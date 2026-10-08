import { z } from "zod";

import type { Perishability } from "@/core/labels";
import { CONTINUOUS_UNITS, UNIT_LABEL, type UnitCode } from "@/features/catalog/labels";

import { formatDeadline, isDateKey, isTime24, parseVnDateTime, vnIso } from "./datetime";

/**
 * Form lô tặng (P2-04, US-STO-07, US-STO-09, US-STO-12) — schema + quy tắc dùng chung client/server.
 * Quy tắc khớp RPC `create_offer`/`update_offer`/`publish_offer` (migration offers_allocations:
 * `private.apply_offer_patch`, `private.offer_effective_deadline`); RPC vẫn là nơi quyết định cuối cùng,
 * lỗi PT422 của RPC được ánh xạ lại về đúng trường bằng `offerFieldErrorsFromRpc`.
 */

export const UNIT_CODES = [
  "loaf",
  "piece",
  "portion",
  "box",
  "bottle",
  "bag",
  "kg",
  "liter",
] as const satisfies readonly UnitCode[];

export const OFFER_LIMITS = {
  titleMin: 2,
  titleMax: 120,
  descriptionMax: 1000,
  quantityMax: 999_999_999,
  weightMax: 1000,
  reasonMax: 500,
  /** `app_settings.min_publish_lead_minutes` mặc định. */
  minLeadMinutes: 30,
} as const;

export type CategoryOption = {
  code: string;
  nameVi: string;
  perishability: Perishability;
  defaultUnit: UnitCode;
  defaultUnitWeightKg: number;
  icon: string;
};

export type SiteOption = { id: string; name: string; ward: string | null };

export type WeightSource = "category_default" | "declared";

/** Giá trị form (chuỗi như người dùng gõ). Ngày "YYYY-MM-DD", giờ "HH:mm" — đều là giờ Việt Nam. */
export type OfferFormValues = {
  siteId: string;
  categoryCode: string;
  title: string;
  description: string;
  quantity: string;
  unit: UnitCode | "";
  unitWeightKg: string;
  weightSource: WeightSource;
  expiryDate: string;
  /** Trống ⇒ hạn chỉ có ngày ⇒ 23:59 giờ VN. */
  expiryTime: string;
  pickupStartDate: string;
  pickupStartTime: string;
  pickupEndDate: string;
  pickupEndTime: string;
  /** Đường dẫn ảnh đã tải lên bucket `media` (org/{org_id}/offer/{uuid}.webp). */
  photoPath: string | null;
  aiAssisted: boolean;
};

export type OfferFieldKey =
  | "siteId"
  | "categoryCode"
  | "title"
  | "description"
  | "quantity"
  | "unit"
  | "unitWeightKg"
  | "expiryDate"
  | "expiryTime"
  | "pickupStart"
  | "pickupEnd"
  | "photoPath"
  | "attested";

export type OfferFieldErrors = Partial<Record<OfferFieldKey, string>>;

export const OFFER_MESSAGES = {
  site: "Vui lòng chọn điểm lấy hàng.",
  siteInactive: "Điểm này đang tạm ngưng nên chưa đăng lô được. Hãy chọn điểm khác.",
  category: "Vui lòng chọn danh mục.",
  categoryInactive: "Danh mục này không còn dùng được. Vui lòng chọn danh mục khác.",
  titleRequired: "Vui lòng nhập tên lô.",
  titleLength: "Tên lô cần từ 2 đến 120 ký tự.",
  descriptionLength: "Mô tả tối đa 1.000 ký tự.",
  quantityRequired: "Vui lòng nhập số lượng.",
  quantityInvalid: "Số lượng phải lớn hơn 0.",
  quantityInteger: (unit: UnitCode) => `Số lượng phải là số nguyên với đơn vị ${UNIT_LABEL[unit]}.`,
  unit: "Vui lòng chọn đơn vị.",
  weightRequired: (unit: UnitCode) => `Vui lòng nhập khối lượng mỗi ${UNIT_LABEL[unit]} (kg).`,
  weightInvalid: "Khối lượng mỗi đơn vị phải lớn hơn 0 và tối đa 1.000 kg.",
  expiryRequired: "Vui lòng chọn hạn sử dụng.",
  expiryTime: "Giờ chưa đúng định dạng 24 giờ, ví dụ 21:00.",
  pickupStart: "Vui lòng nhập ngày và giờ bắt đầu lấy.",
  pickupEnd: "Vui lòng nhập ngày và giờ kết thúc lấy.",
  pickupOrder: "Giờ kết thúc phải sau giờ bắt đầu.",
  pickupAfterExpiry: (at: string) => `Khung giờ lấy phải kết thúc trước hạn sử dụng (${at}).`,
  pickupAfterClose: (at: string) => `Khung giờ lấy phải kết thúc trước ${at} (giờ đóng cửa).`,
  future: "Vui lòng chọn thời điểm trong tương lai.",
  outsideHours: "Lúc bắt đầu khung lấy, điểm đang đóng cửa. Hãy chọn giờ trong giờ mở cửa.",
  tooShort: (min: number) =>
    `Cần ít nhất ${min} phút từ lúc bắt đầu lấy (hoặc từ bây giờ) tới hạn hiệu lực để tổ chức kịp đến.`,
  attest: "Vui lòng xác nhận cam kết an toàn thực phẩm trước khi đăng.",
  photo: "Ảnh chưa hợp lệ. Vui lòng chọn lại ảnh.",
} as const;

// ---------------------------------------------------------------------------
// Số
// ---------------------------------------------------------------------------

/** "12", "12,5", "12.5" ⇒ số; chuỗi khác (âm, chữ, nhiều dấu) ⇒ null. Tối đa 3 chữ số thập phân. */
export function parseDecimal(raw: string): number | null {
  const s = raw.trim().replace(/\s+/g, "").replace(",", ".");
  if (!/^\d{1,12}(\.\d{1,3})?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const inputNumber = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 3, useGrouping: false });

/** Số ⇒ chuỗi cho ô nhập: 2.5 ⇒ "2,5", 12 ⇒ "12". */
export function formatDecimalInput(n: number): string {
  return inputNumber.format(n);
}

export function isContinuous(unit: UnitCode): boolean {
  return CONTINUOUS_UNITS.has(unit);
}

// ---------------------------------------------------------------------------
// Schema hình dạng (envelope) — server action kiểm trước khi chạy quy tắc nghiệp vụ
// ---------------------------------------------------------------------------

const shortText = (max: number) => z.string().max(max);

export const offerFormValuesSchema = z.object({
  siteId: shortText(64),
  categoryCode: shortText(40),
  title: shortText(400),
  description: shortText(4000),
  quantity: shortText(32),
  unit: z.enum([...UNIT_CODES, ""]),
  unitWeightKg: shortText(32),
  weightSource: z.enum(["category_default", "declared"]),
  expiryDate: shortText(10),
  expiryTime: shortText(5),
  pickupStartDate: shortText(10),
  pickupStartTime: shortText(5),
  pickupEndDate: shortText(10),
  pickupEndTime: shortText(5),
  photoPath: z.string().max(300).nullable(),
  aiAssisted: z.boolean(),
}) satisfies z.ZodType<OfferFormValues>;

// ---------------------------------------------------------------------------
// Quy tắc nghiệp vụ (khớp RPC)
// ---------------------------------------------------------------------------

export type ValidateOptions = {
  /** `draft` = Lưu nháp (đủ trường RPC bắt buộc); `publish` = Đăng lô (thêm thời gian + cam kết). */
  mode: "draft" | "publish";
  now: Date;
  attested?: boolean;
  /** Đơn vị mặc định theo danh mục (để biết khi nào bắt buộc khai khối lượng). */
  categories?: readonly CategoryOption[];
  /** Lô đã đăng: số lượng sửa qua "Cập nhật số lượng", không qua form. */
  skipQuantity?: boolean;
};

export type ParsedTimes = {
  expiresAt: Date | null;
  pickupStart: Date | null;
  pickupEnd: Date | null;
};

/** Hạn dùng (chỉ ngày ⇒ 23:59 VN) và khung lấy dưới dạng Date; thiếu/sai ⇒ null. */
export function parseOfferTimes(v: OfferFormValues): ParsedTimes {
  const expiresAt = isDateKey(v.expiryDate)
    ? parseVnDateTime(v.expiryDate, v.expiryTime.trim() === "" ? "23:59" : v.expiryTime.trim())
    : null;
  return {
    expiresAt,
    pickupStart: parseVnDateTime(v.pickupStartDate, v.pickupStartTime),
    pickupEnd: parseVnDateTime(v.pickupEndDate, v.pickupEndTime),
  };
}

export function validateOfferForm(v: OfferFormValues, opts: ValidateOptions): OfferFieldErrors {
  const e: OfferFieldErrors = {};

  if (!z.uuid().safeParse(v.siteId).success) e.siteId = OFFER_MESSAGES.site;
  if (!v.categoryCode) e.categoryCode = OFFER_MESSAGES.category;

  const title = v.title.trim();
  if (!title) e.title = OFFER_MESSAGES.titleRequired;
  else if (title.length < OFFER_LIMITS.titleMin || title.length > OFFER_LIMITS.titleMax)
    e.title = OFFER_MESSAGES.titleLength;
  if (v.description.trim().length > OFFER_LIMITS.descriptionMax)
    e.description = OFFER_MESSAGES.descriptionLength;

  if (!v.unit) e.unit = OFFER_MESSAGES.unit;

  if (!opts.skipQuantity) {
    if (!v.quantity.trim()) e.quantity = OFFER_MESSAGES.quantityRequired;
    else {
      const q = parseDecimal(v.quantity);
      if (q === null || q <= 0 || q > OFFER_LIMITS.quantityMax) e.quantity = OFFER_MESSAGES.quantityInvalid;
      else if (v.unit && !isContinuous(v.unit) && !Number.isInteger(q))
        e.quantity = OFFER_MESSAGES.quantityInteger(v.unit);
    }
  }

  if (v.unit && v.unit !== "kg") {
    const category = opts.categories?.find((c) => c.code === v.categoryCode);
    const usesDefault =
      v.weightSource === "category_default" && (!category || category.defaultUnit === v.unit);
    if (!usesDefault) {
      if (!v.unitWeightKg.trim()) e.unitWeightKg = OFFER_MESSAGES.weightRequired(v.unit);
      else {
        const w = parseDecimal(v.unitWeightKg);
        if (w === null || w <= 0 || w > OFFER_LIMITS.weightMax) e.unitWeightKg = OFFER_MESSAGES.weightInvalid;
      }
    }
  }

  if (!isDateKey(v.expiryDate)) e.expiryDate = OFFER_MESSAGES.expiryRequired;
  if (v.expiryTime.trim() && !isTime24(v.expiryTime.trim())) e.expiryTime = OFFER_MESSAGES.expiryTime;

  const t = parseOfferTimes(v);
  if (!t.pickupStart) e.pickupStart = OFFER_MESSAGES.pickupStart;
  if (!t.pickupEnd) e.pickupEnd = OFFER_MESSAGES.pickupEnd;
  if (t.pickupStart && t.pickupEnd && t.pickupEnd <= t.pickupStart) e.pickupEnd = OFFER_MESSAGES.pickupOrder;

  if (opts.mode === "publish") {
    if (t.pickupEnd && !e.pickupEnd) {
      if (t.pickupEnd <= opts.now) e.pickupEnd = OFFER_MESSAGES.future;
      else if (t.expiresAt && !e.expiryTime && t.pickupEnd > t.expiresAt)
        e.pickupEnd = OFFER_MESSAGES.pickupAfterExpiry(formatDeadline(t.expiresAt, opts.now));
    }
    if (!opts.attested) e.attested = OFFER_MESSAGES.attest;
  }

  return e;
}

/** Thứ tự trường trong form (tóm tắt lỗi + focus lỗi đầu tiên). */
export const OFFER_FIELD_ORDER: OfferFieldKey[] = [
  "photoPath",
  "siteId",
  "categoryCode",
  "title",
  "description",
  "quantity",
  "unit",
  "unitWeightKg",
  "expiryDate",
  "expiryTime",
  "pickupStart",
  "pickupEnd",
  "attested",
];

// ---------------------------------------------------------------------------
// Payload RPC
// ---------------------------------------------------------------------------

export type OfferPayload = {
  site_id: string;
  category_code: string;
  title: string;
  description: string | null;
  quantity: number;
  unit: UnitCode;
  /** null ⇒ trigger điền khối lượng mặc định của danh mục (`weight_source = category_default`). */
  unit_weight_kg: number | null;
  expiry: { date: string } | { datetime: string };
  pickup_start: string;
  pickup_end: string;
  photo_paths: string[];
  ai_assisted: boolean;
};

/** Giá trị form đã kiểm ⇒ payload `create_offer` (khóa đúng như `private.apply_offer_patch`). */
export function buildOfferPayload(v: OfferFormValues): OfferPayload {
  const unit = v.unit as UnitCode;
  const expiryTime = v.expiryTime.trim();
  return {
    site_id: v.siteId,
    category_code: v.categoryCode,
    title: v.title.trim(),
    description: v.description.trim() || null,
    quantity: parseDecimal(v.quantity) ?? 0,
    unit,
    unit_weight_kg:
      unit === "kg" || v.weightSource === "category_default" ? null : parseDecimal(v.unitWeightKg),
    expiry: expiryTime ? { datetime: vnIso(v.expiryDate, expiryTime) } : { date: v.expiryDate },
    pickup_start: vnIso(v.pickupStartDate, v.pickupStartTime),
    pickup_end: vnIso(v.pickupEndDate, v.pickupEndTime),
    photo_paths: v.photoPath ? [v.photoPath] : [],
    ai_assisted: v.aiAssisted,
  };
}

/** Khóa luôn sửa được khi lô đã đăng (kể cả đã có tổ chức giữ hàng). */
export const ALWAYS_EDITABLE_KEYS = ["title", "description", "photo_paths"] as const;

/**
 * Patch cho `update_offer`:
 * - nháp: toàn bộ payload (RPC cho sửa mọi khóa);
 * - đã đăng: chỉ khóa thay đổi, bỏ `quantity` (dùng `update_offer_quantity`) và `ai_assisted` (chỉ lúc tạo);
 *   đã có phân bổ ⇒ chỉ tên, mô tả, ảnh.
 */
export function buildOfferPatch(
  initial: OfferFormValues,
  next: OfferFormValues,
  opts: { isDraft: boolean; hasAllocations: boolean },
): Partial<OfferPayload> {
  const after = buildOfferPayload(next);
  if (opts.isDraft) return after;
  const before = buildOfferPayload(initial);
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(after) as (keyof OfferPayload)[]) {
    if (key === "quantity" || key === "ai_assisted") continue;
    if (opts.hasAllocations && !(ALWAYS_EDITABLE_KEYS as readonly string[]).includes(key)) continue;
    if (JSON.stringify(after[key]) !== JSON.stringify(before[key])) patch[key] = after[key];
  }
  return patch as Partial<OfferPayload>;
}

// ---------------------------------------------------------------------------
// Lỗi PT422 của RPC ⇒ trường của form
// ---------------------------------------------------------------------------

export type RpcFieldMapping = { errors: OfferFieldErrors; suggestedEnd: string | null };

/**
 * `fieldErrors` của `mapRpcError` (khóa = tên tham số/khóa payload, giá trị = mã máy) ⇒ câu tiếng Việt
 * theo trường form. `suggested_end` (ISO) của `after_close`/`after_expiry` được trả ra để form gợi ý.
 */
export function offerFieldErrorsFromRpc(
  fieldErrors: Record<string, string>,
  ctx: { unit?: UnitCode | ""; now: Date },
): RpcFieldMapping {
  const errors: OfferFieldErrors = {};
  const suggestedIso = fieldErrors.suggested_end ?? null;
  const suggested = suggestedIso && !Number.isNaN(Date.parse(suggestedIso)) ? new Date(suggestedIso) : null;
  const at = suggested ? formatDeadline(suggested, ctx.now) : "";
  const unit = ctx.unit || null;

  for (const [key, code] of Object.entries(fieldErrors)) {
    switch (key) {
      case "site_id":
        errors.siteId = code === "inactive" ? OFFER_MESSAGES.siteInactive : OFFER_MESSAGES.site;
        break;
      case "category_code":
        errors.categoryCode = code === "required" ? OFFER_MESSAGES.category : OFFER_MESSAGES.categoryInactive;
        break;
      case "title":
        errors.title = code === "required" ? OFFER_MESSAGES.titleRequired : OFFER_MESSAGES.titleLength;
        break;
      case "description":
        errors.description = OFFER_MESSAGES.descriptionLength;
        break;
      case "quantity":
      case "new_quantity":
        errors.quantity =
          code === "required"
            ? OFFER_MESSAGES.quantityRequired
            : code === "integer_required" && unit
              ? OFFER_MESSAGES.quantityInteger(unit)
              : OFFER_MESSAGES.quantityInvalid;
        break;
      case "unit":
        errors.unit = OFFER_MESSAGES.unit;
        break;
      case "unit_weight_kg":
        errors.unitWeightKg =
          code === "required_for_unit" && unit
            ? OFFER_MESSAGES.weightRequired(unit)
            : OFFER_MESSAGES.weightInvalid;
        break;
      case "expiry":
        errors.expiryDate = OFFER_MESSAGES.expiryRequired;
        break;
      case "pickup_start":
        errors.pickupStart = OFFER_MESSAGES.pickupStart;
        break;
      case "pickup_end":
        errors.pickupEnd = OFFER_MESSAGES.pickupEnd;
        break;
      case "pickup_window":
        switch (code) {
          case "end_before_start":
            errors.pickupEnd = OFFER_MESSAGES.pickupOrder;
            break;
          case "ended":
            errors.pickupEnd = OFFER_MESSAGES.future;
            break;
          case "after_expiry":
            errors.pickupEnd = OFFER_MESSAGES.pickupAfterExpiry(at || "hạn sử dụng");
            break;
          case "after_close":
            errors.pickupEnd = at
              ? OFFER_MESSAGES.pickupAfterClose(at)
              : "Khung giờ lấy phải kết thúc trước giờ đóng cửa của điểm.";
            break;
          case "outside_hours":
            errors.pickupStart = OFFER_MESSAGES.outsideHours;
            break;
          case "too_short":
            errors.pickupEnd = OFFER_MESSAGES.tooShort(OFFER_LIMITS.minLeadMinutes);
            break;
          default:
            errors.pickupEnd = OFFER_MESSAGES.pickupEnd;
        }
        break;
      case "photo_paths":
        errors.photoPath = OFFER_MESSAGES.photo;
        break;
      case "safety_attested":
        errors.attested = OFFER_MESSAGES.attest;
        break;
    }
  }
  return { errors, suggestedEnd: suggested ? suggestedIso : null };
}

// ---------------------------------------------------------------------------
// Thao tác nhanh: số lượng, hủy lô
// ---------------------------------------------------------------------------

export const REASON_MESSAGES = {
  required: "Vui lòng chọn hoặc nhập lý do.",
  tooLong: "Lý do tối đa 500 ký tự.",
} as const;

export const reasonSchema = z
  .string()
  .trim()
  .min(1, REASON_MESSAGES.required)
  .max(OFFER_LIMITS.reasonMax, REASON_MESSAGES.tooLong);

export const updateQuantityInput = z.object({
  offerId: z.uuid(),
  quantity: z.string().max(32),
  reason: reasonSchema,
  clientOpId: z.uuid(),
});

export const cancelOfferInput = z.object({
  offerId: z.uuid(),
  reason: reasonSchema,
  clientOpId: z.uuid(),
});

export const publishDraftInput = z.object({
  offerId: z.uuid(),
  attested: z.literal(true, { error: OFFER_MESSAGES.attest }),
  clientOpId: z.uuid(),
});

/** Số lượng mới cho "Cập nhật số lượng": > 0, nguyên nếu không phải kg/lít, ≥ số đã được giữ. */
export function validateNewQuantity(
  raw: string,
  ctx: { unit: UnitCode; committed: number },
): { ok: true; value: number } | { ok: false; message: string } {
  if (!raw.trim()) return { ok: false, message: OFFER_MESSAGES.quantityRequired };
  const q = parseDecimal(raw);
  if (q === null || q <= 0 || q > OFFER_LIMITS.quantityMax)
    return { ok: false, message: OFFER_MESSAGES.quantityInvalid };
  if (!isContinuous(ctx.unit) && !Number.isInteger(q))
    return { ok: false, message: OFFER_MESSAGES.quantityInteger(ctx.unit) };
  if (q < ctx.committed)
    return {
      ok: false,
      message: `Không thể thấp hơn số đã được giữ (${formatDecimalInput(ctx.committed)} ${UNIT_LABEL[ctx.unit]}).`,
    };
  return { ok: true, value: q };
}

export const CANCEL_REASONS = [
  "Hàng đã hết hoặc đã dùng vào việc khác",
  "Hàng không còn đảm bảo chất lượng",
  "Thông tin lô bị sai, cửa hàng sẽ đăng lại",
] as const;

export const QUANTITY_REASONS = [
  "Còn dư thêm hàng",
  "Đếm lại số lượng",
  "Một phần đã dùng vào việc khác",
] as const;
