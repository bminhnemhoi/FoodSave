import type { LatLng, LngLatTuple } from "@/core/geo/types";
import {
  bestOrder,
  DEFAULT_TRAVEL_CONFIG,
  haversineKm,
  splitBetweenTwo,
  type RoutePlan,
  type RouteStop,
  type TravelConfig,
} from "@/core/routing";

import { MAX_PICKUP_STOPS } from "./plan";

/**
 * Lập chuyến tình nguyện viên (thuần, không IO — PRD US-CHA-16, US-CHA-17; ROADMAP P3-09): gom phân bổ theo
 * cửa hàng, sắp thứ tự bằng `bestOrder` (1 TNV) hoặc chia tuyến bằng `splitBetweenTwo` (2 TNV, mỗi người xuất
 * phát từ khu vực gần đúng của mình nếu có), tính ETA từng điểm, tổng km/phút và cảnh báo sức chở.
 * Client dùng để xem trước, server action gọi lại đúng hàm này trên dữ liệu đọc qua RLS trước `assign_pickup`.
 * Tuyến ở đây là ước tính (chim bay × hệ số, nối thẳng các điểm) — tuyến xe máy thật chỉ gọi khi giao chuyến.
 */

export type PlanAllocation = {
  id: string;
  storeSiteId: string;
  kg: number;
  /** Đầu khung lấy (ISO) — tới sớm hơn thì chờ. */
  pickupStart: string | null;
  /** Hạn hiệu lực (ISO) — bắt đầu lấy sau mốc này là trễ. */
  effectiveDeadline: string | null;
};

export type PlanStore = {
  siteId: string;
  name: string;
  /** Toạ độ công khai: chính xác (public), lưới gần đúng (approximate) hoặc null (ẩn). */
  location: LatLng | null;
  approximate: boolean;
};

export type PlanVolunteer = {
  userId: string;
  name: string;
  /** Khu vực gần đúng (lưới 0,01°) — điểm xuất phát ước tính; null ⇒ xuất phát từ điểm nhận. */
  base: LatLng | null;
  capacityKg: number;
};

export type PlanInput = {
  dropoff: { siteId: string; location: LatLng };
  stores: readonly PlanStore[];
  allocations: readonly PlanAllocation[];
  /** 1 hoặc 2 tình nguyện viên, theo thứ tự chọn (tuyến 1, tuyến 2). */
  volunteers: readonly PlanVolunteer[];
  departAt: number;
  config?: TravelConfig;
};

export type PlannedStop = {
  siteId: string;
  name: string;
  seq: number;
  location: LatLng | null;
  approximate: boolean;
  /** null khi không ước tính được (cửa hàng ẩn vị trí). */
  arriveAt: string | null;
  deadline: string | null;
  lateMin: number;
  waitMin: number;
  allocationIds: string[];
  kg: number;
};

export type PlannedTrip = {
  volunteer: PlanVolunteer;
  stops: PlannedStop[];
  dropoffEta: string | null;
  distanceM: number | null;
  durationS: number | null;
  elapsedS: number | null;
  kg: number;
  overCapacity: boolean;
  feasible: boolean;
  lateMin: number;
  allocationIds: string[];
  /** Tuyến ước tính nối thẳng các điểm lấy theo thứ tự rồi về điểm nhận ([lng, lat]); thiếu toạ độ ⇒ null. */
  line: LngLatTuple[] | null;
};

export type VolunteerPlan = {
  /** `optimized` = thứ tự tối ưu theo thời gian; `deadline` = có cửa hàng ẩn vị trí, sắp theo hạn sớm nhất. */
  method: "optimized" | "deadline";
  trips: PlannedTrip[];
  feasible: boolean;
  /** Thời gian của chuyến dài nhất (giây), null khi không ước tính được. */
  makespanS: number | null;
  distanceM: number | null;
};

export type PlanFailure =
  | "no_allocations"
  | "no_volunteer"
  | "too_many_volunteers"
  | "split_needs_two_stores"
  | "missing_location"
  | "too_many_stops";

export type PlanResult = { ok: true; plan: VolunteerPlan } | { ok: false; reason: PlanFailure };

type StoreGroup = {
  store: PlanStore;
  allocationIds: string[];
  kg: number;
  readyAt: number | null;
  deadline: number | null;
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const ms = (iso: string | null) => (iso ? Date.parse(iso) : Number.NaN);

/** Gom phân bổ theo cửa hàng: sẵn sàng khi khung lấy của MỌI lô đã mở, hạn = hạn sớm nhất. */
function groupByStore(input: PlanInput): StoreGroup[] {
  const stores = new Map(input.stores.map((s) => [s.siteId, s]));
  const groups = new Map<string, StoreGroup>();
  for (const a of input.allocations) {
    const store = stores.get(a.storeSiteId) ?? {
      siteId: a.storeSiteId,
      name: "Cửa hàng",
      location: null,
      approximate: false,
    };
    const g = groups.get(a.storeSiteId) ?? {
      store,
      allocationIds: [],
      kg: 0,
      readyAt: null,
      deadline: null,
    };
    g.allocationIds.push(a.id);
    g.kg += Number.isFinite(a.kg) ? a.kg : 0;
    const start = ms(a.pickupStart);
    if (Number.isFinite(start)) g.readyAt = g.readyAt === null ? start : Math.max(g.readyAt, start);
    const end = ms(a.effectiveDeadline);
    if (Number.isFinite(end)) g.deadline = g.deadline === null ? end : Math.min(g.deadline, end);
    groups.set(a.storeSiteId, g);
  }
  return [...groups.values()];
}

function routeStops(groups: readonly StoreGroup[]): RouteStop[] {
  return groups.map((g) => ({
    id: g.store.siteId,
    location: g.store.location,
    readyAt: g.readyAt,
    deadline: g.deadline,
  }));
}

function lineOf(stops: readonly PlannedStop[], dropoff: LatLng): LngLatTuple[] | null {
  if (stops.some((s) => !s.location)) return null;
  return [...stops.map((s) => [s.location!.lng, s.location!.lat] as LngLatTuple), [dropoff.lng, dropoff.lat]];
}

function tripFromRoute(
  volunteer: PlanVolunteer,
  route: RoutePlan,
  bySite: Map<string, StoreGroup>,
  dropoff: LatLng,
): PlannedTrip {
  const stops: PlannedStop[] = route.order.map((siteId, i) => {
    const g = bySite.get(siteId)!;
    const leg = route.legs[i]!;
    return {
      siteId,
      name: g.store.name,
      seq: i + 1,
      location: g.store.location,
      approximate: g.store.approximate,
      arriveAt: leg.arriveAt,
      deadline: leg.deadline,
      lateMin: leg.lateMin,
      waitMin: leg.waitMin,
      allocationIds: [...g.allocationIds].sort(),
      kg: round1(g.kg),
    };
  });
  const kg = round1(stops.reduce((s, x) => s + x.kg, 0));
  return {
    volunteer,
    stops,
    dropoffEta: route.legs[route.legs.length - 1]?.arriveAt ?? route.endAt,
    distanceM: route.distanceM,
    durationS: route.durationS,
    elapsedS: route.elapsedS,
    kg,
    overCapacity: kg > volunteer.capacityKg,
    feasible: route.feasible,
    lateMin: route.lateMin,
    allocationIds: stops.flatMap((s) => s.allocationIds).sort(),
    line: lineOf(stops, dropoff),
  };
}

/** Có cửa hàng ẩn vị trí: không tối ưu được ⇒ một chuyến theo hạn hiệu lực sớm nhất (giống `assign_pickup`). */
function deadlineTrip(volunteer: PlanVolunteer, groups: StoreGroup[], dropoff: LatLng): PlannedTrip {
  const ordered = [...groups].sort(
    (a, b) =>
      (a.deadline ?? Number.POSITIVE_INFINITY) - (b.deadline ?? Number.POSITIVE_INFINITY) ||
      (a.store.siteId < b.store.siteId ? -1 : a.store.siteId > b.store.siteId ? 1 : 0),
  );
  const stops: PlannedStop[] = ordered.map((g, i) => ({
    siteId: g.store.siteId,
    name: g.store.name,
    seq: i + 1,
    location: g.store.location,
    approximate: g.store.approximate,
    arriveAt: null,
    deadline: g.deadline === null ? null : new Date(g.deadline).toISOString(),
    lateMin: 0,
    waitMin: 0,
    allocationIds: [...g.allocationIds].sort(),
    kg: round1(g.kg),
  }));
  const kg = round1(stops.reduce((s, x) => s + x.kg, 0));
  return {
    volunteer,
    stops,
    dropoffEta: null,
    distanceM: null,
    durationS: null,
    elapsedS: null,
    kg,
    overCapacity: kg > volunteer.capacityKg,
    feasible: true,
    lateMin: 0,
    allocationIds: stops.flatMap((s) => s.allocationIds).sort(),
    line: lineOf(stops, dropoff),
  };
}

export function planVolunteerTrips(input: PlanInput): PlanResult {
  if (input.allocations.length === 0) return { ok: false, reason: "no_allocations" };
  if (input.volunteers.length === 0) return { ok: false, reason: "no_volunteer" };
  if (input.volunteers.length > 2) return { ok: false, reason: "too_many_volunteers" };

  const groups = groupByStore(input);
  const bySite = new Map(groups.map((g) => [g.store.siteId, g]));
  const config = input.config ?? DEFAULT_TRAVEL_CONFIG;
  const dropoff = { id: input.dropoff.siteId, location: input.dropoff.location };
  const anchor = (v: PlanVolunteer) => (v.base ? { id: `base:${v.userId}`, location: v.base } : null);
  const located = groups.every((g) => g.store.location !== null);

  if (input.volunteers.length === 1) {
    const v = input.volunteers[0]!;
    if (groups.length > MAX_PICKUP_STOPS) return { ok: false, reason: "too_many_stops" };
    if (!located) {
      const trip = deadlineTrip(v, groups, input.dropoff.location);
      return {
        ok: true,
        plan: { method: "deadline", trips: [trip], feasible: true, makespanS: null, distanceM: null },
      };
    }
    const route = bestOrder({
      stops: routeStops(groups),
      dropoff,
      start: anchor(v),
      departAt: input.departAt,
      config,
      objective: "duration",
    });
    const trip = tripFromRoute(v, route, bySite, input.dropoff.location);
    return {
      ok: true,
      plan: {
        method: "optimized",
        trips: [trip],
        feasible: trip.feasible,
        makespanS: trip.elapsedS,
        distanceM: trip.distanceM,
      },
    };
  }

  if (groups.length < 2) return { ok: false, reason: "split_needs_two_stores" };
  if (!located) return { ok: false, reason: "missing_location" };
  if (groups.length > MAX_PICKUP_STOPS * 2) return { ok: false, reason: "too_many_stops" };
  const [v1, v2] = input.volunteers as [PlanVolunteer, PlanVolunteer];
  const split = splitBetweenTwo({
    stops: routeStops(groups),
    dropoff,
    bases: [anchor(v1), anchor(v2)],
    departAt: input.departAt,
    config,
    objective: "duration",
  });
  const trips = [
    tripFromRoute(v1, split.routes[0], bySite, input.dropoff.location),
    tripFromRoute(v2, split.routes[1], bySite, input.dropoff.location),
  ];
  if (trips.some((t) => t.stops.length > MAX_PICKUP_STOPS)) return { ok: false, reason: "too_many_stops" };
  return {
    ok: true,
    plan: {
      method: "optimized",
      trips,
      feasible: split.feasible,
      makespanS: split.makespanS,
      distanceM: trips[0]!.distanceM! + trips[1]!.distanceM!,
    },
  };
}

/** `stops` cho `assign_pickup` (DATA-MODEL §8.5): điểm lấy theo thứ tự + điểm giao cuối, kèm ETA nếu có. */
export function assignStops(trip: PlannedTrip, charitySiteId: string) {
  return [
    ...trip.stops.map((s) => ({
      site_id: s.siteId,
      seq: s.seq,
      kind: "pickup" as const,
      ...(s.arriveAt ? { eta: s.arriveAt } : {}),
    })),
    {
      site_id: charitySiteId,
      seq: trip.stops.length + 1,
      kind: "dropoff" as const,
      ...(trip.dropoffEta ? { eta: trip.dropoffEta } : {}),
    },
  ];
}

// ---------------------------------------------------------------------------
// Gợi ý tình nguyện viên (US-CHA-16 AC2)
// ---------------------------------------------------------------------------

export type VolunteerCandidate = {
  userId: string;
  name: string;
  base: LatLng | null;
  capacityKg: number;
  /** Chuyến đã giao/đang chạy (assigned, in_progress). */
  openTrips: number;
  paused: boolean;
};

export type RankedVolunteer<T extends VolunteerCandidate = VolunteerCandidate> = T & {
  /** Km chim bay từ khu vực của TNV tới cửa hàng đầu tiên; null khi chưa khai khu vực. */
  distanceKm: number | null;
  fitsLoad: boolean;
  busy: boolean;
  suggested: boolean;
};

/**
 * Thứ tự gợi ý: đang hoạt động → đủ sức chở (Σ kg ≤ sức chở) → không có chuyến đang mở → gần cửa hàng đầu
 * tiên (theo khu vực gần đúng) → tên. TNV tạm ngưng xếp cuối và không bao giờ được gợi ý.
 */
export function rankVolunteers<T extends VolunteerCandidate>(
  volunteers: readonly T[],
  firstStore: LatLng | null,
  totalKg: number,
): RankedVolunteer<T>[] {
  const ranked = volunteers.map((v) => ({
    ...v,
    distanceKm: firstStore && v.base ? round1(haversineKm(v.base, firstStore)) : null,
    fitsLoad: totalKg <= v.capacityKg,
    busy: v.openTrips > 0,
    suggested: false,
  }));
  const key = (v: (typeof ranked)[number]) => [
    v.paused ? 1 : 0,
    v.fitsLoad ? 0 : 1,
    v.busy ? 1 : 0,
    v.distanceKm ?? Number.POSITIVE_INFINITY,
  ];
  ranked.sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i]! - kb[i]!;
    return a.name.localeCompare(b.name, "vi") || (a.userId < b.userId ? -1 : 1);
  });
  const top = ranked[0];
  if (top && !top.paused) top.suggested = true;
  return ranked;
}

/** Cửa hàng đầu tiên để gợi ý TNV: hạn hiệu lực sớm nhất trong lựa chọn (có toạ độ). */
export function firstStoreLocation(input: Pick<PlanInput, "stores" | "allocations">): LatLng | null {
  const groups = groupByStore({
    stores: input.stores,
    allocations: input.allocations,
    dropoff: { siteId: "", location: { lat: 0, lng: 0 } },
    volunteers: [],
    departAt: 0,
  });
  const located = groups.filter((g) => g.store.location);
  located.sort((a, b) => (a.deadline ?? Number.POSITIVE_INFINITY) - (b.deadline ?? Number.POSITIVE_INFINITY));
  return located[0]?.store.location ?? null;
}
