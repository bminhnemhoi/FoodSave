import { ArrowRight, LogOut, Mail, MessageSquareQuote } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Wordmark } from "@/components/brand/wordmark";
import { StatusBadge } from "@/components/labels/status-badge";
import { SkipLink } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import type { Membership } from "@/core/access/portal";
import { signOut } from "@/features/auth/actions";
import { ORG_KIND_LABEL, statusCopy, type StatusCta } from "@/features/organizations/status-copy";
import { SUPPORT_EMAIL } from "@/lib/contact";
import { getViewerContext } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Trạng thái hồ sơ" };

function CtaButton({ cta, membership }: { cta: StatusCta; membership: Membership }) {
  switch (cta.kind) {
    case "portal":
      return (
        <Button asChild>
          <Link href={membership.org.kind === "store" ? "/store" : "/charity"}>
            {cta.label}
            <ArrowRight aria-hidden />
          </Link>
        </Button>
      );
    case "onboarding":
      return (
        <Button asChild>
          <Link href="/onboarding">
            {cta.label}
            <ArrowRight aria-hidden />
          </Link>
        </Button>
      );
    case "contact":
      return (
        <Button asChild variant="outline">
          <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Hồ sơ ${membership.org.name}`)}`}>
            <Mail aria-hidden />
            {cta.label}
          </a>
        </Button>
      );
  }
}

function OrgStatusCard({ membership, highlighted }: { membership: Membership; highlighted: boolean }) {
  const { org } = membership;
  const copy = statusCopy(org.status, org.kind);
  const isVolunteer = membership.role === "volunteer";
  const headingId = `org-${org.id}`;

  return (
    <article
      aria-labelledby={headingId}
      className={
        highlighted
          ? "flex flex-col gap-4 rounded-xl border-2 border-primary/40 bg-surface p-5 shadow-1 sm:p-6"
          : "flex flex-col gap-4 rounded-xl border bg-surface p-5 sm:p-6"
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-ink-subtle">
            {ORG_KIND_LABEL[org.kind]}
            {isVolunteer ? " · bạn là tình nguyện viên" : null}
          </p>
          <h2 id={headingId} className="text-lg font-semibold break-words">
            {org.name}
          </h2>
        </div>
        <StatusBadge status={org.status} />
      </div>

      <div className="flex flex-col gap-2">
        <p className="font-semibold">{copy.title}</p>
        <p className="text-ink-muted">{copy.body}</p>
      </div>

      {copy.showReason ? (
        <div className="flex gap-3 rounded-lg border border-warning/30 bg-warning-soft p-4">
          <MessageSquareQuote aria-hidden className="mt-0.5 size-5 shrink-0 text-warning" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">Lý do từ FoodSave</p>
            <p className="text-sm break-words whitespace-pre-line text-ink">
              {org.rejectionReason?.trim() || "FoodSave chưa ghi lý do. Hãy liên hệ để được giải thích."}
            </p>
          </div>
        </div>
      ) : null}

      {copy.steps.length > 0 ? (
        <div>
          <p className="text-sm font-semibold">Bước tiếp theo</p>
          <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-5 text-ink-muted marker:font-semibold marker:text-ink">
            {copy.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </div>
      ) : null}

      {copy.cta && !(isVolunteer && copy.cta.kind === "onboarding") ? (
        <div className="flex flex-wrap gap-2">
          <CtaButton cta={copy.cta} membership={membership} />
        </div>
      ) : null}
    </article>
  );
}

/**
 * Trang trạng thái hồ sơ (P1-11, US-STO-04): guard cổng chuyển tới đây khi tổ chức chưa `approved`.
 * Giải thích draft / submitted / needs_changes / rejected / suspended / closed và bước tiếp theo.
 */
export default async function OnboardingStatusPage(props: PageProps<"/onboarding/status">) {
  const { profile, memberships } = await getViewerContext("/onboarding/status");
  if (memberships.length === 0) redirect("/onboarding");

  const { org: orgParam } = await props.searchParams;
  const focusId = typeof orgParam === "string" ? orgParam : undefined;
  // Tổ chức được guard chỉ tới hiện đầu tiên
  const ordered = [...memberships].sort((a, b) => Number(b.orgId === focusId) - Number(a.orgId === focusId));

  return (
    <div className="flex flex-1 flex-col">
      <SkipLink />
      <header className="border-b bg-surface">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between px-4 sm:px-8">
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
        </div>
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-8 outline-none sm:px-8"
      >
        <PageHeader
          title="Trạng thái hồ sơ"
          description={`Xin chào ${profile.fullName}. Đây là tình trạng duyệt của các cửa hàng và tổ chức bạn tham gia.`}
          className="pb-2"
        />
        {ordered.map((m) => (
          <OrgStatusCard
            key={m.orgId}
            membership={m}
            highlighted={m.orgId === focusId && ordered.length > 1}
          />
        ))}
        <p className="text-sm text-ink-subtle">
          Cần hỗ trợ? Gửi email tới{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="font-medium text-primary underline underline-offset-4"
          >
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </main>
    </div>
  );
}
