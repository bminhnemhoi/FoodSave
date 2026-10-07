import { z } from "zod";

import { locationValueSchema } from "@/features/locations/schemas";

import { FOOD_CATEGORY_CODES, SUBTYPES, type OrgKind } from "./options";

/**
 * Schema zod dùng chung client/server cho wizard onboarding (P1-02…P1-07).
 *
 * Mỗi bước là một bộ "trường" (field schema riêng lẻ, nhận giá trị thô của form và trả giá trị đã
 * chuẩn hóa). Nhờ vậy:
 * - client tự lưu nháp **chỉ các trường hợp lệ** (US-STO-01 AC1) bằng `pickValid`;
 * - server kiểm lại đúng các schema đó bằng `parseFields` (không tin client);
 * - nút "Tiếp tục" dùng `z.object(fields)` để bắt buộc đủ trường (AC3).
 */

export const MESSAGES = {
  required: (label: string) => `Vui lòng nhập ${label}.`,
  choose: (label: string) => `Vui lòng chọn ${label}.`,
  length: (label: string, min: number, max: number) => `${label} cần từ ${min} đến ${max} ký tự.`,
  max: (label: string, max: number) => `${label} tối đa ${max} ký tự.`,
  phone: "Số điện thoại cần 10 chữ số, bắt đầu bằng 0.",
  email: "Email chưa đúng định dạng, ví dụ: ten@tochuc.vn.",
  taxCode: "Mã số thuế gồm 10 chữ số, hoặc 13 ký tự dạng 0123456789-001.",
  beneficiaries: "Vui lòng nhập số nguyên dương, ví dụ 45.",
  beneficiariesMax: "Số người tối đa 100.000.",
  foundedOn: "Ngày thành lập không hợp lệ hoặc ở tương lai.",
  location: "Vui lòng chọn vị trí trên bản đồ.",
  radius: "Bán kính phục vụ từ 0,5 đến 30 km.",
  categories: "Vui lòng chọn ít nhất một loại thực phẩm.",
  capacity: "Sức nhận phải là số lớn hơn 0, tối đa 100.000 kg.",
} as const;

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Chuỗi bắt buộc, cắt khoảng trắng, độ dài [min, max]. */
export function requiredText(label: string, min: number, max: number) {
  return z
    .string({ error: MESSAGES.required(label) })
    .trim()
    .min(1, { error: MESSAGES.required(label) })
    .min(min, { error: MESSAGES.length(cap(label), min, max) })
    .max(max, { error: MESSAGES.length(cap(label), min, max) });
}

/** Chuỗi không bắt buộc: rỗng ⇒ null. */
export function optionalText(label: string, max: number) {
  return z
    .string()
    .trim()
    .max(max, { error: MESSAGES.max(cap(label), max) })
    .transform((v) => (v === "" ? null : v));
}

/** Chuẩn hóa SĐT Việt Nam: bỏ khoảng trắng/dấu chấm/gạch, +84 ⇒ 0. */
export function normalizePhone(raw: string): string {
  let s = raw.replace(/[\s.\-()]/g, "");
  if (s.startsWith("+84")) s = `0${s.slice(3)}`;
  else if (s.startsWith("84") && s.length === 11) s = `0${s.slice(2)}`;
  return s;
}

export const phoneSchema = z
  .string({ error: MESSAGES.required("số điện thoại") })
  .transform(normalizePhone)
  .pipe(
    z
      .string()
      .min(1, { error: MESSAGES.required("số điện thoại") })
      .regex(/^0\d{9}$/, { error: MESSAGES.phone }),
  );

export const emailSchema = z
  .string({ error: MESSAGES.required("email") })
  .trim()
  .toLowerCase()
  .min(1, { error: MESSAGES.required("email") })
  .max(254, { error: MESSAGES.email })
  .pipe(z.email({ error: MESSAGES.email }));

/** Ngày hôm nay theo giờ Việt Nam, dạng YYYY-MM-DD. */
export function todayInVietnam(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(now);
}

function isValidPastDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return false;
  return v >= "1900-01-01" && v <= todayInVietnam();
}

const foundedOnSchema = z
  .string()
  .trim()
  .refine((v) => v === "" || isValidPastDate(v), { error: MESSAGES.foundedOn })
  .transform((v) => (v === "" ? null : v));

const beneficiariesSchema = z
  .string({ error: MESSAGES.required("số người được hỗ trợ mỗi ngày") })
  .trim()
  .min(1, { error: MESSAGES.required("số người được hỗ trợ mỗi ngày") })
  .regex(/^\d{1,7}$/, { error: MESSAGES.beneficiaries })
  .transform(Number)
  .pipe(
    z
      .number()
      .int()
      .min(1, { error: MESSAGES.beneficiaries })
      .max(100_000, { error: MESSAGES.beneficiariesMax }),
  );

function subtypeSchema(kind: OrgKind) {
  const values = SUBTYPES[kind].map((s) => s.value) as [string, ...string[]];
  return z.enum(values, { error: MESSAGES.choose("loại hình") });
}

// ---------------------------------------------------------------------------
// Bước 1 — Thông tin cơ bản
// ---------------------------------------------------------------------------

function makeBasicsFields(kind: OrgKind) {
  return {
    name: requiredText(kind === "store" ? "tên cửa hàng" : "tên tổ chức", 2, 160),
    subtype: subtypeSchema(kind),
    description: optionalText("mô tả", 2000),
    contactPhone: phoneSchema,
    contactEmail: emailSchema,
  };
}

const STORE_BASICS = makeBasicsFields("store");
const CHARITY_BASICS = {
  ...makeBasicsFields("charity"),
  beneficiaries: beneficiariesSchema,
  foundedOn: foundedOnSchema,
};

export function basicsFields(kind: "store"): typeof STORE_BASICS;
export function basicsFields(kind: "charity"): typeof CHARITY_BASICS;
export function basicsFields(kind: OrgKind): typeof STORE_BASICS | typeof CHARITY_BASICS;
export function basicsFields(kind: OrgKind) {
  return kind === "store" ? STORE_BASICS : CHARITY_BASICS;
}

export type BasicsForm = {
  name: string;
  subtype: string;
  description: string;
  contactPhone: string;
  contactEmail: string;
  beneficiaries: string;
  foundedOn: string;
};

export const EMPTY_BASICS: BasicsForm = {
  name: "",
  subtype: "",
  description: "",
  contactPhone: "",
  contactEmail: "",
  beneficiaries: "",
  foundedOn: "",
};

/** Trường lưu ở `organizations` (phần còn lại ở `org_sensitive`). */
export const BASICS_ORG_KEYS = ["name", "subtype", "description", "beneficiaries", "foundedOn"] as const;

// ---------------------------------------------------------------------------
// Bước 3 — Pháp lý & người đại diện (org_sensitive, cột theo grant §9.4)
// ---------------------------------------------------------------------------

const LEGAL_COMMON = {
  legalName: requiredText("tên pháp lý", 2, 200),
  representativeName: requiredText("họ tên người đại diện", 2, 120),
  representativeTitle: requiredText("chức danh người đại diện", 2, 80),
};
const STORE_LEGAL = {
  ...LEGAL_COMMON,
  taxCode: z
    .string({ error: MESSAGES.required("mã số thuế") })
    .trim()
    .min(1, { error: MESSAGES.required("mã số thuế") })
    .regex(/^\d{10}(-\d{3})?$/, { error: MESSAGES.taxCode }),
};
const CHARITY_LEGAL = { ...LEGAL_COMMON, registrationNo: optionalText("số quyết định hoặc giấy phép", 60) };

export function legalFields(kind: "store"): typeof STORE_LEGAL;
export function legalFields(kind: "charity"): typeof CHARITY_LEGAL;
export function legalFields(kind: OrgKind): typeof STORE_LEGAL | typeof CHARITY_LEGAL;
export function legalFields(kind: OrgKind) {
  return kind === "store" ? STORE_LEGAL : CHARITY_LEGAL;
}

export type LegalForm = {
  legalName: string;
  taxCode: string;
  registrationNo: string;
  representativeName: string;
  representativeTitle: string;
};

export const EMPTY_LEGAL: LegalForm = {
  legalName: "",
  taxCode: "",
  registrationNo: "",
  representativeName: "",
  representativeTitle: "",
};

// ---------------------------------------------------------------------------
// Bước 2 — Địa điểm (upsert_site)
// ---------------------------------------------------------------------------

export const RADIUS_MIN_KM = 0.5;
export const RADIUS_MAX_KM = 30;

export const radiusSchema = z
  .number({ error: MESSAGES.radius })
  .min(RADIUS_MIN_KM, { error: MESSAGES.radius })
  .max(RADIUS_MAX_KM, { error: MESSAGES.radius })
  .transform((v) => Math.round(v * 10) / 10);

const capacitySchema = z
  .string()
  .trim()
  .refine(
    (v) => {
      if (v === "") return true;
      const n = Number(v.replace(",", "."));
      return Number.isFinite(n) && n > 0 && n <= 100_000;
    },
    { error: MESSAGES.capacity },
  )
  .transform((v) => (v === "" ? null : Math.round(Number(v.replace(",", ".")) * 10) / 10));

const STORE_SITE = {
  name: requiredText("tên điểm cửa hàng", 1, 120),
  location: locationValueSchema,
};
const CHARITY_SITE = {
  name: requiredText("tên điểm nhận", 1, 120),
  location: locationValueSchema,
  visibility: z.enum(["public", "approximate", "hidden"], { error: MESSAGES.choose("chế độ hiển thị") }),
  radiusKm: radiusSchema,
  acceptedCategories: z
    .array(z.enum(FOOD_CATEGORY_CODES as [string, ...string[]]), { error: MESSAGES.categories })
    .min(1, { error: MESSAGES.categories }),
  capacityKg: capacitySchema,
};

export function siteFields(kind: "store"): typeof STORE_SITE;
export function siteFields(kind: "charity"): typeof CHARITY_SITE;
export function siteFields(kind: OrgKind): typeof STORE_SITE | typeof CHARITY_SITE;
export function siteFields(kind: OrgKind) {
  return kind === "store" ? STORE_SITE : CHARITY_SITE;
}

// ---------------------------------------------------------------------------
// Giờ mở cửa / giờ nhận (set_site_hours)
// ---------------------------------------------------------------------------

export const hoursRowsSchema = z
  .array(
    z.object({
      dow: z.number().int().min(0).max(6),
      opens: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      closes: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      closes_next_day: z.boolean(),
    }),
  )
  .max(7)
  .refine((rows) => new Set(rows.map((r) => r.dow)).size === rows.length, {
    error: "Mỗi ngày một khung giờ.",
  });

// ---------------------------------------------------------------------------
// Bước 5 — Cam kết
// ---------------------------------------------------------------------------

export const consentSchema = z.object({
  terms: z.literal(true, { error: "Vui lòng đồng ý Điều khoản sử dụng và Chính sách bảo mật." }),
  truthful: z.literal(true, { error: "Vui lòng xác nhận thông tin trong hồ sơ là đúng sự thật." }),
  commitment: z.literal(true, { error: "Vui lòng xác nhận cam kết trước khi gửi duyệt." }),
});

export type ConsentForm = { terms: boolean; truthful: boolean; commitment: boolean };

// ---------------------------------------------------------------------------
// Helpers: lấy trường hợp lệ / kiểm chặt phía server
// ---------------------------------------------------------------------------

export type FieldSchemas = Record<string, z.ZodType>;
export type FieldOutput<F extends FieldSchemas> = { [K in keyof F]?: z.output<F[K]> };
export type FieldErrors = Record<string, string>;

/**
 * Chỉ giữ các trường hợp lệ (để tự lưu nháp); trường lỗi trả về `errors` và không được lưu,
 * DB giữ giá trị cũ. Khóa không thuộc bộ trường bị bỏ qua.
 */
export function pickValid<F extends FieldSchemas>(
  fields: F,
  values: Partial<Record<string, unknown>>,
): { data: FieldOutput<F>; errors: FieldErrors } {
  const data: Record<string, unknown> = {};
  const errors: FieldErrors = {};
  for (const key of Object.keys(fields)) {
    if (!(key in values)) continue;
    const res = fields[key]!.safeParse(values[key]);
    if (res.success) data[key] = res.data;
    else errors[key] = res.error.issues[0]?.message ?? "Giá trị chưa hợp lệ.";
  }
  return { data: data as FieldOutput<F>, errors };
}

/** Kiểm chặt phía server: khóa lạ hoặc giá trị sai ⇒ lỗi theo trường. */
export function parseFields<F extends FieldSchemas>(
  fields: F,
  values: unknown,
): { ok: true; data: FieldOutput<F> } | { ok: false; errors: FieldErrors } {
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    return { ok: false, errors: { form: "Dữ liệu gửi lên không hợp lệ." } };
  }
  const record = values as Record<string, unknown>;
  const unknownKeys = Object.keys(record).filter((k) => !(k in fields));
  const { data, errors } = pickValid(fields, record);
  for (const k of unknownKeys) errors[k] = "Trường không được phép.";
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, data };
}

/** Đủ mọi trường bắt buộc của bước (dùng cho tiến độ và kiểm tra trước khi gửi duyệt). */
export function isComplete(fields: FieldSchemas, values: Record<string, unknown>): boolean {
  return z.object(fields).safeParse(values).success;
}
