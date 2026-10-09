"use server";

import { z } from "zod";

import { writeOrgHotline } from "@/features/contacts/hotline";
import { sha256Hex } from "@/lib/hash";
import { POLICY_VERSION } from "@/lib/legal";
import { getUser } from "@/server/auth/session";
import { createClient } from "@/server/db/supabase";
import type { Database } from "@/types/database.types";

import { CCCD_MESSAGES, maskCccd, validateCccd } from "./cccd";
import { consentText } from "./consent";
import { isOrgLogoPath } from "./documents";
import { ERROR_MESSAGES, mapDbError, type ActionError, type ActionResult } from "./errors";
import { hoursFromRows, validateHours } from "./hours";
import { replaceOrgLogo } from "./logo";
import { isOrgKind, type OrgKind } from "./options";
import { missingSteps, snapshotOf } from "./progress";
import { loadWizard } from "./queries";
import { buildSitePayload, type ParsedSite } from "./site-payload";
import {
  basicsFields,
  consentSchema,
  hoursRowsSchema,
  legalFields,
  parseFields,
  siteFields,
} from "./schemas";

/**
 * Server Action của wizard onboarding (P1-02…P1-07). Mỗi action: kiểm zod (schema dùng chung) →
 * client Supabase của NGƯỜI DÙNG (RLS + grant cột §9.4, không service role) → ánh xạ lỗi tiếng Việt.
 * Quyền thật nằm ở DB; ở đây kiểm thêm trạng thái `draft/needs_changes` để chặn sửa hồ sơ đã gửi.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;
type OrgUpdate = Database["public"]["Tables"]["organizations"]["Update"];
type SensitiveUpdate = Database["public"]["Tables"]["org_sensitive"]["Update"];
type Saved = { savedAt: string };

const uuid = z.uuid();

function err(
  code: string,
  message: string,
  extra: Partial<ActionError> = {},
): { ok: false; error: ActionError } {
  return { ok: false, error: { code, message, ...extra } };
}

function dbErr(e: { code?: string; message?: string; details?: string | null }, op: string) {
  const mapped = mapDbError(e);
  if (mapped.code === "server_error")
    console.error("[onboarding] db error", { op, code: e.code, message: e.message });
  return { ok: false as const, error: mapped };
}

const invalidInput = () => err("validation_failed", ERROR_MESSAGES.invalid);

async function requireSignedIn() {
  const user = await getUser();
  return user ?? null;
}

/** Tổ chức người dùng được sửa trong wizard: còn `draft`/`needs_changes`. */
async function loadEditableOrg(
  supabase: Supabase,
  orgId: string,
): Promise<{ ok: true; kind: OrgKind } | { ok: false; error: ActionError }> {
  const { data, error } = await supabase
    .from("organizations")
    .select("id, kind, status")
    .eq("id", orgId)
    .maybeSingle();
  if (error) return dbErr(error, "load_org");
  if (!data) return err("not_found", ERROR_MESSAGES.notFound);
  if (data.status !== "draft" && data.status !== "needs_changes") {
    return err("invalid_state", ERROR_MESSAGES.notEditable);
  }
  return { ok: true, kind: data.kind };
}

function now(): Saved {
  return { savedAt: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// Bước 1 — Thông tin cơ bản (create_organization + UPDATE theo grant cột)
// ---------------------------------------------------------------------------

const basicsInput = z.object({
  kind: z.enum(["store", "charity"]),
  orgId: uuid.nullable(),
  clientOpId: uuid,
  values: z.record(z.string(), z.unknown()),
});

export async function saveBasics(
  input: z.input<typeof basicsInput>,
): Promise<ActionResult<Saved & { orgId: string }>> {
  const env = basicsInput.safeParse(input);
  if (!env.success) return invalidInput();
  const { kind, clientOpId, values } = env.data;
  if (!(await requireSignedIn())) return err("unauthenticated", ERROR_MESSAGES.unauthenticated);

  const parsed = parseFields(basicsFields(kind), values);
  if (!parsed.ok) return err("validation_failed", ERROR_MESSAGES.invalid, { fieldErrors: parsed.errors });
  const d = parsed.data as {
    name?: string;
    subtype?: string;
    description?: string | null;
    contactPhone?: string;
    contactEmail?: string;
    hotlinePhone?: string | null;
    hotlineEmail?: string | null;
    beneficiaries?: number;
    foundedOn?: string | null;
  };

  const supabase = await createClient();
  let orgId = env.data.orgId;
  let created = false;

  if (!orgId) {
    if (!d.name || !d.subtype) {
      return err("incomplete", "Vui lòng nhập tên và chọn loại hình trước khi lưu hồ sơ.");
    }
    // Một chủ chỉ có một bản nháp mỗi loại (hồi quy L5): có nháp rồi thì dùng lại.
    const user = (await getUser())!;
    const existing = await supabase
      .from("organizations")
      .select("id")
      .eq("kind", kind)
      .eq("created_by", user.id)
      .eq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(1);
    if (existing.error) return dbErr(existing.error, "find_draft");
    if (existing.data[0]) {
      orgId = existing.data[0].id;
    } else {
      const res = await supabase.rpc("create_organization", {
        p_kind: kind,
        p_name: d.name,
        p_subtype: d.subtype,
        p_client_op_id: clientOpId,
      });
      if (res.error) return dbErr(res.error, "create_organization");
      orgId = res.data;
      created = true;
    }
  }

  const org = await loadEditableOrg(supabase, orgId);
  if (!org.ok) return org;
  if (org.kind !== kind) return err("not_found", ERROR_MESSAGES.notFound);

  const orgPatch: OrgUpdate = {};
  if (!created && d.name !== undefined) orgPatch.name = d.name;
  if (!created && d.subtype !== undefined) orgPatch.subtype = d.subtype;
  if (d.description !== undefined) orgPatch.description = d.description;
  if (kind === "charity" && d.beneficiaries !== undefined) orgPatch.declared_beneficiaries = d.beneficiaries;
  if (kind === "charity" && d.foundedOn !== undefined) orgPatch.founded_on = d.foundedOn;

  if (Object.keys(orgPatch).length > 0) {
    const { data, error } = await supabase
      .from("organizations")
      .update(orgPatch)
      .eq("id", orgId)
      .select("id");
    if (error) return dbErr(error, "update_org");
    if (data.length === 0) return err("invalid_state", ERROR_MESSAGES.notEditable);
  }

  const sensPatch: SensitiveUpdate = {};
  if (d.contactPhone !== undefined) sensPatch.contact_phone = d.contactPhone;
  if (d.contactEmail !== undefined) sensPatch.contact_email = d.contactEmail;
  if (Object.keys(sensPatch).length > 0) {
    const { data, error } = await supabase
      .from("org_sensitive")
      .update(sensPatch)
      .eq("org_id", orgId)
      .select("org_id");
    if (error) return dbErr(error, "update_contact");
    if (data.length === 0) return err("not_found", ERROR_MESSAGES.notFound);
  }

  // Hotline (B1) không bắt buộc, lưu ở `org_contacts` — chỉ hiển thị cho tổ chức đã duyệt qua get_org_contact
  const hotline = await writeOrgHotline(supabase, orgId, { phone: d.hotlinePhone, email: d.hotlineEmail });
  if (!hotline.ok) return dbErr(hotline.error, "update_hotline");

  return { ok: true, data: { orgId, ...now() } };
}

// ---------------------------------------------------------------------------
// Bước 3 — Pháp lý & người đại diện (org_sensitive, cột theo grant §9.4; KHÔNG có CCCD)
// ---------------------------------------------------------------------------

const legalInput = z.object({ orgId: uuid, values: z.record(z.string(), z.unknown()) });

export async function saveLegal(input: z.input<typeof legalInput>): Promise<ActionResult<Saved>> {
  const env = legalInput.safeParse(input);
  if (!env.success) return invalidInput();
  if (!(await requireSignedIn())) return err("unauthenticated", ERROR_MESSAGES.unauthenticated);

  const supabase = await createClient();
  const org = await loadEditableOrg(supabase, env.data.orgId);
  if (!org.ok) return org;

  const parsed = parseFields(legalFields(org.kind), env.data.values);
  if (!parsed.ok) return err("validation_failed", ERROR_MESSAGES.invalid, { fieldErrors: parsed.errors });
  const d = parsed.data as Record<string, string | null | undefined>;

  const patch: SensitiveUpdate = {};
  if (d.legalName !== undefined) patch.legal_name = d.legalName;
  if (d.taxCode !== undefined) patch.tax_code = d.taxCode;
  if (d.registrationNo !== undefined) patch.registration_no = d.registrationNo;
  if (d.representativeName !== undefined) patch.representative_name = d.representativeName;
  if (d.representativeTitle !== undefined) patch.representative_title = d.representativeTitle;
  if (Object.keys(patch).length === 0) return { ok: true, data: now() };

  const { data, error } = await supabase
    .from("org_sensitive")
    .update(patch)
    .eq("org_id", env.data.orgId)
    .select("org_id");
  if (error) return dbErr(error, "update_legal");
  if (data.length === 0) return err("not_found", ERROR_MESSAGES.notFound);
  return { ok: true, data: now() };
}

// ---------------------------------------------------------------------------
// Bước 3 — Số CCCD người đại diện (B2): số đầy đủ chỉ đi tới RPC `set_representative_id` (bảng private),
// không bao giờ lưu ảnh; trả về dạng che. Dùng cả ở wizard và Cài đặt (lần ghi đầu của tổ chức đã duyệt).
// ---------------------------------------------------------------------------

const repIdInput = z.object({
  orgId: uuid,
  idNumber: z.string().max(20),
  source: z.enum(["manual", "cccd_qr"]),
  nameOnCard: z.string().trim().max(120).nullable().optional(),
});

const REP_ID_MESSAGES = {
  invalid: "Số CCCD chưa hợp lệ: cần đúng 12 chữ số, 3 số đầu là mã tỉnh 001–096.",
  locked:
    "Số CCCD người đại diện đã được lưu cho tổ chức này. Muốn đổi người đại diện, hãy gửi đề nghị sửa thông tin pháp lý.",
  mismatch:
    "4 số cuối khác với số FoodSave đã ghi nhận cho người đại diện. Hãy kiểm tra lại, hoặc gửi đề nghị sửa thông tin pháp lý.",
  notEditable: "Hồ sơ đang chờ duyệt nên chưa đổi được số CCCD. Xem trạng thái hồ sơ để biết bước tiếp theo.",
} as const;

export async function saveRepresentativeId(
  input: z.input<typeof repIdInput>,
): Promise<ActionResult<Saved & { masked: string }>> {
  const env = repIdInput.safeParse(input);
  if (!env.success) return invalidInput();
  const number = validateCccd(env.data.idNumber);
  if (!number.ok) {
    return err("validation_failed", CCCD_MESSAGES[number.error], {
      fieldErrors: { idNumber: CCCD_MESSAGES[number.error] },
    });
  }
  if (env.data.source === "cccd_qr" && !env.data.nameOnCard) return invalidInput();
  if (!(await requireSignedIn())) return err("unauthenticated", ERROR_MESSAGES.unauthenticated);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_representative_id", {
    p_org_id: env.data.orgId,
    p_id_number: number.value,
    p_source: env.data.source,
    ...(env.data.source === "cccd_qr" && env.data.nameOnCard ? { p_name_on_card: env.data.nameOnCard } : {}),
  });
  if (error) {
    if (error.code === "PT409" && error.details === "id_locked")
      return err("id_locked", REP_ID_MESSAGES.locked);
    if (error.code === "PT409") return err("invalid_state", REP_ID_MESSAGES.notEditable);
    if (error.code === "PT422" && (error.details ?? "").includes("last4_mismatch")) {
      return err("last4_mismatch", REP_ID_MESSAGES.mismatch, {
        fieldErrors: { idNumber: REP_ID_MESSAGES.mismatch },
      });
    }
    if (error.code === "PT422") {
      return err("validation_failed", REP_ID_MESSAGES.invalid, {
        fieldErrors: { idNumber: REP_ID_MESSAGES.invalid },
      });
    }
    return dbErr(error, "set_representative_id");
  }
  const masked = (data as { masked?: string } | null)?.masked ?? maskCccd(number.value);
  return { ok: true, data: { masked, ...now() } };
}

// ---------------------------------------------------------------------------
// Bước 2 — Địa điểm (upsert_site) và giờ (set_site_hours)
// ---------------------------------------------------------------------------

const siteInput = z.object({
  orgId: uuid,
  siteId: uuid.nullable(),
  clientOpId: uuid,
  values: z.record(z.string(), z.unknown()),
});

export async function saveSite(
  input: z.input<typeof siteInput>,
): Promise<ActionResult<Saved & { siteId: string }>> {
  const env = siteInput.safeParse(input);
  if (!env.success) return invalidInput();
  if (!(await requireSignedIn())) return err("unauthenticated", ERROR_MESSAGES.unauthenticated);

  const supabase = await createClient();
  const org = await loadEditableOrg(supabase, env.data.orgId);
  if (!org.ok) return org;

  const parsed = parseFields(siteFields(org.kind), env.data.values);
  if (!parsed.ok) return err("validation_failed", ERROR_MESSAGES.invalid, { fieldErrors: parsed.errors });
  const d = parsed.data as ParsedSite;

  let siteId = env.data.siteId;
  if (!siteId) {
    // Điểm đã có (tab khác vừa tạo) ⇒ cập nhật điểm đó thay vì tạo trùng
    const existing = await supabase
      .from("sites")
      .select("id")
      .eq("org_id", env.data.orgId)
      .eq("is_active", true)
      .order("is_primary", { ascending: false })
      .limit(1);
    if (existing.error) return dbErr(existing.error, "find_site");
    siteId = existing.data[0]?.id ?? null;
    if (!siteId && (!d.name || !d.location)) {
      return err("incomplete", "Vui lòng nhập tên điểm và chọn vị trí trên bản đồ.");
    }
  }

  const res = await supabase.rpc("upsert_site", {
    p_org_id: env.data.orgId,
    p_site: buildSitePayload(org.kind, siteId, d),
    p_client_op_id: env.data.clientOpId,
  });
  if (res.error) return dbErr(res.error, "upsert_site");
  return { ok: true, data: { siteId: res.data, ...now() } };
}

const hoursInput = z.object({ siteId: uuid, rows: hoursRowsSchema });

export async function saveHours(input: z.input<typeof hoursInput>): Promise<ActionResult<Saved>> {
  const env = hoursInput.safeParse(input);
  if (!env.success) return invalidInput();
  if (!(await requireSignedIn())) return err("unauthenticated", ERROR_MESSAGES.unauthenticated);
  if (env.data.rows.length > 0 && validateHours(hoursFromRows(env.data.rows, true, "store"))) {
    return err("validation_failed", ERROR_MESSAGES.overlap);
  }

  const supabase = await createClient();
  const site = await supabase.from("sites").select("org_id").eq("id", env.data.siteId).maybeSingle();
  if (site.error) return dbErr(site.error, "load_site");
  if (!site.data) return err("not_found", ERROR_MESSAGES.notFound);
  const org = await loadEditableOrg(supabase, site.data.org_id);
  if (!org.ok) return org;

  const { error } = await supabase.rpc("set_site_hours", {
    p_site_id: env.data.siteId,
    p_hours: env.data.rows,
  });
  if (error) return dbErr(error, "set_site_hours");
  return { ok: true, data: now() };
}

// ---------------------------------------------------------------------------
// Bước 4 — Giấy tờ: tệp tải thẳng từ trình duyệt (policy Storage kiểm quyền); ở đây chỉ xóa và gắn logo
// ---------------------------------------------------------------------------

export async function deleteDocument(input: { documentId: string }): Promise<ActionResult<Saved>> {
  const id = uuid.safeParse(input?.documentId);
  if (!id.success) return invalidInput();
  if (!(await requireSignedIn())) return err("unauthenticated", ERROR_MESSAGES.unauthenticated);

  const supabase = await createClient();
  const doc = await supabase
    .from("org_documents")
    .select("id, org_id, storage_path, change_request_id")
    .eq("id", id.data)
    .maybeSingle();
  if (doc.error) return dbErr(doc.error, "load_document");
  if (!doc.data || doc.data.change_request_id) return err("not_found", ERROR_MESSAGES.notFound);
  const org = await loadEditableOrg(supabase, doc.data.org_id);
  if (!org.ok) return org;

  // Xóa tệp trước (Storage API, policy kyc_delete); xóa lại tệp đã mất là no-op nên thử lại an toàn.
  const removed = await supabase.storage.from("kyc").remove([doc.data.storage_path]);
  if (removed.error) {
    console.error("[onboarding] kyc remove failed", { message: removed.error.message });
    return err("storage_error", "Chưa xóa được tệp. Vui lòng thử lại.");
  }
  const { data, error } = await supabase.from("org_documents").delete().eq("id", id.data).select("id");
  if (error) return dbErr(error, "delete_document");
  if (data.length === 0) return err("not_found", ERROR_MESSAGES.notFound);
  return { ok: true, data: now() };
}

const logoInput = z.object({ orgId: uuid, path: z.string().max(300).nullable() });

/** Gắn (hoặc gỡ) logo đã tải lên bucket `media` vào hồ sơ. Gỡ ⇒ xóa luôn tệp cũ. */
export async function saveLogo(input: z.input<typeof logoInput>): Promise<ActionResult<Saved>> {
  const env = logoInput.safeParse(input);
  if (!env.success) return invalidInput();
  if (env.data.path !== null && !isOrgLogoPath(env.data.orgId, env.data.path)) return invalidInput();
  if (!(await requireSignedIn())) return err("unauthenticated", ERROR_MESSAGES.unauthenticated);

  const supabase = await createClient();
  const org = await loadEditableOrg(supabase, env.data.orgId);
  if (!org.ok) return org;

  const res = await replaceOrgLogo(supabase, env.data.orgId, env.data.path);
  if (!res.ok) return dbErr(res.error, res.op);
  return { ok: true, data: now() };
}

// ---------------------------------------------------------------------------
// Bước 5 — Cam kết & gửi duyệt (grant_consent + submit_organization)
// ---------------------------------------------------------------------------

const submitInput = z.object({
  kind: z.enum(["store", "charity"]),
  orgId: uuid,
  clientOpId: uuid,
  consents: z.unknown(),
});

export async function submitOnboarding(
  input: z.input<typeof submitInput>,
): Promise<ActionResult<{ redirectTo: string }>> {
  const env = submitInput.safeParse(input);
  if (!env.success || !isOrgKind(env.data.kind)) return invalidInput();
  const consents = consentSchema.safeParse(env.data.consents);
  if (!consents.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of consents.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return err("validation_failed", "Vui lòng xác nhận đủ các cam kết bên dưới.", { fieldErrors });
  }
  if (!(await requireSignedIn())) return err("unauthenticated", ERROR_MESSAGES.unauthenticated);

  const { kind, orgId, clientOpId } = env.data;
  // Kiểm lại đủ các bước (RPC chỉ kiểm điểm, giấy tờ, đồng ý; thông tin & pháp lý kiểm ở đây)
  const wizard = await loadWizard(kind);
  if (!wizard.org || wizard.org.id !== orgId) return err("not_found", ERROR_MESSAGES.notFound);
  const missing = missingSteps(kind, snapshotOf(wizard));
  if (missing.length > 0) {
    return err("incomplete", "Hồ sơ còn thiếu một số mục bắt buộc. Vui lòng bổ sung rồi gửi lại.", {
      missing: missing.map((m) => ({ step: m.key, message: `Bước “${m.title}” chưa hoàn tất.` })),
    });
  }

  const supabase = await createClient();
  const textHash = await sha256Hex(consentText(kind));
  const consent = await supabase.rpc("grant_consent", {
    p_purpose: "terms",
    p_policy_version: POLICY_VERSION,
    p_text_hash: textHash,
    p_source: "web",
  });
  if (consent.error) return dbErr(consent.error, "grant_consent");

  const submitted = await supabase.rpc("submit_organization", {
    p_org_id: orgId,
    p_client_op_id: clientOpId,
  });
  if (submitted.error) return dbErr(submitted.error, "submit_organization");

  return { ok: true, data: { redirectTo: `/onboarding/status?org=${orgId}&submitted=1` } };
}
