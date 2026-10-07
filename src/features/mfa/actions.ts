"use server";

import { randomUUID } from "node:crypto";

import { redirect } from "next/navigation";
import { z } from "zod";

import { checkAdminAction } from "@/server/auth/admin-action";
import { createClient } from "@/server/db/supabase";

import { mfaErrorMessage } from "./errors";
import { type MfaFormState, qrCodeDataUri, safeAdminNext, totpCodeSchema } from "./schemas";

/**
 * Admin MFA TOTP (F-62, US-ADM-01, P1-10). Mọi lệnh chạy bằng client Supabase của chính người dùng
 * (cookie phiên); xác thực thành công ⇒ @supabase/ssr ghi phiên aal2 vào cookie, rồi chuyển hướng.
 * DB vẫn tự kiểm `aal2` trong `private.is_admin()` — UI chỉ là lớp thứ nhất.
 */

export type EnrollmentResult =
  { ok: true; factorId: string; qrCode: string; secret: string } | { ok: false; message: string };

function denied(reason: "not_authenticated" | "not_admin" | "mfa_required"): string {
  return mfaErrorMessage(reason === "not_admin" ? "not_admin" : "not_authenticated");
}

/** Bắt đầu đăng ký TOTP: dọn yếu tố chưa xác minh (tránh tích lũy khi tải lại trang), tạo yếu tố mới. */
export async function startTotpEnrollment(): Promise<EnrollmentResult> {
  const check = await checkAdminAction({ allowAal1: true });
  if (!check.ok) return { ok: false, message: denied(check.reason) };

  const supabase = await createClient();
  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) return { ok: false, message: mfaErrorMessage(listError.code) };
  if (factors.totp.length > 0) {
    return {
      ok: false,
      message: "Tài khoản đã có ứng dụng xác thực. Tải lại trang để nhập mã từ ứng dụng đó.",
    };
  }

  for (const f of factors.all) {
    if (f.factor_type === "totp" && f.status === "unverified") {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    issuer: "FoodSave",
    friendlyName: `FoodSave Admin ${randomUUID().slice(0, 8)}`,
  });
  if (error || !data) return { ok: false, message: mfaErrorMessage(error?.code) };

  return { ok: true, factorId: data.id, qrCode: qrCodeDataUri(data.totp.qr_code), secret: data.totp.secret };
}

const enrollFormSchema = z.object({
  factorId: z.uuid(),
  code: totpCodeSchema,
  next: z.string().optional(),
});

/** Xác minh mã đầu tiên của yếu tố vừa tạo ⇒ yếu tố `verified` + phiên aal2. */
export async function verifyTotpEnrollment(_prev: MfaFormState, formData: FormData): Promise<MfaFormState> {
  const parsed = enrollFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const codeIssue = parsed.error.issues.find((i) => i.path[0] === "code");
    return codeIssue
      ? { status: "error", fieldError: codeIssue.message }
      : { status: "error", message: mfaErrorMessage("mfa_factor_not_found") };
  }

  const check = await checkAdminAction({ allowAal1: true });
  if (!check.ok) return { status: "error", message: denied(check.reason) };

  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: parsed.data.factorId,
    code: parsed.data.code,
  });
  if (error) {
    const message = mfaErrorMessage(error.code);
    return error.code === "mfa_verification_failed"
      ? { status: "error", fieldError: message }
      : { status: "error", message };
  }
  redirect(safeAdminNext(parsed.data.next));
}

const challengeFormSchema = z.object({ code: totpCodeSchema, next: z.string().optional() });

/** Phiên aal1 của Admin đã có TOTP: nhập mã ⇒ phiên aal2. Yếu tố lấy phía server (không tin client). */
export async function verifyTotpChallenge(_prev: MfaFormState, formData: FormData): Promise<MfaFormState> {
  const parsed = challengeFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", fieldError: parsed.error.issues[0]?.message ?? mfaErrorMessage(null) };
  }

  const check = await checkAdminAction({ allowAal1: true });
  if (!check.ok) return { status: "error", message: denied(check.reason) };

  const supabase = await createClient();
  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp[0];
  if (listError || !factor) {
    return { status: "error", message: mfaErrorMessage(listError?.code ?? "mfa_factor_not_found") };
  }

  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: factor.id,
    code: parsed.data.code,
  });
  if (error) {
    const message = mfaErrorMessage(error.code);
    return error.code === "mfa_verification_failed"
      ? { status: "error", fieldError: message }
      : { status: "error", message };
  }
  redirect(safeAdminNext(parsed.data.next));
}
