import "server-only";

import type { LatLng } from "@/core/geo/types";
import type { Perishability } from "@/core/labels";
import { proposePlans, type MatchCandidate, type MatchResult } from "@/core/matching";
import { travelConfigFrom, TRAVEL_SETTING_KEYS } from "@/core/routing";
import type { AllocationStatus, UnitCode } from "@/features/catalog/labels";
import { loadCharityContext, type ReceivingSite } from "@/features/charity-allocations/context";
import { parseEwkbPoint, parseLineString, type LineString } from "@/features/pickups/geo";
import { createClient } from "@/server/db/supabase";

import { mapMatchError, type NeedActionError } from "./errors";
import { isLiveNeed, type BundleStatus, type NeedStatus, type SiteVisibility } from "./labels";
import {
  displayStatusOf,
  needProgress,
  rematchExclusions,
  remainingOf,
  toPlanViews,
  type NeedProgress,
  type PlanEnrichment,
  type PlanView,
} from "./present";

/**
 * Đọc dữ liệu nhu cầu của cổng Tổ chức (RSC + server action), luôn bằng client của NGƯỜI DÙNG (RLS §9.2).
 * Phương án ghép tính ở server: `match_candidates` (SQL lọc, quyền, bán kính, khả thi) → `proposePlans`
 * (TS thuần, ADR-007) → view-model. Không gọi API bản đồ ở bước đề xuất.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type CategoryInfo = {
  code: string;
  name: string;
  icon: string;
  defaultUnit: UnitCode;
  perishability: Perishability;
};

export async function loadNeedCategories(supabase?: Supabase): Promise<CategoryInfo[]> {
  const db = supabase ?? (await createClient());
  const { data, error } = await db
    .from("food_categories")
    .select("code, name_vi, icon, default_unit, perishability, sort_order")
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw new Error(`Không tải được danh mục thực phẩm (${error.code})`);
  return (data ?? []).map((c) => ({
    code: c.code,
    name: c.name_vi,
    icon: c.icon,
    defaultUnit: c.default_unit,
    perishability: c.perishability,
  }));
}

export type NeedRecord = {
  id: string;
  siteId: string;
  categoryCodes: string[];
  unit: UnitCode;
  quantity: number;
  neededBy: string;
  peopleToServe: number | null;
  note: string | null;
  /** Trạng thái lưu trong DB. */
  status: NeedStatus;
  /** Trạng thái hiển thị: quá `needed_by` mà cron chưa đóng ⇒ coi như đã đóng (DATA-MODEL §6.2). */
  displayStatus: NeedStatus;
  qtyInFlight: number;
  qtyDelivered: number;
  closedAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  progress: NeedProgress;
  /** Còn thiếu (cần − đang giữ − đã giao). */
  remaining: number;
  /** Còn ghép/hủy được: đang sống và chưa quá hạn cần. */
  live: boolean;
};

const NEED_COLUMNS =
  "id, site_id, category_codes, unit, quantity, needed_by, people_to_serve, note, status, qty_in_flight, " +
  "qty_delivered, closed_at, cancel_reason, created_at";

type NeedDbRow = {
  id: string;
  site_id: string;
  category_codes: string[];
  unit: UnitCode;
  quantity: number;
  needed_by: string;
  people_to_serve: number | null;
  note: string | null;
  status: NeedStatus;
  qty_in_flight: number;
  qty_delivered: number;
  closed_at: string | null;
  cancel_reason: string | null;
  created_at: string;
};

function toNeed(r: NeedDbRow, now: number): NeedRecord {
  const base = {
    quantity: Number(r.quantity),
    qtyInFlight: Number(r.qty_in_flight),
    qtyDelivered: Number(r.qty_delivered),
  };
  const displayStatus = displayStatusOf(
    { status: r.status, neededBy: r.needed_by, qtyDelivered: base.qtyDelivered },
    now,
  );
  return {
    id: r.id,
    siteId: r.site_id,
    categoryCodes: r.category_codes,
    unit: r.unit,
    ...base,
    neededBy: r.needed_by,
    peopleToServe: r.people_to_serve,
    note: r.note,
    status: r.status,
    displayStatus,
    closedAt: r.closed_at,
    cancelReason: r.cancel_reason,
    createdAt: r.created_at,
    progress: needProgress(base),
    remaining: remainingOf(base),
    live: isLiveNeed(displayStatus),
  };
}

// ---------------------------------------------------------------------------
// Danh sách
// ---------------------------------------------------------------------------

export type NeedsList = { live: NeedRecord[]; closed: NeedRecord[] };

export async function loadNeedsList(siteIds: readonly string[], now: number): Promise<NeedsList | null> {
  if (siteIds.length === 0) return { live: [], closed: [] };
  const supabase = await createClient();
  const since = new Date(now - 30 * 86_400_000).toISOString();
  const [liveRes, closedRes] = await Promise.all([
    supabase
      .from("needs")
      .select(NEED_COLUMNS)
      .in("site_id", [...siteIds])
      .in("status", ["open", "partially_matched", "matched"])
      .order("needed_by", { ascending: true })
      .limit(100),
    supabase
      .from("needs")
      .select(NEED_COLUMNS)
      .in("site_id", [...siteIds])
      .in("status", ["fulfilled", "closed_partial", "expired", "cancelled"])
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  if (liveRes.error || closedRes.error) {
    console.error("[needs] list", { code: liveRes.error?.code ?? closedRes.error?.code });
    return null;
  }
  const live: NeedRecord[] = [];
  const closed: NeedRecord[] = [];
  for (const r of (liveRes.data ?? []) as unknown as NeedDbRow[]) {
    const n = toNeed(r, now);
    (n.live ? live : closed).push(n);
  }
  for (const r of (closedRes.data ?? []) as unknown as NeedDbRow[]) closed.push(toNeed(r, now));
  return { live, closed };
}

// ---------------------------------------------------------------------------
// Chi tiết: phương án đã chọn + phân bổ
// ---------------------------------------------------------------------------

export type BundleAllocation = {
  id: string;
  bundleId: string | null;
  offerId: string;
  offerTitle: string;
  categoryCode: string;
  effectiveDeadline: string | null;
  storeOrgId: string;
  storeName: string;
  storeSiteId: string;
  storeSiteName: string;
  storeVisibility: SiteVisibility;
  storeLocation: LatLng | null;
  status: AllocationStatus;
  unit: UnitCode;
  /** Đang giữ = qty_reserved − qty_released. */
  qtyHeld: number;
  qtyReserved: number;
  qtyPicked: number;
  qtyDelivered: number;
  autoConfirmed: boolean;
  reservedUntil: string | null;
  requestedAt: string;
  confirmedAt: string | null;
  cancelActor: string | null;
  cancelReason: string | null;
  pickupId: string | null;
};

export type BundleRecord = {
  id: string;
  status: BundleStatus;
  optionRank: number;
  qtyTarget: number;
  stopCount: number;
  estDistanceM: number;
  estDurationS: number;
  route: LineString | null;
  routeProvider: string | null;
  rematchOf: string | null;
  createdAt: string;
  /** Thứ tự đi (id điểm cửa hàng) lúc chọn — đánh số điểm dừng trên bản đồ. */
  stopOrder: string[];
  allocations: BundleAllocation[];
};

export type NeedDetail = {
  need: NeedRecord;
  site: ReceivingSite | null;
  siteName: string;
  /** Toạ độ chính xác điểm nhận của chính tổ chức (`get_site_location`). */
  home: LatLng | null;
  bundles: BundleRecord[];
  allocations: BundleAllocation[];
  /** Người xem thao tác được trên điểm nhận của nhu cầu. */
  canAct: boolean;
  canCancel: boolean;
  isPaused: boolean;
  orgName: string;
};

type AllocDbRow = {
  id: string;
  bundle_id: string | null;
  offer_id: string;
  store_org_id: string;
  store_site_id: string;
  status: AllocationStatus;
  unit: UnitCode;
  qty_reserved: number;
  qty_released: number;
  qty_picked: number;
  qty_delivered: number;
  auto_confirmed: boolean;
  reserved_until: string | null;
  requested_at: string;
  confirmed_at: string | null;
  cancel_actor: string | null;
  cancel_reason: string | null;
  pickup_id: string | null;
  offer: { title: string; category_code: string; effective_deadline: string | null } | null;
  store: { name: string } | null;
  store_site: {
    name: string;
    ward: string | null;
    visibility: SiteVisibility;
    public_location: unknown;
  } | null;
};

const ALLOC_SELECT = `id, bundle_id, offer_id, store_org_id, store_site_id, status, unit, qty_reserved, qty_released,
  qty_picked, qty_delivered, auto_confirmed, reserved_until, requested_at, confirmed_at, cancel_actor, cancel_reason,
  pickup_id,
  offer:offers!allocations_offer_id_fkey(title, category_code, effective_deadline),
  store:organizations!allocations_store_org_id_fkey(name),
  store_site:sites!allocations_store_site_id_fkey(name, ward, visibility, public_location)`;

function toAllocation(r: AllocDbRow): BundleAllocation {
  const visibility = r.store_site?.visibility ?? "hidden";
  return {
    id: r.id,
    bundleId: r.bundle_id,
    offerId: r.offer_id,
    offerTitle: r.offer?.title ?? "Lô tặng",
    categoryCode: r.offer?.category_code ?? "",
    effectiveDeadline: r.offer?.effective_deadline ?? null,
    storeOrgId: r.store_org_id,
    storeName: r.store?.name ?? "Cửa hàng",
    storeSiteId: r.store_site_id,
    storeSiteName: r.store_site?.name ?? "Chi nhánh",
    storeVisibility: visibility,
    storeLocation:
      visibility === "hidden" ? null : parseEwkbPoint(r.store_site?.public_location as string | null),
    status: r.status,
    unit: r.unit,
    qtyHeld: Number(r.qty_reserved) - Number(r.qty_released),
    qtyReserved: Number(r.qty_reserved),
    qtyPicked: Number(r.qty_picked),
    qtyDelivered: Number(r.qty_delivered),
    autoConfirmed: r.auto_confirmed,
    reservedUntil: r.reserved_until,
    requestedAt: r.requested_at,
    confirmedAt: r.confirmed_at,
    cancelActor: r.cancel_actor,
    cancelReason: r.cancel_reason,
    pickupId: r.pickup_id,
  };
}

/** Toạ độ chính xác điểm nhận của chính tổ chức (thành viên được phép — `get_site_location`). */
async function exactLocation(supabase: Supabase, siteId: string): Promise<LatLng | null> {
  const { data, error } = await supabase.rpc("get_site_location", { p_site_id: siteId });
  if (error || !data?.[0]) return null;
  return { lat: Number(data[0].lat), lng: Number(data[0].lng) };
}

/** null ⇒ không thấy nhu cầu (không tồn tại hoặc không thuộc tổ chức của người xem). */
export async function loadNeedDetail(needId: string, now: number): Promise<NeedDetail | null> {
  const ctx = await loadCharityContext();
  const supabase = await createClient();
  const needRes = await supabase
    .from("needs")
    .select(NEED_COLUMNS)
    .eq("id", needId)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (needRes.error) throw new Error(`Không tải được nhu cầu (${needRes.error.code})`);
  if (!needRes.data) return null;
  const need = toNeed(needRes.data as unknown as NeedDbRow, now);

  const site = ctx.sites.find((s) => s.id === need.siteId) ?? null;
  const [siteRow, bundlesRes, allocRes, home] = await Promise.all([
    site
      ? Promise.resolve({ data: { name: site.name }, error: null })
      : supabase.from("sites").select("name").eq("id", need.siteId).maybeSingle(),
    supabase
      .from("need_bundles")
      .select(
        "id, status, option_rank, qty_target, stop_count, est_distance_m, est_duration_s, route, route_provider, rematch_of, created_at, stop_order:inputs_snapshot->option->order",
      )
      .eq("need_id", needId)
      .order("created_at", { ascending: false }),
    supabase.from("allocations").select(ALLOC_SELECT).eq("need_id", needId).order("requested_at"),
    site ? exactLocation(supabase, site.id) : Promise.resolve(null),
  ]);
  if (bundlesRes.error) throw new Error(`Không tải được phương án đã chọn (${bundlesRes.error.code})`);
  if (allocRes.error) throw new Error(`Không tải được phân bổ (${allocRes.error.code})`);

  const allocations = ((allocRes.data ?? []) as unknown as AllocDbRow[]).map(toAllocation);
  const bundles: BundleRecord[] = (bundlesRes.data ?? []).map((b) => ({
    id: b.id,
    status: b.status,
    optionRank: b.option_rank,
    qtyTarget: Number(b.qty_target),
    stopCount: b.stop_count,
    estDistanceM: b.est_distance_m,
    estDurationS: b.est_duration_s,
    route: parseLineString(b.route),
    routeProvider: b.route_provider,
    rematchOf: b.rematch_of,
    createdAt: b.created_at,
    stopOrder: Array.isArray(b.stop_order) ? (b.stop_order as unknown[]).map(String) : [],
    allocations: allocations.filter((a) => a.bundleId === b.id),
  }));

  return {
    need,
    site,
    siteName: siteRow.data?.name ?? "Điểm nhận",
    home,
    bundles,
    allocations,
    canAct: site !== null,
    canCancel: site !== null && ctx.canCancel,
    isPaused: ctx.isPaused,
    orgName: ctx.orgName,
  };
}

// ---------------------------------------------------------------------------
// Phương án ghép (match_candidates → proposePlans)
// ---------------------------------------------------------------------------

export type PlanContext = {
  needId: string;
  unit: UnitCode;
  categoryCodes: string[];
  neededBy: string;
  remaining: number;
  site: ReceivingSite;
  home: LatLng;
  excludeSiteIds: string[];
  /** Bundle mới nhất của nhu cầu ⇒ lần chọn tiếp theo là ghép lại phần thiếu (`rematch_of`). */
  rematchOf: string | null;
};

export type PlansData = {
  plans: PlanView[];
  remaining: number;
  unit: UnitCode;
  /** Số lô / số cửa hàng ứng viên SQL trả về (để giải thích). */
  candidateLots: number;
  candidateStores: number;
  radiusKm: number;
  rematch: boolean;
};

export type PlansOutcome =
  { ok: true; data: PlansData; result: MatchResult } | { ok: false; error: NeedActionError };

/** Ngữ cảnh ghép từ dữ liệu chi tiết đã nạp (null ⇒ không ghép được: đã đủ, đã đóng, thiếu toạ độ…). */
export function planContextFrom(detail: NeedDetail): PlanContext | null {
  const { need, site, home } = detail;
  if (!need.live || need.remaining <= 0 || !site || !home || !detail.canAct) return null;
  return {
    needId: need.id,
    unit: need.unit,
    categoryCodes: need.categoryCodes,
    neededBy: need.neededBy,
    remaining: need.remaining,
    site,
    home,
    excludeSiteIds: rematchExclusions(
      detail.allocations.map((a) => ({
        storeSiteId: a.storeSiteId,
        status: a.status,
        cancelActor: a.cancelActor,
      })),
    ),
    rematchOf: detail.bundles[0]?.id ?? null,
  };
}

async function travelConfig(supabase: Supabase) {
  // app_settings của engine không public (RLS) ⇒ thường rỗng ⇒ mặc định = seed (có test chống lệch)
  const { data } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", Object.values(TRAVEL_SETTING_KEYS));
  return travelConfigFrom(Object.fromEntries((data ?? []).map((r) => [r.key, r.value])));
}

export async function computePlans(
  ctx: PlanContext,
  categories: readonly CategoryInfo[],
): Promise<PlansOutcome> {
  const supabase = await createClient();
  const at = new Date();
  const [rowsRes, travel] = await Promise.all([
    supabase.rpc("match_candidates", {
      p_need_id: ctx.needId,
      p_remaining: ctx.remaining,
      p_exclude_site_ids: ctx.excludeSiteIds,
    }),
    travelConfig(supabase),
  ]);
  if (rowsRes.error) {
    const error = mapMatchError(rowsRes.error);
    if (error.code === "server_error")
      console.error("[needs] match_candidates", { code: rowsRes.error.code, message: rowsRes.error.message });
    return { ok: false, error };
  }
  const rows = (rowsRes.data ?? []) as unknown as MatchCandidate[];

  const result = proposePlans(
    {
      quantity: ctx.remaining,
      unit: ctx.unit,
      categoryCodes: ctx.categoryCodes,
      siteLocation: ctx.home,
      radiusKm: ctx.site.radiusKm,
      neededBy: ctx.neededBy,
      at,
      siteId: ctx.site.id,
    },
    rows,
    { travel, excludeSiteIds: ctx.excludeSiteIds },
  );

  const offerIds = [...new Set(result.plans.flatMap((p) => p.lines.map((l) => l.offerId)))];
  const siteIds = [...new Set(result.plans.flatMap((p) => p.siteIds))];
  const orgIds = [...new Set(result.plans.flatMap((p) => p.stops.map((s) => s.storeOrgId)))];
  const [offersRes, sitesRes, orgsRes] = await Promise.all([
    offerIds.length
      ? supabase.from("offers").select("id, title").in("id", offerIds)
      : Promise.resolve({ data: [], error: null }),
    siteIds.length
      ? supabase.from("sites").select("id, name, ward, visibility").in("id", siteIds)
      : Promise.resolve({ data: [], error: null }),
    orgIds.length
      ? supabase.from("organizations").select("id, name").in("id", orgIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const info: PlanEnrichment = {
    offers: Object.fromEntries((offersRes.data ?? []).map((o) => [o.id, { title: o.title }])),
    sites: Object.fromEntries(
      (sitesRes.data ?? []).map((s) => [s.id, { name: s.name, ward: s.ward, visibility: s.visibility }]),
    ),
    stores: Object.fromEntries((orgsRes.data ?? []).map((o) => [o.id, { name: o.name }])),
    categoryNames: Object.fromEntries(categories.map((c) => [c.code, c.name])),
  };

  return {
    ok: true,
    result,
    data: {
      plans: toPlanViews(result, ctx.unit, info, ctx.home),
      remaining: ctx.remaining,
      unit: ctx.unit,
      candidateLots: rows.length,
      candidateStores: new Set(rows.map((r) => r.site_id)).size,
      radiusKm: ctx.site.radiusKm,
      rematch: ctx.rematchOf !== null,
    },
  };
}
