import { HandHeart, LogOut, Store } from "lucide-react";
import type { Metadata } from "next";

import { Wordmark } from "@/components/brand/wordmark";
import { Button } from "@/components/ui/button";
import { signOut } from "@/features/auth/actions";
import { requireUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Bắt đầu" };

const CHOICES = [
  {
    icon: Store,
    title: "Tôi đại diện cửa hàng",
    body: "Tiệm bánh, nhà hàng, cửa hàng tiện lợi, siêu thị… có thực phẩm dư muốn trao tặng.",
  },
  {
    icon: HandHeart,
    title: "Tôi đại diện tổ chức từ thiện",
    body: "Mái ấm, bếp ăn từ thiện, viện dưỡng lão… cần nhận thực phẩm cho người hưởng lợi.",
  },
];

export default async function OnboardingPage(props: PageProps<"/onboarding">) {
  const user = await requireUser("/onboarding");
  const params = await props.searchParams;
  const name = (user.user_metadata?.full_name as string | undefined) ?? user.email;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-8 sm:px-8">
      <header className="flex items-center justify-between">
        <Wordmark className="text-xl" />
        <form action={signOut}>
          <Button type="submit" variant="ghost" size="sm">
            <LogOut aria-hidden />
            Đăng xuất
          </Button>
        </form>
      </header>

      {params.password === "updated" ? (
        <p role="status" className="rounded-lg bg-success-soft p-4 text-sm text-success">
          Đã cập nhật mật khẩu.
        </p>
      ) : null}

      <section>
        <h1 className="text-[1.75rem] font-bold">Xin chào {name}!</h1>
        <p className="mt-2 text-ink-muted">
          Tài khoản của bạn đã sẵn sàng. Bạn tham gia FoodSave với vai trò nào?
        </p>
      </section>

      <ul className="grid gap-4 sm:grid-cols-2">
        {CHOICES.map(({ icon: Icon, title, body }) => (
          <li key={title} className="flex flex-col gap-3 rounded-lg border bg-surface p-6 shadow-1">
            <Icon aria-hidden className="size-7 text-primary" />
            <p className="text-lg font-semibold">{title}</p>
            <p className="text-sm text-ink-muted">{body}</p>
            <Button variant="outline" disabled className="mt-auto w-fit">
              Mở từ 12/10 (giai đoạn P1)
            </Button>
          </li>
        ))}
      </ul>

      <p className="text-sm text-ink-subtle">
        Tình nguyện viên tham gia qua lời mời từ tổ chức từ thiện — bạn sẽ nhận email mời riêng.
      </p>
    </main>
  );
}
