import { ArrowRight, HandHeart, LogOut, Store } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Wordmark } from "@/components/brand/wordmark";
import { StatusBadge } from "@/components/labels/status-badge";
import { Button } from "@/components/ui/button";
import type { Membership } from "@/core/access/portal";
import { signOut } from "@/features/auth/actions";
import { ORG_KIND_LABEL } from "@/features/organizations/status-copy";
import { getViewerContext } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Bắt đầu" };

const CHOICES = [
  {
    kind: "store",
    icon: Store,
    title: "Tôi đại diện cửa hàng",
    body: "Tiệm bánh, nhà hàng, cửa hàng tiện lợi, siêu thị… có thực phẩm dư muốn trao tặng.",
    start: "Đăng ký cửa hàng",
    resume: "Mở hồ sơ cửa hàng",
  },
  {
    kind: "charity",
    icon: HandHeart,
    title: "Tôi đại diện tổ chức từ thiện",
    body: "Mái ấm, bếp ăn từ thiện, viện dưỡng lão… cần nhận thực phẩm cho người được hỗ trợ.",
    start: "Đăng ký tổ chức",
    resume: "Mở hồ sơ tổ chức",
  },
] as const;

function orgCta(m: Membership): { href: string; label: string } {
  const { org } = m;
  switch (org.status) {
    case "draft":
      return { href: `/onboarding/${org.kind}`, label: "Tiếp tục hồ sơ" };
    case "needs_changes":
      return { href: `/onboarding/${org.kind}`, label: "Sửa hồ sơ" };
    case "approved":
      return {
        href: org.kind === "store" ? "/store" : "/charity",
        label: org.kind === "store" ? "Vào cổng Cửa hàng" : "Vào cổng Tổ chức",
      };
    default:
      return { href: `/onboarding/status?org=${encodeURIComponent(org.id)}`, label: "Xem trạng thái" };
  }
}

/** Chọn vai trò và mở wizard (P1-02). Hồ sơ đang có hiện trạng thái + nút làm tiếp. */
export default async function OnboardingPage(props: PageProps<"/onboarding">) {
  const { profile, memberships } = await getViewerContext("/onboarding");
  const params = await props.searchParams;
  const owned = memberships.filter((m) => m.role === "owner" && m.org.status !== "closed");

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-8 sm:px-8">
      <header className="flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center rounded-md"
          aria-label="FoodSave — trang chủ"
        >
          <Wordmark className="text-xl" />
        </Link>
        <form action={signOut}>
          <Button type="submit" variant="ghost" size="sm" className="min-h-11">
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
        <h1 className="text-[1.75rem] font-bold">Xin chào {profile.fullName}!</h1>
        <p className="mt-2 text-ink-muted">
          {owned.length > 0
            ? "Đây là các hồ sơ bạn đang quản lý. Bạn có thể làm tiếp hoặc đăng ký thêm."
            : "Tài khoản của bạn đã sẵn sàng. Bạn tham gia FoodSave với vai trò nào?"}
        </p>
      </section>

      {owned.length > 0 ? (
        <section aria-labelledby="my-orgs" className="flex flex-col gap-3">
          <h2 id="my-orgs" className="text-lg font-semibold">
            Hồ sơ của bạn
          </h2>
          <ul className="flex flex-col gap-3">
            {owned.map((m) => {
              const cta = orgCta(m);
              return (
                <li
                  key={m.orgId}
                  className="flex flex-col gap-3 rounded-lg border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
                >
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <p className="text-sm text-ink-subtle">{ORG_KIND_LABEL[m.org.kind]}</p>
                    <p className="font-semibold break-words">{m.org.name}</p>
                    <StatusBadge status={m.org.status} />
                  </div>
                  <Button asChild className="min-h-11 w-full sm:w-auto">
                    <Link href={cta.href}>
                      {cta.label}
                      <span className="sr-only">: {m.org.name}</span>
                      <ArrowRight aria-hidden />
                    </Link>
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="choose-role" className="flex flex-col gap-3">
        {owned.length > 0 ? (
          <h2 id="choose-role" className="text-lg font-semibold">
            Đăng ký thêm
          </h2>
        ) : (
          <h2 id="choose-role" className="sr-only">
            Chọn vai trò
          </h2>
        )}
        <ul className="grid gap-4 sm:grid-cols-2">
          {CHOICES.map(({ kind, icon: Icon, title, body, start, resume }) => {
            const hasOne = owned.some((m) => m.org.kind === kind);
            return (
              <li
                key={kind}
                data-role={kind}
                className="flex flex-col gap-3 rounded-lg border bg-surface p-6 shadow-1"
              >
                <Icon aria-hidden className="size-7 text-role-accent" />
                <p className="text-lg font-semibold">{title}</p>
                <p className="text-sm text-ink-muted">{body}</p>
                <Button asChild variant={hasOne ? "outline" : "default"} className="mt-auto min-h-11 w-fit">
                  <Link href={`/onboarding/${kind}`}>
                    {hasOne ? resume : start}
                    <ArrowRight aria-hidden />
                  </Link>
                </Button>
              </li>
            );
          })}
        </ul>
      </section>

      <p className="text-sm text-ink-subtle">
        Tình nguyện viên tham gia qua lời mời từ tổ chức từ thiện — bạn sẽ nhận email mời riêng.
      </p>
    </main>
  );
}
