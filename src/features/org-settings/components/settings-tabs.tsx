import { IdCard, MapPin, PauseCircle, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";

import type { OrgKind } from "@/features/onboarding/options";
import { cn } from "@/lib/utils";

import { SETTINGS_TABS, settingsHref, TAB_LABEL, type SettingsTab } from "../schemas";

const TAB_ICON: Record<SettingsTab, LucideIcon> = {
  profile: IdCard,
  sites: MapPin,
  members: Users,
  pause: PauseCircle,
};

/** Tab của trang Cài đặt — liên kết `?tab=` (giữ khi tải lại/chia sẻ, DESIGN-SYSTEM §12.3), icon + chữ. */
export function SettingsTabs({ kind, active }: { kind: OrgKind; active: SettingsTab }) {
  return (
    <nav aria-label="Các mục cài đặt" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex w-max min-w-full gap-1 border-b">
        {SETTINGS_TABS.map((tab) => {
          const Icon = TAB_ICON[tab];
          const current = tab === active;
          return (
            <li key={tab}>
              <Link
                href={settingsHref(kind, tab)}
                scroll={false}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex min-h-11 items-center gap-2 rounded-t-md border-b-2 px-3 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  current
                    ? "border-role-accent text-ink"
                    : "border-transparent text-ink-muted hover:border-border-strong/40 hover:text-ink",
                )}
              >
                <Icon aria-hidden className="size-4" />
                {TAB_LABEL[kind][tab]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
