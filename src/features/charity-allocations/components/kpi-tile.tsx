import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type KpiTileProps = {
  label: string;
  /** null ⇒ "—" + `emptyNote`. */
  value: string | null;
  unit?: string;
  icon: LucideIcon;
  /** Cách tính + nguồn (DESIGN-SYSTEM §1 luật 4: số đi kèm đơn vị và nguồn). */
  method?: string;
  emptyNote?: string;
  className?: string;
};

/** Chỉ số đơn (DESIGN-SYSTEM §11.2 KpiTile): số tabular, đơn vị, ghi chú cách tính. */
export function KpiTile({ label, value, unit, icon: Icon, method, emptyNote, className }: KpiTileProps) {
  return (
    <div className={cn("flex flex-col gap-2 rounded-lg border bg-surface p-4 shadow-1", className)}>
      <p className="flex items-center gap-2 text-sm font-medium text-ink-muted">
        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-role-accent-soft text-role-accent">
          <Icon aria-hidden className="size-4" />
        </span>
        {label}
      </p>
      <p className="flex items-baseline gap-1.5">
        <span className="text-[2rem] leading-[2.375rem] font-bold text-ink tabular-nums">{value ?? "—"}</span>
        {unit && value !== null ? <span className="text-sm text-ink-muted">{unit}</span> : null}
      </p>
      {value === null && emptyNote ? <p className="text-xs text-ink-subtle">{emptyNote}</p> : null}
      {method ? <p className="text-xs text-ink-subtle">{method}</p> : null}
    </div>
  );
}
