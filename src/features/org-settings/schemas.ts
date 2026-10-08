import { z } from "zod";

import { legalFields, MESSAGES } from "@/features/onboarding/schemas";
import type { OrgKind } from "@/features/onboarding/options";

import { isIsoDate } from "./calendar";

/**
 * Schema dùng chung client/server cho trang Cài đặt cửa hàng/tổ chức (F-08, F-10, F-11, US-STO-05,
 * US-STO-27, US-CHA-34, US-CHA-37). Hồ sơ không pháp lý dùng lại `basicsFields(kind)` của onboarding.
 */

// ---------------------------------------------------------------------------
// Các tab (đồng bộ với URL `?tab=` — DESIGN-SYSTEM §12.3)
// ---------------------------------------------------------------------------

export const SETTINGS_TABS = ["profile", "sites", "members", "pause"] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

export function parseSettingsTab(value: unknown): SettingsTab {
  return typeof value === "string" && (SETTINGS_TABS as readonly string[]).includes(value)
    ? (value as SettingsTab)
    : "profile";
}

export const TAB_LABEL: Record<OrgKind, Record<SettingsTab, string>> = {
  store: { profile: "Hồ sơ", sites: "Chi nhánh & giờ", members: "Nhân viên", pause: "Tạm ngưng" },
  charity: { profile: "Hồ sơ", sites: "Điểm nhận & giờ", members: "Thành viên", pause: "Tạm ngưng" },
};

export function settingsHref(kind: OrgKind, tab: SettingsTab): string {
  return tab === "profile" ? `/${kind}/settings` : `/${kind}/settings?tab=${tab}`;
}

// ---------------------------------------------------------------------------
// Thông tin pháp lý: đề nghị sửa qua `submit_org_change_request` (DATA-MODEL §6.8)
// ---------------------------------------------------------------------------

/** Trường form → cột `org_sensitive`. Không có CCCD: FoodSave không thu số CCCD từ người dùng. */
export const LEGAL_FORM_TO_DB = {
  legalName: "legal_name",
  taxCode: "tax_code",
  registrationNo: "registration_no",
  representativeName: "representative_name",
  representativeTitle: "representative_title",
} as const;

export type LegalFormKey = keyof typeof LEGAL_FORM_TO_DB;

/** Trường pháp lý theo loại tổ chức, đúng thứ tự hiển thị (khớp bước Pháp lý của wizard). */
export function legalFormKeys(kind: OrgKind): LegalFormKey[] {
  return kind === "store"
    ? ["legalName", "taxCode", "representativeName", "representativeTitle"]
    : ["legalName", "registrationNo", "representativeName", "representativeTitle"];
}

export const LEGAL_REASON_MAX = 1000;

/**
 * Kiểm các giá trị muốn đổi (chỉ trường khác giá trị hiện tại). Giá trị mới phải khác rỗng — DB
 * (`private.normalize_legal_changes`) không cho xóa trắng trường pháp lý.
 * Trả `changes` theo tên cột DB, hoặc lỗi theo tên trường form.
 */
export function validateLegalChanges(
  kind: OrgKind,
  next: Partial<Record<LegalFormKey, string>>,
  current: Partial<Record<LegalFormKey, string | null>>,
):
  | { ok: true; changes: Partial<Record<(typeof LEGAL_FORM_TO_DB)[LegalFormKey], string>> }
  | { ok: false; errors: Partial<Record<LegalFormKey | "form", string>> } {
  const fields = legalFields(kind) as Record<string, z.ZodType>;
  const changes: Partial<Record<(typeof LEGAL_FORM_TO_DB)[LegalFormKey], string>> = {};
  const errors: Partial<Record<LegalFormKey | "form", string>> = {};
  for (const key of legalFormKeys(kind)) {
    const raw = next[key];
    if (raw === undefined) continue;
    const trimmed = raw.trim();
    if (trimmed === (current[key] ?? "").trim()) continue;
    if (trimmed === "") {
      errors[key] = "Không để trống thông tin pháp lý. Nếu cần xóa, hãy liên hệ FoodSave.";
      continue;
    }
    const res = fields[key]!.safeParse(trimmed);
    if (!res.success) errors[key] = res.error.issues[0]?.message ?? MESSAGES.required("thông tin");
    else changes[LEGAL_FORM_TO_DB[key]] = String(res.data);
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  if (Object.keys(changes).length === 0) return { ok: false, errors: { form: "Bạn chưa thay đổi mục nào." } };
  return { ok: true, changes };
}

export const legalChangeInput = z.object({
  orgId: z.uuid(),
  clientOpId: z.uuid(),
  values: z.record(z.string(), z.string().max(300)),
  reason: z
    .string()
    .trim()
    .max(LEGAL_REASON_MAX, { error: `Lý do tối đa ${LEGAL_REASON_MAX} ký tự.` })
    .transform((v) => (v === "" ? null : v)),
});

// ---------------------------------------------------------------------------
// Ngày nghỉ (`site_closures`, ghi trực tiếp theo RLS)
// ---------------------------------------------------------------------------

export const CLOSURE_REASON_MAX = 200;

export const closureInput = z.object({
  siteId: z.uuid(),
  date: z.string().refine(isIsoDate, { error: "Ngày không hợp lệ." }),
  reason: z
    .string()
    .trim()
    .max(CLOSURE_REASON_MAX, { error: `Ghi chú tối đa ${CLOSURE_REASON_MAX} ký tự.` })
    .transform((v) => (v === "" ? null : v)),
});

export const removeClosureInput = z.object({
  siteId: z.uuid(),
  date: z.string().refine(isIsoDate, { error: "Ngày không hợp lệ." }),
});

// ---------------------------------------------------------------------------
// Tạm ngưng (`set_org_paused`)
// ---------------------------------------------------------------------------

export const PAUSE_REASON_MAX = 500;

export const pauseInput = z.object({
  orgId: z.uuid(),
  paused: z.boolean(),
  reason: z
    .string()
    .trim()
    .max(PAUSE_REASON_MAX, { error: `Lý do tối đa ${PAUSE_REASON_MAX} ký tự.` })
    .transform((v) => (v === "" ? null : v)),
});
