/**
 * Dữ liệu test cho engine ghép đơn (TESTING.md §3): dựng dòng `match_candidates` giống SQL (khoảng cách
 * haversine, `travel_min`, `eta_pickup` theo §4.7) và bộ sinh fast-check. Chỉ dùng trong test.
 */
import fc from "fast-check";

import { destinationPoint } from "../geo/distance";
import type { LatLng } from "../geo/types";
import { freshnessLabel, type Perishability } from "../labels";
import { DEFAULT_TRAVEL_CONFIG, type TravelConfig } from "../routing/constants";
import { haversineKm, travelMinutes } from "../routing/distance";
import { preScore } from "./score";
import type { MatchCandidate, MatchNeed } from "./types";
import { toNeedUnits, type UnitCode } from "./units";

/** Mái ấm Nắng Mai (hư cấu) — trung tâm TP.HCM. */
export const CHARITY: LatLng = { lat: 10.7769, lng: 106.7009 };
/** 20/10/2026 10:00 giờ Việt Nam. */
export const AT = Date.parse("2026-10-20T10:00:00+07:00");
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export interface OfferSpec {
  offerId: string;
  siteId: string;
  storeOrgId?: string;
  /** Vị trí điểm cửa hàng; `hidden` ⇒ SQL trả `site_lat/lng = null`. */
  location: LatLng;
  hidden?: boolean;
  category?: string;
  unit?: UnitCode;
  qty: number;
  unitWeightKg?: number;
  perishability?: Perishability;
  /** Hạn hiệu lực, phút kể từ `AT`. */
  deadlineMin: number;
  /** Đầu khung lấy, phút kể từ `AT` (mặc định −60). */
  windowStartMin?: number;
  trust?: number;
}

export interface NeedSpec {
  quantity: number;
  unit?: UnitCode;
  radiusKm?: number;
  categoryCodes?: string[];
  neededByMin?: number;
}

export function makeNeed(spec: NeedSpec): MatchNeed {
  return {
    quantity: spec.quantity,
    unit: spec.unit ?? "loaf",
    categoryCodes: spec.categoryCodes ?? ["bread"],
    siteLocation: CHARITY,
    radiusKm: spec.radiusKm ?? 10,
    neededBy: AT + (spec.neededByMin ?? 8 * 60) * MINUTE,
    at: AT,
    siteId: "charity-site",
  };
}

const iso = (ms: number) => new Date(ms).toISOString();
const pgTs = (ms: number) =>
  iso(ms)
    .replace("T", " ")
    .replace(/\.\d{3}Z$/, "+00");

/** Dòng `match_candidates` như SQL sẽ trả (khung lấy ở dạng text `tstzrange`). */
export function makeCandidate(
  spec: OfferSpec,
  need: MatchNeed,
  travel: TravelConfig = DEFAULT_TRAVEL_CONFIG,
): MatchCandidate {
  const at = AT;
  const distanceKm = Math.round(haversineKm(need.siteLocation, spec.location) * 1000) / 1000;
  const travelMin = Math.round(travelMinutes(distanceKm, travel) * 100) / 100;
  const deadline = at + spec.deadlineMin * MINUTE;
  const windowStart = at + (spec.windowStartMin ?? -60) * MINUTE;
  const etaPickup = Math.max(at + travelMin * MINUTE, windowStart);
  const unit = spec.unit ?? "loaf";
  const unitWeightKg = spec.unitWeightKg ?? (unit === "kg" ? 1 : 0.12);
  const perishability = spec.perishability ?? "cooked";
  const trust = spec.trust ?? 60;
  let availableNeedUnits = 0;
  try {
    availableNeedUnits = toNeedUnits(spec.qty, unit, unitWeightKg, need.unit);
  } catch {
    availableNeedUnits = 0;
  }
  return {
    offer_id: spec.offerId,
    store_org_id: spec.storeOrgId ?? `org-${spec.siteId}`,
    site_id: spec.siteId,
    category_code: spec.category ?? "bread",
    unit,
    unit_weight_kg: unitWeightKg,
    qty_available: spec.qty,
    available_need_units: availableNeedUnits,
    effective_deadline: iso(deadline),
    perishability,
    label: freshnessLabel(new Date(deadline), perishability, new Date(at)),
    distance_km: distanceKm,
    travel_min: travelMin,
    eta_pickup: iso(etaPickup),
    eta_dropoff: iso(etaPickup + travelMin * MINUTE),
    pickup_window: `["${pgTs(windowStart)}","${pgTs(deadline + HOUR)}")`,
    trust_score: trust,
    pre_score: preScore({
      effectiveDeadline: deadline,
      perishability,
      at,
      distanceKm,
      radiusKm: need.radiusKm,
      trustScore: trust,
    }),
    site_lat: spec.hidden ? null : spec.location.lat,
    site_lng: spec.hidden ? null : spec.location.lng,
  };
}

/** Điểm cách nhà tổ chức `km` theo hướng `bearing` độ. */
export function around(km: number, bearing: number): LatLng {
  return destinationPoint(CHARITY, km * 1000, bearing);
}

// ---------------------------------------------------------------------------
// Bộ sinh fast-check
// ---------------------------------------------------------------------------

export interface Scenario {
  need: MatchNeed;
  candidates: MatchCandidate[];
}

export interface ScenarioOptions {
  /** Thời gian rộng rãi: hạn ≥ 2 ngày, khung lấy đã mở ⇒ khả thi không bao giờ ràng buộc. */
  generous?: boolean;
  minSites?: number;
  maxSites?: number;
  minOffers?: number;
  maxOffers?: number;
  /** Chỉ một đơn vị (nhu cầu và lô cùng `loaf`), mọi lô đúng danh mục, trong bán kính. */
  clean?: boolean;
}

const arbSite = fc.record({
  km: fc.double({ min: 0.05, max: 12, noNaN: true }),
  bearing: fc.integer({ min: 0, max: 359 }),
  hidden: fc.constantFrom(false, false, false, true),
  trust: fc.integer({ min: 0, max: 100 }),
});

export function arbScenario(opts: ScenarioOptions = {}): fc.Arbitrary<Scenario> {
  const maxSites = opts.maxSites ?? 12;
  const maxOffers = opts.maxOffers ?? 20;
  return fc
    .record({
      needUnit: opts.clean ? fc.constant<UnitCode>("loaf") : fc.constantFrom<UnitCode>("loaf", "kg"),
      quantityInt: fc.integer({ min: 1, max: 600 }),
      quantityKg: fc.integer({ min: 1, max: 80_000 }).map((g) => g / 1000),
      radiusKm: fc.integer({ min: 3, max: 15 }),
      sites: fc.array(arbSite, { minLength: opts.minSites ?? 1, maxLength: maxSites, size: "max" }),
      offers: fc.array(
        fc.record({
          site: fc.nat(),
          unit: opts.clean
            ? fc.constant<UnitCode>("loaf")
            : fc.constantFrom<UnitCode>("loaf", "loaf", "loaf", "kg", "bottle", "liter"),
          qtyInt: fc.integer({ min: 0, max: 120 }),
          qtyMilli: fc.integer({ min: 0, max: 40_000 }),
          unitWeightKg: fc.integer({ min: 50, max: 2000 }).map((g) => g / 1000),
          category: opts.clean
            ? fc.constant("bread")
            : fc.constantFrom("bread", "bread", "bread", "pastry", "dairy"),
          perishability: fc.constantFrom<Perishability>("cooked", "fresh", "packaged"),
          deadlineMin: opts.generous
            ? fc.integer({ min: 2 * 24 * 60, max: 7 * 24 * 60 })
            : fc.integer({ min: -120, max: 7 * 24 * 60 }),
          windowStartMin: opts.generous
            ? fc.integer({ min: -600, max: 0 })
            : fc.integer({ min: -120, max: 360 }),
        }),
        { minLength: opts.minOffers ?? 0, maxLength: maxOffers, size: "max" },
      ),
    })
    .map((r) => {
      const need = makeNeed({
        quantity: r.needUnit === "kg" ? r.quantityKg : r.quantityInt,
        unit: r.needUnit,
        radiusKm: opts.clean ? 20 : r.radiusKm,
        categoryCodes: ["bread", "pastry"],
      });
      const candidates = r.offers.map((o, i) => {
        // Mỗi điểm có ít nhất một lô trước, phần còn lại rải ngẫu nhiên
        const siteIndex = i < r.sites.length ? i : o.site % r.sites.length;
        const site = r.sites[siteIndex]!;
        return makeCandidate(
          {
            offerId: `offer-${String(i).padStart(3, "0")}`,
            siteId: `site-${String(siteIndex).padStart(2, "0")}`,
            location: around(site.km, site.bearing),
            hidden: site.hidden,
            category: o.category,
            unit: o.unit,
            qty: o.unit === "kg" || o.unit === "liter" ? o.qtyMilli / 1000 : o.qtyInt,
            unitWeightKg: o.unit === "kg" ? 1 : o.unitWeightKg,
            perishability: o.perishability,
            deadlineMin: o.deadlineMin,
            windowStartMin: Math.min(o.windowStartMin, o.deadlineMin - 1),
            trust: site.trust,
          },
          need,
        );
      });
      return { need, candidates };
    });
}

/** Hoán vị tất định theo `keys` (để kiểm tính tất định khi đổi thứ tự đầu vào). */
export function permute<T>(items: readonly T[], keys: readonly number[]): T[] {
  return items
    .map((item, i) => ({ item, k: keys[i % Math.max(1, keys.length)] ?? 0, i }))
    .sort((a, b) => a.k - b.k || b.i - a.i)
    .map((x) => x.item);
}
