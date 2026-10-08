import { ArrowRight, HandHeart, LogOut, Store } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { displayFont } from "@/components/brand/fonts";
import { photo } from "@/components/brand/photos";
import { Wordmark } from "@/components/brand/wordmark";
import { StatusBadge } from "@/components/labels/status-badge";
import { Button } from "@/components/ui/button";
import type { Membership } from "@/core/access/portal";
import { signOut } from "@/features/auth/actions";
import { portalAfterAccept } from "@/features/members/schemas";
import { ORG_ROLE_LABEL } from "@/features/organizations/labels";
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
    photo: photo("banh-mi-que"),
  },
  {
    kind: "charity",
    icon: HandHeart,
    title: "Tôi đại diện tổ chức từ thiện",
    body: "Mái ấm, bếp ăn từ thiện, viện dưỡng lão… cần nhận thực phẩm cho người được hỗ trợ.",
    start: "Đăng ký tổ chức",
    resume: "Mở hồ sơ tổ chức",
    photo: photo("chia-suat-an"),
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
  // Tham gia qua lời mời (quản lý, nhân viên, tình nguyện viên) — vào thẳng cổng của tổ chức đã duyệt
  const joined = memberships.filter((m) => m.role !== "owner" && m.org.status === "approved");

  return (
    <main
      className={`${displayFont.variable} mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-8 sm:px-8`}
    >
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
        <h1 className="font-display text-[2rem] leading-tight font-extrabold">
          Xin chào {profile.fullName}!
        </h1>
        <p className="mt-2 text-ink-muted">
          {owned.length > 0
            ? "Đây là các hồ sơ bạn đang quản lý. Bạn có thể làm tiếp hoặc đăng ký thêm."
            : joined.length > 0
              ? "Bạn đang tham gia tổ chức bên dưới. Bạn cũng có thể đăng ký hồ sơ cửa hàng hoặc tổ chức của riêng mình."
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

      {joined.length > 0 ? (
        <section aria-labelledby="joined-orgs" className="flex flex-col gap-3">
          <h2 id="joined-orgs" className="text-lg font-semibold">
            Tổ chức bạn tham gia
          </h2>
          <ul className="flex flex-col gap-3">
            {joined.map((m) => (
              <li
                key={m.orgId}
                className="flex flex-col gap-3 rounded-lg border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
              >
                <div className="flex min-w-0 flex-col gap-1.5">
                  <p className="text-sm text-ink-subtle">
                    {ORG_KIND_LABEL[m.org.kind]} · {ORG_ROLE_LABEL[m.role]}
                  </p>
                  <p className="font-semibold break-words">{m.org.name}</p>
                </div>
                <Button asChild className="min-h-11 w-full sm:w-auto">
                  <Link href={portalAfterAccept(m.role, m.org.kind)}>
                    {m.role === "volunteer" ? "Mở ứng dụng Tình nguyện viên" : "Vào cổng làm việc"}
                    <span className="sr-only">: {m.org.name}</span>
                    <ArrowRight aria-hidden />
                  </Link>
                </Button>
              </li>
            ))}
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
          {CHOICES.map(({ kind, icon: Icon, title, body, start, resume, photo: p }) => {
            const hasOne = owned.some((m) => m.org.kind === kind);
            return (
              <li
                key={kind}
                data-role={kind}
                className="flex flex-col overflow-hidden rounded-xl border bg-surface shadow-1"
              >
                <div className="relative aspect-[16/9]">
                  <Image
                    src={p.src}
                    alt=""
                    fill
                    placeholder="blur"
                    sizes="(min-width: 640px) 360px, 92vw"
                    className="object-cover"
                  />
                  <span className="absolute bottom-3 left-3 grid size-11 place-items-center rounded-xl bg-surface text-role-accent shadow-2">
                    <Icon aria-hidden className="size-6" />
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-3 p-6">
                  <p className="text-lg font-semibold">{title}</p>
                  <p className="text-sm text-ink-muted">{body}</p>
                  <Button asChild variant={hasOne ? "outline" : "default"} className="mt-auto min-h-11 w-fit">
                    <Link href={`/onboarding/${kind}`}>
                      {hasOne ? resume : start}
                      <ArrowRight aria-hidden />
                    </Link>
                  </Button>
                </div>
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
