"use server";

import { redirect } from "next/navigation";

import { registerWithEmail, sendPasswordReset } from "@/server/auth/emails";
import { createClient } from "@/server/db/supabase";

import { authErrorMessage } from "./errors";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  safeNextPath,
  signInSchema,
  signUpSchema,
  toFieldErrors,
  type FormState,
} from "./schemas";

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = Object.fromEntries(formData);
  const parsed = signInSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: toFieldErrors(parsed.error),
      values: { email: String(raw.email ?? "") },
    };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) {
    return { status: "error", message: authErrorMessage(error.code), values: { email: parsed.data.email } };
  }
  redirect(safeNextPath(parsed.data.next));
}

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = Object.fromEntries(formData);
  const parsed = signUpSchema.safeParse(raw);
  const values = { fullName: String(raw.fullName ?? ""), email: String(raw.email ?? "") };
  if (!parsed.success) return { status: "error", fieldErrors: toFieldErrors(parsed.error), values };

  // ADR-012: FoodSave tự gửi thư xác nhận. KHÔNG gửi vai trò — vai trò chỉ được gán phía server (B1).
  const result = await registerWithEmail({
    email: parsed.data.email,
    password: parsed.data.password,
    fullName: parsed.data.fullName,
  });
  if (!result.ok) {
    return {
      status: "error",
      message:
        result.reason === "rate_limited"
          ? authErrorMessage("over_email_send_rate_limit")
          : "Chưa gửi được thư xác nhận. Vui lòng thử lại sau ít phút.",
      values,
    };
  }
  // Cùng một thông báo dù email đã tồn tại hay chưa (không dò được tài khoản).
  return {
    status: "success",
    message: `Đã gửi thư xác nhận tới ${parsed.data.email}. Mở hộp thư (kể cả mục Quảng cáo/Spam) và bấm vào liên kết để kích hoạt tài khoản.`,
  };
}

export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = forgotPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  const result = await sendPasswordReset(parsed.data.email);
  if (!result.ok && result.reason === "rate_limited") {
    return { status: "error", message: authErrorMessage("over_email_send_rate_limit") };
  }
  return {
    status: "success",
    message: "Nếu email này đã đăng ký, bạn sẽ nhận được liên kết đặt lại mật khẩu trong vài phút.",
  };
}

export async function updatePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = resetPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: toFieldErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { status: "error", message: authErrorMessage(error.code) };
  redirect("/onboarding?password=updated");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
