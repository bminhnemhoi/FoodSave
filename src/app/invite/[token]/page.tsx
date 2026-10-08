import { LogIn, UserPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { signOut } from "@/features/auth/actions";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { AcceptInviteForm } from "@/features/members/components/accept-invite-form";
import { invitePath, isInviteToken } from "@/features/members/schemas";
import { getUser } from "@/server/auth/session";

export const metadata: Metadata = {
  title: "Nhận lời mời",
  // Token nằm trong đường dẫn: không lập chỉ mục, không gửi Referer ra ngoài
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * Nhận lời mời thành viên / tình nguyện viên (F-01, F-09, F-32, US-STO-06, US-CHA-14 AC2, US-VOL-01 AC1).
 * Chưa đăng nhập ⇒ đăng nhập hoặc tạo tài khoản rồi quay lại đây (`next`). Đã đăng nhập ⇒ nút "Nhận lời mời"
 * gọi `accept_invite` (DB kiểm email khớp, hạn 7 ngày, dùng một lần) rồi chuyển vào đúng cổng.
 */
export default async function InvitePage(props: PageProps<"/invite/[token]">) {
  const { token } = await props.params;

  if (!isInviteToken(token)) {
    return (
      <AuthShell
        title="Liên kết mời không hợp lệ"
        description="Liên kết có thể bị cắt mất khi sao chép. Hãy mở lại đúng nút trong email mời, hoặc nhờ người mời gửi lại."
      >
        <Button asChild variant="outline" size="lg" className="min-h-12 w-full">
          <Link href="/">Về trang chủ FoodSave</Link>
        </Button>
      </AuthShell>
    );
  }

  const next = invitePath(token);
  const user = await getUser();

  if (!user) {
    return (
      <AuthShell
        title="Bạn được mời tham gia FoodSave"
        description="Một cửa hàng hoặc tổ chức từ thiện đã mời bạn cùng làm việc trên FoodSave. Đăng nhập (hoặc tạo tài khoản) bằng đúng email đã nhận thư mời để nhận lời mời."
      >
        <div className="flex flex-col gap-3">
          <Button asChild size="lg" className="min-h-12 w-full">
            <Link href={`/login?next=${encodeURIComponent(next)}`}>
              <LogIn aria-hidden />
              Đăng nhập để nhận lời mời
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="min-h-12 w-full">
            <Link href={`/register?next=${encodeURIComponent(next)}`}>
              <UserPlus aria-hidden />
              Tạo tài khoản mới
            </Link>
          </Button>
          <p className="text-sm text-ink-muted">
            Lời mời có hiệu lực 7 ngày và chỉ dùng được một lần. Tình nguyện viên không cần FoodSave duyệt hồ
            sơ.
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Nhận lời mời"
      description="Bấm nhận để tham gia tổ chức đã mời bạn. Bạn sẽ được chuyển vào đúng cổng làm việc."
      footer={
        <form action={signOut} className="flex flex-wrap items-center gap-1">
          <input type="hidden" name="next" value={next} />
          Không phải tài khoản này?
          <button
            type="submit"
            className="min-h-11 rounded-sm px-1 font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            Đăng xuất
          </button>
        </form>
      }
    >
      <AcceptInviteForm token={token} email={user.email ?? null} />
    </AuthShell>
  );
}
