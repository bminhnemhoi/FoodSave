import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthShell } from "@/features/auth/components/auth-shell";
import { LoginForm } from "@/features/auth/components/login-form";
import { authErrorMessage } from "@/features/auth/errors";
import { safeNextPath } from "@/features/auth/schemas";
import { getUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Đăng nhập" };

export default async function LoginPage(props: PageProps<"/login">) {
  const params = await props.searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  if (await getUser()) redirect(safeNextPath(next));
  const error = typeof params.error === "string" ? authErrorMessage(params.error) : undefined;

  return (
    <AuthShell
      title="Đăng nhập"
      description="Dùng chung một tài khoản cho cửa hàng, tổ chức từ thiện và tình nguyện viên."
      footer={
        <>
          Chưa có tài khoản?{" "}
          <Link
            href={next ? `/register?next=${encodeURIComponent(safeNextPath(next))}` : "/register"}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Đăng ký
          </Link>
        </>
      }
    >
      <LoginForm next={next} notice={error} />
    </AuthShell>
  );
}
