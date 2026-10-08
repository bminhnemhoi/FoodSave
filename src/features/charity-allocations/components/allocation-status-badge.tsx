import {
  Ban,
  BadgeCheck,
  CircleCheckBig,
  CircleSlash,
  CircleX,
  Hourglass,
  type LucideIcon,
  PackageCheck,
  Route,
} from "lucide-react";

import { ALLOCATION_STATUS_LABEL, type AllocationStatus } from "@/features/catalog/labels";
import { cn } from "@/lib/utils";

/** Badge trạng thái phân bổ (DESIGN-SYSTEM §12.7) — tông ngữ nghĩa, không dùng token nhãn tươi; luôn icon + chữ. */

type Tone = "neutral" | "info" | "success" | "warning" | "danger";

const TONE: Record<Tone, string> = {
  neutral: "border-border-strong/40 bg-bg-sunken text-ink-muted",
  info: "border-info/30 bg-info-soft text-info",
  success: "border-success/30 bg-success-soft text-success",
  warning: "border-warning/30 bg-warning-soft text-warning",
  danger: "border-danger/30 bg-danger-soft text-danger",
};

const STATUS: Record<AllocationStatus, { tone: Tone; icon: LucideIcon }> = {
  requested: { tone: "warning", icon: Hourglass },
  confirmed: { tone: "info", icon: BadgeCheck },
  assigned: { tone: "info", icon: Route },
  picked_up: { tone: "info", icon: PackageCheck },
  delivered: { tone: "success", icon: CircleCheckBig },
  cancelled: { tone: "neutral", icon: Ban },
  rejected: { tone: "danger", icon: CircleX },
  expired: { tone: "neutral", icon: CircleSlash },
};

export function AllocationStatusBadge({
  status,
  className,
}: {
  status: AllocationStatus;
  className?: string;
}) {
  const { tone, icon: Icon } = STATUS[status];
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        TONE[tone],
        className,
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {ALLOCATION_STATUS_LABEL[status]}
    </span>
  );
}

export { TONE as STATUS_TONE };
export type { Tone as StatusTone };
