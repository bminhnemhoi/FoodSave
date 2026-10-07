import { KeyRound, LogOut, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Wordmark } from "@/components/brand/wordmark";
import { SkipLink } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/layout/empty-state";
import { RoleBadge } from "@/components/layout/role-badge";
import { Button } from "@/components/ui/button";
import { signOut } from "@/features/auth/actions";
import { SUPPORT_EMAIL } from "@/lib/contact";
import { requireAdmin } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Xác thực hai lớp — Admin" };

/**
 * Admin phải có phiên aal2 (TOTP) mới vào /admin (F-62). Giao diện đăng ký/thử thách TOTP thuộc P1-10;
 * trang này giữ chỗ trung thực và là đích chuyển hướng của guard.
 */
export default async function AdminMfaPage() {
  const { profile, aal } = await requireAdmin({ allowAal1: true });
  if (aal === "aal2") redirect("/admin");

  return (
    <div className="flex flex-1 flex-col">
      <SkipLink />
      <header className="border-b bg-surface">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center gap-3 px-4 sm:px-8">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center rounded-md"
            aria-label="FoodSave — trang chủ"
          >
            <Wordmark className="text-xl" />
          </Link>
          <RoleBadge role="admin" />
          <form action={signOut} className="ml-auto">
            <Button type="submit" variant="ghost" size="sm" className="min-h-11">
              <LogOut aria-hidden />
              Đăng xuất
            </Button>
          </form>
        </div>
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10 outline-none sm:px-8"
      >
        <h1 className="text-[1.625rem] leading-[2.125rem] font-bold md:text-[1.875rem] md:leading-[2.375rem]">
          Cần xác thực hai lớp
        </h1>
        <EmptyState
          icon={KeyRound}
          title="Tính năng mở ở giai đoạn P1"
          description={
            <div className="flex flex-col gap-3">
              <p>
                Xin chào {profile.fullName}. Khu vực quản trị chỉ mở khi phiên đăng nhập đã qua xác thực hai
                lớp bằng mã TOTP (ứng dụng như Google Authenticator). Đây là yêu cầu bắt buộc với mọi tài
                khoản Admin.
              </p>
              <p>
                Màn đăng ký và nhập mã xác thực đang được hoàn thiện. Trong lúc chờ, hãy liên hệ người phụ
                trách kỹ thuật qua{" "}
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="font-medium text-primary underline underline-offset-4"
                >
                  {SUPPORT_EMAIL}
                </a>
                .
              </p>
            </div>
          }
        />
        <p className="flex items-start gap-2 text-sm text-ink-muted">
          <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
          Mọi thao tác duyệt của Admin đều được cơ sở dữ liệu kiểm tra lại mức xác thực, kể cả khi gọi trực
          tiếp.
        </p>
      </main>
    </div>
  );
}
