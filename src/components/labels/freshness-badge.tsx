import { AlarmClock, CircleSlash, Clock, Leaf, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type FreshnessLabel = "green" | "yellow" | "red" | "expired";

const LABELS: Record<FreshnessLabel, { text: string; icon: LucideIcon; className: string }> = {
  green: {
    text: "Xanh",
    icon: Leaf,
    className: "bg-label-green-bg text-label-green-fg border-label-green-border",
  },
  yellow: {
    text: "Vàng",
    icon: Clock,
    className: "bg-label-yellow-bg text-label-yellow-fg border-label-yellow-border",
  },
  red: {
    text: "Đỏ",
    icon: AlarmClock,
    className: "bg-label-red-bg text-label-red-fg border-label-red-border",
  },
  expired: {
    text: "Hết hạn",
    icon: CircleSlash,
    className: "bg-label-expired-bg text-label-expired-fg border-label-expired-border",
  },
};

type FreshnessBadgeProps = {
  label: FreshnessLabel;
  className?: string;
  /** Kích thước gọn (bảng, marker list) — vẫn giữ icon + chữ. */
  size?: "sm" | "md";
};

/** Pill nhãn tươi: luôn có icon + chữ (DESIGN-SYSTEM §3.6). */
export function FreshnessBadge({ label, className, size = "md" }: FreshnessBadgeProps) {
  const { text, icon: Icon, className: tone } = LABELS[label];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-medium whitespace-nowrap",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm",
        tone,
        className,
      )}
    >
      <Icon aria-hidden className={size === "sm" ? "size-3.5" : "size-4"} />
      Nhãn {text}
    </span>
  );
}
