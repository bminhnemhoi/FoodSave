"use client";

import { ChevronDown, ListChecks } from "lucide-react";
import { useId, useState } from "react";

import type { FreshnessLabel } from "@/core/labels";
import { cn } from "@/lib/utils";

import { HouseHeartGlyph, PIN_ROUND, PIN_SQUARE, ScooterGlyph, StoreGlyph } from "./glyphs";
import { LABEL_ICON, type RouteTone, type StopStatus } from "./markers";

/**
 * Chú giải gập được (DESIGN-SYSTEM §13.8), nằm ở chân khung bản đồ (không che marker): chỉ liệt kê ký hiệu CÓ trên
 * bản đồ đang xem; mở sẵn lần đầu, người dùng thu gọn thì nhớ lựa chọn theo từng loại bản đồ (localStorage, chỉ
 * là tiện ích — lỗi đọc/ghi thì bỏ qua). Đặt qua prop `legend` của `MapFrame`.
 */

export type LegendItem = { key: string; symbol: React.ReactNode; label: React.ReactNode };
export type LegendRoute = { key: string; label: string; tone: RouteTone | "alt"; dashed: boolean };

const STORAGE_PREFIX = "fs-map-legend:";

function readOpen(key: string): boolean {
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + key) !== "closed";
  } catch {
    return true;
  }
}

function writeOpen(key: string, open: boolean) {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + key, open ? "open" : "closed");
  } catch {
    // trình duyệt chặn bộ nhớ — chỉ mất phần "nhớ lựa chọn"
  }
}

export function MapLegend({
  items,
  routes = [],
  storageKey,
  listLabel = "Chú giải bản đồ",
  routesLabel = "Chú thích tuyến",
  note,
  action,
  className,
}: {
  items: LegendItem[];
  routes?: LegendRoute[];
  /** Loại bản đồ (offer, plan, trip…) — nhớ trạng thái gập riêng cho từng loại. */
  storageKey: string;
  listLabel?: string;
  routesLabel?: string;
  /** Dòng ghi chú cuối (ví dụ "2 nhu cầu ẩn vị trí — xem trong danh sách"). */
  note?: React.ReactNode;
  /** Nút đặt cùng hàng tiêu đề, bên phải (MapFrame đặt "Vừa khung" vào đây). */
  action?: React.ReactNode;
  className?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(() => readOpen(storageKey));
  const hasContent = items.length > 0 || routes.length > 0 || !!note;
  if (!hasContent && !action) return null;

  function toggle() {
    setOpen((o) => {
      writeOpen(storageKey, !o);
      return !o;
    });
  }

  return (
    <div data-map-legend className={cn("px-2 py-0.5 text-xs text-ink", className)}>
      <div className="flex items-center justify-between gap-2">
        {hasContent ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={open ? id : undefined}
            onClick={toggle}
            className="inline-flex min-h-11 items-center gap-1 rounded-md px-1 text-sm font-semibold sm:min-h-8"
          >
            <ListChecks aria-hidden className="size-4 text-ink-muted" />
            Chú giải
            <ChevronDown aria-hidden className={cn("size-4 text-ink-muted", !open && "-rotate-90")} />
            {open ? null : <span className="font-normal text-ink-muted">(bấm để xem ký hiệu)</span>}
          </button>
        ) : (
          <span />
        )}
        {action}
      </div>
      {open && hasContent ? (
        <div id={id} className="flex flex-col gap-0.5 pb-1">
          {routes.length > 0 ? (
            <ul aria-label={routesLabel} className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
              {routes.map((r) => (
                <li key={r.key} className="flex min-h-6 items-center gap-1.5">
                  <RouteSwatch tone={r.tone} dashed={r.dashed} />
                  <span>{r.label}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {items.length > 0 ? (
            <ul aria-label={listLabel} className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
              {items.map((it) => (
                <li key={it.key} className="flex min-h-6 items-center gap-1.5">
                  <span aria-hidden className="grid h-6 min-w-6 shrink-0 place-items-center">
                    {it.symbol}
                  </span>
                  <span>{it.label}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {note ? <p className="text-ink-muted">{note}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ký hiệu thu nhỏ cho chú giải (cùng hình với marker thật)
// ---------------------------------------------------------------------------

const MINI_RING: Record<FreshnessLabel, string> = {
  red: "bg-label-red border-(--map-halo)",
  yellow: "bg-label-yellow border-label-yellow-fg",
  green: "bg-label-green border-(--map-halo)",
  expired: "bg-label-expired border-(--map-halo)",
};

/** Cửa hàng thu nhỏ (vòng màu nhãn) + icon nhãn. */
export function LegendStore({
  label,
  approximate = false,
}: {
  label: FreshnessLabel;
  approximate?: boolean;
}) {
  const Icon = LABEL_ICON[label];
  return (
    <span className="relative inline-grid">
      <span
        className={cn(
          "grid size-6 place-items-center rounded-full border-2 p-[2px]",
          approximate ? "border-dashed border-ink-subtle bg-bg-sunken" : MINI_RING[label],
        )}
      >
        <span className="grid size-full place-items-center rounded-full bg-surface">
          <StoreGlyph size={13} />
        </span>
      </span>
      {approximate ? null : (
        <Icon
          className={cn(
            "absolute -right-1 -bottom-1 size-3 rounded-full p-px",
            label === "yellow" ? "bg-label-yellow text-ink" : `text-white ${MINI_BG[label]}`,
          )}
          strokeWidth={3}
        />
      )}
    </span>
  );
}

const MINI_BG: Record<FreshnessLabel, string> = {
  red: "bg-label-red",
  yellow: "bg-label-yellow",
  green: "bg-label-green",
  expired: "bg-label-expired",
};

export function LegendCount() {
  return (
    <span className="grid h-4 min-w-4 place-items-center rounded-full bg-ink px-1 text-[10px] leading-none font-bold text-white tabular-nums">
      3
    </span>
  );
}

export function LegendOrder() {
  return (
    <span className="grid size-5 place-items-center rounded-full border-2 border-(--map-halo) bg-(--map-route) text-[10px] leading-none font-bold text-white tabular-nums">
      1
    </span>
  );
}

export function LegendCluster({ tone = "red" }: { tone?: FreshnessLabel | "charity" }) {
  return (
    <span
      {...(tone === "charity" ? { "data-role": "charity" } : {})}
      className={cn(
        "grid size-6 place-items-center rounded-full border-2 text-[11px] font-bold tabular-nums",
        tone === "charity"
          ? "border-role-accent bg-surface text-ink"
          : tone === "yellow"
            ? "border-label-yellow-fg bg-label-yellow text-ink"
            : `border-(--map-halo) text-white ${MINI_BG[tone]}`,
      )}
    >
      5
    </span>
  );
}

export function LegendApprox() {
  return (
    <span className="block size-5 rounded-full border-2 border-dashed border-ink-subtle bg-ink-subtle/12" />
  );
}

export function LegendHome({ kind }: { kind: "charity" | "store" }) {
  return (
    <span data-role={kind} className="relative inline-block">
      <svg width={17} height={22} viewBox="0 0 32 42" className="block">
        <path d={PIN_ROUND} fill="var(--ink)" stroke="var(--map-halo)" strokeWidth={2.2} />
        <circle
          cx={16}
          cy={16}
          r={10.5}
          fill="var(--surface)"
          stroke="var(--role-accent-fill)"
          strokeWidth={3}
        />
      </svg>
      <span className="absolute top-[3px] left-1/2 -translate-x-1/2">
        {kind === "charity" ? <HouseHeartGlyph size={10} /> : <StoreGlyph size={10} />}
      </span>
    </span>
  );
}

export function LegendStop({ status = "pending", tone = 0 }: { status?: StopStatus; tone?: RouteTone }) {
  const fill =
    status === "done"
      ? "var(--success)"
      : status === "late"
        ? "var(--danger)"
        : status === "arrived"
          ? "var(--map-volunteer)"
          : status === "skipped"
            ? "var(--surface)"
            : tone === 1
              ? "var(--chart-e)"
              : "var(--map-route)";
  return (
    <svg width={17} height={22} viewBox="0 0 32 42" className="block">
      <path
        d={tone === 1 ? PIN_SQUARE : PIN_ROUND}
        fill={fill}
        stroke={status === "skipped" ? "var(--ink-subtle)" : "var(--map-halo)"}
        strokeWidth={2.5}
        strokeDasharray={status === "skipped" ? "3 2.5" : undefined}
      />
      {status === "done" ? (
        <path
          d="m10.5 16.5 4 4 7-8"
          fill="none"
          stroke="var(--primary-foreground)"
          strokeWidth={3.2}
          strokeLinecap="round"
        />
      ) : (
        <text
          x={16}
          y={21.5}
          textAnchor="middle"
          fontSize={15}
          fontWeight={700}
          fill={
            status === "arrived"
              ? "var(--ink)"
              : status === "skipped"
                ? "var(--ink-subtle)"
                : "var(--primary-foreground)"
          }
        >
          1
        </text>
      )}
    </svg>
  );
}

export function LegendVolunteer({ stale = false }: { stale?: boolean }) {
  return (
    <span
      className={cn(
        "grid size-6 place-items-center rounded-full border-2",
        stale ? "border-dashed border-ink-subtle bg-label-expired-bg" : "border-ink bg-(--map-volunteer)",
      )}
    >
      <ScooterGlyph size={15} />
    </span>
  );
}

export function LegendYouAreHere() {
  return (
    <span className="relative grid size-6 place-items-center">
      <span className="absolute inset-0 rounded-full bg-info/20" />
      <span className="size-3 rounded-full border-2 border-(--map-halo) bg-info" />
    </span>
  );
}

export function LegendNeed() {
  return (
    <span
      data-role="charity"
      className="grid size-6 place-items-center rounded-full border-2 border-role-accent bg-surface"
    >
      <HouseHeartGlyph size={14} />
    </span>
  );
}

export function LegendRadius() {
  return <span className="block size-5 rounded-full border-2 border-dashed border-primary bg-primary/10" />;
}

function RouteSwatch({ tone, dashed }: { tone: RouteTone | "alt"; dashed: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "block h-0 w-7 shrink-0 border-t-[3px]",
        tone === 0 && "border-info",
        tone === 1 && "border-chart-e",
        tone === "alt" && "border-t-2 border-border-strong",
        dashed && "border-dashed",
      )}
    />
  );
}
