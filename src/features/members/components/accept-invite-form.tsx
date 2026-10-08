"use client";

import { CircleAlert, Home, Loader2, LogOut, UserCheck } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { signOut } from "@/features/auth/actions";

import { acceptInvite, type AcceptInviteState } from "../actions";
import { invitePath } from "../schemas";

function AcceptButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="min-h-12 w-full" disabled={pending} aria-disabled={pending}>
      {pending ? <Loader2 aria-hidden className="animate-spin" /> : <UserCheck aria-hidden />}
      {pending ? "Đang nhận lời mời…" : "Nhận lời mời"}
    </Button>
  );
}

/** Nút "Nhận lời mời" (POST qua Server Action — không nhận lời mời bằng GET/prefetch). */
export function AcceptInviteForm({ token, email }: { token: string; email: string | null }) {
  const [state, action] = useActionState<AcceptInviteState, FormData>(acceptInvite, { status: "idle" });
  const failed = state.status === "error";

  return (
    <div className="flex flex-col gap-5">
      {failed ? (
        <div
          role="alert"
          className="flex gap-3 rounded-lg border border-danger/30 bg-danger-soft p-4 text-sm"
        >
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-danger" />
          <p className="text-ink">{state.message}</p>
        </div>
      ) : null}

      {failed && state.code === "email_mismatch" ? (
        <form action={signOut}>
          <input type="hidden" name="next" value={invitePath(token)} />
          <Button type="submit" size="lg" className="min-h-12 w-full">
            <LogOut aria-hidden />
            Đăng xuất để đăng nhập bằng email khác
          </Button>
        </form>
      ) : failed &&
        ["token_invalid", "token_expired", "token_consumed", "org_not_active"].includes(state.code) ? (
        <Button asChild variant="outline" size="lg" className="min-h-12 w-full">
          <Link href="/onboarding">
            <Home aria-hidden />
            Về trang của bạn
          </Link>
        </Button>
      ) : (
        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="token" value={token} />
          {email ? (
            <p className="text-sm text-ink-muted">
              Bạn đang đăng nhập bằng <strong className="break-all text-ink">{email}</strong>. Lời mời chỉ
              nhận được bằng đúng email đã nhận thư mời.
            </p>
          ) : null}
          <AcceptButton />
        </form>
      )}
    </div>
  );
}
