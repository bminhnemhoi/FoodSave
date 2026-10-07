"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signIn } from "../actions";
import { initialFormState } from "../schemas";
import { FormMessage, SubmitButton, TextField } from "./form-bits";

export function LoginForm({ next, notice }: { next?: string; notice?: string }) {
  const [state, action] = useActionState(signIn, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {notice && state.status === "idle" ? (
        <FormMessage state={{ status: "error", message: notice }} />
      ) : null}
      <FormMessage state={state} />
      <input type="hidden" name="next" value={next ?? ""} />
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
        autoComplete="current-password"
        required
        error={state.fieldErrors?.password}
      />
      <div className="-mt-2 text-right text-sm">
        <Link href="/forgot-password" className="font-medium text-primary underline-offset-4 hover:underline">
          Quên mật khẩu?
        </Link>
      </div>
      <SubmitButton pendingText="Đang đăng nhập…">Đăng nhập</SubmitButton>
    </form>
  );
}
