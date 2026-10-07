"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { FieldError } from "@/components/ui/field";

import { signUp } from "../actions";
import { initialFormState } from "../schemas";
import { FormMessage, SubmitButton, TextField } from "./form-bits";

export function RegisterForm() {
  const [state, action] = useActionState(signUp, initialFormState);

  if (state.status === "success") {
    return (
      <div className="flex flex-col gap-4">
        <FormMessage state={state} />
        <p className="text-sm text-ink-muted">
          Chưa nhận được thư sau 5 phút? Kiểm tra lại địa chỉ email rồi{" "}
          <Link href="/register" className="font-medium text-primary underline-offset-4 hover:underline">
            đăng ký lại
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <FormMessage state={state} />
      <TextField
        label="Họ và tên"
        name="fullName"
        autoComplete="name"
        required
        defaultValue={state.values?.fullName}
        error={state.fieldErrors?.fullName}
      />
      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <TextField
        label="Mật khẩu"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        hint="Ít nhất 8 ký tự, gồm cả chữ và số."
        error={state.fieldErrors?.password}
      />
      <TextField
        label="Nhập lại mật khẩu"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
        error={state.fieldErrors?.confirmPassword}
      />
      <div className="flex flex-col gap-2">
        <label className="flex items-start gap-3 text-sm text-ink-muted">
          <Checkbox
            name="acceptTerms"
            className="mt-0.5"
            aria-invalid={state.fieldErrors?.acceptTerms ? true : undefined}
            aria-describedby={state.fieldErrors?.acceptTerms ? "acceptTerms-error" : undefined}
          />
          <span>
            Tôi đồng ý với{" "}
            <Link href="/terms" className="font-medium text-primary underline-offset-4 hover:underline">
              Điều khoản sử dụng
            </Link>{" "}
            và{" "}
            <Link href="/privacy" className="font-medium text-primary underline-offset-4 hover:underline">
              Chính sách bảo mật
            </Link>
            .
          </span>
        </label>
        {state.fieldErrors?.acceptTerms ? (
          <FieldError id="acceptTerms-error">{state.fieldErrors.acceptTerms}</FieldError>
        ) : null}
      </div>
      <SubmitButton pendingText="Đang tạo tài khoản…">Tạo tài khoản</SubmitButton>
    </form>
  );
}
