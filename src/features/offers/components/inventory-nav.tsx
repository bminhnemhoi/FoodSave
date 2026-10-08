import { Archive, FilePen, MapPin, Radio, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

import type { InventoryTab } from "../queries";
import type { SiteOption } from "../schemas";

const TABS: { key: InventoryTab; label: string; icon: LucideIcon }[] = [
  { key: "open", label: "Đang mở", icon: Radio },
  { key: "draft", label: "Nháp", icon: FilePen },
  { key: "closed", label: "Đã kết thúc", icon: Archive },
];

export function inventoryHref(tab: InventoryTab, siteId: string | null): string {
  const p = new URLSearchParams();
  if (tab !== "open") p.set("tab", tab);
  if (siteId) p.set("site", siteId);
  const q = p.toString();
  return q ? `/store/inventory?${q}` : "/store/inventory";
}

/** Tab "Đang mở / Nháp / Đã kết thúc" — liên kết `?tab=` (giữ khi tải lại/chia sẻ, DESIGN-SYSTEM §12.3). */
export function InventoryTabs({
  active,
  counts,
  siteId,
}: {
  active: InventoryTab;
  counts: Record<InventoryTab, number>;
  siteId: string | null;
}) {
  return (
    <nav aria-label="Trạng thái lô" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex w-max min-w-full gap-1 border-b">
        {TABS.map(({ key, label, icon: Icon }) => {
          const current = key === active;
          return (
            <li key={key}>
              <Link
                href={inventoryHref(key, siteId)}
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
                {label}
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs tabular-nums",
                    current ? "bg-role-accent-soft text-role-accent" : "bg-bg-sunken text-ink-muted",
                  )}
                >
                  {counts[key]}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Lọc theo chi nhánh khi cửa hàng có ≥ 2 điểm (US-STO-10 AC4). Nhân viên chỉ thấy điểm được giao. */
export function SiteFilter({
  sites,
  active,
  tab,
}: {
  sites: SiteOption[];
  active: string | null;
  tab: InventoryTab;
}) {
  if (sites.length < 2) return null;
  const chip = (current: boolean) =>
    cn(
      "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none md:min-h-9",
      current
        ? "border-primary bg-primary-soft text-primary-active"
        : "bg-surface text-ink-muted hover:text-ink",
    );
  return (
    <nav aria-label="Lọc theo chi nhánh">
      <ul className="flex flex-wrap gap-2">
        <li>
          <Link
            href={inventoryHref(tab, null)}
            aria-current={active ? undefined : "page"}
            className={chip(!active)}
          >
            Mọi chi nhánh
          </Link>
        </li>
        {sites.map((s) => (
          <li key={s.id}>
            <Link
              href={inventoryHref(tab, s.id)}
              aria-current={active === s.id ? "page" : undefined}
              className={chip(active === s.id)}
            >
              <MapPin aria-hidden className="size-3.5" />
              {s.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
