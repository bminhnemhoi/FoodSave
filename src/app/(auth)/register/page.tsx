import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthShell } from "@/features/auth/components/auth-shell";
import { RegisterForm } from "@/features/auth/components/register-form";
import { getUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Đăng ký" };

export default async function RegisterPage() {
  if (await getUser()) redirect("/onboarding");
  return (
    <AuthShell
      title="Tạo tài khoản FoodSave"
      description="Sau khi xác nhận email, bạn chọn đăng ký hồ sơ cửa hàng hoặc tổ chức từ thiện để FoodSave xét duyệt."
      footer={
        <>
          Đã có tài khoản?{" "}
          <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
            Đăng nhập
          </Link>
        </>
      }
    >
      <RegisterForm />
    </AuthShell>
  );
}
