/**
 * Quy tắc chọn phân bổ cho một chuyến tự lấy (thuần, không IO; DB vẫn kiểm lại trong `assign_pickup`).
 */

/** `app_settings.max_pickup_stops` mặc định (DATA-MODEL §2.3 pickup_stops: ≤ 5 điểm lấy + 1 điểm giao). */
export const MAX_PICKUP_STOPS = 5;

export type PlanItem = { id: string; storeSiteId: string; charitySiteId: string };

export type PlanCheck =
  | { ok: true; stores: number }
  | { ok: false; reason: "empty" | "mixed_sites" | "too_many_stops"; stores: number };

/** Số cửa hàng (điểm lấy) khác nhau trong lựa chọn và lỗi nếu có. */
export function checkPlan(items: readonly PlanItem[], max = MAX_PICKUP_STOPS): PlanCheck {
  const stores = new Set(items.map((i) => i.storeSiteId)).size;
  if (items.length === 0) return { ok: false, reason: "empty", stores };
  if (new Set(items.map((i) => i.charitySiteId)).size > 1)
    return { ok: false, reason: "mixed_sites", stores };
  if (stores > max) return { ok: false, reason: "too_many_stops", stores };
  return { ok: true, stores };
}

/** Nhóm theo khóa, giữ thứ tự xuất hiện. */
export function groupBy<T, K>(items: readonly T[], key: (t: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const it of items) {
    const k = key(it);
    const list = out.get(k);
    if (list) list.push(it);
    else out.set(k, [it]);
  }
  return out;
}
