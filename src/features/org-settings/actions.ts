"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isOrgLogoPath } from "@/features/onboarding/documents";
import { hoursFromRows, validateHours } from "@/features/onboarding/hours";
import { replaceOrgLogo } from "@/features/onboarding/logo";
import type { OrgKind } from "@/features/onboarding/options";
import {
  basicsFields,
  hoursRowsSchema,
  isComplete,
  parseFields,
  siteFields,
  todayInVietnam,
} from "@/features/onboarding/schemas";
import { buildSitePayload, type ParsedSite } from "@/features/onboarding/site-payload";
import { getUser } from "@/server/auth/session";
import { createClient } from "@/server/db/supabase";
import type { Database } from "@/types/database.types";

import { isClosureDateAllowed } from "./calendar";
import { mapSettingsError, SETTINGS_MESSAGES, type ActionError, type ActionResult } from "./errors";
import {
  closureInput,
  LEGAL_FORM_TO_DB,
  legalChangeInput,
  pauseInput,
  removeClosureInput,
  validateLegalChanges,
  type LegalFormKey,
} from "./schemas";

/**
 * Server Action trang Cài đặt cửa hàng/tổ chức đã duyệt (P1-06, F-08, F-10, F-11, US-STO-05, US-STO-27,
 * US-CHA-34, US-CHA-37). Mỗi action: zod (schema dùng chung) → client Supabase của NGƯỜI DÙNG
 * (RLS + grant cột, RPC security definer) → lỗi tiếng Việt → revalidate trang.
 * Ở đây chỉ kiểm thêm "tổ chức đã duyệt" để tách khỏi wizard; quyền thật nằm ở DB.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Saved = { savedAt: string };
type OrgUpdate = Database["public"]["Tables"]["organizations"]["Update"];
type SensitiveUpdate = Database["public"]["Tables"]["org_sensitive"]["Update"];

const uuid = z.uuid();

function fail(
  code: string,
  message: string,
  extra: Partial<ActionError> = {},
): { ok: false; error: ActionError } {
  return { ok: false, error: { code, message, ...extra } };
}

function dbFail(
  e: { code?: string; message?: string; details?: string | null; hint?: string | null },
  op: string,
) {
  const mapped = mapSettingsError(e);
  if (mapped.code === "server_error")
    console.error("[org-settings] db error", { op, code: e.code, message: e.message });
  return { ok: false as const, error: mapped };
}

const invalid = (fieldErrors?: Record<string, string>) =>
  fail("validation_failed", SETTINGS_MESSAGES.invalid, fieldErrors ? { fieldErrors } : {});

function saved(): Saved {
  return { savedAt: new Date().toISOString() };
}

/** Cả cổng (tên tổ chức hiện ở app shell) và trang Cài đặt. */
function revalidatePortal(kind: OrgKind) {
  revalidatePath(`/${kind}`, "layout");
}

async function signedIn() {
  return (await getUser()) ?? null;
}

/** Tổ chức đã duyệt mà người dùng là thành viên (RLS lọc). Hồ sơ nháp sửa ở wizard, không ở đây. */
async function loadApprovedOrg(
  supabase: Supabase,
  orgId: string,
): Promise<{ ok: true; kind: OrgKind } | { ok: false; error: ActionError }> {
  const { data, error } = await supabase
    .from("organizations")
    .select("kind, status")
    .eq("id", orgId)
    .maybeSingle();
  if (error) return dbFail(error, "load_org");
  if (!data) return fail("not_found", SETTINGS_MESSAGES.notFound);
  if (data.status !== "approved") return fail("org_not_active", SETTINGS_MESSAGES.orgNotActive);
  return { ok: true, kind: data.kind };
}

async function loadSiteOrg(
  supabase: Supabase,
  siteId: string,
): Promise<{ ok: true; orgId: string; kind: OrgKind } | { ok: false; error: ActionError }> {
  const site = await supabase.from("sites").select("org_id").eq("id", siteId).maybeSingle();
  if (site.error) return dbFail(site.error, "load_site");
  if (!site.data) return fail("not_found", SETTINGS_MESSAGES.notFound);
  const org = await loadApprovedOrg(supabase, site.data.org_id);
  return org.ok ? { ok: true, orgId: site.data.org_id, kind: org.kind } : org;
}

// ---------------------------------------------------------------------------
// Hồ sơ: trường không pháp lý (UPDATE theo grant cột §9.4) — lưu ngay, không duyệt lại
// ---------------------------------------------------------------------------

const profileInput = z.object({ orgId: uuid, values: z.record(z.string(), z.unknown()) });

export async function saveProfile(input: z.input<typeof profileInput>): Promise<ActionResult<Saved>> {
  const env = profileInput.safeParse(input);
  if (!env.success) return invalid();
  if (!(await signedIn())) return fail("unauthenticated", SETTINGS_MESSAGES.unauthenticated);

  const supabase = await createClient();
  const org = await loadApprovedOrg(supabase, env.data.orgId);
  if (!org.ok) return org;

  const fields = basicsFields(org.kind);
  const parsed = parseFields(fields, env.data.values);
  if (!parsed.ok) return invalid(parsed.errors);
  if (!isComplete(fields, env.data.values)) return invalid();
  const d = parsed.data as {
    name: string;
    subtype: string;
    description: string | null;
    contactPhone: string;
    contactEmail: string;
    beneficiaries?: number;
    foundedOn?: string | null;
  };

  const orgPatch: OrgUpdate = { name: d.name, subtype: d.subtype, description: d.description };
  if (org.kind === "charity") {
    orgPatch.declared_beneficiaries = d.beneficiaries;
    orgPatch.founded_on = d.foundedOn ?? null;
  }
  const upd = await supabase.from("organizations").update(orgPatch).eq("id", env.data.orgId).select("id");
  if (upd.error) return dbFail(upd.error, "update_org");
  if (upd.data.length === 0) return fail("forbidden", SETTINGS_MESSAGES.forbidden);

  const sens: SensitiveUpdate = { contact_phone: d.contactPhone, contact_email: d.contactEmail };
  const sensUpd = await supabase
    .from("org_sensitive")
    .update(sens)
    .eq("org_id", env.data.orgId)
    .select("org_id");
  if (sensUpd.error) return dbFail(sensUpd.error, "update_contact");
  if (sensUpd.data.length === 0) return fail("forbidden", SETTINGS_MESSAGES.forbidden);

  revalidatePortal(org.kind);
  return { ok: true, data: saved() };
}

const logoInput = z.object({ orgId: uuid, path: z.string().max(300).nullable() });

export async function saveSettingsLogo(input: z.input<typeof logoInput>): Promise<ActionResult<Saved>> {
  const env = logoInput.safeParse(input);
  if (!env.success) return invalid();
  if (env.data.path !== null && !isOrgLogoPath(env.data.orgId, env.data.path)) return invalid();
  if (!(await signedIn())) return fail("unauthenticated", SETTINGS_MESSAGES.unauthenticated);

  const supabase = await createClient();
  const org = await loadApprovedOrg(supabase, env.data.orgId);
  if (!org.ok) return org;
  const res = await replaceOrgLogo(supabase, env.data.orgId, env.data.path);
  if (!res.ok) return dbFail(res.error, res.op);
  revalidatePortal(org.kind);
  return { ok: true, data: saved() };
}

// ---------------------------------------------------------------------------
// Hồ sơ: trường pháp lý ⇒ đề nghị chờ Admin duyệt; tổ chức vẫn `approved` (DATA-MODEL §6.8)
// ---------------------------------------------------------------------------

export async function submitLegalChange(
  input: z.input<typeof legalChangeInput>,
): Promise<ActionResult<{ requestId: string }>> {
  const env = legalChangeInput.safeParse(input);
  if (!env.success) {
    const reason = env.error.issues.find((i) => i.path[0] === "reason");
    return invalid(reason ? { reason: reason.message } : undefined);
  }
  if (!(await signedIn())) return fail("unauthenticated", SETTINGS_MESSAGES.unauthenticated);

  const supabase = await createClient();
  const org = await loadApprovedOrg(supabase, env.data.orgId);
  if (!org.ok) return org;

  // Giá trị hiện tại (owner/manager đọc được `org_sensitive`) để chỉ gửi trường thực sự đổi
  const cur = await supabase
    .from("org_sensitive")
    .select("legal_name, tax_code, registration_no, representative_name, representative_title")
    .eq("org_id", env.data.orgId)
    .maybeSingle();
  if (cur.error) return dbFail(cur.error, "load_legal");
  const current = Object.fromEntries(
    (Object.keys(LEGAL_FORM_TO_DB) as LegalFormKey[]).map((k) => [
      k,
      cur.data?.[LEGAL_FORM_TO_DB[k]] ?? null,
    ]),
  ) as Record<LegalFormKey, string | null>;

  const checked = validateLegalChanges(
    org.kind,
    env.data.values as Partial<Record<LegalFormKey, string>>,
    current,
  );
  if (!checked.ok) {
    const { form, ...fieldErrors } = checked.errors;
    return form && Object.keys(fieldErrors).length === 0
      ? fail("no_changes", form)
      : invalid(fieldErrors as Record<string, string>);
  }

  const { data, error } = await supabase.rpc("submit_org_change_request", {
    p_org_id: env.data.orgId,
    p_changes: checked.changes,
    p_reason: env.data.reason as string,
    p_client_op_id: env.data.clientOpId,
  });
  if (error) return dbFail(error, "submit_org_change_request");
  revalidatePortal(org.kind);
  return { ok: true, data: { requestId: data } };
}

// ---------------------------------------------------------------------------
// Điểm (upsert_site) và giờ (set_site_hours)
// ---------------------------------------------------------------------------

const siteInput = z.object({
  orgId: uuid,
  siteId: uuid.nullable(),
  clientOpId: uuid,
  values: z.record(z.string(), z.unknown()),
});

export async function saveSettingsSite(
  input: z.input<typeof siteInput>,
): Promise<ActionResult<Saved & { siteId: string }>> {
  const env = siteInput.safeParse(input);
  if (!env.success) return invalid();
  if (!(await signedIn())) return fail("unauthenticated", SETTINGS_MESSAGES.unauthenticated);

  const supabase = await createClient();
  const org = await loadApprovedOrg(supabase, env.data.orgId);
  if (!org.ok) return org;

  const fields = siteFields(org.kind);
  const parsed = parseFields(fields, env.data.values);
  if (!parsed.ok) return invalid(parsed.errors);
  if (!env.data.siteId && !isComplete(fields, env.data.values)) return invalid();

  const res = await supabase.rpc("upsert_site", {
    p_org_id: env.data.orgId,
    p_site: buildSitePayload(org.kind, env.data.siteId, parsed.data as ParsedSite),
    p_client_op_id: env.data.clientOpId,
  });
  if (res.error) return dbFail(res.error, "upsert_site");
  revalidatePortal(org.kind);
  return { ok: true, data: { siteId: res.data, ...saved() } };
}

const hoursInput = z.object({ siteId: uuid, rows: hoursRowsSchema });

export async function saveSettingsHours(input: z.input<typeof hoursInput>): Promise<ActionResult<Saved>> {
  const env = hoursInput.safeParse(input);
  if (!env.success) return invalid();
  if (!(await signedIn())) return fail("unauthenticated", SETTINGS_MESSAGES.unauthenticated);
  if (env.data.rows.length > 0 && validateHours(hoursFromRows(env.data.rows, true, "store"))) {
    return fail("hours_overlap", SETTINGS_MESSAGES.overlap);
  }

  const supabase = await createClient();
  const site = await loadSiteOrg(supabase, env.data.siteId);
  if (!site.ok) return site;

  const { error } = await supabase.rpc("set_site_hours", {
    p_site_id: env.data.siteId,
    p_hours: env.data.rows,
  });
  if (error) return dbFail(error, "set_site_hours");
  revalidatePortal(site.kind);
  return { ok: true, data: saved() };
}

// ---------------------------------------------------------------------------
// Ngày nghỉ: ghi trực tiếp `site_closures` theo RLS (owner/manager tổ chức đã duyệt, đúng điểm)
// ---------------------------------------------------------------------------

export async function addClosure(input: z.input<typeof closureInput>): Promise<ActionResult<Saved>> {
  const env = closureInput.safeParse(input);
  if (!env.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of env.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return invalid(fieldErrors);
  }
  if (!isClosureDateAllowed(env.data.date, todayInVietnam())) {
    return invalid({ date: "Chọn ngày từ hôm nay tới 12 tháng tới." });
  }
  if (!(await signedIn())) return fail("unauthenticated", SETTINGS_MESSAGES.unauthenticated);

  const supabase = await createClient();
  const site = await loadSiteOrg(supabase, env.data.siteId);
  if (!site.ok) return site;

  const ins = await supabase
    .from("site_closures")
    .insert({ site_id: env.data.siteId, closed_on: env.data.date, reason: env.data.reason });
  if (ins.error?.code === "23505") {
    // Đã là ngày nghỉ ⇒ cập nhật ghi chú (grant UPDATE chỉ có closed_on, reason)
    const upd = await supabase
      .from("site_closures")
      .update({ reason: env.data.reason })
      .eq("site_id", env.data.siteId)
      .eq("closed_on", env.data.date)
      .select("site_id");
    if (upd.error) return dbFail(upd.error, "update_closure");
    if (upd.data.length === 0) return fail("forbidden", SETTINGS_MESSAGES.forbidden);
  } else if (ins.error) {
    return dbFail(ins.error, "insert_closure");
  }
  revalidatePortal(site.kind);
  return { ok: true, data: saved() };
}

export async function removeClosure(input: z.input<typeof removeClosureInput>): Promise<ActionResult<Saved>> {
  const env = removeClosureInput.safeParse(input);
  if (!env.success) return invalid();
  if (!(await signedIn())) return fail("unauthenticated", SETTINGS_MESSAGES.unauthenticated);

  const supabase = await createClient();
  const site = await loadSiteOrg(supabase, env.data.siteId);
  if (!site.ok) return site;

  const { data, error } = await supabase
    .from("site_closures")
    .delete()
    .eq("site_id", env.data.siteId)
    .eq("closed_on", env.data.date)
    .select("site_id");
  if (error) return dbFail(error, "delete_closure");
  if (data.length === 0) return fail("not_found", SETTINGS_MESSAGES.notFound);
  revalidatePortal(site.kind);
  return { ok: true, data: saved() };
}

// ---------------------------------------------------------------------------
// Tạm ngưng (set_org_paused — owner/manager, tổ chức đã duyệt)
// ---------------------------------------------------------------------------

export async function setPaused(input: z.input<typeof pauseInput>): Promise<ActionResult<Saved>> {
  const env = pauseInput.safeParse(input);
  if (!env.success) {
    const reason = env.error.issues.find((i) => i.path[0] === "reason");
    return invalid(reason ? { reason: reason.message } : undefined);
  }
  if (!(await signedIn())) return fail("unauthenticated", SETTINGS_MESSAGES.unauthenticated);

  const supabase = await createClient();
  const org = await loadApprovedOrg(supabase, env.data.orgId);
  if (!org.ok) return org;

  const { error } = await supabase.rpc("set_org_paused", {
    p_org_id: env.data.orgId,
    p_paused: env.data.paused,
    p_reason: env.data.reason as string,
  });
  if (error) return dbFail(error, "set_org_paused");
  revalidatePortal(org.kind);
  return { ok: true, data: saved() };
}
