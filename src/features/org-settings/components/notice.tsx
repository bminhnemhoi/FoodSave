import { CircleAlert, CircleCheck, Info, PauseCircle, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type Tone = "info" | "success" | "warning" | "danger";

const TONE: Record<Tone, { box: string; icon: LucideIcon; iconClass: string }> = {
  info: { box: "border-info/30 bg-info-soft", icon: Info, iconClass: "text-info" },
  success: { box: "border-success/30 bg-success-soft", icon: CircleCheck, iconClass: "text-success" },
  warning: { box: "border-warning/30 bg-warning-soft", icon: PauseCircle, iconClass: "text-warning" },
  danger: { box: "border-danger/30 bg-danger-soft", icon: CircleAlert, iconClass: "text-danger" },
};

/** Ghi chú cần giữ lại trên trang (không dùng toast — DESIGN-SYSTEM §12.6): icon + chữ, tông ngữ nghĩa. */
export function Notice({
  tone = "info",
  title,
  children,
  icon,
  role,
  className,
}: {
  tone?: Tone;
  title?: React.ReactNode;
  children?: React.ReactNode;
  icon?: LucideIcon;
  role?: "status" | "alert" | "note";
  className?: string;
}) {
  const t = TONE[tone];
  const Icon = icon ?? t.icon;
  return (
    <div role={role} className={cn("flex gap-3 rounded-lg border p-3 text-sm sm:p-4", t.box, className)}>
      <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", t.iconClass)} />
      <div className="flex min-w-0 flex-col gap-1 text-ink">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="text-ink-muted [&_strong]:text-ink">{children}</div> : null}
      </div>
    </div>
  );
}
