import {
  Archive,
  Ban,
  BadgeCheck,
  CircleX,
  FilePen,
  Hourglass,
  type LucideIcon,
  MessageSquareWarning,
} from "lucide-react";

import { cn } from "@/lib/utils";

/** Badge trạng thái state machine — tách biệt với nhãn tươi (DESIGN-SYSTEM §12.7). */

export type OrgStatus =
  "draft" | "submitted" | "needs_changes" | "approved" | "rejected" | "suspended" | "closed";
type Tone = "neutral" | "info" | "success" | "warning" | "danger";

const TONE: Record<Tone, string> = {
  neutral: "border-border-strong/40 bg-bg-sunken text-ink-muted",
  info: "border-info/30 bg-info-soft text-info",
  success: "border-success/30 bg-success-soft text-success",
  warning: "border-warning/30 bg-warning-soft text-warning",
  danger: "border-danger/30 bg-danger-soft text-danger",
};

export const ORG_STATUS_BADGE: Record<OrgStatus, { text: string; tone: Tone; icon: LucideIcon }> = {
  draft: { text: "Nháp", tone: "neutral", icon: FilePen },
  submitted: { text: "Chờ duyệt", tone: "warning", icon: Hourglass },
  needs_changes: { text: "Cần bổ sung", tone: "warning", icon: MessageSquareWarning },
  approved: { text: "Đã duyệt", tone: "success", icon: BadgeCheck },
  rejected: { text: "Bị từ chối", tone: "danger", icon: CircleX },
  suspended: { text: "Tạm khóa", tone: "danger", icon: Ban },
  closed: { text: "Đã đóng", tone: "neutral", icon: Archive },
};

export function StatusBadge({ status, className }: { status: OrgStatus; className?: string }) {
  const { text, tone, icon: Icon } = ORG_STATUS_BADGE[status];
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-full border px-2.5 py-1 text-sm font-medium whitespace-nowrap",
        TONE[tone],
        className,
      )}
    >
      <Icon aria-hidden className="size-4" />
      {text}
    </span>
  );
}
