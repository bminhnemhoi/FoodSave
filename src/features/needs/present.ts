import type { LatLng, LngLatTuple } from "@/core/geo/types";
import type { FreshnessLabel, Perishability } from "@/core/labels";
import type { MatchPlan, MatchResult } from "@/core/matching";
import type { AllocationStatus, UnitCode } from "@/features/catalog/labels";

import { isLiveNeed, type NeedStatus, type SiteVisibility } from "./labels";

/**
 * View-model thuần (không IO) cho màn nhu cầu và "Phương án ghép" (P3-05, US-CHA-10…13): tiến độ ba lớp,
 * thẻ phương án (phủ, điểm dừng, km, phút, lô Đỏ, cảnh báo, từng dòng cửa hàng), chữ ký phương án và tập
 * điểm loại khi ghép lại phần thiếu. Server dựng xong rồi gửi xuống client (JSON-serializable).
 */

const qtyFormat = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 3 });

/** Số lượng theo vi-VN: 50 · 12,5 · 1.200. */
export function formatAmount(n: number): string {
  return Number.isFinite(n) ? qtyFormat.format(n) : "—";
}

// ---------------------------------------------------------------------------
// Tiến độ nhu cầu (US-CHA-13 AC1): đã giao / đang giữ / còn thiếu
// ---------------------------------------------------------------------------

export type NeedProgress = {
  quantity: number;
  delivered: number;
  /** Đang giữ + đã lấy chưa giao (R + P, DATA-MODEL §4.6). */
  inFlight: number;
  missing: number;
  /** Phần trăm bề rộng thanh (đã kẹp để tổng ≤ 100). */
  pctDelivered: number;
  pctInFlight: number;
};

export function needProgress(n: {
  quantity: number;
  qtyInFlight: number;
  qtyDelivered: number;
}): NeedProgress {
  const quantity = Math.max(0, Number(n.quantity) || 0);
  const delivered = Math.max(0, Number(n.qtyDelivered) || 0);
  const inFlight = Math.max(0, Number(n.qtyInFlight) || 0);
  const missing = Math.max(0, round3(quantity - delivered - inFlight));
  if (quantity === 0) return { quantity, delivered, inFlight, missing, pctDelivered: 0, pctInFlight: 0 };
  const pctDelivered = Math.min(100, (delivered / quantity) * 100);
  const pctInFlight = Math.min(100 - pctDelivered, (inFlight / quantity) * 100);
  return { quantity, delivered, inFlight, missing, pctDelivered, pctInFlight };
}

/** Trạng thái hiển thị (thuần): nhu cầu sống đã quá `needed_by` ⇒ `closed_partial`/`expired` như cron sẽ đặt. */
export function displayStatusOf(
  n: { status: NeedStatus; neededBy: string; qtyDelivered: number },
  now: number,
): NeedStatus {
  if (isLiveNeed(n.status) && new Date(n.neededBy).getTime() <= now)
    return n.qtyDelivered > 0 ? "closed_partial" : "expired";
  return n.status;
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

/** "Đáp ứng 50/50" · "Đáp ứng 38/50 — thiếu 12" (US-CHA-10 AC1, AC3). */
export function coverageText(p: { coveredQty: number; requestedQty: number; shortfall: number }): string {
  const base = `Đáp ứng ${formatAmount(p.coveredQty)}/${formatAmount(p.requestedQty)}`;
  return p.shortfall > 0 ? `${base} — thiếu ${formatAmount(p.shortfall)}` : base;
}

// ---------------------------------------------------------------------------
// Phương án ghép
// ---------------------------------------------------------------------------

/**
 * Chữ ký phương án = các dòng (lô, số lượng) đã sắp. Server tính lại phương án lúc người dùng bấm chọn và chỉ
 * giữ chỗ khi chữ ký khớp đúng phương án đã hiển thị (không bao giờ giữ thứ người dùng chưa thấy).
 */
export function planKey(lines: readonly { offerId: string; qty: number }[]): string {
  return [...lines]
    .map((l) => `${l.offerId}:${Number(l.qty)}`)
    .sort()
    .join(",");
}

export type PlanEnrichment = {
  offers: Record<string, { title: string }>;
  stores: Record<string, { name: string }>;
  sites: Record<string, { name: string; visibility: SiteVisibility; ward: string | null }>;
  categoryNames: Record<string, string>;
};

export type PlanLineView = {
  offerId: string;
  title: string;
  categoryName: string;
  qty: number;
  unit: UnitCode;
  needUnits: number;
  label: FreshnessLabel;
  perishability: Perishability;
  effectiveDeadline: string;
};

export type PlanStopView = {
  seq: number;
  siteId: string;
  storeName: string;
  siteName: string;
  ward: string | null;
  visibility: SiteVisibility;
  /** Toạ độ công khai (lưới gần đúng khi `approximate`), null khi ẩn. */
  location: LatLng | null;
  /** Khoảng cách tới điểm nhận (km nguyên với điểm không công khai — SQL đã làm thô). */
  distanceKm: number;
  arriveAt: string;
  lines: PlanLineView[];
};

export type PlanView = {
  key: string;
  rank: number;
  unit: UnitCode;
  requestedQty: number;
  coveredQty: number;
  shortfall: number;
  covered: boolean;
  stopCount: number;
  estDistanceM: number;
  estDurationS: number;
  /** ETA về tới điểm nhận. */
  endAt: string;
  redLots: number;
  /** Cảnh báo `arrives_after_needed_by` (chỉ cảnh báo, không loại). */
  lateForNeed: boolean;
  /** Mọi điểm dừng công khai vị trí ⇒ được gọi chỉ đường thật khi chọn. */
  allPublic: boolean;
  hiddenStops: number;
  stops: PlanStopView[];
  /** Đường ước tính [lng, lat]: điểm nhận → các điểm có toạ độ theo thứ tự đi → điểm nhận. */
  path: LngLatTuple[];
};

const FALLBACK_SITE = { name: "Chi nhánh", visibility: "hidden" as SiteVisibility, ward: null };

export function toPlanView(plan: MatchPlan, unit: UnitCode, info: PlanEnrichment, home: LatLng): PlanView {
  const distanceBySite = new Map(plan.scores.map((s) => [s.siteId, s.distanceKm]));
  const stops: PlanStopView[] = plan.stops.map((s) => {
    const site = info.sites[s.siteId] ?? FALLBACK_SITE;
    const lines = plan.lines
      .filter((l) => l.siteId === s.siteId)
      .map((l): PlanLineView => ({
        offerId: l.offerId,
        title: info.offers[l.offerId]?.title ?? "Lô tặng",
        categoryName: info.categoryNames[l.categoryCode] ?? l.categoryCode,
        qty: l.qty,
        unit: l.unit,
        needUnits: l.needUnits,
        label: l.label,
        perishability: l.perishability,
        effectiveDeadline: l.effectiveDeadline,
      }));
    // Điểm ẩn không bao giờ có toạ độ, kể cả khi dữ liệu lệch (phòng thủ)
    const location = site.visibility === "hidden" ? null : s.location;
    return {
      seq: s.seq,
      siteId: s.siteId,
      storeName: info.stores[s.storeOrgId]?.name ?? "Cửa hàng",
      siteName: site.name,
      ward: site.ward,
      visibility: location ? site.visibility : "hidden",
      location,
      distanceKm: distanceBySite.get(s.siteId) ?? 0,
      arriveAt: s.arriveAt,
      lines,
    };
  });
  const known = stops.filter((s) => s.location).map((s) => [s.location!.lng, s.location!.lat] as LngLatTuple);
  return {
    key: planKey(plan.lines),
    rank: plan.rank,
    unit,
    requestedQty: plan.requestedQty,
    coveredQty: plan.coveredQty,
    shortfall: plan.shortfall,
    covered: plan.shortfall <= 0,
    stopCount: plan.stopCount,
    estDistanceM: plan.estDistanceM,
    estDurationS: plan.estDurationS,
    endAt: plan.route.endAt,
    redLots: plan.redLots,
    lateForNeed: plan.warnings.includes("arrives_after_needed_by"),
    allPublic: stops.every((s) => s.visibility === "public"),
    hiddenStops: stops.filter((s) => s.visibility === "hidden").length,
    stops,
    path: [[home.lng, home.lat], ...known, [home.lng, home.lat]],
  };
}

export function toPlanViews(
  result: MatchResult,
  unit: UnitCode,
  info: PlanEnrichment,
  home: LatLng,
): PlanView[] {
  return result.plans.map((p) => toPlanView(p, unit, info, home));
}

// ---------------------------------------------------------------------------
// Ghép lại phần thiếu (US-CHA-12, DATA-MODEL §6.3)
// ---------------------------------------------------------------------------

export type AllocationLite = {
  storeSiteId: string;
  status: AllocationStatus;
  cancelActor: string | null;
};

/**
 * Điểm cửa hàng loại khỏi lần ghép lại: mọi điểm đã có phân bổ của nhu cầu (đang chạy hoặc đã xong), cộng điểm
 * đã từ chối / để hết hạn / tự hủy. Chỉ điểm mà chính tổ chức đã hủy yêu cầu mới được đề xuất lại.
 */
export function rematchExclusions(allocations: readonly AllocationLite[]): string[] {
  const out = new Set<string>();
  for (const a of allocations) {
    if (a.status === "cancelled" && a.cancelActor === "charity") continue;
    out.add(a.storeSiteId);
  }
  return [...out].sort();
}

/** Số còn thiếu = cần − đang giữ − đã giao (≥ 0). */
export function remainingOf(n: { quantity: number; qtyInFlight: number; qtyDelivered: number }): number {
  return Math.max(0, round3(Number(n.quantity) - Number(n.qtyInFlight) - Number(n.qtyDelivered)));
}

// ---------------------------------------------------------------------------
// Phương án đã chọn (bundle) — điểm dừng đánh số theo thứ tự đi lúc chọn
// ---------------------------------------------------------------------------

export type BundleStop = {
  siteId: string;
  seq: number;
  storeName: string;
  visibility: SiteVisibility;
  location: LatLng | null;
};

/**
 * Điểm dừng của một bundle: mỗi điểm cửa hàng một lần, theo `inputs_snapshot.option.order` (thứ tự đi đã
 * tính lúc chọn); điểm không có trong thứ tự (dữ liệu cũ) xếp sau theo tên. Điểm ẩn không có toạ độ.
 */
export function bundleStops(
  stopOrder: readonly string[],
  allocations: readonly {
    storeSiteId: string;
    storeName: string;
    storeVisibility: SiteVisibility;
    storeLocation: LatLng | null;
  }[],
): BundleStop[] {
  const bySite = new Map<string, (typeof allocations)[number]>();
  for (const a of allocations) if (!bySite.has(a.storeSiteId)) bySite.set(a.storeSiteId, a);
  const rank = (id: string) => {
    const i = stopOrder.indexOf(id);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...bySite.values()]
    .sort((a, b) => rank(a.storeSiteId) - rank(b.storeSiteId) || a.storeName.localeCompare(b.storeName, "vi"))
    .map((a, i) => ({
      siteId: a.storeSiteId,
      seq: i + 1,
      storeName: a.storeName,
      visibility: a.storeVisibility,
      location: a.storeVisibility === "hidden" ? null : a.storeLocation,
    }));
}

/** Đường ước tính của bundle: điểm nhận → các điểm có toạ độ theo thứ tự → điểm nhận. */
export function bundlePath(stops: readonly BundleStop[], home: LatLng): LngLatTuple[] {
  return [
    [home.lng, home.lat],
    ...stops.filter((s) => s.location).map((s) => [s.location!.lng, s.location!.lat] as LngLatTuple),
    [home.lng, home.lat],
  ];
}
