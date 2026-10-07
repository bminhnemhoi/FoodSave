import { LifeBuoy, LogOut, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Wordmark } from "@/components/brand/wordmark";
import { SkipLink } from "@/components/layout/app-shell";
import { RoleBadge } from "@/components/layout/role-badge";
import { Button } from "@/components/ui/button";
import { signOut } from "@/features/auth/actions";
import { MfaChallengeForm, MfaEnrollPanel } from "@/features/mfa/components/mfa-forms";
import { safeAdminNext } from "@/features/mfa/schemas";
import { SUPPORT_EMAIL } from "@/lib/contact";
import { requireAdmin } from "@/server/auth/guards";
import { createClient } from "@/server/db/supabase";

export const metadata: Metadata = { title: "Xác thực hai lớp — Admin" };

/**
 * Admin MFA TOTP (P1-10, F-62, US-ADM-01). Guard `(console)` chuyển phiên aal1 tới đây.
 * - Chưa có yếu tố TOTP đã xác minh ⇒ đăng ký (QR + khóa bí mật + mã đầu tiên).
 * - Đã có ⇒ nhập mã 6 số. Thành công ⇒ phiên aal2, quay lại `next` (trong /admin) hoặc hàng đợi duyệt.
 */
export default async function AdminMfaPage(props: PageProps<"/admin/mfa">) {
  const { profile, aal } = await requireAdmin({ allowAal1: true });
  const { next: rawNext } = await props.searchParams;
  const next = safeAdminNext(typeof rawNext === "string" ? rawNext : undefined);
  if (aal === "aal2") redirect(next);

  const supabase = await createClient();
  const { data: factors, error } = await supabase.auth.mfa.listFactors();
  if (error) throw new Error(`Không tải được thiết lập xác thực (${error.code ?? "unknown"})`);
  const enrolled = factors.totp.length > 0;

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
        className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 outline-none sm:px-8 sm:py-10"
      >
        <div className="flex flex-col gap-2">
          <h1 className="text-[1.625rem] leading-[2.125rem] font-bold md:text-[1.875rem] md:leading-[2.375rem]">
            Xác thực hai lớp
          </h1>
          <p className="max-w-prose text-ink-muted">
            {enrolled
              ? `Xin chào ${profile.fullName}. Nhập mã từ ứng dụng xác thực trên điện thoại để vào khu vực quản trị.`
              : `Xin chào ${profile.fullName}. Tài khoản Admin bắt buộc dùng mã xác thực (TOTP) ngoài mật khẩu. Thiết lập một lần, mất khoảng 1 phút.`}
          </p>
        </div>

        {enrolled ? (
          <section
            aria-labelledby="mfa-challenge-title"
            className="flex flex-col gap-4 rounded-xl border bg-surface p-5 sm:p-6"
          >
            <h2 id="mfa-challenge-title" className="text-lg font-semibold">
              Nhập mã xác thực
            </h2>
            <MfaChallengeForm next={next} />
          </section>
        ) : (
          <MfaEnrollPanel next={next} />
        )}

        <div className="flex flex-col gap-3 text-sm text-ink-muted">
          <p className="flex items-start gap-2">
            <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
            Mọi thao tác duyệt của Admin đều được cơ sở dữ liệu kiểm tra lại mức xác thực, kể cả khi gọi trực
            tiếp.
          </p>
          <p className="flex items-start gap-2">
            <LifeBuoy aria-hidden className="mt-0.5 size-4 shrink-0 text-info" />
            <span>
              Mất điện thoại hoặc không còn ứng dụng xác thực? Liên hệ{" "}
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="font-medium text-primary underline underline-offset-4"
              >
                {SUPPORT_EMAIL}
              </a>{" "}
              để được gỡ thiết lập theo thủ tục bảo mật (có ghi nhật ký).
            </span>
          </p>
        </div>
      </main>
    </div>
  );
}
