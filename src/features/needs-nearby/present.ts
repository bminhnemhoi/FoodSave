import type { LatLng } from "@/core/geo/types";
import type { UnitCode } from "@/features/catalog/labels";
import { formatKm } from "@/lib/format";
import type { NeedStatus, SiteVisibility } from "@/features/needs/labels";

/**
 * "Nhu cầu gần bạn" (P3-07, US-STO-20/21) — kiểu dữ liệu + trình bày thuần (không IO). Dữ liệu đến từ RPC
 * `needs_nearby` đã làm thô vị trí: điểm gần đúng là lưới ~550 m, điểm ẩn không có toạ độ lẫn khoảng cách.
 */

export type NearbyNeed = {
  needId: string;
  charityOrgId: string;
  charityName: string;
  charitySubtype: string;
  categoryCodes: string[];
  unit: UnitCode;
  quantity: number;
  qtyRemaining: number;
  qtyInFlight: number;
  qtyDelivered: number;
  neededBy: string;
  peopleToServe: number | null;
  status: NeedStatus;
  storeSiteId: string;
  /** null với điểm nhận ẩn. */
  distanceKm: number | null;
  visibility: SiteVisibility;
  ward: string | null;
  city: string | null;
  /** Toạ độ công khai (lưới gần đúng / null khi ẩn). */
  location: LatLng | null;
};

export type NearbyRow = {
  need_id: string;
  charity_org_id: string;
  charity_name: string;
  charity_subtype: string;
  category_codes: string[];
  unit: UnitCode;
  quantity: number;
  qty_in_flight: number;
  qty_delivered: number;
  qty_remaining: number;
  needed_by: string;
  people_to_serve: number | null;
  status: NeedStatus;
  store_site_id: string;
  distance_km: number | null;
  site_visibility: SiteVisibility;
  site_ward: string | null;
  site_city: string | null;
  site_lat: number | null;
  site_lng: number | null;
};

export function toNearbyNeed(r: NearbyRow): NearbyNeed {
  const hidden = r.site_visibility === "hidden";
  const hasPoint = !hidden && r.site_lat !== null && r.site_lng !== null;
  return {
    needId: r.need_id,
    charityOrgId: r.charity_org_id,
    charityName: r.charity_name,
    charitySubtype: r.charity_subtype,
    categoryCodes: r.category_codes ?? [],
    unit: r.unit,
    quantity: Number(r.quantity),
    qtyRemaining: Number(r.qty_remaining),
    qtyInFlight: Number(r.qty_in_flight),
    qtyDelivered: Number(r.qty_delivered),
    neededBy: r.needed_by,
    peopleToServe: r.people_to_serve,
    status: r.status,
    storeSiteId: r.store_site_id,
    distanceKm: hidden || r.distance_km === null ? null : Number(r.distance_km),
    visibility: r.site_visibility,
    ward: r.site_ward,
    city: r.site_city,
    location: hasPoint ? { lat: Number(r.site_lat), lng: Number(r.site_lng) } : null,
  };
}

/** "cách 1,2 km" (công khai) · "cách ~2 km" (gần đúng, km nguyên) · "trong bán kính phục vụ" (ẩn). */
export function distanceText(n: Pick<NearbyNeed, "distanceKm" | "visibility">): string {
  if (n.visibility === "hidden" || n.distanceKm === null) return "trong bán kính phục vụ";
  return n.visibility === "public" ? `cách ${formatKm(n.distanceKm)}` : `cách ~${formatKm(n.distanceKm)}`;
}

/** Khu vực hiển thị: "Phường Bến Thành" (điểm ẩn/gần đúng chỉ tới phường). */
export function areaText(n: Pick<NearbyNeed, "ward" | "city">): string {
  return n.ward || n.city || "Khu vực gần bạn";
}

/** Nhu cầu đã có cửa hàng giữ đủ ⇒ nút "Đăng lô phù hợp" vô hiệu kèm giải thích (US-STO-21 AC3). */
export function canRespond(n: Pick<NearbyNeed, "status" | "qtyRemaining">): boolean {
  return n.status !== "matched" && n.qtyRemaining > 0;
}
