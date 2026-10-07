"use client";

import { useActionState } from "react";

import { requestPasswordReset, updatePassword } from "../actions";
import { initialFormState } from "../schemas";
import { FormMessage, SubmitButton, TextField } from "./form-bits";

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordReset, initialFormState);
  if (state.status === "success") return <FormMessage state={state} />;
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <FormMessage state={state} />
      <TextField
        label="Email đã đăng ký"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        error={state.fieldErrors?.email}
      />
      <SubmitButton pendingText="Đang gửi…">Gửi liên kết đặt lại</SubmitButton>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action] = useActionState(updatePassword, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <FormMessage state={state} />
      <TextField
        label="Mật khẩu mới"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        hint="Ít nhất 8 ký tự, gồm cả chữ và số."
        error={state.fieldErrors?.password}
      />
      <TextField
        label="Nhập lại mật khẩu mới"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
        error={state.fieldErrors?.confirmPassword}
      />
      <SubmitButton pendingText="Đang lưu…">Lưu mật khẩu mới</SubmitButton>
    </form>
  );
}
