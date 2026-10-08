/**
 * Tác động (ESG-METHODOLOGY §2–§4, DATA-MODEL §13) — TypeScript thuần, không IO.
 *
 * - `computeLineImpact` tái hiện ĐÚNG phép tính của `private.credit_impact` (SQL) cho một dòng bàn giao:
 *   kg = round(qty × unit_weight_kg, 3); co2e = max(round(kg × f_co2e, 3), 0,001);
 *   water = round(kg × f_water, 2) (null nếu version không có hệ số nước); meals = round(kg ÷ f_meal, 2).
 *   Hai phía dùng chung `fixtures.json` (ESG-METHODOLOGY §1.5).
 * - `sumImpact` cộng các dòng sổ (credit dương, reversal âm) — không bao giờ nhân lại tổng kg với hệ số
 *   hiện hành (ESG §4.1 E2).
 * - `display*` định dạng hiển thị theo ESG §2.2: kg 1 chữ số thập phân; CO₂e < 10 kg một chữ số, từ 10 kg
 *   số nguyên, từ 1.000 kg đổi sang tấn; nước số nguyên lít, từ 1.000 lít đổi sang m³; suất ăn làm tròn XUỐNG.
 */

export type ImpactMetric = "co2e_kg_per_kg" | "water_l_per_kg" | "kg_per_meal";

/** Một bộ hệ số có version (bảng `impact_factors`, mỗi dòng = version × metric). */
export type ImpactFactorSet = {
  version: string;
  co2eKgPerKg: number;
  /** null ⇒ version không có hệ số nước ⇒ UI ẩn chỉ số nước. */
  waterLPerKg: number | null;
  kgPerMeal: number;
};

export type LineImpact = {
  kg: number;
  co2eKg: number;
  waterL: number | null;
  meals: number;
};

export type LedgerEntry = LineImpact & { entryType: "credit" | "reversal" };

export type ImpactTotals = LineImpact & {
  /** Số dòng credit (= số dòng bàn giao có tác động); reversal không trừ (DATA-MODEL §2.5). */
  deliveries: number;
};

export const ZERO_TOTALS: ImpactTotals = { kg: 0, co2eKg: 0, waterL: 0, meals: 0, deliveries: 0 };

/**
 * Làm tròn kiểu `round(numeric, d)` của Postgres: nửa xa số 0. Dùng mũ thập phân trong chuỗi để tránh
 * lỗi nhị phân (1.005 × 100 = 100.49999…).
 */
export function roundHalfAwayFromZero(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return value;
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  const shifted = Math.round(Number(`${abs}e${decimals}`));
  const result = sign * Number(`${shifted}e-${decimals}`);
  return Object.is(result, -0) ? 0 : result;
}

/** kg của một dòng: `round(qty × unit_weight_kg_snapshot, 3)` (ESG §2.3). */
export function kgFromQty(qty: number, unitWeightKg: number): number {
  return roundHalfAwayFromZero(qty * unitWeightKg, 3);
}

/**
 * Tác động của một dòng bàn giao dropoff (giống `private.credit_impact`). Trả `null` khi dòng không tạo
 * credit (qty = 0, hoặc kg làm tròn về 0).
 */
export function computeLineImpact(
  qty: number,
  unitWeightKg: number,
  factors: ImpactFactorSet,
): LineImpact | null {
  if (!(qty > 0) || !(unitWeightKg > 0)) return null;
  const kg = kgFromQty(qty, unitWeightKg);
  if (kg <= 0) return null;
  return impactOfKg(kg, factors);
}

/** Tác động của một khối lượng kg đã làm tròn 3 chữ số (xem trước trên UI). */
export function impactOfKg(kg: number, factors: ImpactFactorSet): LineImpact {
  return {
    kg,
    co2eKg: Math.max(roundHalfAwayFromZero(kg * factors.co2eKgPerKg, 3), 0.001),
    waterL: factors.waterLPerKg === null ? null : roundHalfAwayFromZero(kg * factors.waterLPerKg, 2),
    meals: roundHalfAwayFromZero(kg / factors.kgPerMeal, 2),
  };
}

/**
 * Dòng reversal âm cho `kg` (> 0) của một credit — giống `public.reverse_impact`: CO₂e, nước, suất ăn
 * tỷ lệ theo kg của credit gốc với cùng version hệ số (ESG §6.1).
 */
export function reversalOf(credit: LineImpact, kg: number): LedgerEntry {
  const reversedKg = roundHalfAwayFromZero(kg, 3);
  const ratio = reversedKg / credit.kg;
  return {
    entryType: "reversal",
    kg: -reversedKg,
    co2eKg: -Math.max(roundHalfAwayFromZero(credit.co2eKg * ratio, 3), 0.001),
    waterL: credit.waterL === null ? null : -roundHalfAwayFromZero(credit.waterL * ratio, 2),
    meals: -roundHalfAwayFromZero(credit.meals * ratio, 2),
  };
}

/**
 * Cộng các dòng sổ (đã có dấu). Nước: nếu có dòng nào thiếu `water_l` (version không có hệ số nước)
 * thì tổng nước = null để UI ẩn, thay vì hiện một con số thấp hơn thực tế (ESG §4.1 E3).
 */
export function sumImpact(entries: readonly LedgerEntry[]): ImpactTotals {
  let kg = 0;
  let co2eKg = 0;
  let waterL: number | null = 0;
  let meals = 0;
  let deliveries = 0;
  for (const e of entries) {
    kg += e.kg;
    co2eKg += e.co2eKg;
    meals += e.meals;
    if (waterL !== null) waterL = e.waterL === null ? null : waterL + e.waterL;
    if (e.entryType === "credit") deliveries += 1;
  }
  return {
    kg: roundHalfAwayFromZero(kg, 3),
    co2eKg: roundHalfAwayFromZero(co2eKg, 3),
    waterL: waterL === null ? null : roundHalfAwayFromZero(waterL, 2),
    meals: roundHalfAwayFromZero(meals, 2),
    deliveries,
  };
}

/** Gom các dòng `impact_factors` thành bộ hệ số theo version; bỏ version thiếu CO₂e hoặc suất ăn. */
export function factorSetsFromRows(
  rows: readonly { version: string; metric: string; value: number }[],
): ImpactFactorSet[] {
  const byVersion = new Map<string, Partial<Record<ImpactMetric, number>>>();
  for (const r of rows) {
    const m = byVersion.get(r.version) ?? {};
    if (r.metric === "co2e_kg_per_kg" || r.metric === "water_l_per_kg" || r.metric === "kg_per_meal") {
      m[r.metric] = Number(r.value);
    }
    byVersion.set(r.version, m);
  }
  const sets: ImpactFactorSet[] = [];
  for (const [version, m] of byVersion) {
    if (!(m.co2e_kg_per_kg! > 0) || !(m.kg_per_meal! > 0)) continue;
    sets.push({
      version,
      co2eKgPerKg: m.co2e_kg_per_kg!,
      waterLPerKg: m.water_l_per_kg! > 0 ? m.water_l_per_kg! : null,
      kgPerMeal: m.kg_per_meal!,
    });
  }
  // v10 sau v9: so theo số
  return sets.sort((a, b) => versionNumber(a.version) - versionNumber(b.version));
}

function versionNumber(version: string): number {
  const n = Number(/^v(\d+)$/.exec(version)?.[1]);
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------------
// Hiển thị (vi-VN)
// ---------------------------------------------------------------------------

export type DisplayValue = {
  /** Phần số, đã định dạng vi-VN: "1.234,5". */
  value: string;
  /** Đơn vị: "kg", "kg CO₂e", "tấn CO₂e", "lít", "m³", "suất". */
  unit: string;
  /** "1.234,5 kg". */
  text: string;
};

const fixed1 = new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

function make(value: string, unit: string): DisplayValue {
  return { value, unit, text: `${value} ${unit}` };
}

/** Kg cứu được: luôn 1 chữ số thập phân — "12,0 kg", "1.234,5 kg". */
export function displayKg(kg: number): DisplayValue {
  return make(fixed1.format(roundHalfAwayFromZero(kg, 1)), "kg");
}

/** CO₂e: "1,9 kg CO₂e" (< 10) · "24 kg CO₂e" · "1,2 tấn CO₂e" (≥ 1.000 kg). */
export function displayCo2e(co2eKg: number): DisplayValue {
  const r1 = roundHalfAwayFromZero(co2eKg, 1);
  if (Math.abs(r1) < 10) return make(fixed1.format(r1), "kg CO₂e");
  const r0 = roundHalfAwayFromZero(co2eKg, 0);
  if (Math.abs(r0) < 1000) return make(integer.format(r0), "kg CO₂e");
  return make(fixed1.format(roundHalfAwayFromZero(co2eKg / 1000, 1)), "tấn CO₂e");
}

/** Nước tưới: "150 lít" · "1,8 m³" (≥ 1.000 lít). */
export function displayWater(waterL: number): DisplayValue {
  const r0 = roundHalfAwayFromZero(waterL, 0);
  if (Math.abs(r0) < 1000) return make(integer.format(r0), "lít");
  return make(fixed1.format(roundHalfAwayFromZero(waterL / 1000, 1)), "m³");
}

/** Suất ăn tương đương: làm tròn XUỐNG (bảo thủ, ESG §4.2 S1) — "28 suất". */
export function displayMeals(meals: number): DisplayValue {
  // ε chống lỗi cộng dồn số thực (28,999999… phải là 29)
  return make(integer.format(Math.max(0, Math.floor(meals + 1e-9))), "suất");
}

/** Số lô đã giao (mỗi dòng credit = một phân bổ giao thành công): "12 lô". */
export function displayDeliveredLots(count: number): DisplayValue {
  return make(integer.format(Math.max(0, Math.trunc(count))), "lô");
}
