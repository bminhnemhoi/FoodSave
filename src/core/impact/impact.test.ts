import fc from "fast-check";
import { describe, expect, it } from "vitest";

import fixtures from "./fixtures.json";
import {
  computeLineImpact,
  displayCo2e,
  displayDeliveredLots,
  displayKg,
  displayMeals,
  displayWater,
  factorSetsFromRows,
  impactOfKg,
  kgFromQty,
  reversalOf,
  roundHalfAwayFromZero,
  sumImpact,
  type ImpactFactorSet,
  type LedgerEntry,
} from "./index";

type FixtureFactors = { co2e_kg_per_kg: number; water_l_per_kg: number | null; kg_per_meal: number };

function factorsOf(version: string): ImpactFactorSet {
  const f = (fixtures.factors as Record<string, FixtureFactors>)[version]!;
  return { version, co2eKgPerKg: f.co2e_kg_per_kg, waterLPerKg: f.water_l_per_kg, kgPerMeal: f.kg_per_meal };
}

const V1 = factorsOf("v1");

describe("computeLineImpact — fixture dùng chung với private.credit_impact", () => {
  it.each(fixtures.lines)("$name", ({ version, qty, unit_weight_kg, expected, display }) => {
    const line = computeLineImpact(qty, unit_weight_kg, factorsOf(version));
    expect(line).not.toBeNull();
    expect(line!.kg).toBe(expected.kg);
    expect(line!.co2eKg).toBe(expected.co2e_kg);
    expect(line!.waterL).toBe(expected.water_l);
    expect(line!.meals).toBe(expected.meals);

    expect(displayKg(line!.kg).text).toBe(display.kg);
    expect(displayCo2e(line!.co2eKg).text).toBe(display.co2e);
    expect(line!.waterL === null ? null : displayWater(line!.waterL).text).toBe(display.water);
    expect(displayMeals(line!.meals).text).toBe(display.meals);
  });

  it.each(fixtures.noCredit)("không tạo credit: $name", ({ qty, unit_weight_kg }) => {
    expect(computeLineImpact(qty, unit_weight_kg, V1)).toBeNull();
  });

  it("số âm / không hợp lệ ⇒ không tạo credit", () => {
    expect(computeLineImpact(-1, 1, V1)).toBeNull();
    expect(computeLineImpact(1, 0, V1)).toBeNull();
    expect(computeLineImpact(Number.NaN, 1, V1)).toBeNull();
  });
});

describe("roundHalfAwayFromZero (= round(numeric, d) của Postgres)", () => {
  it.each([
    [1.005, 2, 1.01],
    [2.675, 2, 2.68],
    [0.0005, 3, 0.001],
    [-1.005, 2, -1.01],
    [-0.0004, 3, 0],
    [12.25, 1, 12.3],
    [150.74999999999997, 2, 150.75],
  ])("round(%d, %d) = %d", (value, d, expected) => {
    expect(roundHalfAwayFromZero(value, d)).toBe(expected);
  });

  it("không trả -0 và giữ nguyên NaN/Infinity", () => {
    expect(Object.is(roundHalfAwayFromZero(-0.0001, 2), 0)).toBe(true);
    expect(roundHalfAwayFromZero(Number.NaN, 2)).toBeNaN();
    expect(roundHalfAwayFromZero(Number.POSITIVE_INFINITY, 2)).toBe(Number.POSITIVE_INFINITY);
  });

  it("kgFromQty làm tròn 3 chữ số", () => {
    expect(kgFromQty(3, 0.335)).toBe(1.005);
    expect(kgFromQty(7, 0.143)).toBe(1.001);
  });
});

describe("sumImpact — credit dương, reversal âm", () => {
  const credit = (kg: number): LedgerEntry => ({ entryType: "credit", ...impactOfKg(kg, V1) });

  it("partial_reversals: credit 18 kg, reversal 5 rồi 13 (tỷ lệ theo credit) ⇒ tổng 0, vẫn 1 lần bàn giao", () => {
    const c = credit(18);
    const t = sumImpact([c, reversalOf(c, 5), reversalOf(c, 13)]);
    expect(t).toEqual({ kg: 0, co2eKg: 0, waterL: 0, meals: 0, deliveries: 1 });
  });

  it("reversal giữ nước null khi credit không có nước", () => {
    const c = { entryType: "credit" as const, ...impactOfKg(10, factorsOf("v0_no_water")) };
    expect(reversalOf(c, 4)).toEqual({
      entryType: "reversal",
      kg: -4,
      co2eKg: -10,
      waterL: null,
      meals: -11.43,
    });
  });

  it("cộng nhiều dòng", () => {
    const t = sumImpact([credit(12), credit(4)]);
    expect(t.kg).toBe(16);
    expect(t.co2eKg).toBe(32);
    expect(t.waterL).toBe(2400);
    expect(t.meals).toBe(38.09);
    expect(t.deliveries).toBe(2);
  });

  it("có dòng thiếu hệ số nước ⇒ tổng nước null (UI ẩn)", () => {
    const noWater = factorsOf("v0_no_water");
    const t = sumImpact([credit(1), { entryType: "credit", ...impactOfKg(1, noWater) }]);
    expect(t.waterL).toBeNull();
    expect(t.kg).toBe(2);
  });

  it("rỗng ⇒ 0", () => {
    expect(sumImpact([])).toEqual({ kg: 0, co2eKg: 0, waterL: 0, meals: 0, deliveries: 0 });
  });
});

describe("factorSetsFromRows", () => {
  it("gom theo version, bỏ version thiếu metric bắt buộc, sắp theo số version", () => {
    const sets = factorSetsFromRows([
      { version: "v10", metric: "co2e_kg_per_kg", value: 1.9 },
      { version: "v10", metric: "kg_per_meal", value: 0.4 },
      { version: "v1", metric: "co2e_kg_per_kg", value: 2 },
      { version: "v1", metric: "water_l_per_kg", value: 150 },
      { version: "v1", metric: "kg_per_meal", value: 0.42 },
      { version: "v2", metric: "co2e_kg_per_kg", value: 2.1 },
      { version: "v2", metric: "unknown", value: 1 },
    ]);
    expect(sets).toEqual([
      { version: "v1", co2eKgPerKg: 2, waterLPerKg: 150, kgPerMeal: 0.42 },
      { version: "v10", co2eKgPerKg: 1.9, waterLPerKg: null, kgPerMeal: 0.4 },
    ]);
  });
});

describe("hiển thị (ESG §2.2, DESIGN-SYSTEM §16.4)", () => {
  it("kg luôn 1 chữ số thập phân", () => {
    expect(displayKg(0).text).toBe("0,0 kg");
    expect(displayKg(1234.54).text).toBe("1.234,5 kg");
    expect(displayKg(12).value).toBe("12,0");
    expect(displayKg(12).unit).toBe("kg");
  });

  it("CO₂e: < 10 một chữ số, từ 10 số nguyên, từ 1.000 tấn", () => {
    expect(displayCo2e(1.94).text).toBe("1,9 kg CO₂e");
    expect(displayCo2e(9.96).text).toBe("10 kg CO₂e");
    expect(displayCo2e(999.4).text).toBe("999 kg CO₂e");
    expect(displayCo2e(999.6).text).toBe("1,0 tấn CO₂e");
    expect(displayCo2e(1234).text).toBe("1,2 tấn CO₂e");
  });

  it("nước: lít số nguyên, từ 1.000 lít sang m³", () => {
    expect(displayWater(150).text).toBe("150 lít");
    expect(displayWater(999.4).text).toBe("999 lít");
    expect(displayWater(1800).text).toBe("1,8 m³");
  });

  it("suất ăn làm tròn xuống, chống lỗi số thực", () => {
    expect(displayMeals(28.57).text).toBe("28 suất");
    expect(displayMeals(0.1 + 0.2 + 2.7).text).toBe("3 suất");
    expect(displayMeals(-1).text).toBe("0 suất");
    expect(displayMeals(2976.19).text).toBe("2.976 suất");
  });

  it("số lô đã giao", () => {
    expect(displayDeliveredLots(1234).text).toBe("1.234 lô");
  });
});

describe("tính chất (fast-check)", () => {
  const kgArb = fc.integer({ min: 1, max: 5_000_000 }).map((g) => g / 1000);

  it("E2 = Σ round(kg × f): tổng CO₂e bằng tổng từng dòng (không nhân lại tổng kg)", () => {
    fc.assert(
      fc.property(fc.array(kgArb, { minLength: 1, maxLength: 30 }), (kgs) => {
        const entries = kgs.map((kg) => ({ entryType: "credit" as const, ...impactOfKg(kg, V1) }));
        const total = sumImpact(entries);
        const expected = roundHalfAwayFromZero(
          entries.reduce((s, e) => s + e.co2eKg, 0),
          3,
        );
        expect(total.co2eKg).toBeCloseTo(expected, 6);
      }),
    );
  });

  it("cộng theo cửa hàng bằng tổng toàn hệ thống (tính chất cộng)", () => {
    fc.assert(
      fc.property(fc.array(kgArb, { maxLength: 20 }), fc.array(kgArb, { maxLength: 20 }), (a, b) => {
        const ea = a.map((kg) => ({ entryType: "credit" as const, ...impactOfKg(kg, V1) }));
        const eb = b.map((kg) => ({ entryType: "credit" as const, ...impactOfKg(kg, V1) }));
        const all = sumImpact([...ea, ...eb]);
        const sa = sumImpact(ea);
        const sb = sumImpact(eb);
        expect(all.kg).toBeCloseTo(sa.kg + sb.kg, 6);
        expect(all.meals).toBeCloseTo(sa.meals + sb.meals, 6);
        expect(all.deliveries).toBe(sa.deliveries + sb.deliveries);
      }),
    );
  });

  it("suất ăn hiển thị không bao giờ vượt giá trị thực", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1e7, noNaN: true }), (meals) => {
        const shown = Number(displayMeals(meals).value.replace(/\./g, ""));
        expect(shown).toBeLessThanOrEqual(meals + 1e-6);
      }),
    );
  });

  it("credit luôn dương, CO₂e ≥ 0,001", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100_000 }),
        fc.integer({ min: 1, max: 1_000_000 }).map((g) => g / 1000),
        (qty, w) => {
          const line = computeLineImpact(qty, w, V1);
          expect(line).not.toBeNull();
          expect(line!.kg).toBeGreaterThan(0);
          expect(line!.co2eKg).toBeGreaterThanOrEqual(0.001);
        },
      ),
    );
  });
});
