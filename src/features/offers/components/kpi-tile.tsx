import type { LucideIcon } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * Chỉ số đơn (DESIGN-SYSTEM §11.2 `KpiTile`): nhãn, số tabular + đơn vị, một dòng giải thích nguồn/cách tính.
 * Chỉ hiển thị số thật; `emphasis` dùng tông cảnh báo khi cần hành động (vd. còn yêu cầu chờ).
 */
export function KpiTile({
  icon: Icon,
  label,
  value,
  unit,
  hint,
  href,
  emphasis = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  unit?: string;
  hint: string;
  href?: string;
  emphasis?: boolean;
}) {
  const body = (
    <>
      <span className="flex items-center gap-2 text-sm font-medium text-ink-muted">
        <span
          className={cn(
            "grid size-8 place-items-center rounded-md",
            emphasis ? "bg-warning-soft text-warning" : "bg-role-accent-soft text-role-accent",
          )}
        >
          <Icon aria-hidden className="size-4" />
        </span>
        {label}
      </span>
      <span className="flex items-baseline gap-1.5">
        <span className="text-[2rem] leading-[2.375rem] font-bold tabular-nums">{value}</span>
        {unit ? <span className="text-sm font-medium text-ink-muted">{unit}</span> : null}
      </span>
      <span className="text-xs leading-relaxed text-ink-subtle">{hint}</span>
    </>
  );
  const box = cn(
    "flex h-full flex-col gap-2 rounded-xl border bg-surface p-4 shadow-1 sm:p-5",
    emphasis && "border-warning/40",
  );
  return href ? (
    <Link
      href={href}
      className={cn(
        box,
        "transition-colors duration-100 hover:border-border-strong/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
      )}
    >
      {body}
    </Link>
  ) : (
    <div className={box}>{body}</div>
  );
}
