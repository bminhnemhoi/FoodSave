import "server-only";

import type { Perishability } from "@/core/labels";
import type { AllocationStatus, UnitCode } from "@/features/catalog/labels";
import type { ShortfallReason } from "@/features/handover/labels";
import { createClient } from "@/server/db/supabase";

/**
 * Yêu cầu nhận lô / phân bổ phía cửa hàng (P2-10, US-STO-13, US-STO-15, US-STO-16) — RSC, client của
 * NGƯỜI DÙNG. RLS `allocations_select` giới hạn theo điểm cửa hàng người xem được thao tác.
 * Điểm nhận của tổ chức chỉ đọc các cột công khai (`public_address` đã tôn trọng `visibility`):
 * `approximate`/`hidden` không bao giờ có địa chỉ chính xác; vị trí tình nguyện viên không được đọc ở đây.
 */

export type SiteVisibility = "public" | "approximate" | "hidden";

export type StoreAllocation = {
  id: string;
  offerId: string;
  offerTitle: string;
  offerDeadline: string | null;
  perishability: Perishability | null;
  status: AllocationStatus;
  unit: UnitCode;
  unitWeightKg: number;
  qtyReserved: number;
  qtyReleased: number;
  qtyPicked: number;
  qtyDelivered: number;
  requestedAt: string;
  reservedUntil: string | null;
  confirmedAt: string | null;
  autoConfirmed: boolean;
  packedAt: string | null;
  closedAt: string | null;
  cancelReason: string | null;
  cancelActor: string | null;
  /**
   * Phần tổ chức không nhận khi hàng về (`delivered`, `qty_delivered < qty_picked`). Lý do luôn là
   * `quality_reject`: bàn giao giao về chỉ nhận lý do này (DATA-MODEL §2.3 handover_lines) và cửa hàng không
   * đọc được dòng đối soát giao về (RLS). Ghi chú tự do của tổ chức không bao giờ được đọc ở đây.
   */
  rejectedOnReceipt: { qty: number; reason: ShortfallReason } | null;
  charity: { name: string; subtype: string; trustScore: number } | null;
  /** Tổ chức nhận — mở hotline theo yêu cầu (get_org_contact, B1). */
  charityOrgId: string;
  /** Chuyến chứa phân bổ (đã phân công) — "Gọi tình nguyện viên" (reveal_trip_contact, B1). */
  pickupId: string | null;
  receivingSite: { name: string; area: string; visibility: SiteVisibility } | null;
};

const COLUMNS =
  "id, offer_id, status, unit, unit_weight_kg_snapshot, qty_reserved, qty_released, qty_picked, " +
  "qty_delivered, requested_at, reserved_until, confirmed_at, auto_confirmed, packed_at, closed_at, " +
  "cancel_reason, cancel_actor, charity_org_id, pickup_id, " +
  "offers(title, effective_deadline, food_categories(perishability)), " +
  "charity:organizations!allocations_charity_org_id_fkey(name, subtype, trust_score), " +
  "charity_site:sites!allocations_charity_site_id_fkey(name, ward, city, public_address, visibility)";

type Row = {
  id: string;
  offer_id: string;
  status: AllocationStatus;
  unit: UnitCode;
  unit_weight_kg_snapshot: number;
  qty_reserved: number;
  qty_released: number;
  qty_picked: number;
  qty_delivered: number;
  requested_at: string;
  reserved_until: string | null;
  confirmed_at: string | null;
  auto_confirmed: boolean;
  packed_at: string | null;
  closed_at: string | null;
  cancel_reason: string | null;
  cancel_actor: string | null;
  charity_org_id: string;
  pickup_id: string | null;
  offers: {
    title: string;
    effective_deadline: string | null;
    food_categories: { perishability: Perishability } | null;
  } | null;
  charity: { name: string; subtype: string; trust_score: number } | null;
  charity_site: {
    name: string;
    ward: string | null;
    city: string | null;
    public_address: string | null;
    visibility: SiteVisibility;
  } | null;
};

/** Khu vực hiển thị của điểm nhận theo `visibility` (không bao giờ là toạ độ). */
function receivingSite(s: Row["charity_site"]): StoreAllocation["receivingSite"] {
  if (!s) return null;
  const ward = s.ward?.trim() || s.city?.trim() || "";
  if (s.visibility === "public") {
    return { name: s.name, area: s.public_address?.trim() || ward, visibility: "public" };
  }
  return { name: s.name, area: ward, visibility: s.visibility };
}

function toAllocation(r: Row): StoreAllocation {
  const rejected = r.status === "delivered" ? Number(r.qty_picked) - Number(r.qty_delivered) : 0;
  return {
    id: r.id,
    offerId: r.offer_id,
    offerTitle: r.offers?.title ?? "Lô tặng",
    offerDeadline: r.offers?.effective_deadline ?? null,
    perishability: r.offers?.food_categories?.perishability ?? null,
    status: r.status,
    unit: r.unit,
    unitWeightKg: Number(r.unit_weight_kg_snapshot),
    qtyReserved: Number(r.qty_reserved),
    qtyReleased: Number(r.qty_released),
    qtyPicked: Number(r.qty_picked),
    qtyDelivered: Number(r.qty_delivered),
    requestedAt: r.requested_at,
    reservedUntil: r.reserved_until,
    confirmedAt: r.confirmed_at,
    autoConfirmed: r.auto_confirmed,
    packedAt: r.packed_at,
    closedAt: r.closed_at,
    cancelReason: r.cancel_reason,
    cancelActor: r.cancel_actor,
    rejectedOnReceipt: rejected > 0 ? { qty: rejected, reason: "quality_reject" } : null,
    charity: r.charity
      ? { name: r.charity.name, subtype: r.charity.subtype, trustScore: Number(r.charity.trust_score) }
      : null,
    charityOrgId: r.charity_org_id,
    pickupId: r.pickup_id,
    receivingSite: receivingSite(r.charity_site),
  };
}

const STATUS_ORDER: Record<AllocationStatus, number> = {
  requested: 0,
  confirmed: 1,
  assigned: 2,
  picked_up: 3,
  delivered: 4,
  rejected: 5,
  cancelled: 6,
  expired: 7,
};

/**
 * Phân bổ của các lô cửa hàng: theo lô (`offerId`), hoặc theo trạng thái (hộp "Chờ xác nhận" ở Tổng quan).
 * Yêu cầu đã quá `reserved_until` nhưng job chưa kịp chạy được coi như hết hạn (không hiện ở hộp chờ).
 */
export async function listStoreAllocations(opts: {
  orgId: string;
  offerId?: string;
  statuses?: AllocationStatus[];
  now: Date;
  limit?: number;
}): Promise<StoreAllocation[]> {
  const supabase = await createClient();
  let q = supabase.from("allocations").select(COLUMNS).eq("store_org_id", opts.orgId);
  if (opts.offerId) q = q.eq("offer_id", opts.offerId);
  if (opts.statuses) q = q.in("status", opts.statuses);
  const { data, error } = await q.order("requested_at", { ascending: true }).limit(opts.limit ?? 200);
  if (error) throw new Error(`Không tải được yêu cầu nhận lô (${error.code ?? "unknown"})`);

  const nowMs = opts.now.getTime();
  return ((data ?? []) as unknown as Row[])
    .map(toAllocation)
    .map((a) =>
      // Job `expire_stale_requests` chạy mỗi phút; trong lúc chờ, hiển thị đúng thực tế là đã hết hạn
      a.status === "requested" && a.reservedUntil && Date.parse(a.reservedUntil) <= nowMs
        ? { ...a, status: "expired" as const }
        : a,
    )
    .filter((a) => !opts.statuses || opts.statuses.includes(a.status))
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
}
