import { Ban, CircleCheckBig, CircleDashed, type LucideIcon, Route, UserCheck } from "lucide-react";

import { PICKUP_STATUS_LABEL, type PickupStatus } from "@/features/catalog/labels";
import {
  STATUS_TONE,
  type StatusTone,
} from "@/features/charity-allocations/components/allocation-status-badge";
import { cn } from "@/lib/utils";

const STATUS: Record<PickupStatus, { tone: StatusTone; icon: LucideIcon }> = {
  planned: { tone: "warning", icon: CircleDashed },
  assigned: { tone: "info", icon: UserCheck },
  in_progress: { tone: "info", icon: Route },
  completed: { tone: "success", icon: CircleCheckBig },
  cancelled: { tone: "neutral", icon: Ban },
};

/** Nhãn trạng thái chuyến; chuyến tự lấy chưa bắt đầu gọi là "Chờ đi lấy" cho dễ hiểu. */
export function pickupStatusText(status: PickupStatus, mode: "self" | "volunteer"): string {
  if (mode === "self" && status === "planned") return "Chờ đi lấy";
  return PICKUP_STATUS_LABEL[status];
}

export function PickupStatusBadge({
  status,
  mode,
  className,
}: {
  status: PickupStatus;
  mode: "self" | "volunteer";
  className?: string;
}) {
  const { tone, icon: Icon } = STATUS[status];
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        STATUS_TONE[tone],
        className,
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {pickupStatusText(status, mode)}
    </span>
  );
}
