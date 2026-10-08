import "server-only";

import { sumImpact, type ImpactTotals } from "@/core/impact";
import type { UnitCode } from "@/features/catalog/labels";
import { createClient } from "@/server/db/supabase";
import type { Database, Json } from "@/types/database.types";

import { parseTstzRange } from "./format";
import type { ShortfallReason } from "./labels";
import type { LineSpec } from "./lines";

/**
 * Đọc dữ liệu màn bàn giao bằng client của NGƯỜI DÙNG (RLS áp dụng — DATA-MODEL §9.2):
 * - người mang hàng (tổ chức) thấy chuyến/điểm dừng/phân bổ/bàn giao của điểm nhận mình phụ trách;
 * - cửa hàng thấy điểm dừng `pickup` tại chi nhánh mình, bàn giao và dòng đối soát của các điểm đó
 *   (không bao giờ thấy `token_hash`/`code_hash` — không có quyền cột).
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;
type PickupMode = Database["public"]["Enums"]["pickup_mode"];
type PickupStatus = Database["public"]["Enums"]["pickup_status"];
type StopStatus = Database["public"]["Enums"]["stop_status"];
type HandoverMethod = Database["public"]["Enums"]["handover_method"];

/** `handover_max_failed_attempts` mặc định (DATA-MODEL §2.3, app_settings không công khai). */
export const MAX_FAILED_ATTEMPTS = 5;
/** `handover_window_grace_minutes` mặc định (DATA-MODEL §2.3). */
export const HANDOVER_WINDOW_GRACE_MINUTES = 30;

export type HandoverLineSpec = LineSpec & { categoryCode: string };

export type ProposedLine = { qty: number | null; reason: ShortfallReason | null; note: string | null };

/** Bản xem trước một lượt bàn giao cho bên đối diện (cửa hàng) — từ `peek_handover_token` hoặc từ bảng. */
export type HandoverPreview = {
  handoverId: string;
  stopId: string;
  charityName: string;
  /** Chỉ có khi quét QR (`peek_handover_token`); đường nhập mã không đọc được hồ sơ người mang hàng. */
  carrierName: string | null;
  expiresAt: string | null;
  consumedAt: string | null;
  expired: boolean;
  locked: boolean;
  inWindow: boolean;
  lines: (HandoverLineSpec & { proposal: ProposedLine | null })[];
};

const toNum = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : null;
};

/** `proposed_lines` (jsonb) ⇒ đề xuất theo phân bổ. */
export function parseProposedLines(value: Json | null | undefined): Map<string, ProposedLine> {
  const out = new Map<string, ProposedLine>();
  if (!Array.isArray(value)) return out;
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const id = typeof raw.allocation_id === "string" ? raw.allocation_id : null;
    if (!id) continue;
    out.set(id, {
      qty: toNum(raw.qty),
      reason: typeof raw.reason === "string" ? (raw.reason as ShortfallReason) : null,
      note: typeof raw.note === "string" ? raw.note : null,
    });
  }
  return out;
}

type AllocationRow = {
  id: string;
  stop_id: string | null;
  charity_org_id: string;
  unit: UnitCode;
  unit_weight_kg_snapshot: number;
  qty_reserved: number;
  qty_released: number;
  qty_picked: number;
  status: Database["public"]["Enums"]["allocation_status"];
  offers: { title: string; category_code: string; pickup_window: unknown } | null;
};

const ALLOC_COLUMNS =
  "id, stop_id, charity_org_id, unit, unit_weight_kg_snapshot, qty_reserved, qty_released, qty_picked, status, offers(title, category_code, pickup_window)";

function specOf(a: AllocationRow): HandoverLineSpec {
  return {
    allocationId: a.id,
    title: a.offers?.title ?? "Lô tặng",
    categoryCode: a.offers?.category_code ?? "",
    unit: a.unit,
    expectedQty: Number(a.qty_reserved) - Number(a.qty_released),
    unitWeightKg: Number(a.unit_weight_kg_snapshot),
  };
}

async function orgNames(supabase: Supabase, ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const { data, error } = await supabase.from("organizations").select("id, name").in("id", unique);
  if (error) throw new Error(`Không tải được tên tổ chức (${error.code})`);
  return new Map((data ?? []).map((o) => [o.id, o.name]));
}

// ---------------------------------------------------------------------------
// Người mang hàng (tổ chức tự đến lấy)
// ---------------------------------------------------------------------------

export type ReceivedLine = {
  allocationId: string;
  title: string;
  unit: UnitCode;
  expectedQty: number;
  qty: number;
  reason: ShortfallReason | null;
  note: string | null;
  unitWeightKg: number;
};

export type CarrierStopView = {
  pickup: { id: string; mode: PickupMode; status: PickupStatus; isAssignee: boolean; hasAssignee: boolean };
  stop: { id: string; kind: "pickup" | "dropoff"; status: StopStatus; completedAt: string | null };
  store: { name: string; siteName: string; address: string | null };
  pickupWindow: { start: string; end: string } | null;
  /**
   * Vị trí của "bây giờ" so với khung lấy ± 30 phút ân hạn (DATA-MODEL §2.3 "Hiệu lực token"): mã chỉ phát
   * được khi `open`. Tính phía server để màn hình nói trước, RPC vẫn là chốt cuối.
   */
  windowState: "before" | "open" | "after" | null;
  /** Mốc mở mã sớm nhất (= đầu khung − 30 phút), để hiện "mở được từ hh:mm". */
  opensAt: string | null;
  lines: HandoverLineSpec[];
  handover: {
    id: string;
    consumedAt: string | null;
    expiresAt: string | null;
    method: HandoverMethod | null;
    locked: boolean;
  } | null;
  received: ReceivedLine[];
  /** Tổng sổ tác động của các phân bổ ở điểm dừng (tự đến lấy: ghi ngay khi bàn giao). */
  impact: ImpactTotals | null;
};

export async function getCarrierStop(
  pickupId: string,
  stopId: string,
  viewerId: string,
): Promise<CarrierStopView | null> {
  const supabase = await createClient();

  const [pickupRes, stopRes] = await Promise.all([
    supabase.from("pickups").select("id, mode, status, assignee_user_id").eq("id", pickupId).maybeSingle(),
    supabase
      .from("pickup_stops")
      .select("id, pickup_id, kind, status, site_id, completed_at")
      .eq("id", stopId)
      .eq("pickup_id", pickupId)
      .maybeSingle(),
  ]);
  if (pickupRes.error) throw new Error(`Không tải được chuyến (${pickupRes.error.code})`);
  if (stopRes.error) throw new Error(`Không tải được điểm dừng (${stopRes.error.code})`);
  const pickup = pickupRes.data;
  const stop = stopRes.data;
  if (!pickup || !stop) return null;

  const [siteRes, allocRes, handoverRes] = await Promise.all([
    supabase
      .from("sites")
      .select("id, name, org_id, public_address, ward")
      .eq("id", stop.site_id)
      .maybeSingle(),
    supabase
      .from("allocations")
      .select(ALLOC_COLUMNS)
      .eq("stop_id", stopId)
      .overrideTypes<AllocationRow[], { merge: false }>(),
    supabase
      .from("handovers")
      .select("id, consumed_at, token_expires_at, method, failed_attempts")
      .eq("stop_id", stopId)
      .maybeSingle(),
  ]);
  if (siteRes.error) throw new Error(`Không tải được điểm lấy hàng (${siteRes.error.code})`);
  if (allocRes.error) throw new Error(`Không tải được hàng của điểm dừng (${allocRes.error.code})`);
  if (handoverRes.error) throw new Error(`Không tải được bàn giao (${handoverRes.error.code})`);

  const site = siteRes.data;
  const allocations = allocRes.data ?? [];
  const names = await orgNames(supabase, site ? [site.org_id] : []);

  const assigned = allocations.filter((a) => a.status === "assigned");
  const windows = assigned
    .map((a) => parseTstzRange(typeof a.offers?.pickup_window === "string" ? a.offers.pickup_window : null))
    .filter((w): w is { start: Date; end: Date } => w !== null);
  // Khung chung của mọi lô ở điểm dừng (token chỉ dùng được khi nằm trong khung của MỌI phân bổ)
  const pickupWindow =
    windows.length > 0
      ? {
          start: new Date(Math.max(...windows.map((w) => w.start.getTime()))).toISOString(),
          end: new Date(Math.min(...windows.map((w) => w.end.getTime()))).toISOString(),
        }
      : null;

  const graceMs = HANDOVER_WINDOW_GRACE_MINUTES * 60_000;
  const now = Date.now();
  const windowState = pickupWindow
    ? now < new Date(pickupWindow.start).getTime() - graceMs
      ? "before"
      : now > new Date(pickupWindow.end).getTime() + graceMs
        ? "after"
        : "open"
    : null;

  const h = handoverRes.data;
  let received: ReceivedLine[] = [];
  let impact: ImpactTotals | null = null;
  if (h?.consumed_at) {
    const byId = new Map(allocations.map((a) => [a.id, a]));
    const [linesRes, ledgerRes] = await Promise.all([
      supabase
        .from("handover_lines")
        .select("allocation_id, expected_qty, qty, reason, note")
        .eq("handover_id", h.id),
      allocations.length
        ? supabase
            .from("impact_ledger")
            .select("entry_type, kg, co2e_kg, water_l, meals")
            .in(
              "allocation_id",
              allocations.map((a) => a.id),
            )
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (linesRes.error) throw new Error(`Không tải được dòng bàn giao (${linesRes.error.code})`);
    received = (linesRes.data ?? []).map((l) => {
      const a = byId.get(l.allocation_id);
      return {
        allocationId: l.allocation_id,
        title: a?.offers?.title ?? "Lô tặng",
        unit: a?.unit ?? "piece",
        expectedQty: Number(l.expected_qty),
        qty: Number(l.qty),
        reason: l.reason,
        note: l.note,
        unitWeightKg: Number(a?.unit_weight_kg_snapshot ?? 0),
      };
    });
    // Sổ tác động không đọc được (vai trò khác) thì chỉ ẩn phần tác động, không làm hỏng màn hình
    if (!ledgerRes.error && ledgerRes.data && ledgerRes.data.length > 0) {
      impact = sumImpact(
        ledgerRes.data.map((r) => ({
          entryType: r.entry_type,
          kg: Number(r.kg),
          co2eKg: Number(r.co2e_kg),
          waterL: r.water_l === null ? null : Number(r.water_l),
          meals: Number(r.meals),
        })),
      );
    }
  }

  return {
    pickup: {
      id: pickup.id,
      mode: pickup.mode,
      status: pickup.status,
      isAssignee: pickup.assignee_user_id === viewerId,
      hasAssignee: pickup.assignee_user_id !== null,
    },
    stop: { id: stop.id, kind: stop.kind, status: stop.status, completedAt: stop.completed_at },
    store: {
      name: site ? (names.get(site.org_id) ?? "Cửa hàng") : "Cửa hàng",
      siteName: site?.name ?? "",
      address: site?.public_address ?? site?.ward ?? null,
    },
    pickupWindow,
    windowState,
    opensAt: pickupWindow ? new Date(new Date(pickupWindow.start).getTime() - graceMs).toISOString() : null,
    lines: assigned.map(specOf),
    handover: h
      ? {
          id: h.id,
          consumedAt: h.consumed_at,
          expiresAt: h.token_expires_at,
          method: h.method,
          locked: h.failed_attempts >= MAX_FAILED_ATTEMPTS,
        }
      : null,
    received,
    impact,
  };
}

// ---------------------------------------------------------------------------
// Cửa hàng: bảng bàn giao
// ---------------------------------------------------------------------------

export type PendingStop = {
  stopId: string;
  siteName: string;
  charityName: string;
  eta: string | null;
  lines: HandoverLineSpec[];
  /** null = người mang hàng chưa mở mã. */
  handover: HandoverPreview | null;
};

export type RecentHandover = {
  handoverId: string;
  consumedAt: string;
  charityName: string;
  siteName: string;
  method: HandoverMethod | null;
  lines: {
    title: string;
    unit: UnitCode;
    qty: number;
    expectedQty: number;
    reason: ShortfallReason | null;
    unitWeightKg: number;
  }[];
};

export type StoreHandoverBoard = {
  pending: PendingStop[];
  recent: RecentHandover[];
  siteCount: number;
  /** `Date.now()` lúc đọc (ms) — mốc đầu cho đồng hồ đếm ngược phía client. */
  serverNow: number;
};

const RECENT_HOURS = 24;

export async function getStoreHandoverBoard(storeOrgId: string): Promise<StoreHandoverBoard> {
  const supabase = await createClient();

  const { data: sites, error: sitesError } = await supabase
    .from("sites")
    .select("id, name")
    .eq("org_id", storeOrgId);
  if (sitesError) throw new Error(`Không tải được chi nhánh (${sitesError.code})`);
  const siteIds = (sites ?? []).map((s) => s.id);
  const siteName = new Map((sites ?? []).map((s) => [s.id, s.name]));
  if (siteIds.length === 0) return { pending: [], recent: [], siteCount: 0, serverNow: Date.now() };

  const since = new Date(Date.now() - RECENT_HOURS * 3_600_000).toISOString();
  const [pendingRes, doneRes] = await Promise.all([
    supabase
      .from("pickup_stops")
      .select("id, site_id, eta, created_at")
      .eq("kind", "pickup")
      .in("status", ["pending", "arrived"])
      .in("site_id", siteIds)
      .order("created_at", { ascending: true })
      .limit(50),
    supabase
      .from("pickup_stops")
      .select("id, site_id, completed_at")
      .eq("kind", "pickup")
      .eq("status", "done")
      .in("site_id", siteIds)
      .gte("completed_at", since)
      .order("completed_at", { ascending: false })
      .limit(10),
  ]);
  if (pendingRes.error) throw new Error(`Không tải được lượt lấy hàng (${pendingRes.error.code})`);
  if (doneRes.error) throw new Error(`Không tải được lượt đã bàn giao (${doneRes.error.code})`);

  const pendingStops = pendingRes.data ?? [];
  const doneStops = doneRes.data ?? [];
  const stopIds = [...pendingStops, ...doneStops].map((s) => s.id);
  if (stopIds.length === 0)
    return { pending: [], recent: [], siteCount: siteIds.length, serverNow: Date.now() };

  const [allocRes, handoverRes] = await Promise.all([
    supabase
      .from("allocations")
      .select(ALLOC_COLUMNS)
      .in("stop_id", stopIds)
      .overrideTypes<AllocationRow[], { merge: false }>(),
    supabase
      .from("handovers")
      .select("id, stop_id, token_expires_at, failed_attempts, consumed_at, proposed_lines, method")
      .in("stop_id", stopIds),
  ]);
  if (allocRes.error) throw new Error(`Không tải được hàng cần giao (${allocRes.error.code})`);
  if (handoverRes.error) throw new Error(`Không tải được mã bàn giao (${handoverRes.error.code})`);

  const allocations = allocRes.data ?? [];
  const handovers = handoverRes.data ?? [];
  const names = await orgNames(
    supabase,
    allocations.map((a) => a.charity_org_id),
  );
  const handoverByStop = new Map(handovers.map((h) => [h.stop_id, h]));
  const allocsByStop = new Map<string, AllocationRow[]>();
  for (const a of allocations) {
    if (!a.stop_id) continue;
    allocsByStop.set(a.stop_id, [...(allocsByStop.get(a.stop_id) ?? []), a]);
  }
  const now = Date.now();

  const pending: PendingStop[] = [];
  for (const s of pendingStops) {
    const assigned = (allocsByStop.get(s.id) ?? []).filter((a) => a.status === "assigned");
    if (assigned.length === 0) continue;
    const charityName = names.get(assigned[0]!.charity_org_id) ?? "Tổ chức nhận";
    const lines = assigned.map(specOf);
    const h = handoverByStop.get(s.id);
    const proposals = parseProposedLines(h?.proposed_lines);
    pending.push({
      stopId: s.id,
      siteName: siteName.get(s.site_id) ?? "",
      charityName,
      eta: s.eta,
      lines,
      handover: h
        ? {
            handoverId: h.id,
            stopId: s.id,
            charityName,
            carrierName: null,
            expiresAt: h.token_expires_at,
            consumedAt: h.consumed_at,
            expired: !h.token_expires_at || new Date(h.token_expires_at).getTime() <= now,
            locked: h.failed_attempts >= MAX_FAILED_ATTEMPTS,
            inWindow: true,
            lines: lines.map((l) => ({ ...l, proposal: proposals.get(l.allocationId) ?? null })),
          }
        : null,
    });
  }

  const doneHandovers = doneStops
    .map((s) => ({ s, h: handoverByStop.get(s.id) }))
    .filter((x): x is { s: (typeof doneStops)[number]; h: (typeof handovers)[number] } => !!x.h?.consumed_at);
  let recent: RecentHandover[] = [];
  if (doneHandovers.length > 0) {
    const { data: lineRows, error: linesError } = await supabase
      .from("handover_lines")
      .select("handover_id, allocation_id, expected_qty, qty, reason")
      .in(
        "handover_id",
        doneHandovers.map((x) => x.h.id),
      );
    if (linesError) throw new Error(`Không tải được dòng bàn giao (${linesError.code})`);
    const allocById = new Map(allocations.map((a) => [a.id, a]));
    recent = doneHandovers.map(({ s, h }) => {
      const rows = (lineRows ?? []).filter((l) => l.handover_id === h.id);
      const first = allocById.get(rows[0]?.allocation_id ?? "");
      return {
        handoverId: h.id,
        consumedAt: h.consumed_at!,
        charityName: first ? (names.get(first.charity_org_id) ?? "Tổ chức nhận") : "Tổ chức nhận",
        siteName: siteName.get(s.site_id) ?? "",
        method: h.method,
        lines: rows.map((l) => {
          const a = allocById.get(l.allocation_id);
          return {
            title: a?.offers?.title ?? "Lô tặng",
            unit: a?.unit ?? "piece",
            qty: Number(l.qty),
            expectedQty: Number(l.expected_qty),
            reason: l.reason,
            unitWeightKg: Number(a?.unit_weight_kg_snapshot ?? 0),
          };
        }),
      };
    });
  }

  return { pending, recent, siteCount: siteIds.length, serverNow: now };
}

/** Thông tin cần cho đề xuất của người mang hàng ở bản xem trước (đường quét QR). */
export async function getProposedLines(handoverId: string): Promise<Map<string, ProposedLine>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("handovers")
    .select("proposed_lines")
    .eq("id", handoverId)
    .maybeSingle();
  if (error || !data) return new Map();
  return parseProposedLines(data.proposed_lines);
}
