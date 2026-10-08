import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { destinationPoint } from "../geo/distance";
import type { LatLng } from "../geo/types";
import {
  bestOrder,
  estimateRoute,
  splitBetweenTwo,
  type RouteInput,
  type RoutePlan,
  type RouteStop,
} from "./index";

/** TESTING.md §3: 500 lần trên CI, 100 lần khi chạy local. */
const NUM_RUNS = process.env.CI ? 500 : 100;
const HUB: LatLng = { lat: 10.7769, lng: 106.7009 };
const AT = Date.parse("2026-10-20T10:00:00+07:00");
const MIN = 60_000;

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((x, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((p) => [x, ...p]),
  );
}

const arbStop = (id: string): fc.Arbitrary<RouteStop> =>
  fc
    .record({
      km: fc.double({ min: 0.1, max: 10, noNaN: true }),
      bearing: fc.integer({ min: 0, max: 359 }),
      hidden: fc.constantFrom(false, false, false, true),
      ready: fc.option(fc.integer({ min: -30, max: 150 }), { nil: null }),
      deadline: fc.option(fc.integer({ min: 20, max: 300 }), { nil: null }),
    })
    .map(({ km, bearing, hidden, ready, deadline }) => {
      const location = destinationPoint(HUB, km * 1000, bearing);
      return {
        id,
        location: hidden ? null : location,
        hubKm: km,
        readyAt: ready === null ? null : AT + ready * MIN,
        deadline: deadline === null ? null : AT + deadline * MIN,
      };
    });

const arbInput = (min: number, max: number): fc.Arbitrary<RouteInput> =>
  fc
    .record({
      n: fc.integer({ min, max }),
      objective: fc.constantFrom<"distance" | "duration">("distance", "duration"),
      base: fc.option(
        fc.record({
          km: fc.double({ min: 0.5, max: 8, noNaN: true }),
          bearing: fc.integer({ min: 0, max: 359 }),
        }),
        { nil: null },
      ),
    })
    .chain(({ n, objective, base }) =>
      fc.tuple(...Array.from({ length: n }, (_, i) => arbStop(`stop-${i}`))).map((stops): RouteInput => ({
        stops,
        dropoff: { id: "charity", location: HUB },
        start: base ? { id: "base", location: destinationPoint(HUB, base.km * 1000, base.bearing) } : null,
        departAt: AT,
        objective,
      })),
    );

const metric = (input: RouteInput, p: RoutePlan) =>
  input.objective === "duration" ? p.elapsedS : p.distanceM;

describe("bestOrder — thuộc tính", { timeout: 60_000 }, () => {
  it("≤ 5 điểm: bằng kết quả vét cạn tham chiếu (P11)", () => {
    fc.assert(
      fc.property(arbInput(1, 5), (input) => {
        const plan = bestOrder(input);
        const all = permutations(input.stops.map((s) => s.id)).map((o) => estimateRoute(input, o));
        expect([...plan.order].sort()).toEqual(input.stops.map((s) => s.id).sort());
        expect(plan.evaluated).toBe(all.length);
        const feasible = all.filter((p) => p.feasible);
        if (feasible.length > 0) {
          expect(plan.feasible).toBe(true);
          expect(metric(input, plan)).toBe(Math.min(...feasible.map((p) => metric(input, p))));
        } else {
          expect(plan.feasible).toBe(false);
          expect(plan.lateMin).toBeLessThanOrEqual(Math.min(...all.map((p) => p.lateMin)) + 0.02);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("tôn trọng khung lấy và hạn: chờ tới đầu khung, không lấy sau hạn khi khả thi", () => {
    fc.assert(
      fc.property(arbInput(1, 5), (input) => {
        const plan = bestOrder(input);
        const byId = new Map(input.stops.map((s) => [s.id, s]));
        let prevService = AT;
        for (const leg of plan.legs) {
          const arrive = Date.parse(leg.arriveAt);
          const service = Date.parse(leg.serviceAt);
          expect(arrive).toBeGreaterThan(prevService);
          expect(service).toBeGreaterThanOrEqual(arrive);
          const s = byId.get(leg.to);
          if (s?.readyAt != null) expect(service).toBeGreaterThanOrEqual(Number(s.readyAt) - 1);
          if (plan.feasible && s?.deadline != null) expect(service).toBeLessThanOrEqual(Number(s.deadline));
          prevService = service;
        }
        expect(Math.abs(plan.elapsedS - plan.durationS - plan.waitS)).toBeLessThanOrEqual(2);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("tất định khi đổi thứ tự đầu vào", () => {
    fc.assert(
      fc.property(arbInput(1, 6), (input) => {
        const reversed = { ...input, stops: [...input.stops].reverse() };
        expect(bestOrder(reversed)).toEqual(bestOrder(input));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("6–9 điểm (heuristic): là hoán vị và chỉ số khớp ước lượng lại theo đúng thứ tự", () => {
    fc.assert(
      fc.property(arbInput(6, 9), (input) => {
        const plan = bestOrder(input);
        expect(plan.method).toBe("heuristic");
        expect([...plan.order].sort()).toEqual(input.stops.map((s) => s.id).sort());
        const again = estimateRoute(input, plan.order);
        expect({ ...again, method: plan.method, evaluated: plan.evaluated }).toEqual(plan);
      }),
      { numRuns: Math.ceil(NUM_RUNS / 4) },
    );
  });
});

describe("splitBetweenTwo — thuộc tính", { timeout: 60_000 }, () => {
  it("bằng vét cạn mọi cách chia; mỗi điểm thuộc đúng một tuyến", () => {
    fc.assert(
      fc.property(arbInput(2, 5), (input) => {
        const split = splitBetweenTwo({ ...input, bases: input.start ? [input.start, null] : null });
        const ids = input.stops.map((s) => s.id).sort();
        expect([...split.routes[0].order, ...split.routes[1].order].sort()).toEqual(ids);
        expect(split.routes.every((r) => r.order.length > 0)).toBe(true);

        // Tham chiếu: mọi cách chia, cùng khóa xếp hạng
        let best: number[] | null = null;
        const n = input.stops.length;
        for (let mask = 1; mask < (1 << n) - 1; mask++) {
          const r0 = bestOrder({
            ...input,
            stops: input.stops.filter((_, i) => mask & (1 << i)),
            start: input.start,
          });
          const r1 = bestOrder({
            ...input,
            stops: input.stops.filter((_, i) => !(mask & (1 << i))),
            start: null,
          });
          const key = [
            r0.feasible && r1.feasible ? 0 : 1,
            Math.round((r0.lateMin + r1.lateMin) * 60),
            Math.max(r0.elapsedS, r1.elapsedS),
          ];
          const i = best === null ? 0 : key.findIndex((v, k) => v !== best![k]);
          if (best === null || (i !== -1 && key[i]! < best[i]!)) best = key;
        }
        expect(split.feasible ? 0 : 1).toBe(best![0]);
        if (split.feasible) expect(split.makespanS).toBe(best![2]);
        expect(split.imbalanceS).toBe(Math.abs(split.routes[0].elapsedS - split.routes[1].elapsedS));
      }),
      { numRuns: Math.ceil(NUM_RUNS / 2) },
    );
  });
});
