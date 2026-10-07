import { cn } from "@/lib/utils";

import { PORTAL_NAV, type PortalRole } from "./nav-config";

/** Nhận diện cổng đang dùng: icon + chữ, màu accent vai trò (DESIGN-SYSTEM §3.4, §11.2). */
export function RoleBadge({ role, className }: { role: PortalRole; className?: string }) {
  const { roleLabel, roleIcon: Icon } = PORTAL_NAV[role];
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full bg-role-accent-soft px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-role-accent",
        className,
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {roleLabel}
    </span>
  );
}
