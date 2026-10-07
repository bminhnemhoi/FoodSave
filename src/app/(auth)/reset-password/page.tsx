import type { Metadata } from "next";

import { AuthShell } from "@/features/auth/components/auth-shell";
import { ResetPasswordForm } from "@/features/auth/components/password-forms";
import { requireUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Đặt mật khẩu mới" };

export default async function ResetPasswordPage() {
  // Liên kết trong email đã tạo phiên khôi phục qua /auth/callback.
  await requireUser("/reset-password");
  return (
    <AuthShell title="Đặt mật khẩu mới" description="Mật khẩu mới sẽ dùng cho lần đăng nhập tiếp theo.">
      <ResetPasswordForm />
    </AuthShell>
  );
}
