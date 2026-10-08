import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/features/auth/components/auth-shell";
import { ForgotPasswordForm } from "@/features/auth/components/password-forms";

export const metadata: Metadata = { title: "Quên mật khẩu" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      scene="recover"
      title="Quên mật khẩu"
      description="Nhập email đã đăng ký, chúng tôi sẽ gửi liên kết để bạn đặt mật khẩu mới."
      footer={
        <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          ← Quay lại đăng nhập
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
