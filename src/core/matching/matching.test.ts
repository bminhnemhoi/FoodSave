import { describe, expect, it } from "vitest";

import type { Perishability } from "../labels";
import { AT, CHARITY, around, makeCandidate, makeNeed, type OfferSpec } from "./__arbitraries__";
import fixtures from "./fixtures.json";
import {
  ALGORITHM_VERSION,
  MATCH_LIMITS,
  MATCH_WEIGHTS,
  ceilToQuantum,
  floorToQuantum,
  isUnitCompatible,
  parsePickupWindow,
  preScore,
  proposePlans,
  proximityScore,
  quantityFitScore,
  rematch,
  scoreParts,
  toNeedUnits,
  toReserveBundlePayload,
  trustScoreNorm,
  urgencyHorizonHours,
  urgencyScore,
  type MatchCandidate,
  type MatchNeed,
} from "./index";

const MIN = 60_000;

/** Kịch bản demo "cần 50 bánh: 20 + 18 + 12 từ 3 cửa hàng" (ROADMAP P3, US-CHA-10 AC1, US-SYS-05 AC2). */
const STORES: Record<string, Omit<OfferSpec, "offerId" | "siteId" | "qty">> = {
  A: { location: around(1.0, 30), deadlineMin: 300, trust: 70 }, // Tiệm bánh Hoa Sữa (hư cấu)
  B: { location: around(1.6, 80), deadlineMin: 360, trust: 65 }, // Lò bánh Mặt Trời
  C: { location: around(2.2, 140), deadlineMin: 420, trust: 60 }, // Bánh mì Phố Xanh
  D: { location: around(7.0, 250), deadlineMin: 400, trust: 80 }, // Bếp Bình Minh — xa
  E: { location: around(12, 200), deadlineMin: 400, trust: 90 }, // ngoài bán kính 10 km
  F: { location: around(3.0, 320), deadlineMin: 500, trust: 55 },
};

function offer(store: keyof typeof STORES, qty: number, need: MatchNeed, extra: Partial<OfferSpec> = {}) {
  return makeCandidate(
    { offerId: `o-${store}`, siteId: `s-${store}`, qty, ...STORES[store]!, ...extra },
    need,
  );
}

function demo() {
  const need = makeNeed({ quantity: 50 });
  const candidates = [
    offer("A", 20, need),
    offer("B", 18, need),
    offer("C", 12, need),
    offer("D", 25, need),
    offer("E", 40, need),
  ];
  return { need, candidates };
}

describe("chấm điểm — fixture dùng chung với pre_score của SQL", () => {
  const cases = fixtures.preScore;

  it.each(cases)("$name", (f) => {
    const input = {
      effectiveDeadline: f.effective_deadline,
      perishability: f.perishability as Perishability,
      at: f.at,
      distanceKm: f.distance_km,
      radiusKm: f.radius_km,
      trustScore: f.trust_score,
    };
    expect(urgencyScore(input.effectiveDeadline, input.perishability, input.at)).toBeCloseTo(
      f.expected.urgency,
      4,
    );
    expect(proximityScore(input.distanceKm, input.radiusKm)).toBeCloseTo(f.expected.proximity, 10);
    expect(trustScoreNorm(input.trustScore)).toBeCloseTo(f.expected.trust, 10);
    expect(preScore(input)).toBe(f.expected.pre_score);
  });

  it.each(fixtures.score)("$name", (f) => {
    const base = cases[f.base]!;
    const parts = scoreParts({
      effectiveDeadline: base.effective_deadline,
      perishability: base.perishability as Perishability,
      at: base.at,
      distanceKm: base.distance_km,
      radiusKm: base.radius_km,
      trustScore: base.trust_score,
      availableNeedUnits: f.available_need_units,
      remaining: f.remaining,
    });
    expect(parts.quantityFit).toBeCloseTo(f.expected.quantity_fit, 10);
    expect(Math.round(parts.score * 1e4) / 1e4).toBe(f.expected.score);
  });

  it("trọng số và ngưỡng khớp fixture", () => {
    expect(fixtures.version).toBe(ALGORITHM_VERSION);
    expect({
      urgency: MATCH_WEIGHTS.urgency,
      proximity: MATCH_WEIGHTS.proximity,
      quantity_fit: MATCH_WEIGHTS.quantityFit,
      trust: MATCH_WEIGHTS.trust,
    }).toEqual(fixtures.weights);
    for (const [p, h] of Object.entries(fixtures.urgencyHorizonHours)) {
      expect(urgencyHorizonHours(p as Perishability)).toBe(h);
    }
  });

  it("biên: bán kính 0, phần thiếu 0, uy tín thiếu", () => {
    expect(proximityScore(1, 0)).toBe(0);
    expect(quantityFitScore(10, 0)).toBe(0);
    expect(quantityFitScore(-5, 10)).toBe(0);
    expect(trustScoreNorm(null)).toBe(0);
    expect(trustScoreNorm(Number.NaN)).toBe(0);
  });
});

describe("đơn vị (DATA-MODEL §4.6)", () => {
  it("quy đổi và tương thích", () => {
    expect(toNeedUnits(20, "loaf", 0.12, "loaf")).toBe(20);
    expect(toNeedUnits(20, "loaf", 0.12, "kg")).toBeCloseTo(2.4, 10);
    expect(() => toNeedUnits(1, "kg", 1, "loaf")).toThrow("unit_mismatch");
    expect(isUnitCompatible("bottle", "kg")).toBe(true);
    expect(isUnitCompatible("kg", "loaf")).toBe(false);
    expect(isUnitCompatible("bottle", "liter")).toBe(false);
  });

  it("làm tròn theo bước, chống sai số dấu phẩy động", () => {
    expect(floorToQuantum(2.9999999999, 1)).toBe(3);
    expect(floorToQuantum(12.3456, 0.001)).toBe(12.345);
    expect(ceilToQuantum(3.0000000001, 1)).toBe(3);
    expect(ceilToQuantum(0.36 / 0.12, 1)).toBe(3);
    expect(ceilToQuantum(50 / 0.12, 1)).toBe(417);
  });

  it("đọc khung lấy tstzrange", () => {
    expect(parsePickupWindow('["2026-10-20 03:00:00+00","2026-10-20 07:00:00+00")')).toEqual({
      start: Date.parse("2026-10-20T03:00:00Z"),
      end: Date.parse("2026-10-20T07:00:00Z"),
    });
    expect(parsePickupWindow("[2026-10-20T03:00:00Z,)")).toEqual({
      start: Date.parse("2026-10-20T03:00:00Z"),
      end: null,
    });
    expect(parsePickupWindow({ start: new Date(5), end: null })).toEqual({ start: 5, end: null });
    expect(parsePickupWindow("empty")).toEqual({ start: null, end: null });
    expect(parsePickupWindow('["x","y")')).toEqual({ start: null, end: null });
    expect(parsePickupWindow(null)).toEqual({ start: null, end: null });
  });
});

describe("proposePlans — kịch bản 50 bánh", () => {
  it("phương án 1 = A 20 + B 18 + C 12, phủ đủ, 3 điểm dừng", () => {
    const { need, candidates } = demo();
    const result = proposePlans(need, candidates);
    const [p1, p2, p3] = result.plans;

    expect(result.plans).toHaveLength(3);
    expect(p1!.siteIds).toEqual(["s-A", "s-B", "s-C"]);
    expect(Object.fromEntries(p1!.lines.map((l) => [l.offerId, l.qty]))).toEqual({
      "o-A": 20,
      "o-B": 18,
      "o-C": 12,
    });
    expect(p1!.coverage).toBe(1);
    expect(p1!.coveredQty).toBe(50);
    expect(p1!.shortfall).toBe(0);
    expect(p1!.stopCount).toBe(3);
    expect(p1!.source).toBe("exact");
    expect(p1!.rematch).toBeNull();
    expect(p1!.algorithmVersion).toBe("match-v1");
    expect(p1!.stops.map((s) => s.seq)).toEqual([1, 2, 3]);
    expect(p1!.stops.map((s) => s.siteId).sort()).toEqual(p1!.siteIds);
    expect(p1!.estDistanceM).toBe(p1!.route.distanceM);
    expect(p1!.warnings).toEqual([]);

    // Phương án có D (xa) phủ đủ nhưng tuyến dài hơn ⇒ xếp sau (US-CHA-10 AC1)
    for (const p of [p2!, p3!]) {
      expect(p.siteIds).toContain("s-D");
      expect(p.coverage).toBe(1);
      expect(p.estDistanceM).toBeGreaterThan(p1!.estDistanceM);
    }
    expect(new Set(result.plans.map((p) => p.siteIds.join())).size).toBe(3);
    expect(result.candidates.dropped).toEqual([{ offerId: "o-E", reason: "out_of_radius" }]);
    expect(result.candidates).toMatchObject({ total: 5, used: 4 });
    expect(result.siteScores.map((s) => s.rank)).toEqual([1, 2, 3, 4]);
  });

  it("tất định: đảo thứ tự ứng viên cho cùng kết quả", () => {
    const { need, candidates } = demo();
    expect(proposePlans(need, [...candidates].reverse())).toEqual(proposePlans(need, candidates));
  });

  it("chuỗi thời gian kiểu Postgres và Date cho cùng kết quả", () => {
    const { need, candidates } = demo();
    const asDates: MatchCandidate[] = candidates.map((c) => ({
      ...c,
      effective_deadline: new Date(c.effective_deadline as string),
      eta_pickup: new Date(c.eta_pickup as string),
    }));
    expect(proposePlans({ ...need, at: new Date(AT) }, asDates)).toEqual(proposePlans(need, candidates));
  });
});

describe("proposePlans — thiếu hàng và ghép lại phần thiếu", () => {
  it("chỉ có A 20 + B 18 ⇒ 'Đáp ứng 38/50 — thiếu 12' và gợi ý ghép lại đúng 12", () => {
    const need = makeNeed({ quantity: 50 });
    const result = proposePlans(need, [offer("A", 20, need), offer("B", 18, need)]);
    const best = result.plans[0]!;
    expect(best.siteIds).toEqual(["s-A", "s-B"]);
    expect(best.coveredQty).toBe(38);
    expect(best.shortfall).toBe(12);
    expect(best.coverage).toBe(0.76);
    expect(best.rematch).toEqual({ remaining: 12, excludeSiteIds: ["s-A", "s-B"] });

    // Có lô mới F 15 ⇒ ghép lại chỉ 12, không đụng A, B
    const later = [offer("A", 0, need), offer("B", 0, need), offer("F", 15, need)];
    const again = rematch(need, later, best.rematch!);
    expect(again.inputs.remaining).toBe(12);
    expect(again.plans[0]!.lines).toMatchObject([{ offerId: "o-F", qty: 12 }]);
    expect(again.plans[0]!.coverage).toBe(1);
    expect(again.candidates.dropped.map((d) => d.reason)).toEqual(["excluded_site", "excluded_site"]);
  });

  it("cửa hàng C từ chối 12 bánh ⇒ ghép lại đúng 12, loại A, B, C (US-CHA-12 AC1)", () => {
    const { need, candidates } = demo();
    const result = rematch(need, candidates, { remaining: 12, excludeSiteIds: ["s-A", "s-B", "s-C"] });
    expect(result.plans[0]!.lines).toMatchObject([{ offerId: "o-D", qty: 12, needUnits: 12 }]);
    expect(result.plans.every((p) => !p.siteIds.some((s) => ["s-A", "s-B", "s-C"].includes(s)))).toBe(true);
    expect(result.inputs.excludeSiteIds).toEqual(["s-A", "s-B", "s-C"]);
  });

  it("không đủ hàng kể cả 5 cửa hàng ⇒ phương án tốt nhất 5 điểm, thiếu đúng phần còn lại", () => {
    const need = makeNeed({ quantity: 100, radiusKm: 15 });
    const candidates = Array.from({ length: 6 }, (_, i) =>
      makeCandidate(
        {
          offerId: `o-${i}`,
          siteId: `s-${i}`,
          location: around(1 + i * 0.5, i * 60),
          qty: 10,
          deadlineMin: 600,
        },
        need,
      ),
    );
    const best = proposePlans(need, candidates).plans[0]!;
    expect(best.stopCount).toBe(MATCH_LIMITS.maxStops);
    expect(best.coveredQty).toBe(50);
    expect(best.shortfall).toBe(50);
    expect(best.source).toBe("extended");
    expect(best.rematch!.remaining).toBe(50);
  });

  it("không ứng viên hợp lệ ⇒ không có phương án", () => {
    const need = makeNeed({ quantity: 10 });
    const result = proposePlans(need, []);
    expect(result.plans).toEqual([]);
    expect(result.siteScores).toEqual([]);
    expect(result.stats).toEqual({ combosEvaluated: 0, routesEvaluated: 0 });
  });
});

describe("proposePlans — mở rộng tham lam tới 5 cửa hàng", () => {
  it("5 cửa hàng × 22 cho nhu cầu 100 ⇒ không tổ hợp ≤ 3 nào đủ, mở rộng đủ 100 với 5 điểm", () => {
    const need = makeNeed({ quantity: 100 });
    const candidates = Array.from({ length: 5 }, (_, i) =>
      makeCandidate(
        {
          offerId: `o-${i}`,
          siteId: `s-${i}`,
          location: around(1 + i * 0.3, i * 72),
          qty: 22,
          deadlineMin: 300 + i,
        },
        need,
      ),
    );
    const result = proposePlans(need, candidates);
    const best = result.plans[0]!;
    expect(best.stopCount).toBe(5);
    expect(best.coverage).toBe(1);
    expect(best.source).toBe("extended");
    expect(best.lines.map((l) => l.qty).sort((a, b) => a - b)).toEqual([12, 22, 22, 22, 22]);
    // Ít hạn nhất (o-4) nhận phần dư
    expect(best.lines.find((l) => l.offerId === "o-4")!.qty).toBe(12);
  });

  it("cửa hàng ngoài top 12 nhưng đủ một mình ⇒ phương án 1 điểm (mở rộng từ tập rỗng)", () => {
    const need = makeNeed({ quantity: 30, radiusKm: 15 });
    const small = Array.from({ length: 12 }, (_, i) =>
      makeCandidate(
        {
          offerId: `o-${String(i).padStart(2, "0")}`,
          siteId: `s-${String(i).padStart(2, "0")}`,
          location: around(0.5 + i * 0.1, i * 30),
          qty: 3,
          deadlineMin: 120,
          trust: 100,
        },
        need,
      ),
    );
    const big = makeCandidate(
      {
        offerId: "o-big",
        siteId: "s-big",
        location: around(14, 0),
        qty: 40,
        deadlineMin: 6 * 24 * 60,
        perishability: "packaged",
        trust: 0,
      },
      need,
    );
    const result = proposePlans(need, [...small, big]);
    expect(result.siteScores.find((s) => s.siteId === "s-big")!.rank).toBe(13);
    expect(result.plans[0]!.siteIds).toEqual(["s-big"]);
    expect(result.plans[0]!.coverage).toBe(1);
    expect(result.plans[0]!.source).toBe("extended");
  });
});

describe("proposePlans — mở rộng tham lam: tối giản", () => {
  it("điểm ngoài top 12 nhưng gấp hơn và đủ một mình ⇒ các điểm của hạt giống bị cấp 0 được bỏ", () => {
    const need = makeNeed({ quantity: 30, radiusKm: 15 });
    const small = Array.from({ length: 12 }, (_, i) =>
      makeCandidate(
        {
          offerId: `o-${String(i).padStart(2, "0")}`,
          siteId: `s-${String(i).padStart(2, "0")}`,
          location: around(0.5 + i * 0.1, i * 30),
          qty: 3,
          deadlineMin: 120,
          trust: 100,
        },
        need,
      ),
    );
    // Hạn sớm hơn mọi lô nhỏ ⇒ được cấp trước, đủ 30 một mình; điểm thấp (xa, uy tín 0) ⇒ hạng 13
    const big = makeCandidate(
      {
        offerId: "o-big",
        siteId: "s-big",
        location: around(14, 0),
        qty: 40,
        deadlineMin: 100,
        perishability: "packaged",
        trust: 0,
      },
      need,
    );
    const result = proposePlans(need, [...small, big]);
    expect(result.siteScores.find((s) => s.siteId === "s-big")!.rank).toBe(13);
    expect(result.plans[0]!.siteIds).toEqual(["s-big"]);
    expect(result.plans[0]!.lines).toMatchObject([{ offerId: "o-big", qty: 30 }]);
    for (const p of result.plans) {
      expect([...new Set(p.lines.map((l) => l.siteId))].sort()).toEqual(p.siteIds);
    }
  });
});

describe("proposePlans — quy tắc cấp số lượng", () => {
  it("nhu cầu kg, lô tính ổ bánh ⇒ làm tròn lên, vượt < 1 ổ (§4.6)", () => {
    const need = makeNeed({ quantity: 5, unit: "kg" });
    const best = proposePlans(need, [offer("A", 100, need, { unit: "loaf", unitWeightKg: 0.12 })]).plans[0]!;
    expect(best.lines[0]!.qty).toBe(42);
    expect(best.allocatedQty).toBe(5.04);
    expect(best.coveredQty).toBe(5);
    expect(best.coverage).toBe(1);
    expect(best.allocatedQty - need.quantity).toBeLessThan(0.12);
  });

  it("nhu cầu kg, lô tính lít ⇒ lít làm tròn lên 0,001", () => {
    const need = makeNeed({ quantity: 2, unit: "kg", categoryCodes: ["dairy"] });
    const best = proposePlans(need, [
      offer("A", 10, need, { unit: "liter", unitWeightKg: 1.03, category: "dairy", perishability: "fresh" }),
    ]).plans[0]!;
    expect(best.lines[0]!.qty).toBe(1.942);
    expect(best.coverage).toBe(1);
  });

  it("một điểm có nhiều lô ⇒ một điểm dừng, lô gấp hơn được cấp trước", () => {
    const need = makeNeed({ quantity: 25 });
    const best = proposePlans(need, [
      offer("A", 20, need, { offerId: "o-A-late", deadlineMin: 600 }),
      offer("A", 15, need, { offerId: "o-A-soon", deadlineMin: 200 }),
    ]).plans[0]!;
    expect(best.stopCount).toBe(1);
    expect(Object.fromEntries(best.lines.map((l) => [l.offerId, l.qty]))).toEqual({
      "o-A-soon": 15,
      "o-A-late": 10,
    });
    expect(best.stops[0]!.offerIds.sort()).toEqual(["o-A-late", "o-A-soon"]);
    expect(Date.parse(best.stops[0]!.deadline!)).toBe(AT + 200 * MIN);
  });

  it("đủ từ 1 cửa hàng ⇒ phương án 1 điểm xếp đầu (ít điểm dừng)", () => {
    const need = makeNeed({ quantity: 15 });
    const result = proposePlans(need, [offer("A", 10, need), offer("B", 10, need), offer("D", 40, need)]);
    expect(result.plans[0]!.siteIds).toEqual(["s-D"]);
    expect(result.plans[0]!.stopCount).toBe(1);
  });

  it("đếm lô Đỏ (US-CHA-10 AC1)", () => {
    const need = makeNeed({ quantity: 30 });
    const best = proposePlans(need, [offer("A", 20, need, { deadlineMin: 90 }), offer("B", 10, need)])
      .plans[0]!;
    expect(best.redLots).toBe(1);
    expect(best.lines.find((l) => l.offerId === "o-A")!.label).toBe("red");
  });
});

describe("proposePlans — khả thi và tuyến", () => {
  it("hai lô Đỏ ở hai hướng ngược nhau: từng lô kịp, cả hai thì không ⇒ không ghép chung", () => {
    const need = makeNeed({ quantity: 30 });
    const tight = { deadlineMin: 40, windowStartMin: -60 };
    const result = proposePlans(need, [
      makeCandidate(
        { offerId: "o-east", siteId: "s-east", location: around(5, 90), qty: 15, ...tight },
        need,
      ),
      makeCandidate(
        { offerId: "o-west", siteId: "s-west", location: around(5, 270), qty: 15, ...tight },
        need,
      ),
    ]);
    expect(result.plans.map((p) => p.siteIds)).toEqual([["s-east"], ["s-west"]]);
    expect(result.plans.every((p) => p.coverage === 0.5 && p.route.feasible)).toBe(true);
  });

  it("khung lấy chưa mở ⇒ chờ tới đầu khung", () => {
    const need = makeNeed({ quantity: 10 });
    const best = proposePlans(need, [offer("A", 10, need, { windowStartMin: 90, deadlineMin: 300 })])
      .plans[0]!;
    expect(best.stops[0]!.serviceAt).toBe(new Date(AT + 90 * MIN).toISOString());
    expect(best.route.waitS).toBeGreaterThan(0);
  });

  it("điểm ẩn (không toạ độ) vẫn ghép được, tuyến ước lượng qua khoảng cách SQL", () => {
    const need = makeNeed({ quantity: 30 });
    const best = proposePlans(need, [offer("A", 20, need, { hidden: true }), offer("B", 10, need)]).plans[0]!;
    expect(best.siteIds).toEqual(["s-A", "s-B"]);
    expect(best.stops.find((s) => s.siteId === "s-A")!.location).toBeNull();
    expect(best.route.feasible).toBe(true);
  });

  it("tới điểm nhận sau needed_by ⇒ cảnh báo", () => {
    const need = makeNeed({ quantity: 10, neededByMin: 20 });
    expect(proposePlans(need, [offer("A", 10, need)]).plans[0]!.warnings).toEqual([
      "arrives_after_needed_by",
    ]);
  });

  it("cấu hình di chuyển và giới hạn truyền vào được áp dụng", () => {
    const { need, candidates } = demo();
    const slow = proposePlans(need, candidates, {
      travel: { detourFactor: 1.4, speedKmh: 9, bufferMinutes: 10 },
      limits: { maxPlans: 1 },
    });
    expect(slow.plans).toHaveLength(1);
    expect(slow.plans[0]!.estDurationS).toBeGreaterThan(
      proposePlans(need, candidates).plans[0]!.estDurationS,
    );
    expect(slow.inputs.travel.speedKmh).toBe(9);
  });
});

describe("sàng lọc phòng thủ", () => {
  it("bỏ ứng viên sai và ghi lý do", () => {
    const need = makeNeed({ quantity: 10, radiusKm: 5 });
    const good = offer("A", 10, need);
    const rows: MatchCandidate[] = [
      good,
      { ...good }, // trùng offer_id
      { ...offer("B", 10, need), category_code: "dairy" },
      { ...offer("C", 10, need), offer_id: "o-unit", unit: "kg", unit_weight_kg: 1 },
      { ...offer("C", 0, need), offer_id: "o-empty" },
      { ...offer("C", 0.4, need), offer_id: "o-fraction" }, // 0,4 ổ ⇒ làm tròn xuống 0
      { ...offer("D", 10, need), offer_id: "o-far" }, // 7 km > 5 km
      { ...offer("B", 10, need, { deadlineMin: -5 }), offer_id: "o-expired" },
      { ...offer("B", 10, need), offer_id: "o-label", label: "expired" },
      {
        ...offer("B", 10, need, { deadlineMin: 30 }),
        offer_id: "o-late",
        eta_pickup: new Date(AT + 45 * MIN).toISOString(),
      },
      { ...good, offer_id: "o-bad-unit", unit: "thùng" as never },
      { ...good, offer_id: "o-nan", qty_available: Number.NaN },
      { ...good, offer_id: "o-no-deadline", effective_deadline: "mai" },
      { ...good, offer_id: "o-weight", unit_weight_kg: 0 },
      { ...good, offer_id: "" },
      { ...offer("F", 10, need), offer_id: "o-excluded" },
    ];
    const result = proposePlans(need, rows, { excludeSiteIds: ["s-F"] });
    const reasons = Object.fromEntries(result.candidates.dropped.map((d) => [d.offerId, d.reason]));
    expect(reasons).toEqual({
      "": "invalid",
      "o-A": "duplicate",
      "o-B": "category_mismatch",
      "o-unit": "unit_mismatch",
      "o-empty": "no_quantity",
      "o-fraction": "no_quantity",
      "o-far": "out_of_radius",
      "o-expired": "expired",
      "o-label": "expired",
      "o-late": "infeasible_timing",
      "o-bad-unit": "invalid",
      "o-nan": "invalid",
      "o-no-deadline": "invalid",
      "o-weight": "invalid",
      "o-excluded": "excluded_site",
    });
    expect(result.candidates.used).toBe(1);
    expect(result.plans[0]!.lines).toMatchObject([{ offerId: "o-A", qty: 10 }]);
  });

  it("số dạng chuỗi (numeric của PostgREST) vẫn đọc được", () => {
    const need = makeNeed({ quantity: 10 });
    const row = offer("A", 10, need);
    const asStrings = {
      ...row,
      qty_available: "10",
      distance_km: String(row.distance_km),
      unit_weight_kg: "0.12",
    } as unknown as MatchCandidate;
    expect(proposePlans(need, [asStrings]).plans[0]!.lines[0]!.qty).toBe(10);
  });

  it("từ chối nhu cầu và tùy chọn sai", () => {
    const need = makeNeed({ quantity: 10 });
    const rows = [offer("A", 10, need)];
    expect(() => proposePlans({ ...need, quantity: 0 }, rows)).toThrow(RangeError);
    expect(() => proposePlans({ ...need, quantity: 2.5 }, rows)).toThrow("số nguyên");
    expect(() => proposePlans({ ...need, unit: "thùng" as never }, rows)).toThrow(RangeError);
    expect(() => proposePlans({ ...need, categoryCodes: [] }, rows)).toThrow(RangeError);
    expect(() => proposePlans({ ...need, siteLocation: { lat: 100, lng: 0 } }, rows)).toThrow(RangeError);
    expect(() => proposePlans({ ...need, radiusKm: 0 }, rows)).toThrow(RangeError);
    expect(() => proposePlans({ ...need, at: "bây giờ" }, rows)).toThrow(RangeError);
    expect(() => proposePlans(need, rows, { limits: { maxStops: 6 } })).toThrow(RangeError);
    expect(() => proposePlans(need, rows, { limits: { maxPlans: 4 } })).toThrow(RangeError);
    expect(() => proposePlans(need, rows, { weights: { ...MATCH_WEIGHTS, trust: -1 } })).toThrow(RangeError);
    expect(() =>
      proposePlans(need, rows, { travel: { detourFactor: 1.4, speedKmh: 0, bufferMinutes: 10 } }),
    ).toThrow(RangeError);
    expect(
      proposePlans({ ...need, quantity: 2.5, unit: "kg" }, [offer("A", 10, need, { unit: "kg" })]).plans,
    ).toHaveLength(1);
  });
});

describe("toReserveBundlePayload", () => {
  it("dựng p_lines và p_meta đúng hợp đồng reserve_bundle (DATA-MODEL §8.4)", () => {
    const { need, candidates } = demo();
    const result = proposePlans(need, candidates);
    const plan = result.plans[0]!;
    const { p_lines, p_meta } = toReserveBundlePayload(result, plan);

    expect(p_lines).toEqual([
      { offer_id: "o-A", qty: 20 },
      { offer_id: "o-B", qty: 18 },
      { offer_id: "o-C", qty: 12 },
    ]);
    expect(Object.keys(p_meta).sort()).toEqual(
      [
        "algorithm_version",
        "est_distance_m",
        "est_duration_s",
        "inputs_snapshot",
        "option_rank",
        "score",
        "stop_count",
      ].sort(),
    );
    expect(p_meta.algorithm_version).toMatch(/^match-v[0-9]+$/);
    expect(p_meta.option_rank).toBe(1);
    expect(p_meta.stop_count).toBe(3);
    expect(p_meta.score).toBeGreaterThan(0);
    expect(p_meta.score).toBeLessThanOrEqual(1);
    expect(Number.isInteger(p_meta.score * 1e4)).toBe(true);
    expect(Number.isInteger(p_meta.est_distance_m)).toBe(true);
    expect(p_meta.est_duration_s).toBe(plan.estDurationS);

    const snap = p_meta.inputs_snapshot;
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap);
    expect(snap.option).toMatchObject({
      rank: 1,
      site_ids: ["s-A", "s-B", "s-C"],
      coverage: 1,
      shortfall: 0,
    });
    expect(snap.remaining).toBe(50);
    expect(snap.sites).toHaveLength(3);
    expect(snap.alternatives.map((a) => a.rank)).toEqual([2, 3]);
    expect(snap.candidates.dropped).toEqual([{ offer_id: "o-E", reason: "out_of_radius" }]);
    expect(snap.route_source).toBe("estimate");
  });

  it("tuyến thật và ghép lại: lấy km/phút từ provider, gắn rematch_of", () => {
    const { need, candidates } = demo();
    const result = proposePlans(need, candidates);
    const route = {
      geojson: {
        type: "LineString" as const,
        coordinates: [
          [CHARITY.lng, CHARITY.lat],
          [106.71, 10.78],
        ] as [number, number][],
      },
      distanceM: 9123.6,
      durationS: 1800.4,
      provider: "fake",
    };
    const { p_meta } = toReserveBundlePayload(result, 2, { route, rematchOf: "bundle-1" });
    expect(p_meta.option_rank).toBe(2);
    expect(p_meta.est_distance_m).toBe(9124);
    expect(p_meta.est_duration_s).toBe(1800);
    expect(p_meta.route_geojson).toEqual(route.geojson);
    expect(p_meta.route_provider).toBe("fake");
    expect(p_meta.rematch_of).toBe("bundle-1");
    expect(p_meta.inputs_snapshot.route_source).toBe("provider");
  });

  it("phương án không thuộc kết quả ⇒ RangeError", () => {
    const { need, candidates } = demo();
    const result = proposePlans(need, candidates);
    const other = proposePlans(makeNeed({ quantity: 10 }), candidates).plans[0]!;
    expect(() => toReserveBundlePayload(result, 4)).toThrow(RangeError);
    expect(() => toReserveBundlePayload(result, other)).toThrow(RangeError);
    expect(toReserveBundlePayload(result, { ...result.plans[1]! }).p_meta.option_rank).toBe(2);
  });
});

describe("hiệu năng (ARCHITECTURE §14: ≤ 50 ms cho 15 ứng viên)", () => {
  function fifteen(quantity: number) {
    const need = makeNeed({ quantity, radiusKm: 15 });
    const perish: Perishability[] = ["cooked", "fresh", "packaged"];
    const candidates = Array.from({ length: 15 }, (_, i) =>
      makeCandidate(
        {
          offerId: `o-${String(i).padStart(2, "0")}`,
          siteId: `s-${String(i).padStart(2, "0")}`,
          location: around(0.5 + (i % 7) * 1.7, (i * 137) % 360),
          qty: 8 + ((i * 7) % 13),
          deadlineMin: 240 + i * 90,
          perishability: perish[i % 3],
          trust: 40 + ((i * 11) % 60),
        },
        need,
      ),
    );
    return { need, candidates };
  }

  function medianMs(run: () => void): number {
    run(); // làm nóng JIT
    const times: number[] = [];
    for (let i = 0; i < 7; i++) {
      const t0 = performance.now();
      run();
      times.push(performance.now() - t0);
    }
    return times.sort((a, b) => a - b)[3]!;
  }

  it("15 ứng viên / 15 điểm, phủ đủ trong ≤ 3 điểm", () => {
    const { need, candidates } = fifteen(40);
    const result = proposePlans(need, candidates);
    expect(result.stats.combosEvaluated).toBe(298);
    expect(result.plans[0]!.coverage).toBe(1);
    expect(medianMs(() => proposePlans(need, candidates))).toBeLessThan(50);
  });

  it("15 ứng viên, phải mở rộng tham lam tới 5 điểm (trường hợp chậm nhất)", () => {
    const { need, candidates } = fifteen(80);
    const result = proposePlans(need, candidates);
    expect(result.plans[0]!.stopCount).toBeGreaterThan(3);
    expect(medianMs(() => proposePlans(need, candidates))).toBeLessThan(50);
  });
});
