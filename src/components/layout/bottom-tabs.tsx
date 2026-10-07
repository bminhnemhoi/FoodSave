"use client";

import { Ellipsis } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import { isNavActive, PORTAL_NAV, type NavItem, type PortalRole } from "./nav-config";
import { NavList } from "./nav-links";

const TAB_CLASS =
  "relative flex h-16 w-full flex-col items-center justify-center gap-1 px-1 text-xs font-medium text-ink-muted transition-colors duration-100 hover:text-ink";

function TabIndicator({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "absolute inset-x-4 top-0 h-[3px] rounded-b-full bg-role-accent transition-opacity",
        active ? "opacity-100" : "opacity-0",
      )}
    />
  );
}

/**
 * Bottom tab bar (DESIGN-SYSTEM §10.1): tối đa 5 mục, mục thứ 5 "Thêm" mở sheet các mục còn lại.
 * Cao 64 px + safe-area. Ẩn từ 768 px khi cổng có sidebar; PWA tình nguyện viên luôn hiện.
 */
export function BottomTabs({ role, alwaysVisible = false }: { role: PortalRole; alwaysVisible?: boolean }) {
  const pathname = usePathname();
  const nav = PORTAL_NAV[role];
  if (nav.mobileTabs.length === 0) return null;

  const tabs = nav.mobileTabs
    .map((href) => nav.items.find((i) => i.href === href))
    .filter((i): i is NavItem => !!i);
  const rest = nav.items.filter((i) => !nav.mobileTabs.includes(i.href));
  // Trang đầu cổng mở bằng logo trên topbar ⇒ không tô "Thêm" khi đang ở trang đầu
  const restActive = rest.some((i) => i.href !== nav.home && isNavActive(i, pathname, nav.home));
  const columns = tabs.length + (rest.length > 0 ? 1 : 0);

  return (
    <nav
      aria-label="Điều hướng nhanh"
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 border-t bg-surface pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_2px_rgb(19_38_30/0.04)]",
        !alwaysVisible && "md:hidden",
      )}
    >
      <ul
        className="mx-auto grid max-w-lg"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {tabs.map((item) => {
          const active = isNavActive(item, pathname, nav.home);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(TAB_CLASS, active && "text-role-accent hover:text-role-accent")}
              >
                <TabIndicator active={active} />
                <Icon aria-hidden className="size-5" />
                <span className="max-w-full truncate">{item.shortLabel ?? item.label}</span>
              </Link>
            </li>
          );
        })}
        {rest.length > 0 ? (
          <li>
            <Sheet>
              <SheetTrigger
                className={cn(TAB_CLASS, restActive && "text-role-accent hover:text-role-accent")}
              >
                <TabIndicator active={restActive} />
                <Ellipsis aria-hidden className="size-5" />
                <span>Thêm</span>
              </SheetTrigger>
              <SheetContent
                side="bottom"
                className="rounded-t-xl pb-[calc(1rem+env(safe-area-inset-bottom))]"
              >
                <SheetHeader>
                  <SheetTitle className="text-lg font-semibold">Các mục khác</SheetTitle>
                  <SheetDescription>{nav.roleLabel} · chọn mục bạn muốn mở</SheetDescription>
                </SheetHeader>
                <nav aria-label="Các mục khác" className="px-4">
                  <NavList role={role} items={rest} inSheet />
                </nav>
              </SheetContent>
            </Sheet>
          </li>
        ) : null}
      </ul>
    </nav>
  );
}
