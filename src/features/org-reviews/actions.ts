"use server";

import { revalidatePath } from "next/cache";

import { ORG_STATUS_BADGE } from "@/components/labels/status-badge";
import { formatDateTime } from "@/lib/format";
import { checkAdminAction } from "@/server/auth/admin-action";
import { createClient } from "@/server/db/supabase";
import { sendOrgReviewEmail } from "@/server/email/org-review";

import { adminErrorMessage, classifyRpcError, type AdminErrorKind, type RpcErrorLike } from "./errors";
import {
  documentIdSchema,
  orgIdSchema,
  orgStandingSchema,
  reviewChangeSchema,
  reviewOrgSchema,
  verifyIdSchema,
  type OrgStandingInput,
  type ReviewChangeInput,
  type ReviewOrgInput,
  type VerifyIdInput,
} from "./schemas";

/**
 * Server Action của hàng đợi duyệt (P1-09). Mỗi action: kiểm quyền (admin aal2) → zod → RPC bằng client
 * của Admin (RLS/aal2 kiểm lại ở DB) → ánh xạ lỗi tiếng Việt → làm mới dữ liệu trang Admin.
 */

export type ActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; kind: AdminErrorKind; message: string; fieldErrors?: Record<string, string> };

function fail(kind: AdminErrorKind, message = adminErrorMessage(kind)): ActionResult<never> {
  return { ok: false, kind, message };
}

async function guard(): Promise<ActionResult<never> | null> {
  const check = await checkAdminAction();
  if (check.ok) return null;
  return check.reason === "mfa_required" ? fail("mfa_required") : fail("not_authorized");
}

function fromRpc(error: RpcErrorLike): ActionResult<never> {
  return fail(classifyRpcError(error));
}

function fieldErrorsOf(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const key = String(i.path[0] ?? "form");
    out[key] ??= i.message;
  }
  return out;
}

/** "Hồ sơ đã được xử lý bởi …" (US-ADM-04 AC4) khi một Admin khác ra quyết định trước. */
async function alreadyHandledMessage(orgId: string): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organizations")
    .select("status, reviewed_at, reviewer:profiles!organizations_reviewed_by_fkey(full_name)")
    .eq("id", orgId)
    .maybeSingle();
  if (!data) return adminErrorMessage("invalid_state");
  const who = data.reviewer?.full_name?.trim();
  const when = data.reviewed_at ? ` lúc ${formatDateTime(data.reviewed_at)}` : "";
  const status = ORG_STATUS_BADGE[data.status].text;
  return who
    ? `Hồ sơ đã được xử lý bởi Admin ${who}${when} (trạng thái: ${status}). Tải lại trang để xem.`
    : `Hồ sơ không còn ở trạng thái chờ duyệt (hiện: ${status}). Tải lại trang để xem.`;
}

// ---------------------------------------------------------------------------
// Duyệt hồ sơ onboarding (US-ADM-04)
// ---------------------------------------------------------------------------

export async function reviewOrganizationAction(
  input: ReviewOrgInput,
): Promise<ActionResult<{ emailSent: boolean }>> {
  const parsed = reviewOrgSchema.safeParse(input);
  if (!parsed.success) {
    return { ...fail("validation_failed"), fieldErrors: fieldErrorsOf(parsed.error.issues) };
  }
  const denied = await guard();
  if (denied) return denied;

  const { orgId, decision, reason, clientOpId } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_organization", {
    p_org_id: orgId,
    p_decision: decision,
    // RPC nhận text; duyệt không có lý do ⇒ null (kiểu sinh ra là string)
    p_reason: (reason ?? null) as string,
    p_client_op_id: clientOpId,
  });
  if (error) {
    const kind = classifyRpcError(error);
    if (kind === "invalid_state") return fail(kind, await alreadyHandledMessage(orgId));
    return fromRpc(error);
  }

  const emailSent = await sendOrgReviewEmail({ orgId, decision, reason });
  revalidatePath("/admin", "layout");
  return { ok: true, emailSent };
}

// ---------------------------------------------------------------------------
// Yêu cầu cập nhật thông tin pháp lý (US-ADM-02 AC3)
// ---------------------------------------------------------------------------

export async function reviewChangeRequestAction(input: ReviewChangeInput): Promise<ActionResult> {
  const parsed = reviewChangeSchema.safeParse(input);
  if (!parsed.success) {
    return { ...fail("validation_failed"), fieldErrors: fieldErrorsOf(parsed.error.issues) };
  }
  const denied = await guard();
  if (denied) return denied;

  const { requestId, decision, note, clientOpId } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_org_change_request", {
    p_request_id: requestId,
    p_decision: decision,
    p_note: (note ?? null) as string,
    p_client_op_id: clientOpId,
  });
  if (error) {
    const kind = classifyRpcError(error);
    if (kind === "invalid_state") {
      return fail(kind, "Yêu cầu này đã được xử lý trước đó. Tải lại trang để xem kết quả.");
    }
    return fromRpc(error);
  }
  revalidatePath("/admin", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Tạm khóa / mở khóa (F-69)
// ---------------------------------------------------------------------------

export async function setOrgStandingAction(input: OrgStandingInput): Promise<ActionResult> {
  const parsed = orgStandingSchema.safeParse(input);
  if (!parsed.success) {
    return { ...fail("validation_failed"), fieldErrors: fieldErrorsOf(parsed.error.issues) };
  }
  const denied = await guard();
  if (denied) return denied;

  const { orgId, action, reason, confirmName, clientOpId } = parsed.data;
  const supabase = await createClient();

  if (action === "suspend") {
    const { data: org } = await supabase.from("organizations").select("name").eq("id", orgId).maybeSingle();
    if (!org) return fail("not_found");
    if ((confirmName ?? "").trim() !== org.name.trim()) {
      return {
        ...fail("validation_failed", "Tên tổ chức gõ lại chưa khớp."),
        fieldErrors: { confirmName: "Gõ lại chính xác tên tổ chức để xác nhận tạm khóa." },
      };
    }
  }

  const { error } =
    action === "suspend"
      ? await supabase.rpc("suspend_organization", {
          p_org_id: orgId,
          p_reason: reason,
          p_client_op_id: clientOpId,
        })
      : await supabase.rpc("reinstate_organization", {
          p_org_id: orgId,
          p_note: reason,
          p_client_op_id: clientOpId,
        });
  if (error) {
    const kind = classifyRpcError(error);
    if (kind === "invalid_state") {
      return fail(kind, "Trạng thái tổ chức vừa thay đổi. Tải lại trang để xem trạng thái mới nhất.");
    }
    return fromRpc(error);
  }
  revalidatePath("/admin", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Xác minh CCCD người đại diện (chỉ 4 số cuối — SECURITY-PRIVACY C6)
// ---------------------------------------------------------------------------

export async function verifyRepresentativeAction(input: VerifyIdInput): Promise<ActionResult> {
  const parsed = verifyIdSchema.safeParse(input);
  if (!parsed.success) {
    return { ...fail("validation_failed"), fieldErrors: fieldErrorsOf(parsed.error.issues) };
  }
  const denied = await guard();
  if (denied) return denied;

  const supabase = await createClient();
  const { error } = await supabase.rpc("verify_representative_id", {
    p_org_id: parsed.data.orgId,
    p_last4: parsed.data.last4,
    p_method: parsed.data.method,
  });
  if (error) return fromRpc(error);
  revalidatePath("/admin", "layout");
  return { ok: true };
}

/**
 * "Hiện số" CCCD đầy đủ (B2): chỉ admin aal2 (DB kiểm lại trong `reveal_representative_id`), mỗi lần ghi nhật ký
 * `representative_id.reveal`. Số chỉ trả về trình duyệt của admin, không lưu ở đâu khác.
 */
export async function revealRepresentativeIdAction(
  orgId: string,
): Promise<ActionResult<{ idNumber: string }>> {
  const parsed = orgIdSchema.safeParse(orgId);
  if (!parsed.success) return fail("not_found");
  const denied = await guard();
  if (denied) return denied;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reveal_representative_id", { p_org_id: parsed.data });
  if (error) {
    const kind = classifyRpcError(error);
    if (kind === "not_found") return fail(kind, "Tổ chức chưa khai số CCCD người đại diện.");
    return fromRpc(error);
  }
  if (typeof data !== "string") return fail("not_found", "Tổ chức chưa khai số CCCD người đại diện.");
  return { ok: true, idNumber: data };
}

// ---------------------------------------------------------------------------
// Xem giấy tờ KYC: signed URL 60 s (US-ADM-03, SECURITY-PRIVACY C7)
// ---------------------------------------------------------------------------

const KYC_SIGNED_URL_TTL = 60;

/**
 * Tạo signed URL 60 giây cho một giấy tờ, bằng client của Admin để policy `kyc_select` (admin aal2)
 * của Storage được áp dụng. Mỗi lần xem tạo URL mới; không có tùy chọn tải xuống.
 */
export async function openOrgDocumentAction(
  documentId: string,
): Promise<ActionResult<{ url: string; mimeType: string; expiresAt: string }>> {
  const parsed = documentIdSchema.safeParse(documentId);
  if (!parsed.success) return fail("not_found");
  const denied = await guard();
  if (denied) return denied;

  const supabase = await createClient();
  const { data: doc, error } = await supabase
    .from("org_documents")
    .select("storage_path, mime_type, file_deleted_at")
    .eq("id", parsed.data)
    .maybeSingle();
  if (error) return fromRpc(error);
  if (!doc) return fail("not_found", "Không tìm thấy giấy tờ này.");
  if (doc.file_deleted_at) {
    return fail("not_found", "Tệp đã được xóa theo chính sách lưu giữ 30 ngày sau quyết định duyệt.");
  }

  // US-ADM-03 AC2: ghi nhật ký mỗi lần mở giấy tờ TRƯỚC khi cấp link (không ghi được ⇒ không cấp link).
  const { error: auditError } = await supabase.rpc("log_document_view", { p_document_id: parsed.data });
  if (auditError) return fromRpc(auditError);

  const { data: signed, error: signError } = await supabase.storage
    .from("kyc")
    .createSignedUrl(doc.storage_path, KYC_SIGNED_URL_TTL);
  if (signError || !signed?.signedUrl) {
    console.error("[kyc] createSignedUrl failed", { status: (signError as { status?: number })?.status });
    return fail("not_found", "Không mở được tệp. Tệp có thể đã bị xóa hoặc phiên xác thực đã hết hạn.");
  }

  return {
    ok: true,
    url: signed.signedUrl,
    mimeType: doc.mime_type,
    expiresAt: new Date(Date.now() + KYC_SIGNED_URL_TTL * 1000).toISOString(),
  };
}
