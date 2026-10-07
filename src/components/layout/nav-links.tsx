"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { SheetClose } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import { isNavActive, PORTAL_NAV, type NavItem, type PortalRole } from "./nav-config";

/** Nhãn nhỏ cho mục chưa mở — trung thực, không giả tính năng. */
export function ComingSoon({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "rounded-full bg-bg px-1.5 py-px text-xs font-medium whitespace-nowrap text-ink-subtle",
        className,
      )}
    >
      Sắp có
    </span>
  );
}

type NavLinkProps = {
  item: NavItem;
  active: boolean;
  /** Thanh bên thu gọn: chỉ icon, nhãn chỉ dành cho trình đọc màn hình. */
  compact?: boolean;
  /** Bọc trong SheetClose để đóng sheet sau khi chọn. */
  inSheet?: boolean;
};

export function NavLink({ item, active, compact = false, inSheet = false }: NavLinkProps) {
  const Icon = item.icon;
  const link = (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={compact ? item.label : undefined}
      className={cn(
        "group/nav relative flex min-h-11 items-center gap-3 rounded-md text-sm font-medium text-ink-muted transition-colors duration-100 hover:bg-surface hover:text-ink",
        "aria-[current=page]:bg-role-accent-soft aria-[current=page]:text-ink",
        compact ? "justify-center px-0" : "px-3",
      )}
    >
      <span
        aria-hidden
        className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-role-accent opacity-0 group-aria-[current=page]/nav:opacity-100"
      />
      <Icon aria-hidden className="size-5 shrink-0 group-aria-[current=page]/nav:text-role-accent" />
      <span className={cn("min-w-0 flex-1 truncate", compact && "sr-only")}>{item.label}</span>
      {item.phase && !compact ? <ComingSoon /> : null}
      {item.phase && compact ? <span className="sr-only">(sắp có)</span> : null}
    </Link>
  );
  return inSheet ? <SheetClose asChild>{link}</SheetClose> : link;
}

/** Danh sách mục điều hướng của một cổng (dùng trong sidebar và sheet). */
export function NavList({
  role,
  items,
  compact = false,
  inSheet = false,
  className,
}: {
  role: PortalRole;
  items?: NavItem[];
  compact?: boolean;
  inSheet?: boolean;
  className?: string;
}) {
  const pathname = usePathname();
  const nav = PORTAL_NAV[role];
  return (
    <ul className={cn("flex flex-col gap-1", className)}>
      {(items ?? nav.items).map((item) => (
        <li key={item.href}>
          <NavLink
            item={item}
            active={isNavActive(item, pathname, nav.home)}
            compact={compact}
            inSheet={inSheet}
          />
        </li>
      ))}
    </ul>
  );
}
