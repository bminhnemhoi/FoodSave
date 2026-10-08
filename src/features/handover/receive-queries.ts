import "server-only";

import type { UnitCode } from "@/features/catalog/labels";
import { createClient } from "@/server/db/supabase";

import {
  MAX_FAILED_ATTEMPTS,
  parseProposedLines,
  type HandoverLineSpec,
  type HandoverPreview,
} from "./queries";

/**
 * Nhận hàng tại tổ chức (dropoff của chuyến tình nguyện viên — PRD US-CHA-21; DATA-MODEL §6.6 `record_dropoff`).
 * Đọc bằng client của NGƯỜI DÙNG (RLS §9.2: chuyến tới điểm nhận người xem có quyền); không bao giờ đọc được
 * `token_hash`/`code_hash`. Mỗi chuyến đang chạy là một "lượt giao về": sẵn sàng khi mọi điểm lấy đã xong/bỏ
 * qua; có mã khi tình nguyện viên đã bấm hiện mã giao về.
 */

export type PendingDropoff = {
  pickupId: string;
  siteName: string;
  volunteerName: string | null;
  startedAt: string | null;
  storeNames: string[];
  pickupsDone: number;
  pickupsTotal: number;
  /** Mọi điểm lấy đã xong hoặc bỏ qua (và có hàng đã lấy) — giao về được. */
  ready: boolean;
  /** Dòng đã lấy (`qty_picked`) — số tối đa nhận được. */
  lines: HandoverLineSpec[];
  /** null = tình nguyện viên chưa mở mã giao về. Dùng làm bản xem trước khi nhập mã 6 số. */
  handover: HandoverPreview | null;
};

export type RecentDropoff = {
  pickupId: string;
  completedAt: string;
  volunteerName: string | null;
  kg: number;
  lines: { title: string; unit: UnitCode; qty: number; expectedQty: number }[];
};

export type ReceiveBoard = { pending: PendingDropoff[]; recent: RecentDropoff[]; serverNow: number };

type TripRow = {
  id: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  assignee: { full_name: string | null } | null;
  charity_site: { name: string } | null;
  stops: {
    id: string;
    kind: "pickup" | "dropoff";
    status: "pending" | "arrived" | "done" | "skipped";
    site: { name: string; org: { name: string } | null } | null;
  }[];
};

type AllocRow = {
  id: string;
  pickup_id: string;
  status: string;
  unit: UnitCode;
  unit_weight_kg_snapshot: number;
  qty_picked: number;
  qty_delivered: number;
  offers: { title: string; category_code: string } | null;
};

const RECENT_HOURS = 24;

export async function getReceiveBoard(orgId: string): Promise<ReceiveBoard> {
  const supabase = await createClient();
  const since = new Date(Date.now() - RECENT_HOURS * 3_600_000).toISOString();
  const select = `id, status, started_at, completed_at,
    assignee:profiles!pickups_assignee_user_id_fkey(full_name),
    charity_site:sites!pickups_charity_site_id_fkey(name),
    stops:pickup_stops(id, kind, status, site:sites!pickup_stops_site_id_fkey(name, org:organizations!sites_org_id_fkey(name)))`;
  const [runningRes, doneRes] = await Promise.all([
    supabase
      .from("pickups")
      .select(select)
      .eq("charity_org_id", orgId)
      .eq("mode", "volunteer")
      .eq("status", "in_progress")
      .order("started_at", { ascending: true })
      .limit(50),
    supabase
      .from("pickups")
      .select(select)
      .eq("charity_org_id", orgId)
      .eq("mode", "volunteer")
      .eq("status", "completed")
      .gte("completed_at", since)
      .order("completed_at", { ascending: false })
      .limit(10),
  ]);
  if (runningRes.error) throw new Error(`Không tải được chuyến đang về (${runningRes.error.code})`);
  if (doneRes.error) throw new Error(`Không tải được lượt đã nhận (${doneRes.error.code})`);
  const running = (runningRes.data ?? []) as unknown as TripRow[];
  const done = (doneRes.data ?? []) as unknown as TripRow[];
  const tripIds = [...running, ...done].map((t) => t.id);
  if (tripIds.length === 0) return { pending: [], recent: [], serverNow: Date.now() };

  const dropoffStopIds = running.flatMap((t) => t.stops.filter((s) => s.kind === "dropoff").map((s) => s.id));
  const [allocRes, handoverRes] = await Promise.all([
    supabase
      .from("allocations")
      .select(
        "id, pickup_id, status, unit, unit_weight_kg_snapshot, qty_picked, qty_delivered, offers(title, category_code)",
      )
      .in("pickup_id", tripIds)
      .in("status", ["picked_up", "delivered"])
      .overrideTypes<AllocRow[], { merge: false }>(),
    dropoffStopIds.length
      ? supabase
          .from("handovers")
          .select("id, stop_id, token_expires_at, failed_attempts, consumed_at, proposed_lines")
          .in("stop_id", dropoffStopIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (allocRes.error) throw new Error(`Không tải được hàng đã lấy (${allocRes.error.code})`);
  if (handoverRes.error) throw new Error(`Không tải được mã giao về (${handoverRes.error.code})`);
  const allocations = allocRes.data ?? [];
  const handoverByStop = new Map((handoverRes.data ?? []).map((h) => [h.stop_id, h]));
  const now = Date.now();

  const pending: PendingDropoff[] = running
    .map((t): PendingDropoff | null => {
      const pickups = t.stops.filter((s) => s.kind === "pickup");
      const dropoff = t.stops.find((s) => s.kind === "dropoff");
      if (!dropoff || dropoff.status === "done" || dropoff.status === "skipped") return null;
      const picked = allocations.filter((a) => a.pickup_id === t.id && a.status === "picked_up");
      const lines: HandoverLineSpec[] = picked
        .sort((a, b) => (a.id < b.id ? -1 : 1))
        .map((a) => ({
          allocationId: a.id,
          title: a.offers?.title ?? "Lô tặng",
          categoryCode: a.offers?.category_code ?? "",
          unit: a.unit,
          expectedQty: Number(a.qty_picked),
          unitWeightKg: Number(a.unit_weight_kg_snapshot),
        }));
      const ready = lines.length > 0 && pickups.every((s) => s.status === "done" || s.status === "skipped");
      const h = handoverByStop.get(dropoff.id);
      const proposals = parseProposedLines(h?.proposed_lines);
      const volunteerName = t.assignee?.full_name?.trim() || null;
      return {
        pickupId: t.id,
        siteName: t.charity_site?.name ?? "Điểm nhận",
        volunteerName,
        startedAt: t.started_at,
        storeNames: [...new Set(pickups.map((s) => s.site?.org?.name).filter((n): n is string => !!n))],
        pickupsDone: pickups.filter((s) => s.status === "done").length,
        pickupsTotal: pickups.length,
        ready,
        lines,
        handover:
          h && !h.consumed_at
            ? {
                handoverId: h.id,
                stopId: dropoff.id,
                charityName: t.charity_site?.name ?? "Điểm nhận",
                carrierName: volunteerName,
                expiresAt: h.token_expires_at,
                consumedAt: h.consumed_at,
                expired: !h.token_expires_at || new Date(h.token_expires_at).getTime() <= now,
                locked: h.failed_attempts >= MAX_FAILED_ATTEMPTS,
                inWindow: true,
                lines: lines.map((l) => ({ ...l, proposal: proposals.get(l.allocationId) ?? null })),
              }
            : null,
      };
    })
    .filter((p): p is PendingDropoff => p !== null);

  const recent: RecentDropoff[] = done.map((t) => {
    const delivered = allocations.filter((a) => a.pickup_id === t.id && a.status === "delivered");
    return {
      pickupId: t.id,
      completedAt: t.completed_at ?? "",
      volunteerName: t.assignee?.full_name?.trim() || null,
      kg:
        Math.round(
          delivered.reduce((s, a) => s + Number(a.qty_delivered) * Number(a.unit_weight_kg_snapshot), 0) *
            1000,
        ) / 1000,
      lines: delivered.map((a) => ({
        title: a.offers?.title ?? "Lô tặng",
        unit: a.unit,
        qty: Number(a.qty_delivered),
        expectedQty: Number(a.qty_picked),
      })),
    };
  });

  return { pending, recent, serverNow: now };
}
