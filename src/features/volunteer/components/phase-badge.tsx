import { Ban, CircleCheckBig, Hourglass, type LucideIcon, Route, UserCheck, UserX } from "lucide-react";

import { cn } from "@/lib/utils";

import { PHASE_LABEL, type VolunteerPhase } from "../trip-model";

const STYLE: Record<VolunteerPhase, { icon: LucideIcon; tone: string }> = {
  awaiting_response: { icon: Hourglass, tone: "border-warning/30 bg-warning-soft text-warning" },
  accepted: { icon: UserCheck, tone: "border-info/30 bg-info-soft text-info" },
  in_progress: { icon: Route, tone: "border-role-accent/40 bg-role-accent-soft text-role-accent" },
  completed: { icon: CircleCheckBig, tone: "border-success/30 bg-success-soft text-success" },
  cancelled: { icon: Ban, tone: "border-border-strong/40 bg-bg-sunken text-ink-muted" },
  unassigned: { icon: UserX, tone: "border-border-strong/40 bg-bg-sunken text-ink-muted" },
};

/** Trạng thái chuyến theo góc nhìn TNV — icon + chữ (DESIGN-SYSTEM §12.7, không dùng màu nhãn tươi). */
export function PhaseBadge({ phase, className }: { phase: VolunteerPhase; className?: string }) {
  const { icon: Icon, tone } = STYLE[phase];
  return (
    <span
      data-phase={phase}
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-semibold whitespace-nowrap",
        tone,
        className,
      )}
    >
      <Icon aria-hidden className="size-4" />
      {PHASE_LABEL[phase]}
    </span>
  );
}
