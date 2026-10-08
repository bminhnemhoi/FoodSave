import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { destinationPoint } from "../geo/distance";
import type { LatLng } from "../geo/types";
import {
  DEFAULT_TRAVEL_CONFIG,
  GOOGLE_MAX_WAYPOINTS,
  MAX_EXACT_STOPS,
  MAX_SPLIT_STOPS,
  TRAVEL_SETTING_KEYS,
  appleMapsDirectionsUrl,
  assertTravelConfig,
  bestOrder,
  driveMinutes,
  estimateRoute,
  googleMapsDirectionsUrl,
  haversineKm,
  parseTimestamp,
  roadKm,
  routeDirectionsLinks,
  splitBetweenTwo,
  toIso,
  toMs,
  toMsOrNull,
  travelConfigFrom,
  travelMinutes,
  type RouteStop,
} from "./index";

const HUB: LatLng = { lat: 10.7769, lng: 106.7009 };
const DROPOFF = { id: "charity", location: HUB };
const AT = Date.parse("2026-10-20T10:00:00+07:00");
const MIN = 60_000;
const at = (km: number, bearing: number) => destinationPoint(HUB, km * 1000, bearing);
const stop = (id: string, km: number, bearing: number, extra: Partial<RouteStop> = {}): RouteStop => ({
  id,
  location: at(km, bearing),
  ...extra,
});

describe("hằng số di chuyển", () => {
  it("mặc định khớp app_settings trong seed (chống lệch SQL ↔ TS)", () => {
    const seed = readFileSync(
      fileURLToPath(new URL("../../../supabase/seed/00_reference.sql", import.meta.url)),
      "utf8",
    );
    const value = (key: string) => Number(new RegExp(`'${key}',\\s*'([\\d.]+)'`).exec(seed)?.[1]);
    expect(value(TRAVEL_SETTING_KEYS.speedKmh)).toBe(DEFAULT_TRAVEL_CONFIG.speedKmh);
    expect(value(TRAVEL_SETTING_KEYS.detourFactor)).toBe(DEFAULT_TRAVEL_CONFIG.detourFactor);
    expect(value(TRAVEL_SETTING_KEYS.bufferMinutes)).toBe(DEFAULT_TRAVEL_CONFIG.bufferMinutes);
    expect(value("max_pickup_stops")).toBe(MAX_EXACT_STOPS);
  });

  it("travelConfigFrom đọc số hoặc chuỗi số, sai thì dùng mặc định", () => {
    expect(travelConfigFrom(null)).toEqual(DEFAULT_TRAVEL_CONFIG);
    expect(
      travelConfigFrom({
        matching_speed_kmh: "20",
        matching_detour_factor: 1.3,
        matching_buffer_minutes: "0",
      }),
    ).toEqual({ speedKmh: 20, detourFactor: 1.3, bufferMinutes: 0 });
    expect(
      travelConfigFrom({
        matching_speed_kmh: "abc",
        matching_detour_factor: 0.5,
        matching_buffer_minutes: -1,
      }),
    ).toEqual(DEFAULT_TRAVEL_CONFIG);
    expect(travelConfigFrom({ matching_speed_kmh: "", matching_detour_factor: null })).toEqual(
      DEFAULT_TRAVEL_CONFIG,
    );
  });

  it("assertTravelConfig từ chối cấu hình sai", () => {
    expect(assertTravelConfig({ ...DEFAULT_TRAVEL_CONFIG })).toEqual(DEFAULT_TRAVEL_CONFIG);
    expect(() => assertTravelConfig({ ...DEFAULT_TRAVEL_CONFIG, speedKmh: 0 })).toThrow(RangeError);
    expect(() => assertTravelConfig({ ...DEFAULT_TRAVEL_CONFIG, detourFactor: 0.9 })).toThrow(RangeError);
    expect(() => assertTravelConfig({ ...DEFAULT_TRAVEL_CONFIG, bufferMinutes: Number.NaN })).toThrow(
      RangeError,
    );
  });

  it("travel_min = km × 1,4 ÷ 18 × 60 + 10 (DATA-MODEL §4.7)", () => {
    expect(roadKm(3)).toBeCloseTo(4.2, 10);
    expect(driveMinutes(3)).toBeCloseTo(14, 10);
    expect(travelMinutes(3)).toBeCloseTo(24, 10);
    expect(travelMinutes(0)).toBe(10);
    expect(travelMinutes(3, { detourFactor: 1, speedKmh: 30, bufferMinutes: 0 })).toBeCloseTo(6, 10);
    expect(haversineKm(HUB, at(2, 45))).toBeCloseTo(2, 6);
  });
});

describe("thời gian", () => {
  it("đọc timestamptz của Postgres và ISO", () => {
    const expected = Date.parse("2026-10-20T03:00:00Z");
    expect(parseTimestamp("2026-10-20 10:00:00+07")).toBe(expected);
    expect(parseTimestamp("2026-10-20T10:00:00+07:00")).toBe(expected);
    expect(parseTimestamp("2026-10-20T10:00:00+0700")).toBe(expected);
    expect(parseTimestamp("2026-10-20T03:00:00Z")).toBe(expected);
    expect(parseTimestamp(" 2026-10-20 03:00:00.123456+00 ")).toBe(expected + 123);
    expect(parseTimestamp("2026-10-20T10:00")).toBeNaN(); // thiếu múi giờ
    expect(parseTimestamp("20/10/2026")).toBeNaN();
  });

  it("toMs nhận Date, số, chuỗi; sai thì RangeError", () => {
    expect(toMs(new Date(5))).toBe(5);
    expect(toMs(7)).toBe(7);
    expect(toMs("2026-10-20T03:00:00Z")).toBe(Date.parse("2026-10-20T03:00:00Z"));
    expect(() => toMs("hôm nay", "at")).toThrow("at không hợp lệ");
    expect(() => toMs(Number.NaN)).toThrow(RangeError);
    expect(toMsOrNull(null)).toBeNull();
    expect(toMsOrNull(undefined)).toBeNull();
    expect(toIso(0)).toBe("1970-01-01T00:00:00.000Z");
  });
});

describe("bestOrder", () => {
  it("các điểm thẳng hàng: đi ra rồi quay về, hòa thì thứ tự id nhỏ hơn", () => {
    const plan = bestOrder({
      stops: [stop("c", 3, 90), stop("a", 1, 90), stop("b", 2, 90)],
      dropoff: DROPOFF,
      departAt: AT,
    });
    expect(plan.method).toBe("exact");
    expect(plan.evaluated).toBe(6);
    expect(plan.order).toEqual(["a", "b", "c"]);
    expect(plan.distanceM).toBeGreaterThan(8390);
    expect(plan.distanceM).toBeLessThan(8410); // 6 km chim bay × 1,4
    expect(plan.legs.map((l) => l.kind)).toEqual(["pickup", "pickup", "pickup", "dropoff"]);
    expect(plan.legs.at(-1)!.to).toBe("charity");
    // 6 km × 1,4 ÷ 18 km/h = 28 phút lái + 4 lần đệm 10 phút
    expect(plan.durationS).toBeCloseTo(68 * 60, -1);
    expect(plan.waitS).toBe(0);
    expect(plan.feasible).toBe(true);
    expect(plan.departAt).toBe(toIso(AT));
    expect(Date.parse(plan.endAt) - AT).toBeCloseTo(plan.elapsedS * 1000, -3);
  });

  it("tôn trọng hạn hiệu lực: đi điểm sắp hết hạn trước dù xa hơn", () => {
    const plan = bestOrder({
      stops: [stop("near", 1, 0), stop("far-red", 3, 180, { deadline: AT + 30 * MIN })],
      dropoff: DROPOFF,
      departAt: AT,
    });
    expect(plan.order).toEqual(["far-red", "near"]);
    expect(plan.feasible).toBe(true);
    expect(Date.parse(plan.legs[0]!.serviceAt)).toBeLessThanOrEqual(AT + 30 * MIN);
  });

  it("tới trước khung lấy thì chờ", () => {
    const plan = bestOrder({
      stops: [stop("a", 1, 90, { readyAt: AT + 60 * MIN })],
      dropoff: DROPOFF,
      departAt: new Date(AT),
    });
    expect(plan.legs[0]!.serviceAt).toBe(toIso(AT + 60 * MIN));
    expect(plan.legs[0]!.waitMin).toBeGreaterThan(40);
    expect(plan.waitS).toBeGreaterThan(40 * 60);
    expect(plan.elapsedS).toBe(plan.durationS + plan.waitS);
  });

  it("không có thứ tự khả thi ⇒ trả thứ tự trễ ít nhất, gắn cờ", () => {
    const plan = bestOrder({
      stops: [stop("a", 4, 0, { deadline: AT + 25 * MIN }), stop("b", 4, 180, { deadline: AT + 25 * MIN })],
      dropoff: DROPOFF,
      departAt: AT,
    });
    expect(plan.feasible).toBe(false);
    expect(plan.lateMin).toBeGreaterThan(0);
    expect(plan.legs.some((l) => l.lateMin > 0)).toBe(true);
  });

  it("hạn tới điểm giao (tùy chọn)", () => {
    const ok = bestOrder({
      stops: [stop("a", 1, 0)],
      dropoff: DROPOFF,
      departAt: AT,
      dropoffDeadline: AT + 60 * MIN,
    });
    const late = bestOrder({
      stops: [stop("a", 1, 0)],
      dropoff: DROPOFF,
      departAt: AT,
      dropoffDeadline: toIso(AT + 15 * MIN),
    });
    expect(ok.feasible).toBe(true);
    expect(late.feasible).toBe(false);
    expect(late.legs.at(-1)!.deadline).toBe(toIso(AT + 15 * MIN));
  });

  it("mục tiêu distance và duration chọn khác nhau khi phải chờ khung lấy", () => {
    const input = {
      stops: [stop("a", 1, 90, { readyAt: AT + 60 * MIN }), stop("b", 1, 0, { readyAt: AT + 100 * MIN })],
      dropoff: DROPOFF,
      start: { id: "base", location: at(2, 270) },
      departAt: AT,
    };
    const byDistance = bestOrder(input);
    const byDuration = bestOrder({ ...input, objective: "duration" });
    expect(byDistance.order).toEqual(["b", "a"]);
    expect(byDuration.order).toEqual(["a", "b"]);
    expect(byDistance.distanceM).toBeLessThan(byDuration.distanceM);
    expect(byDuration.elapsedS).toBeLessThan(byDistance.elapsedS);
    expect(byDistance.legs[0]!.from).toBe("base");
  });

  it("điểm ẩn: dùng khoảng cách tới điểm giao và thời gian của SQL", () => {
    const plan = bestOrder({
      stops: [{ id: "hidden", location: null, hubKm: 2, hubTravelMin: 25 }, stop("shown", 1, 90)],
      dropoff: DROPOFF,
      departAt: AT,
    });
    const legs = new Map(plan.legs.map((l) => [`${l.from}>${l.to}`, l]));
    const hubLeg = legs.get("charity>hidden") ?? legs.get("hidden>charity");
    expect(hubLeg!.crowKm).toBe(2);
    expect(hubLeg!.travelMin).toBe(25);
    // giữa điểm ẩn và điểm khác: cận trên qua điểm giao (2 + 1 km)
    const between = legs.get("hidden>shown") ?? legs.get("shown>hidden");
    expect(between!.crowKm).toBeCloseTo(3, 3);
  });

  it("điểm ẩn khi xuất phát từ khu vực TNV: đi vòng qua điểm giao", () => {
    const base = { id: "base", location: at(1, 270) };
    const plan = bestOrder({
      stops: [{ id: "hidden", location: null, hubKm: 2 }],
      dropoff: DROPOFF,
      start: base,
      departAt: AT,
    });
    expect(plan.legs[0]!.crowKm).toBeCloseTo(3, 3);
    expect(plan.legs[0]!.travelMin).toBeCloseTo(travelMinutes(3), 1);
  });

  it("start trùng điểm giao được coi như xuất phát từ điểm giao", () => {
    const plan = bestOrder({ stops: [stop("a", 2, 0)], dropoff: DROPOFF, start: DROPOFF, departAt: AT });
    expect(plan.legs[0]!.from).toBe("charity");
    expect(plan.legs[0]!.crowKm).toBeCloseTo(2, 3);
  });

  it("> 5 điểm: láng giềng gần nhất + 2-opt, vẫn là hoán vị và tôn trọng hạn", () => {
    const stops = Array.from({ length: 8 }, (_, i) => stop(`s${i}`, 1 + (i % 4), i * 45));
    const plan = bestOrder({ stops, dropoff: DROPOFF, departAt: AT });
    expect(plan.method).toBe("heuristic");
    expect([...plan.order].sort()).toEqual(stops.map((s) => s.id).sort());
    expect(plan.feasible).toBe(true);
    const withDeadline = bestOrder({
      stops: stops.map((s, i) => (i === 7 ? { ...s, deadline: AT + 40 * MIN } : s)),
      dropoff: DROPOFF,
      departAt: AT,
    });
    expect(withDeadline.feasible).toBe(true);
  });

  it("từ chối đầu vào sai", () => {
    const base = { dropoff: DROPOFF, departAt: AT };
    expect(() => bestOrder({ ...base, stops: [] })).toThrow(RangeError);
    expect(() => bestOrder({ ...base, stops: [stop("a", 1, 0), stop("a", 2, 0)] })).toThrow("trùng");
    expect(() => bestOrder({ ...base, stops: [{ id: "", location: HUB }] })).toThrow(RangeError);
    expect(() => bestOrder({ ...base, stops: [{ id: "x", location: null }] })).toThrow("thiếu toạ độ");
    expect(() =>
      bestOrder({ ...base, stops: [stop("a", 1, 0)], dropoff: { id: "d", location: { lat: 99, lng: 0 } } }),
    ).toThrow(RangeError);
    expect(() =>
      bestOrder({
        ...base,
        stops: [stop("a", 1, 0)],
        start: { id: "s", location: { lat: Number.NaN, lng: 0 } },
      }),
    ).toThrow(RangeError);
    expect(() => bestOrder({ ...base, stops: [stop("a", 1, 0, { deadline: "mai" })] })).toThrow(RangeError);
    expect(() => bestOrder({ ...base, departAt: "bây giờ", stops: [stop("a", 1, 0)] })).toThrow("departAt");
  });
});

describe("estimateRoute", () => {
  const stops = [stop("a", 1, 0), stop("b", 2, 180)];

  it("ước lượng đúng thứ tự cho trước", () => {
    const plan = estimateRoute({ stops, dropoff: DROPOFF, departAt: AT }, ["b", "a"]);
    expect(plan.order).toEqual(["b", "a"]);
    expect(plan.method).toBe("fixed");
    expect(plan.legs[0]!.to).toBe("b");
  });

  it("thứ tự không phải hoán vị ⇒ RangeError", () => {
    const input = { stops, dropoff: DROPOFF, departAt: AT };
    expect(() => estimateRoute(input, ["a"])).toThrow(RangeError);
    expect(() => estimateRoute(input, ["a", "a"])).toThrow(RangeError);
    expect(() => estimateRoute(input, ["a", "z"])).toThrow(RangeError);
  });
});

describe("splitBetweenTwo — 2 tình nguyện viên chia tuyến", () => {
  it("50 bánh: A và B gần nhau về một phía, C ở phía kia ⇒ {A, B} | {C}", () => {
    const split = splitBetweenTwo({
      stops: [stop("A", 2, 40), stop("B", 2.4, 60), stop("C", 2.2, 220)],
      dropoff: DROPOFF,
      departAt: AT,
    });
    const groups = split.routes.map((r) => [...r.order].sort().join("+")).sort();
    expect(groups).toEqual(["A+B", "C"]);
    expect(split.feasible).toBe(true);
    expect(split.makespanS).toBe(Math.max(...split.routes.map((r) => r.elapsedS)));
    for (const r of split.routes) expect(r.legs.at(-1)!.to).toBe("charity");
  });

  it("4 điểm đối xứng ⇒ chia 2 + 2, lệch không quá 1 phút", () => {
    const split = splitBetweenTwo({
      stops: [stop("n", 3, 0), stop("e", 3, 90), stop("s", 3, 180), stop("w", 3, 270)],
      dropoff: DROPOFF,
      departAt: AT,
    });
    expect(split.routes.map((r) => r.order.length)).toEqual([2, 2]);
    expect(split.imbalanceS).toBeLessThanOrEqual(60);
  });

  it("mỗi TNV xuất phát từ khu vực của mình", () => {
    const split = splitBetweenTwo({
      stops: [stop("east", 4, 90), stop("west", 4, 270)],
      dropoff: DROPOFF,
      departAt: AT,
      bases: [
        { id: "tnv-1", location: at(5, 270) },
        { id: "tnv-2", location: at(5, 90) },
      ],
    });
    expect(split.routes[0].order).toEqual(["west"]);
    expect(split.routes[1].order).toEqual(["east"]);
    expect(split.routes[0].legs[0]!.from).toBe("tnv-1");
  });

  it("giới hạn số điểm", () => {
    const base = { dropoff: DROPOFF, departAt: AT };
    expect(() => splitBetweenTwo({ ...base, stops: [stop("a", 1, 0)] })).toThrow(RangeError);
    const many = Array.from({ length: MAX_SPLIT_STOPS + 1 }, (_, i) => stop(`s${i}`, 1, i * 30));
    expect(() => splitBetweenTwo({ ...base, stops: many })).toThrow(RangeError);
  });
});

describe("deep link bản đồ", () => {
  const a = { lat: 10.78, lng: 106.7 };
  const b = { lat: 10.79, lng: 106.71 };

  it("Google Maps: điểm đi, điểm dừng, xe máy", () => {
    const url = new URL(googleMapsDirectionsUrl(HUB, { origin: a, waypoints: [b] }));
    expect(url.origin + url.pathname).toBe("https://www.google.com/maps/dir/");
    expect(url.searchParams.get("origin")).toBe("10.780000,106.700000");
    expect(url.searchParams.get("destination")).toBe("10.776900,106.700900");
    expect(url.searchParams.get("waypoints")).toBe("10.790000,106.710000");
    expect(url.searchParams.get("travelmode")).toBe("two-wheeler");
    expect(new URL(googleMapsDirectionsUrl(HUB)).searchParams.has("origin")).toBe(false);
  });

  it("Apple Maps: lặp tham số waypoint, chế độ driving", () => {
    const url = new URL(appleMapsDirectionsUrl(HUB, { origin: a, waypoints: [a, b], mode: "two-wheeler" }));
    expect(url.origin + url.pathname).toBe("https://maps.apple.com/directions");
    expect(url.searchParams.get("source")).toBe("10.780000,106.700000");
    expect(url.searchParams.get("destination")).toBe("10.776900,106.700900");
    expect(url.searchParams.getAll("waypoint")).toEqual(["10.780000,106.700000", "10.790000,106.710000"]);
    expect(url.searchParams.get("mode")).toBe("driving");
    expect(new URL(appleMapsDirectionsUrl(HUB)).searchParams.has("source")).toBe(false);
  });

  it("link cả tuyến: điểm ẩn ⇒ không dựng; quá giới hạn Google ⇒ chỉ Apple", () => {
    const links = routeDirectionsLinks([a, b], HUB);
    expect(new URL(links.google!).searchParams.get("waypoints")!.split("|")).toHaveLength(2);
    expect(new URL(links.apple!).searchParams.getAll("waypoint")).toHaveLength(2);
    expect(routeDirectionsLinks([a, null], HUB)).toEqual({ google: null, apple: null });
    const many = Array.from({ length: GOOGLE_MAX_WAYPOINTS + 1 }, () => a);
    const capped = routeDirectionsLinks(many, HUB, { origin: b });
    expect(capped.google).toBeNull();
    expect(new URL(capped.apple!).searchParams.getAll("waypoint")).toHaveLength(GOOGLE_MAX_WAYPOINTS + 1);
  });
});
