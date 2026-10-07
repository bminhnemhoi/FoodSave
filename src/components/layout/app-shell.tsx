import { FlaskConical } from "lucide-react";
import Link from "next/link";

import { Wordmark } from "@/components/brand/wordmark";
import { cn } from "@/lib/utils";

import { BodyRole } from "./body-role";
import { BottomTabs } from "./bottom-tabs";
import { MobileNavSheet } from "./mobile-nav-sheet";
import { PORTAL_NAV, type PortalRole } from "./nav-config";
import { RoleBadge } from "./role-badge";
import { Sidebar } from "./sidebar";
import { UserMenu } from "./user-menu";

export type ShellUser = { name: string; email: string | null };

type AppShellProps = {
  role: PortalRole;
  user: ShellUser;
  /** Tổ chức đang làm việc (cửa hàng/tổ chức/TNV). */
  orgName?: string | null;
  /** Tài khoản hoặc tổ chức demo ⇒ DemoBanner (kiểm tra phía server). */
  isDemo?: boolean;
  children: React.ReactNode;
};

export function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only rounded-md bg-surface px-4 py-2 font-medium text-ink shadow-3 focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
    >
      Bỏ qua tới nội dung chính
    </a>
  );
}

function DemoBanner() {
  return (
    <p
      role="note"
      className="flex items-center justify-center gap-2 bg-brand-yellow-soft px-4 py-2 text-center text-sm font-medium text-ink"
    >
      <FlaskConical aria-hidden className="size-4 shrink-0" />
      Bạn đang xem dữ liệu demo — số liệu minh họa, không phải hoạt động thật.
    </p>
  );
}

/**
 * App shell theo vai trò (DESIGN-SYSTEM §10, F-85): sidebar thu gọn (≥ 768 px), bottom tab (mobile),
 * topbar với wordmark · RoleBadge · menu tài khoản. Đặt `data-role` để áp accent vai trò.
 * PWA tình nguyện viên: không sidebar, bottom tab luôn hiện, chữ 17 px (§10.3).
 */
export function AppShell({ role, user, orgName, isDemo = false, children }: AppShellProps) {
  const nav = PORTAL_NAV[role];
  const isVolunteer = role === "volunteer";
  const hasTabs = nav.mobileTabs.length > 0;

  return (
    <div data-role={role} className="flex min-h-dvh w-full flex-1 bg-bg">
      <SkipLink />
      <BodyRole role={role} />
      {isVolunteer ? null : <Sidebar role={role} />}

      <div className="flex min-w-0 flex-1 flex-col">
        {isDemo ? <DemoBanner /> : null}
        <header
          data-app
          className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-surface/95 px-3 backdrop-blur-sm supports-backdrop-filter:bg-surface/85 sm:gap-3 md:px-6"
        >
          {!isVolunteer && !hasTabs ? <MobileNavSheet role={role} /> : null}
          <Link
            href={nav.home}
            aria-label="FoodSave — về trang đầu"
            className={cn("inline-flex min-h-11 items-center rounded-md px-1", !isVolunteer && "md:hidden")}
          >
            <Wordmark className="text-xl" />
          </Link>
          <div className="flex min-w-0 items-center gap-2">
            <RoleBadge role={role} />
            {orgName ? (
              <span
                className={cn(
                  "min-w-0 truncate text-sm font-medium text-ink",
                  isVolunteer ? "max-sm:hidden" : "max-md:hidden",
                )}
              >
                {orgName}
              </span>
            ) : null}
          </div>
          <div className="ml-auto shrink-0">
            <UserMenu name={user.name} email={user.email} orgName={orgName} settingsHref={nav.settingsHref} />
          </div>
        </header>

        <main
          id="main-content"
          tabIndex={-1}
          className={cn(
            "mx-auto w-full flex-1 px-4 pt-6 outline-none",
            isVolunteer
              ? "max-w-lg pb-[calc(6rem+env(safe-area-inset-bottom))] text-[1.0625rem]"
              : cn(
                  "max-w-[1280px] md:px-6 md:pb-12 lg:px-8 lg:pt-8",
                  hasTabs ? "pb-[calc(6rem+env(safe-area-inset-bottom))]" : "pb-12",
                ),
          )}
        >
          {children}
        </main>
      </div>

      <BottomTabs role={role} alwaysVisible={isVolunteer} />
    </div>
  );
}
