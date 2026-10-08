import { z } from "zod";

import { CONTINUOUS_UNITS, UNIT_LABEL, type UnitCode } from "@/features/catalog/labels";
import {
  addDays,
  formatDeadline,
  isDateKey,
  isTime24,
  parseVnDateTime,
  roundUpToStep,
  vnDateKey,
  vnIso,
  vnTime,
} from "@/features/offers/datetime";
import { parseDecimal, reasonSchema, UNIT_CODES } from "@/features/offers/schemas";

/**
 * Form "Đăng nhu cầu" (P3-05, US-CHA-09) — quy tắc dùng chung client/server, khớp RPC `publish_need`
 * (DATA-MODEL §8.4 "Ghi chú triển khai P3"). RPC là nơi quyết định cuối cùng; lỗi PT422 của RPC quay lại
 * đúng trường bằng `needFieldErrorsFromRpc`. Ngày "YYYY-MM-DD" + giờ "HH:mm" luôn là giờ Việt Nam.
 */

export { UNIT_CODES };

export const NEED_LIMITS = {
  categoriesMax: 3,
  quantityMax: 999_999,
  peopleMax: 100_000,
  noteMax: 500,
  reasonMax: 500,
  /** `needed_by > now + 1 giờ` (RPC). */
  minLeadMs: 60 * 60 * 1000,
  /** `needed_by ≤ now + 7 ngày` (PRD US-CHA-09 AC3). */
  maxLeadMs: 7 * 24 * 60 * 60 * 1000,
} as const;

export type NeedFormValues = {
  siteId: string;
  /** 1–3 danh mục thay thế được cho nhau, giữ thứ tự chọn. */
  categoryCodes: string[];
  quantity: string;
  unit: UnitCode | "";
  neededByDate: string;
  neededByTime: string;
  peopleToServe: string;
  note: string;
};

export type NeedFieldKey =
  "siteId" | "categoryCodes" | "quantity" | "unit" | "neededBy" | "peopleToServe" | "note";

export type NeedFieldErrors = Partial<Record<NeedFieldKey, string>>;

/** Thứ tự trường (tóm tắt lỗi + focus lỗi đầu tiên). */
export const NEED_FIELD_ORDER: NeedFieldKey[] = [
  "siteId",
  "categoryCodes",
  "quantity",
  "unit",
  "neededBy",
  "peopleToServe",
  "note",
];

export const NEED_MESSAGES = {
  site: "Vui lòng chọn điểm nhận.",
  siteInactive: "Điểm nhận này đang tạm ngưng. Hãy chọn điểm nhận khác.",
  categoriesRequired: "Vui lòng chọn ít nhất một danh mục.",
  categoriesMax: "Chọn tối đa 3 danh mục thay thế được cho nhau.",
  categoriesUnknown: "Có danh mục không còn dùng được. Vui lòng chọn lại.",
  categoriesNotAccepted:
    "Điểm nhận này không nhận một số danh mục đã chọn. Hãy bỏ chọn chúng hoặc đổi điểm nhận.",
  quantityRequired: "Vui lòng nhập số lượng.",
  quantityInvalid: "Số lượng phải lớn hơn 0.",
  quantityMax: "Số lượng tối đa 999.999.",
  quantityInteger: (unit: UnitCode) => `Số lượng phải là số nguyên với đơn vị ${UNIT_LABEL[unit]}.`,
  unit: "Vui lòng chọn đơn vị.",
  neededByRequired: "Vui lòng nhập ngày và giờ cần nhận.",
  neededByTime: "Giờ chưa đúng định dạng 24 giờ, ví dụ 15:00.",
  neededByMin: "Cần trước phải sau thời điểm hiện tại ít nhất 1 giờ để cửa hàng và người lấy kịp chuẩn bị.",
  neededByMax: "Chỉ đăng nhu cầu cho 7 ngày tới. Vui lòng chọn thời điểm sớm hơn.",
  people: "Số người được hỗ trợ là số nguyên từ 1 đến 100.000.",
  note: "Ghi chú tối đa 500 ký tự.",
} as const;

/** "50", "12,5" ⇒ số; số người phải là số nguyên. */
function parseInteger(raw: string): number | null {
  const s = raw.trim().replace(/[.\s]/g, "");
  if (!/^\d{1,9}$/.test(s)) return null;
  return Number(s);
}

export function isContinuousUnit(unit: UnitCode): boolean {
  return CONTINUOUS_UNITS.has(unit);
}

/** Mặc định "cần trước": 4 giờ nữa, làm tròn lên mốc 15 phút (giờ VN). */
export function defaultNeededBy(now: Date): { date: string; time: string } {
  const at = roundUpToStep(new Date(now.getTime() + 4 * 60 * 60 * 1000), 15);
  return { date: vnDateKey(at), time: vnTime(at) };
}

/** Giới hạn ô ngày: hôm nay … hôm nay + 7 (giờ VN). */
export function neededByDateBounds(now: Date): { min: string; max: string } {
  const today = vnDateKey(now);
  return { min: today, max: addDays(today, 7) };
}

export function parseNeededBy(v: Pick<NeedFormValues, "neededByDate" | "neededByTime">): Date | null {
  return parseVnDateTime(v.neededByDate, v.neededByTime.trim());
}

export type ValidateNeedOptions = {
  now: Date;
  /** `accepted_categories` của điểm nhận đã chọn (`null` = nhận mọi danh mục). */
  acceptedCategories?: readonly string[] | null;
};

export function validateNeedForm(v: NeedFormValues, opts: ValidateNeedOptions): NeedFieldErrors {
  const e: NeedFieldErrors = {};

  if (!z.uuid().safeParse(v.siteId).success) e.siteId = NEED_MESSAGES.site;

  const codes = [...new Set(v.categoryCodes)];
  if (codes.length === 0) e.categoryCodes = NEED_MESSAGES.categoriesRequired;
  else if (codes.length > NEED_LIMITS.categoriesMax) e.categoryCodes = NEED_MESSAGES.categoriesMax;
  else if (opts.acceptedCategories && codes.some((c) => !opts.acceptedCategories!.includes(c)))
    e.categoryCodes = NEED_MESSAGES.categoriesNotAccepted;

  if (!v.unit) e.unit = NEED_MESSAGES.unit;
  if (!v.quantity.trim()) e.quantity = NEED_MESSAGES.quantityRequired;
  else {
    const q = parseDecimal(v.quantity);
    if (q === null || q <= 0) e.quantity = NEED_MESSAGES.quantityInvalid;
    else if (q > NEED_LIMITS.quantityMax) e.quantity = NEED_MESSAGES.quantityMax;
    else if (v.unit && !isContinuousUnit(v.unit) && !Number.isInteger(q))
      e.quantity = NEED_MESSAGES.quantityInteger(v.unit);
  }

  if (!isDateKey(v.neededByDate)) e.neededBy = NEED_MESSAGES.neededByRequired;
  else if (!isTime24(v.neededByTime.trim())) e.neededBy = NEED_MESSAGES.neededByTime;
  else {
    const at = parseNeededBy(v)!;
    const lead = at.getTime() - opts.now.getTime();
    if (lead <= NEED_LIMITS.minLeadMs) e.neededBy = NEED_MESSAGES.neededByMin;
    else if (lead > NEED_LIMITS.maxLeadMs) e.neededBy = NEED_MESSAGES.neededByMax;
  }

  if (v.peopleToServe.trim()) {
    const p = parseInteger(v.peopleToServe);
    if (p === null || p < 1 || p > NEED_LIMITS.peopleMax) e.peopleToServe = NEED_MESSAGES.people;
  }
  if (v.note.trim().length > NEED_LIMITS.noteMax) e.note = NEED_MESSAGES.note;

  return e;
}

/** Envelope form (server action kiểm hình dạng trước khi chạy quy tắc nghiệp vụ). */
const shortText = (max: number) => z.string().max(max);
export const needFormValuesSchema = z.object({
  siteId: shortText(64),
  categoryCodes: z.array(shortText(40)).max(10),
  quantity: shortText(32),
  unit: z.enum([...UNIT_CODES, ""]),
  neededByDate: shortText(10),
  neededByTime: shortText(5),
  peopleToServe: shortText(16),
  note: shortText(2000),
}) satisfies z.ZodType<NeedFormValues>;

export const publishNeedInput = z.object({ values: needFormValuesSchema, clientOpId: z.uuid() });
export const cancelNeedInput = z.object({ needId: z.uuid(), reason: reasonSchema, clientOpId: z.uuid() });
/** `planKey` = chữ ký các dòng của phương án người dùng đã thấy (`planKey()` trong `present.ts`). */
export const choosePlanInput = z.object({
  needId: z.uuid(),
  planKey: z.string().min(1).max(4000),
  clientOpId: z.uuid(),
});
export const findPlansInput = z.object({ needId: z.uuid() });

export type PublishNeedArgs = {
  p_site_id: string;
  p_category_codes: string[];
  p_unit: UnitCode;
  p_quantity: number;
  p_needed_by: string;
  p_people_to_serve: number | null;
  p_note: string | null;
};

/** Giá trị form đã kiểm ⇒ tham số `publish_need` (giờ VN gửi dạng ISO `+07:00`). */
export function buildPublishNeedArgs(v: NeedFormValues): PublishNeedArgs {
  const people = v.peopleToServe.trim() ? parseInteger(v.peopleToServe) : null;
  return {
    p_site_id: v.siteId,
    p_category_codes: [...new Set(v.categoryCodes)],
    p_unit: v.unit as UnitCode,
    p_quantity: parseDecimal(v.quantity) ?? 0,
    p_needed_by: vnIso(v.neededByDate, v.neededByTime.trim()),
    p_people_to_serve: people,
    p_note: v.note.trim() || null,
  };
}

/**
 * `fieldErrors` của `mapRpcError` cho `publish_need` (khóa đã bỏ tiền tố `p_`, giá trị là mã máy) ⇒ câu
 * tiếng Việt theo trường form. Mã lạ ⇒ thông điệp chung của trường đó.
 */
export function needFieldErrorsFromRpc(
  fieldErrors: Record<string, string>,
  ctx: { unit?: UnitCode | "" } = {},
): NeedFieldErrors {
  const errors: NeedFieldErrors = {};
  for (const [key, code] of Object.entries(fieldErrors)) {
    switch (key) {
      case "site_id":
        errors.siteId = code === "inactive" ? NEED_MESSAGES.siteInactive : NEED_MESSAGES.site;
        break;
      case "category_codes":
        errors.categoryCodes =
          code === "not_accepted_by_site"
            ? NEED_MESSAGES.categoriesNotAccepted
            : code === "unknown_or_inactive"
              ? NEED_MESSAGES.categoriesUnknown
              : NEED_MESSAGES.categoriesMax;
        break;
      case "unit":
        errors.unit = NEED_MESSAGES.unit;
        break;
      case "quantity":
        errors.quantity =
          code === "integer_required" && ctx.unit
            ? NEED_MESSAGES.quantityInteger(ctx.unit)
            : NEED_MESSAGES.quantityInvalid;
        break;
      case "needed_by":
        errors.neededBy =
          code === "min_1_hour"
            ? NEED_MESSAGES.neededByMin
            : code === "max_7_days"
              ? NEED_MESSAGES.neededByMax
              : NEED_MESSAGES.neededByRequired;
        break;
      case "people_to_serve":
        errors.peopleToServe = NEED_MESSAGES.people;
        break;
      case "note":
        errors.note = NEED_MESSAGES.note;
        break;
    }
  }
  return errors;
}

/** "15:00 thứ Bảy, 15/11" cho gợi ý dưới ô ngày giờ. */
export function describeNeededBy(v: NeedFormValues, now: Date): string | null {
  const at = parseNeededBy(v);
  return at ? formatDeadline(at, now) : null;
}

export const CANCEL_NEED_REASONS = [
  "Đã nhận đủ từ nguồn khác",
  "Kế hoạch phát suất ăn thay đổi",
  "Đăng nhầm số lượng hoặc thời gian",
] as const;
