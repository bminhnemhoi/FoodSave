import "server-only";

import type { AllocationStatus, UnitCode } from "@/features/catalog/labels";
import { createClient } from "@/server/db/supabase";

import { parseTstzRange, startOfVnMonth } from "./present";

/**
 * Phân bổ của tổ chức (RLS §9.2: chỉ phân bổ tới điểm nhận người xem có quyền). Dùng cho Tổng quan
 * (nhóm theo trạng thái, hủy yêu cầu) và Chuyến lấy hàng (phân bổ đã xác nhận chờ lên chuyến).
 */

export type CharityAllocation = {
  id: string;
  status: AllocationStatus;
  unit: UnitCode;
  /** Số đang giữ = qty_reserved − qty_released. */
  qtyHeld: number;
  qtyPicked: number;
  qtyDelivered: number;
  kgDelivered: number;
  unitWeightKg: number;
  reservedUntil: string | null;
  requestedAt: string;
  confirmedAt: string | null;
  autoConfirmed: boolean;
  packedAt: string | null;
  deliveredAt: string | null;
  closedAt: string | null;
  cancelActor: string | null;
  cancelReason: string | null;
  pickupId: string | null;
  stopId: string | null;
  charitySiteId: string;
  charitySiteName: string;
  storeSiteId: string;
  storeSiteName: string;
  storeName: string;
  offerId: string;
  offerTitle: string;
  categoryCode: string;
  effectiveDeadline: string | null;
  pickupStart: string | null;
  pickupEnd: string | null;
};

const SELECT = `id, status, unit, qty_reserved, qty_released, qty_picked, qty_delivered, kg_delivered,
  unit_weight_kg_snapshot, reserved_until, requested_at, confirmed_at, auto_confirmed, packed_at, delivered_at,
  closed_at, cancel_actor, cancel_reason, pickup_id, stop_id, charity_site_id, store_site_id, offer_id,
  offer:offers!allocations_offer_id_fkey(title, category_code, effective_deadline, pickup_window),
  store:organizations!allocations_store_org_id_fkey(name),
  store_site:sites!allocations_store_site_id_fkey(name),
  charity_site:sites!allocations_charity_site_id_fkey(name)`;

type Row = {
  id: string;
  status: AllocationStatus;
  unit: UnitCode;
  qty_reserved: number;
  qty_released: number;
  qty_picked: number;
  qty_delivered: number;
  kg_delivered: number | null;
  unit_weight_kg_snapshot: number;
  reserved_until: string | null;
  requested_at: string;
  confirmed_at: string | null;
  auto_confirmed: boolean;
  packed_at: string | null;
  delivered_at: string | null;
  closed_at: string | null;
  cancel_actor: string | null;
  cancel_reason: string | null;
  pickup_id: string | null;
  stop_id: string | null;
  charity_site_id: string;
  store_site_id: string;
  offer_id: string;
  offer: {
    title: string;
    category_code: string;
    effective_deadline: string | null;
    pickup_window: unknown;
  } | null;
  store: { name: string } | null;
  store_site: { name: string } | null;
  charity_site: { name: string } | null;
};

function toAllocation(r: Row): CharityAllocation {
  const window = parseTstzRange(r.offer?.pickup_window as string | null | undefined);
  return {
    id: r.id,
    status: r.status,
    unit: r.unit,
    qtyHeld: Number(r.qty_reserved) - Number(r.qty_released),
    qtyPicked: Number(r.qty_picked),
    qtyDelivered: Number(r.qty_delivered),
    kgDelivered: Number(r.kg_delivered ?? 0),
    unitWeightKg: Number(r.unit_weight_kg_snapshot),
    reservedUntil: r.reserved_until,
    requestedAt: r.requested_at,
    confirmedAt: r.confirmed_at,
    autoConfirmed: r.auto_confirmed,
    packedAt: r.packed_at,
    deliveredAt: r.delivered_at,
    closedAt: r.closed_at,
    cancelActor: r.cancel_actor,
    cancelReason: r.cancel_reason,
    pickupId: r.pickup_id,
    stopId: r.stop_id,
    charitySiteId: r.charity_site_id,
    charitySiteName: r.charity_site?.name ?? "Điểm nhận",
    storeSiteId: r.store_site_id,
    storeSiteName: r.store_site?.name ?? "",
    storeName: r.store?.name ?? "Cửa hàng",
    offerId: r.offer_id,
    offerTitle: r.offer?.title ?? "Lô tặng",
    categoryCode: r.offer?.category_code ?? "",
    effectiveDeadline: r.offer?.effective_deadline ?? null,
    pickupStart: window?.start.toISOString() ?? null,
    pickupEnd: window?.end.toISOString() ?? null,
  };
}

export async function loadAllocations(
  orgId: string,
  opts: { statuses: readonly AllocationStatus[]; closedSince?: string; limit?: number; pickupId?: string },
): Promise<CharityAllocation[]> {
  const supabase = await createClient();
  let q = supabase
    .from("allocations")
    .select(SELECT)
    .eq("charity_org_id", orgId)
    .in("status", [...opts.statuses])
    .order("requested_at", { ascending: false })
    .limit(opts.limit ?? 200);
  if (opts.closedSince) q = q.gte("closed_at", opts.closedSince);
  if (opts.pickupId) q = q.eq("pickup_id", opts.pickupId);
  const { data, error } = await q;
  if (error) throw new Error(`Không tải được danh sách phân bổ (${error.code})`);
  return ((data ?? []) as unknown as Row[]).map(toAllocation);
}

/**
 * Kg đã nhận trong tháng (giờ VN) theo sổ tác động — nguồn sự thật cho tác động (DATA-MODEL §13):
 * cộng mọi dòng credit và reversal (reversal âm) của tổ chức. RLS: owner/manager/staff của tổ chức.
 */
export async function loadKgThisMonth(orgId: string, now: Date = new Date()): Promise<number | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("impact_ledger")
    .select("kg")
    .eq("charity_org_id", orgId)
    .gte("occurred_at", startOfVnMonth(now))
    .limit(5000);
  if (error) {
    console.error("[charity-allocations] impact_ledger", { code: error.code });
    return null;
  }
  return (data ?? []).reduce((sum, r) => sum + Number(r.kg), 0);
}
