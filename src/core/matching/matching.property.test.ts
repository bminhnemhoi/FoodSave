import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { bestOrder } from "../routing/order";
import { AT, arbScenario, permute, type Scenario } from "./__arbitraries__";
import {
  isContinuousUnit,
  isUnitCompatible,
  proposePlans,
  quantumOf,
  screenCandidates,
  toNeedUnits,
  type MatchPlan,
  type MatchResult,
} from "./index";

/**
 * Thuộc tính bắt buộc của engine ghép đơn (ADR-007 §7, TESTING.md §3, US-SYS-05).
 * 500 lần trên CI, 100 lần khi chạy local; tái hiện bằng seed fast-check in ra khi fail.
 */
const NUM_RUNS = process.env.CI ? 500 : 100;
const EPS = 1e-6;

function combos<T>(items: readonly T[], k: number): T[][] {
  if (k === 0) return [[]];
  return items.flatMap((x, i) => combos(items.slice(i + 1), k - 1).map((c) => [x, ...c]));
}

/** Kiểm mọi bất biến của một kết quả (P1–P8). */
function checkInvariants({ need, candidates }: Scenario, result: MatchResult, excluded: ReadonlySet<string>) {
  const byOffer = new Map(candidates.map((c) => [c.offer_id, c]));
  const R = need.quantity;
  expect(result.plans.length).toBeLessThanOrEqual(3);
  expect(new Set(result.plans.map((p) => p.siteIds.join())).size).toBe(result.plans.length);
  result.plans.forEach((p, i) => expect(p.rank).toBe(i + 1));

  for (const plan of result.plans) {
    expect(plan.stopCount).toBeGreaterThanOrEqual(1);
    expect(plan.stopCount).toBeLessThanOrEqual(5);
    expect(new Set(plan.siteIds).size).toBe(plan.stopCount);
    expect([...new Set(plan.lines.map((l) => l.siteId))].sort()).toEqual(plan.siteIds);
    expect(plan.stops.map((s) => s.siteId).sort()).toEqual(plan.siteIds);

    const seen = new Set<string>();
    let total = 0;
    let tolerance = 0;
    for (const line of plan.lines) {
      const c = byOffer.get(line.offerId)!;
      expect(c).toBeDefined();
      // P1: không cấp vượt lô, mỗi lô một dòng
      expect(seen.has(line.offerId)).toBe(false);
      seen.add(line.offerId);
      expect(line.qty).toBeGreaterThan(0);
      expect(line.qty).toBeLessThanOrEqual(c.qty_available + EPS);
      // P5/P6: số nguyên với đơn vị đếm, 3 chữ số với kg/lít; nhu cầu đơn vị đếm ⇒ quy đổi cũng nguyên
      if (isContinuousUnit(line.unit))
        expect(Math.abs(line.qty * 1000 - Math.round(line.qty * 1000))).toBeLessThan(EPS);
      else expect(Number.isInteger(line.qty)).toBe(true);
      if (!isContinuousUnit(need.unit)) expect(Number.isInteger(line.needUnits)).toBe(true);
      // P3/P4: chỉ ứng viên hợp lệ — đúng danh mục/đơn vị, trong bán kính, chưa hết hạn, kịp lấy
      expect(need.categoryCodes).toContain(c.category_code);
      expect(isUnitCompatible(c.unit, need.unit)).toBe(true);
      expect(c.distance_km).toBeLessThanOrEqual(need.radiusKm);
      expect(Date.parse(c.effective_deadline as string)).toBeGreaterThan(AT);
      expect(Date.parse(c.eta_pickup as string)).toBeLessThanOrEqual(
        Date.parse(c.effective_deadline as string),
      );
      expect(excluded.has(c.site_id)).toBe(false);
      total += toNeedUnits(line.qty, c.unit, c.unit_weight_kg, need.unit);
      if (c.unit !== need.unit) tolerance = Math.max(tolerance, quantumOf(c.unit) * c.unit_weight_kg);
    }
    // P2: không vượt nhu cầu (quy đổi kg: vượt ít hơn một đơn vị — DATA-MODEL §4.6)
    if (tolerance === 0) expect(total).toBeLessThanOrEqual(R + EPS);
    else expect(total - R).toBeLessThan(tolerance + EPS);
    expect(plan.coveredQty + plan.shortfall).toBeCloseTo(R, 6);
    expect(plan.coverage).toBeGreaterThan(0);
    expect(plan.coverage).toBeLessThanOrEqual(1);
    expect(plan.rematch === null).toBe(plan.shortfall === 0);

    // P4: tuyến khả thi, mỗi điểm được lấy trước hạn hiệu lực sớm nhất của các lô lấy ở đó
    expect(plan.route.feasible).toBe(true);
    for (const stop of plan.stops) {
      const deadlines = plan.lines
        .filter((l) => l.siteId === stop.siteId)
        .map((l) => Date.parse(l.effectiveDeadline));
      expect(Date.parse(stop.serviceAt)).toBeLessThanOrEqual(Math.min(...deadlines));
    }
  }

  // P8: thứ tự xếp hạng — phủ ↓, số điểm dừng ↑, km ↑
  for (let i = 1; i < result.plans.length; i++) {
    const [a, b] = [result.plans[i - 1]!, result.plans[i]!];
    const key = (p: MatchPlan) => [-p.coverage, p.stopCount, p.estDistanceM];
    const [ka, kb] = [key(a), key(b)];
    const d = ka.findIndex((v, k) => v !== kb[k]);
    if (d !== -1) expect(ka[d]!).toBeLessThan(kb[d]!);
  }
}

describe("proposePlans — thuộc tính", { timeout: 60_000 }, () => {
  it.each([
    ["≤ 12 điểm", {}],
    ["10–16 điểm, nhiều lô", { minSites: 10, maxSites: 16, minOffers: 12, maxOffers: 24 }],
  ])(
    "P1–P8 (%s): không vượt lô, không vượt nhu cầu, chỉ ứng viên hợp lệ, số nguyên, ≤ 5 điểm, ≤ 3 phương án, đúng thứ tự",
    (_, opts) => {
      fc.assert(
        fc.property(arbScenario(opts), (scenario) => {
          checkInvariants(scenario, proposePlans(scenario.need, scenario.candidates), new Set());
        }),
        { numRuns: NUM_RUNS },
      );
    },
  );

  it("không bao giờ dùng điểm bị loại (ghép lại phần thiếu)", () => {
    fc.assert(
      fc.property(
        arbScenario(),
        fc.array(fc.integer({ min: 0, max: 11 }), { maxLength: 6 }),
        (scenario, idx) => {
          const excluded = new Set(idx.map((i) => `site-${String(i).padStart(2, "0")}`));
          const result = proposePlans(scenario.need, scenario.candidates, { excludeSiteIds: [...excluded] });
          checkInvariants(scenario, result, excluded);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("P10: tất định — hoán vị đầu vào cho cùng kết quả", () => {
    fc.assert(
      fc.property(
        arbScenario(),
        fc.array(fc.integer(), { minLength: 1, maxLength: 25 }),
        (scenario, keys) => {
          const shuffled = permute(scenario.candidates, keys);
          expect(proposePlans(scenario.need, shuffled)).toEqual(
            proposePlans(scenario.need, scenario.candidates),
          );
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it("P9: tối ưu trong không gian ≤ 3 cửa hàng — bằng vét cạn tham chiếu (≤ 8 điểm, thời gian rộng)", () => {
    fc.assert(
      fc.property(
        arbScenario({ generous: true, clean: true, maxSites: 8, maxOffers: 12 }),
        ({ need, candidates }) => {
          const result = proposePlans(need, candidates);
          const { offers } = screenCandidates(candidates, {
            unit: need.unit,
            categoryCodes: need.categoryCodes,
            radiusKm: need.radiusKm,
            at: AT,
            excludeSiteIds: [],
          });
          const sites = [...new Set(offers.map((o) => o.siteId))].sort().map((siteId) => {
            const mine = offers.filter((o) => o.siteId === siteId);
            return {
              siteId,
              available: mine.reduce((s, o) => s + o.needUnits, 0),
              stop: { id: siteId, location: mine[0]!.location, hubKm: mine[0]!.distanceKm },
            };
          });
          if (sites.length === 0) {
            expect(result.plans).toEqual([]);
            return;
          }

          const R = need.quantity;
          const subsets = [1, 2, 3].flatMap((k) => combos(sites, k));
          const coverage = (s: typeof sites) => Math.min(1, s.reduce((t, x) => t + x.available, 0) / R);
          const bestCoverage = Math.max(...subsets.map(coverage));
          const best = result.plans[0]!;
          if (bestCoverage >= 1 - EPS) {
            const covering = subsets.filter((s) => coverage(s) >= 1 - EPS);
            const minStops = Math.min(...covering.map((s) => s.length));
            const minKm = Math.min(
              ...covering
                .filter((s) => s.length === minStops)
                .map(
                  (s) =>
                    bestOrder({
                      stops: s.map((x) => x.stop),
                      dropoff: { id: "d", location: need.siteLocation },
                      departAt: AT,
                    }).distanceM,
                ),
            );
            expect(best.coverage).toBe(1);
            expect(best.stopCount).toBe(minStops);
            expect(best.estDistanceM).toBe(minKm);
          } else {
            expect(best.coverage).toBeGreaterThanOrEqual(bestCoverage - EPS);
          }
          // Phủ của phương án 1 = tối ưu toàn cục với ≤ 5 điểm (5 điểm có khả dụng lớn nhất)
          const top5 = [...sites].sort((a, b) => b.available - a.available).slice(0, 5);
          expect(best.coverage).toBeCloseTo(coverage(top5), 5);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it.each([
    ["đơn vị trộn lẫn", { generous: true, maxSites: 16, maxOffers: 21 }],
    [
      "vượt top 12 điểm",
      { generous: true, clean: true, minSites: 13, maxSites: 16, minOffers: 16, maxOffers: 24 },
    ],
  ])("đơn điệu: thêm một ứng viên không làm phủ của phương án 1 giảm (thời gian rộng, %s)", (_, opts) => {
    fc.assert(
      fc.property(arbScenario(opts), ({ need, candidates }) => {
        const before = proposePlans(need, candidates.slice(0, -1)).plans[0]?.coverage ?? 0;
        const after = proposePlans(need, candidates).plans[0]?.coverage ?? 0;
        expect(after).toBeGreaterThanOrEqual(before);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
