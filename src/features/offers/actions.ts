"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { FreshnessLabel } from "@/core/labels";
import { UNIT_LABEL, type UnitCode } from "@/features/catalog/labels";
import {
  mapRpcError,
  parseRpcDetail,
  RPC_MESSAGES,
  type ActionError,
  type PgLikeError,
} from "@/lib/rpc-errors";
import { getUser } from "@/server/auth/session";
import { createClient } from "@/server/db/supabase";
import { getAiProvider } from "@/server/providers/ai";

import { AI_FAILURE_MESSAGES, type AiDraftFailure, type AiOfferDraft } from "./ai-mapping";
import { consumeAiOfferQuota } from "./ai.server";
import { offerToFormValues } from "./mapping";
import { getStoreOffer, loadCategories, offerRecord } from "./queries";
import {
  buildOfferPatch,
  buildOfferPayload,
  cancelOfferInput,
  formatDecimalInput,
  offerFieldErrorsFromRpc,
  offerFormValuesSchema,
  publishDraftInput,
  updateQuantityInput,
  validateNewQuantity,
  validateOfferForm,
} from "./schemas";

/**
 * Server Action lô tặng (P2-04, P2-05, P2-06; US-STO-07…12). Mỗi action: zod (schema dùng chung) → client
 * Supabase của NGƯỜI DÙNG → RPC security definer (quyền thật ở DB) → `mapRpcError` → ActionResult.
 * Mọi RPC đổi trạng thái nhận `p_client_op_id` do CLIENT sinh một lần cho mỗi ý định (bấm lại = idempotent).
 */

export type OfferActionError = ActionError & { suggestedEnd?: string | null };
export type OfferResult<T> = { ok: true; data: T } | { ok: false; error: OfferActionError };

const OFFER_OVERRIDES: Record<string, string> = {
  not_found: "Không tìm thấy lô, hoặc bạn không có quyền với điểm của lô này. Hãy tải lại trang.",
  not_authorized:
    "Bạn không có quyền thao tác ở điểm này của cửa hàng. Liên hệ chủ cửa hàng nếu cần thêm quyền.",
  "invalid_state:offer_has_allocations":
    "Lô đã có tổ chức giữ hàng nên chỉ sửa được tên, mô tả và ảnh. Đổi số lượng bằng “Cập nhật số lượng”.",
  invalid_state: "Lô vừa đổi trạng thái (đã đăng, đã đóng hoặc đã hủy). Hãy tải lại trang để xem mới nhất.",
  validation_failed: "Thông tin lô chưa hợp lệ. Vui lòng kiểm tra các trường được đánh dấu.",
};

const NETWORK_SAFE_UUID = z.uuid();

function fail(code: string, message: string, extra: Partial<OfferActionError> = {}): OfferActionError {
  return { code, message, ...extra };
}

function clean(errors: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(errors).filter((e): e is [string, string] => Boolean(e[1])));
}

function rpcFail(
  err: PgLikeError,
  op: string,
  ctx: { unit?: UnitCode | ""; overrides?: Record<string, string> } = {},
): OfferActionError {
  const mapped = mapRpcError(err, { ...OFFER_OVERRIDES, ...ctx.overrides });
  if (mapped.code === "server_error") {
    console.error("[offers] rpc error", { op, code: err.code, message: err.message });
  }
  if (mapped.fieldErrors) {
    const { errors, suggestedEnd } = offerFieldErrorsFromRpc(mapped.fieldErrors, {
      unit: ctx.unit,
      now: new Date(),
    });
    return { ...mapped, fieldErrors: clean(errors), suggestedEnd };
  }
  return mapped;
}

/** Trang Tổng quan, Lô tặng và chi tiết lô cùng đọc lô/phân bổ ⇒ làm mới cả cổng. */
function revalidateStore() {
  revalidatePath("/store", "layout");
}

// ---------------------------------------------------------------------------
// Lưu nháp / Đăng lô / Lưu thay đổi (form)
// ---------------------------------------------------------------------------

const saveInput = z.object({
  offerId: z.uuid().nullable(),
  values: offerFormValuesSchema,
  /** `draft` = Lưu nháp; `publish` = Đăng lô (nháp ⇒ đang mở); `save` = sửa lô đã đăng. */
  intent: z.enum(["draft", "publish", "save"]),
  attested: z.boolean(),
  ops: z.object({ save: z.uuid(), publish: z.uuid() }),
});

export type SaveOfferData = {
  offerId: string;
  status: "draft" | "open";
  effectiveDeadline: string | null;
  label: FreshnessLabel | null;
};

export type SaveOfferResult =
  | { ok: true; data: SaveOfferData }
  | { ok: false; error: OfferActionError; offerId: string | null; draftSaved: boolean };

export async function saveOffer(input: z.input<typeof saveInput>): Promise<SaveOfferResult> {
  const parsed = saveInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: fail("validation_failed", RPC_MESSAGES.invalid),
      offerId: null,
      draftSaved: false,
    };
  }
  const { values, intent, attested, ops } = parsed.data;
  if (!(await getUser())) {
    return {
      ok: false,
      error: fail("unauthenticated", RPC_MESSAGES.unauthenticated),
      offerId: null,
      draftSaved: false,
    };
  }

  const now = new Date();
  const existing = parsed.data.offerId ? await getStoreOffer(parsed.data.offerId, now) : null;
  if (parsed.data.offerId && !existing) {
    return {
      ok: false,
      error: fail("not_found", OFFER_OVERRIDES.not_found!),
      offerId: parsed.data.offerId,
      draftSaved: false,
    };
  }
  if (existing && !["draft", "open", "fully_allocated"].includes(existing.status)) {
    return {
      ok: false,
      error: fail("invalid_state", OFFER_OVERRIDES.invalid_state!),
      offerId: existing.id,
      draftSaved: false,
    };
  }

  const isDraft = !existing || existing.status === "draft";
  const publishing = isDraft && intent === "publish";
  const categories = await loadCategories();
  // Lô đã đăng: RPC tính lại hạn hiệu lực khi đổi giờ ⇒ áp quy tắc thời gian như lúc đăng (không cần cam kết lại)
  const errors = validateOfferForm(values, {
    mode: publishing || !isDraft ? "publish" : "draft",
    now,
    attested: publishing ? attested : true,
    categories,
    skipQuantity: !isDraft,
  });
  if (Object.keys(errors).length > 0) {
    return {
      ok: false,
      error: fail("validation_failed", OFFER_OVERRIDES.validation_failed!, { fieldErrors: clean(errors) }),
      offerId: existing?.id ?? null,
      draftSaved: false,
    };
  }

  const supabase = await createClient();
  let offerId = existing?.id ?? null;

  if (!existing) {
    const { data, error } = await supabase.rpc("create_offer", {
      p_payload: buildOfferPayload(values),
      p_client_op_id: ops.save,
    });
    if (error) {
      return {
        ok: false,
        error: rpcFail(error, "create_offer", { unit: values.unit }),
        offerId: null,
        draftSaved: false,
      };
    }
    offerId = data;
  } else {
    const patch = buildOfferPatch(offerToFormValues(offerRecord(existing)), values, {
      isDraft,
      hasAllocations: existing.stats.total > 0,
    });
    if (Object.keys(patch).length > 0) {
      const { error } = await supabase.rpc("update_offer", {
        p_offer_id: existing.id,
        p_patch: patch,
        p_client_op_id: ops.save,
      });
      if (error) {
        return {
          ok: false,
          error: rpcFail(error, "update_offer", { unit: values.unit }),
          offerId: existing.id,
          draftSaved: false,
        };
      }
      // Ảnh cũ bị thay ⇒ xóa khỏi bucket (best-effort, policy media cho phép thành viên cửa hàng)
      const old = existing.photoPath;
      if ("photo_paths" in patch && old && old !== values.photoPath) {
        const removed = await supabase.storage.from("media").remove([old]);
        if (removed.error)
          console.error("[offers] old photo remove failed", { message: removed.error.message });
      }
    }
  }
  revalidateStore();

  if (publishing && offerId) {
    const { data, error } = await supabase.rpc("publish_offer", {
      p_offer_id: offerId,
      p_safety_attested: attested,
      p_client_op_id: ops.publish,
    });
    if (error) {
      return {
        ok: false,
        error: rpcFail(error, "publish_offer", { unit: values.unit }),
        offerId,
        draftSaved: true,
      };
    }
    const res = (data ?? {}) as { effective_deadline?: string; label?: FreshnessLabel };
    return {
      ok: true,
      data: {
        offerId,
        status: "open",
        effectiveDeadline: res.effective_deadline ?? null,
        label: res.label ?? null,
      },
    };
  }

  return {
    ok: true,
    data: {
      offerId: offerId!,
      status: isDraft ? "draft" : "open",
      effectiveDeadline: existing?.effectiveDeadline ?? null,
      label: existing?.label ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// Đăng một lô nháp (không qua form): cam kết an toàn trong hộp thoại
// ---------------------------------------------------------------------------

export async function publishDraft(
  input: z.input<typeof publishDraftInput>,
): Promise<OfferResult<{ effectiveDeadline: string | null; label: FreshnessLabel | null }>> {
  const parsed = publishDraftInput.safeParse(input);
  if (!parsed.success) {
    const attest = parsed.error.issues.find((i) => i.path[0] === "attested");
    return {
      ok: false,
      error: fail("validation_failed", attest?.message ?? RPC_MESSAGES.invalid, {
        fieldErrors: attest ? { attested: attest.message } : undefined,
      }),
    };
  }
  if (!(await getUser())) return { ok: false, error: fail("unauthenticated", RPC_MESSAGES.unauthenticated) };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("publish_offer", {
    p_offer_id: parsed.data.offerId,
    p_safety_attested: true,
    p_client_op_id: parsed.data.clientOpId,
  });
  if (error) return { ok: false, error: rpcFail(error, "publish_offer") };
  revalidateStore();
  const res = (data ?? {}) as { effective_deadline?: string; label?: FreshnessLabel };
  return { ok: true, data: { effectiveDeadline: res.effective_deadline ?? null, label: res.label ?? null } };
}

// ---------------------------------------------------------------------------
// Cập nhật số lượng (US-STO-12 AC2) — không thấp hơn số đã được giữ
// ---------------------------------------------------------------------------

export async function updateOfferQuantity(
  input: z.input<typeof updateQuantityInput>,
): Promise<OfferResult<{ quantity: number }>> {
  const parsed = updateQuantityInput.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0] ?? "form")] ??= issue.message;
    return { ok: false, error: fail("validation_failed", RPC_MESSAGES.invalid, { fieldErrors }) };
  }
  if (!(await getUser())) return { ok: false, error: fail("unauthenticated", RPC_MESSAGES.unauthenticated) };

  const offer = await getStoreOffer(parsed.data.offerId, new Date());
  if (!offer) return { ok: false, error: fail("not_found", OFFER_OVERRIDES.not_found!) };

  const checked = validateNewQuantity(parsed.data.quantity, { unit: offer.unit, committed: offer.committed });
  if (!checked.ok) {
    return {
      ok: false,
      error: fail("validation_failed", checked.message, { fieldErrors: { quantity: checked.message } }),
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_offer_quantity", {
    p_offer_id: offer.id,
    p_new_quantity: checked.value,
    p_reason: parsed.data.reason,
    p_client_op_id: parsed.data.clientOpId,
  });
  if (error) {
    const detail = parseRpcDetail(error.details);
    if (detail?.p_new_quantity === "below_committed") {
      const committed = Number(detail.qty_committed ?? offer.committed);
      const message = `Không thể thấp hơn số đã được giữ (${formatDecimalInput(committed)} ${UNIT_LABEL[offer.unit]}).`;
      return { ok: false, error: fail("validation_failed", message, { fieldErrors: { quantity: message } }) };
    }
    return { ok: false, error: rpcFail(error, "update_offer_quantity", { unit: offer.unit }) };
  }
  revalidateStore();
  return { ok: true, data: { quantity: checked.value } };
}

// ---------------------------------------------------------------------------
// Hủy lô (C11) — chỉ owner/manager; phân bổ đã xác nhận bị hủy, −5 uy tín mỗi phân bổ
// ---------------------------------------------------------------------------

export async function cancelOffer(
  input: z.input<typeof cancelOfferInput>,
): Promise<OfferResult<{ status: "cancelled" | "completed" }>> {
  const parsed = cancelOfferInput.safeParse(input);
  if (!parsed.success) {
    const reason = parsed.error.issues.find((i) => i.path[0] === "reason");
    return {
      ok: false,
      error: fail("validation_failed", reason?.message ?? RPC_MESSAGES.invalid, {
        fieldErrors: reason ? { reason: reason.message } : undefined,
      }),
    };
  }
  if (!(await getUser())) return { ok: false, error: fail("unauthenticated", RPC_MESSAGES.unauthenticated) };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_offer", {
    p_offer_id: parsed.data.offerId,
    p_reason: parsed.data.reason,
    p_client_op_id: parsed.data.clientOpId,
  });
  if (error) {
    return {
      ok: false,
      error: rpcFail(error, "cancel_offer", {
        overrides: { not_authorized: "Chỉ chủ cửa hàng hoặc quản lý mới hủy được lô. Hãy nhờ họ thực hiện." },
      }),
    };
  }
  revalidateStore();
  const status = (data as { status?: string } | null)?.status === "completed" ? "completed" : "cancelled";
  return { ok: true, data: { status } };
}

// ---------------------------------------------------------------------------
// Xóa lô nháp (RLS `offers_delete_draft`) + ảnh của nó
// ---------------------------------------------------------------------------

export async function deleteDraft(input: { offerId: string }): Promise<OfferResult<null>> {
  if (!NETWORK_SAFE_UUID.safeParse(input?.offerId).success) {
    return { ok: false, error: fail("validation_failed", RPC_MESSAGES.invalid) };
  }
  if (!(await getUser())) return { ok: false, error: fail("unauthenticated", RPC_MESSAGES.unauthenticated) };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("offers")
    .delete()
    .eq("id", input.offerId)
    .eq("status", "draft")
    .select("id, photo_paths");
  if (error) return { ok: false, error: rpcFail(error, "delete_draft") };
  if (!data || data.length === 0) {
    return {
      ok: false,
      error: fail("invalid_state", "Lô này không còn là bản nháp (hoặc đã bị xóa). Hãy tải lại trang."),
    };
  }
  const paths = data.flatMap((r) => r.photo_paths ?? []);
  if (paths.length > 0) {
    const removed = await supabase.storage.from("media").remove(paths);
    if (removed.error)
      console.error("[offers] draft photo remove failed", { message: removed.error.message });
  }
  revalidateStore();
  return { ok: true, data: null };
}

// ---------------------------------------------------------------------------
// Xem trước: giờ đóng cửa của điểm (RPC `site_close_at`, cấp cho authenticated)
// ---------------------------------------------------------------------------

const siteCloseInput = z.object({ siteId: z.uuid(), at: z.iso.datetime({ offset: true }) });

export async function previewSiteClose(
  input: z.input<typeof siteCloseInput>,
): Promise<OfferResult<{ closeAt: string | null }>> {
  const parsed = siteCloseInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: fail("validation_failed", RPC_MESSAGES.invalid) };
  if (!(await getUser())) return { ok: false, error: fail("unauthenticated", RPC_MESSAGES.unauthenticated) };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("site_close_at", {
    p_site_id: parsed.data.siteId,
    p_at: parsed.data.at,
  });
  if (error) return { ok: false, error: rpcFail(error, "site_close_at") };
  return { ok: true, data: { closeAt: (data as string | null) ?? null } };
}

// ---------------------------------------------------------------------------
// AI: ảnh → gợi ý điền form (P2-05, US-STO-08). Không bao giờ tự lưu hay tự đăng.
// ---------------------------------------------------------------------------

/** Ảnh gửi lên đã được mã hóa lại ≤ 1024 px ở trình duyệt (xóa EXIF/GPS); trần ~1 MB của Server Action. */
const MAX_AI_IMAGE_BASE64 = 1_300_000;

const aiInput = z.object({
  orgId: z.uuid(),
  image: z.object({
    mediaType: z.enum(["image/jpeg", "image/webp", "image/png"]),
    base64: z
      .string()
      .min(100)
      .max(MAX_AI_IMAGE_BASE64)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  }),
});

export type AiDraftResult =
  { ok: true; data: AiOfferDraft } | { ok: false; reason: AiDraftFailure; message: string };

const aiFail = (reason: AiDraftFailure): AiDraftResult => ({
  ok: false,
  reason,
  message: AI_FAILURE_MESSAGES[reason],
});

export async function draftOfferFromPhoto(input: z.input<typeof aiInput>): Promise<AiDraftResult> {
  const parsed = aiInput.safeParse(input);
  if (!parsed.success) return aiFail("failed");
  const user = await getUser();
  if (!user) return { ok: false, reason: "failed", message: RPC_MESSAGES.unauthenticated };

  const provider = getAiProvider();
  if (!provider) return aiFail("disabled");

  // Người gọi phải là owner/manager/staff đang hoạt động của cửa hàng đã duyệt (RLS: dòng của chính mình)
  const supabase = await createClient();
  const member = await supabase
    .from("org_members")
    .select("role, organizations!inner(kind, status)")
    .eq("org_id", parsed.data.orgId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (
    member.error ||
    !member.data ||
    !["owner", "manager", "staff"].includes(member.data.role) ||
    member.data.organizations.kind !== "store" ||
    member.data.organizations.status !== "approved"
  ) {
    return { ok: false, reason: "failed", message: RPC_MESSAGES.forbidden };
  }

  const quota = await consumeAiOfferQuota(parsed.data.orgId);
  if (quota === "limited") return aiFail("quota");
  if (quota === "unavailable") return aiFail("failed");

  const categories = await loadCategories();
  const result = await provider.extractOfferFromPhoto(
    {
      image: parsed.data.image,
      categories: categories.map((c) => ({ code: c.code, nameVi: c.nameVi, defaultUnit: c.defaultUnit })),
    },
    { signal: AbortSignal.timeout(20_000) },
  );
  if (!result.ok) {
    if (result.reason !== "refused" && result.reason !== "invalid_output") {
      console.warn("[offers-ai] extract failed", { reason: result.reason });
    }
    switch (result.reason) {
      case "refused":
      case "timeout":
      case "invalid_output":
      case "rate_limited":
      case "disabled":
        return aiFail(result.reason);
      default:
        return aiFail("failed");
    }
  }
  return { ok: true, data: result.data };
}
