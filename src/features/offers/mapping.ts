import type { UnitCode } from "@/features/catalog/labels";

import { parseTstzRange, roundUpToStep, vnDateKey, vnTime } from "./datetime";
import { formatDecimalInput, type OfferFormValues, type WeightSource } from "./schemas";

/**
 * Dòng `offers` (đọc qua RLS) ⇒ giá trị form sửa lô. Thuần, có unit test. Dùng ở trang Sửa (giá trị ban đầu)
 * và ở server action (so sánh để chỉ gửi khóa thay đổi khi lô đã đăng).
 */

export type OfferRecord = {
  siteId: string;
  categoryCode: string;
  title: string;
  description: string | null;
  quantity: number;
  unit: UnitCode;
  unitWeightKg: number;
  weightSource: WeightSource;
  expiresAt: string;
  expiryIsDateOnly: boolean;
  /** `tstzrange` dạng chữ của PostgREST. */
  pickupWindow: string;
  photoPaths: string[];
  aiAssisted: boolean;
};

/**
 * Giá trị ban đầu của form "Đăng lô mới": khung lấy bắt đầu ở mốc 15 phút kế tiếp, dài 2 giờ (tính theo
 * giờ VN ở server); danh mục, số lượng, hạn dùng để người dùng chọn.
 */
export function newOfferValues(siteId: string, now: Date): OfferFormValues {
  const start = roundUpToStep(now, 15);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  return {
    siteId,
    categoryCode: "",
    title: "",
    description: "",
    quantity: "",
    unit: "",
    unitWeightKg: "",
    weightSource: "category_default",
    expiryDate: "",
    expiryTime: "",
    pickupStartDate: vnDateKey(start),
    pickupStartTime: vnTime(start),
    pickupEndDate: vnDateKey(end),
    pickupEndTime: vnTime(end),
    photoPath: null,
    aiAssisted: false,
  };
}

/**
 * Điền sẵn danh mục (vd. từ "Nhu cầu gần bạn" → `/store/inventory/new?category=bread`, US-STO-21 AC1):
 * cùng quy tắc với bộ chọn danh mục của form — đơn vị mặc định, khối lượng/đơn vị theo danh mục (trừ kg).
 * Mã lạ hoặc không còn hoạt động ⇒ giữ nguyên giá trị.
 */
export function withCategory(
  values: OfferFormValues,
  code: string | undefined,
  categories: readonly { code: string; defaultUnit: UnitCode; defaultUnitWeightKg: number }[],
): OfferFormValues {
  const cat = code ? categories.find((c) => c.code === code) : undefined;
  if (!cat) return values;
  return {
    ...values,
    categoryCode: cat.code,
    unit: cat.defaultUnit,
    unitWeightKg: cat.defaultUnit === "kg" ? "" : formatDecimalInput(cat.defaultUnitWeightKg),
    weightSource: cat.defaultUnit === "kg" ? "declared" : "category_default",
  };
}

export function offerToFormValues(r: OfferRecord): OfferFormValues {
  const expires = new Date(r.expiresAt);
  const window = parseTstzRange(r.pickupWindow);
  return {
    siteId: r.siteId,
    categoryCode: r.categoryCode,
    title: r.title,
    description: r.description ?? "",
    quantity: formatDecimalInput(r.quantity),
    unit: r.unit,
    unitWeightKg: r.unit === "kg" ? "" : formatDecimalInput(r.unitWeightKg),
    weightSource: r.unit === "kg" ? "declared" : r.weightSource,
    expiryDate: vnDateKey(expires),
    expiryTime: r.expiryIsDateOnly ? "" : vnTime(expires),
    pickupStartDate: window ? vnDateKey(window.start) : "",
    pickupStartTime: window ? vnTime(window.start) : "",
    pickupEndDate: window ? vnDateKey(window.end) : "",
    pickupEndTime: window ? vnTime(window.end) : "",
    photoPath: r.photoPaths[0] ?? null,
    aiAssisted: r.aiAssisted,
  };
}
