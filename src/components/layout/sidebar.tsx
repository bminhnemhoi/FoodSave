"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";

import { Wordmark } from "@/components/brand/wordmark";
import { cn } from "@/lib/utils";

import { PORTAL_NAV, type PortalRole } from "./nav-config";
import { NavList } from "./nav-links";

const STORAGE_KEY = "fs.sidebar.collapsed";
const CHANGE_EVENT = "fs:sidebar-change";

// Lựa chọn thu gọn lưu ở localStorage (bọc try/catch — trình duyệt có thể chặn storage). DESIGN-SYSTEM §10.1.
function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCollapsed(value: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    // Không lưu được thì vẫn đổi trong phiên hiện tại qua sự kiện bên dưới.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/** Ký hiệu rút gọn "F·S" khi thanh bên thu gọn (và topbar màn rất hẹp). */
export function LogoMark() {
  return (
    <span aria-hidden className="inline-flex items-baseline text-lg font-bold tracking-tight">
      <span className="text-ink">F</span>
      <span className="text-primary">S</span>
      <span className="ml-0.5 inline-block size-1.5 -translate-y-2 rounded-full bg-brand-yellow" />
    </span>
  );
}

/**
 * Thanh bên desktop (DESIGN-SYSTEM §10.1): ≥ 1024 px rộng 264 px, thu gọn được còn 72 px;
 * 768–1023 px luôn thu gọn; < 768 px ẩn (dùng bottom tab).
 */
export function Sidebar({ role }: { role: PortalRole }) {
  const nav = PORTAL_NAV[role];
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, () => false);

  return (
    <div
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col border-r bg-bg-sunken md:flex md:w-[72px]",
        !collapsed && "lg:w-66",
      )}
    >
      <div className={cn("flex h-16 items-center border-b px-3", collapsed ? "justify-center" : "lg:px-5")}>
        <Link
          href={nav.home}
          className="inline-flex min-h-11 items-center rounded-md px-1"
          aria-label={`FoodSave — về trang Tổng quan ${nav.roleLabel.toLocaleLowerCase("vi")}`}
        >
          <span className={cn(!collapsed && "lg:hidden")}>
            <LogoMark />
          </span>
          {collapsed ? null : <Wordmark className="hidden text-xl lg:inline-flex" />}
        </Link>
      </div>

      <nav aria-label="Điều hướng chính" className="flex-1 overflow-y-auto px-3 py-4">
        {/* md: luôn thu gọn; lg: theo lựa chọn người dùng */}
        <NavList role={role} compact className={cn(!collapsed && "lg:hidden")} />
        {collapsed ? null : <NavList role={role} className="hidden lg:flex" />}
      </nav>

      <div className="hidden border-t p-3 lg:block">
        <button
          type="button"
          onClick={() => writeCollapsed(!collapsed)}
          aria-expanded={!collapsed}
          className={cn(
            "flex min-h-11 w-full items-center gap-3 rounded-md text-sm font-medium text-ink-muted hover:bg-surface hover:text-ink",
            collapsed ? "justify-center" : "px-3",
          )}
        >
          {collapsed ? (
            <PanelLeftOpen aria-hidden className="size-5" />
          ) : (
            <PanelLeftClose aria-hidden className="size-5" />
          )}
          <span className={cn(collapsed && "sr-only")}>
            {collapsed ? "Mở rộng thanh bên" : "Thu gọn thanh bên"}
          </span>
        </button>
      </div>
    </div>
  );
}
