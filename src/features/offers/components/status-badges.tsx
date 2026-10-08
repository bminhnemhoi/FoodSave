import {
  Ban,
  BadgeCheck,
  CircleCheck,
  CircleSlash,
  CircleX,
  FilePen,
  Hourglass,
  type LucideIcon,
  PackageCheck,
  Radio,
  Route,
  Truck,
} from "lucide-react";

import {
  ALLOCATION_STATUS_LABEL,
  OFFER_STATUS_LABEL,
  type AllocationStatus,
  type OfferStatus,
} from "@/features/catalog/labels";
import { cn } from "@/lib/utils";

/**
 * Badge trạng thái lô / phân bổ (DESIGN-SYSTEM §12.7) — tách biệt với nhãn tươi: nền soft trung tính/ngữ
 * nghĩa, icon + chữ, không dùng token nhãn. Chữ lấy từ `features/catalog/labels` (một nguồn duy nhất).
 */

type Tone = "neutral" | "info" | "success" | "warning" | "danger";

const TONE: Record<Tone, string> = {
  neutral: "border-border-strong/40 bg-bg-sunken text-ink-muted",
  info: "border-info/30 bg-info-soft text-info",
  success: "border-success/30 bg-success-soft text-success",
  warning: "border-warning/30 bg-warning-soft text-warning",
  danger: "border-danger/30 bg-danger-soft text-danger",
};

const OFFER: Record<OfferStatus, { tone: Tone; icon: LucideIcon }> = {
  draft: { tone: "neutral", icon: FilePen },
  open: { tone: "info", icon: Radio },
  fully_allocated: { tone: "info", icon: PackageCheck },
  completed: { tone: "success", icon: CircleCheck },
  expired: { tone: "neutral", icon: CircleSlash },
  cancelled: { tone: "neutral", icon: Ban },
};

const ALLOCATION: Record<AllocationStatus, { tone: Tone; icon: LucideIcon }> = {
  requested: { tone: "warning", icon: Hourglass },
  confirmed: { tone: "info", icon: BadgeCheck },
  assigned: { tone: "info", icon: Route },
  picked_up: { tone: "info", icon: Truck },
  delivered: { tone: "success", icon: CircleCheck },
  cancelled: { tone: "neutral", icon: Ban },
  rejected: { tone: "danger", icon: CircleX },
  expired: { tone: "neutral", icon: CircleSlash },
};

function Pill({
  tone,
  icon: Icon,
  text,
  className,
}: {
  tone: Tone;
  icon: LucideIcon;
  text: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        TONE[tone],
        className,
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {text}
    </span>
  );
}

export function OfferStatusBadge({ status, className }: { status: OfferStatus; className?: string }) {
  const s = OFFER[status];
  return <Pill tone={s.tone} icon={s.icon} text={OFFER_STATUS_LABEL[status]} className={className} />;
}

export function AllocationStatusBadge({
  status,
  className,
}: {
  status: AllocationStatus;
  className?: string;
}) {
  const s = ALLOCATION[status];
  return <Pill tone={s.tone} icon={s.icon} text={ALLOCATION_STATUS_LABEL[status]} className={className} />;
}
