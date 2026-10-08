import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthShell } from "@/features/auth/components/auth-shell";
import { RegisterForm } from "@/features/auth/components/register-form";
import { safeNextPath } from "@/features/auth/schemas";
import { getUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Đăng ký" };

export default async function RegisterPage(props: PageProps<"/register">) {
  const params = await props.searchParams;
  const rawNext = typeof params.next === "string" ? params.next : undefined;
  const next = rawNext ? safeNextPath(rawNext) : undefined;
  if (await getUser()) redirect(next ?? "/onboarding");
  const fromInvite = next?.startsWith("/invite/") ?? false;

  return (
    <AuthShell
      scene="register"
      title="Tạo tài khoản FoodSave"
      description={
        fromInvite
          ? "Dùng đúng địa chỉ email đã nhận thư mời. Sau khi xác nhận email, bạn quay lại trang nhận lời mời."
          : "Sau khi xác nhận email, bạn chọn đăng ký hồ sơ cửa hàng hoặc tổ chức từ thiện để FoodSave xét duyệt."
      }
      footer={
        <>
          Đã có tài khoản?{" "}
          <Link
            href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Đăng nhập
          </Link>
        </>
      }
    >
      <RegisterForm next={next} />
    </AuthShell>
  );
}
