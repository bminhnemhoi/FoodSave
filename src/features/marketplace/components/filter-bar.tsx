"use client";

import {
  AlarmClock,
  ChevronDown,
  Clock,
  Home,
  Leaf,
  type LucideIcon,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatKm } from "@/lib/format";
import { cn } from "@/lib/utils";

import {
  clearFilters,
  countActiveFilters,
  effectiveMaxKm,
  KM_STEP,
  LABEL_FILTERS,
  MIN_KM,
  toggle,
  TRAVEL_MIN_OPTIONS,
  type LabelFilter,
  type MarketplaceFilters,
} from "../filters";
import type { FoodCategory } from "../queries";

const LABEL_CHIP: Record<LabelFilter, { text: string; icon: LucideIcon; on: string; off: string }> = {
  red: {
    text: "Đỏ",
    icon: AlarmClock,
    on: "border-label-red-fg bg-label-red-bg text-label-red-fg",
    off: "border-label-red-border text-label-red-fg",
  },
  yellow: {
    text: "Vàng",
    icon: Clock,
    on: "border-label-yellow-fg bg-label-yellow-bg text-label-yellow-fg",
    off: "border-label-yellow-border text-label-yellow-fg",
  },
  green: {
    text: "Xanh",
    icon: Leaf,
    on: "border-label-green-fg bg-label-green-bg text-label-green-fg",
    off: "border-label-green-border text-label-green-fg",
  },
};

type FilterBarProps = {
  filters: MarketplaceFilters;
  sites: { id: string; name: string }[];
  siteId: string;
  radiusKm: number;
  categories: FoodCategory[];
  onChange: (next: MarketplaceFilters) => void;
  /** Nút chuyển Danh sách | Bản đồ (mobile). */
  viewSwitch?: React.ReactNode;
};

/** Bộ lọc Kho tặng (DESIGN-SYSTEM §12.3): chip nhãn dùng đúng icon + chữ của nhãn; đồng bộ URL ở nơi gọi. */
export function FilterBar({
  filters,
  sites,
  siteId,
  radiusKm,
  categories,
  onChange,
  viewSwitch,
}: FilterBarProps) {
  const id = useId();
  const moreCount =
    (effectiveMaxKm(filters.maxKm, radiusKm) !== null ? 1 : 0) +
    (filters.maxMin !== null ? 1 : 0) +
    (filters.categories.length > 0 ? 1 : 0);
  const [open, setOpen] = useState(moreCount > 0);
  const active = countActiveFilters(filters, radiusKm);
  const site = sites.find((s) => s.id === siteId);

  return (
    <section
      aria-label="Bộ lọc kho tặng"
      className="flex flex-col gap-3 rounded-lg border bg-bg-sunken p-3 sm:p-4"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span id={`${id}-site`} className="text-xs font-medium text-ink-muted">
            Điểm nhận
          </span>
          {sites.length > 1 ? (
            <Select value={siteId} onValueChange={(v) => onChange({ ...clearFilters(filters), siteId: v })}>
              <SelectTrigger aria-labelledby={`${id}-site`} className="h-11 min-w-56 bg-surface md:h-10">
                <Home aria-hidden className="text-role-accent" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sites.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="inline-flex min-h-10 items-center gap-1.5 font-medium text-ink">
              <Home aria-hidden className="size-4 text-role-accent" />
              {site?.name}
              <span className="text-sm font-normal text-ink-muted">· bán kính {formatKm(radiusKm)}</span>
            </span>
          )}
        </div>
        {viewSwitch}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="sr-only">Lọc theo nhãn tươi</legend>
          <span aria-hidden className="mr-1 text-sm font-medium text-ink-muted max-sm:hidden">
            Nhãn
          </span>
          {LABEL_FILTERS.map((l) => {
            const chip = LABEL_CHIP[l];
            const on = filters.labels.includes(l);
            const Icon = chip.icon;
            return (
              <button
                key={l}
                type="button"
                aria-pressed={on}
                onClick={() => onChange({ ...filters, labels: toggle(filters.labels, l) })}
                className={cn(
                  "inline-flex h-11 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors duration-100 sm:px-3.5 md:h-9",
                  on ? chip.on : cn("bg-surface hover:bg-bg", chip.off),
                )}
              >
                <Icon aria-hidden className="size-4" />
                <span className="sr-only sm:not-sr-only">Nhãn </span>
                {chip.text}
              </button>
            );
          })}
        </fieldset>
        <Button
          type="button"
          variant="outline"
          className="h-11 bg-surface md:h-9"
          aria-expanded={open}
          aria-controls={`${id}-more`}
          onClick={() => setOpen((o) => !o)}
        >
          <SlidersHorizontal aria-hidden />
          <span className="max-[380px]:sr-only">Bộ lọc khác</span>
          {moreCount > 0 ? (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-ink px-1 text-xs text-white tabular-nums">
              {moreCount}
            </span>
          ) : null}
          <ChevronDown aria-hidden className={cn("transition-transform", open && "rotate-180")} />
        </Button>
      </div>

      <div
        id={`${id}-more`}
        hidden={!open}
        className="grid gap-4 border-t pt-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        <DistanceField
          key={`${siteId}:${filters.maxKm ?? "all"}`}
          id={`${id}-km`}
          radiusKm={radiusKm}
          value={effectiveMaxKm(filters.maxKm, radiusKm)}
          onCommit={(km) => onChange({ ...filters, maxKm: km })}
        />
        <div className="flex flex-col gap-1.5">
          <span id={`${id}-min`} className="text-sm font-medium text-ink">
            Thời gian tới (xe máy)
          </span>
          <Select
            value={filters.maxMin === null ? "any" : String(filters.maxMin)}
            onValueChange={(v) => onChange({ ...filters, maxMin: v === "any" ? null : Number(v) })}
          >
            <SelectTrigger aria-labelledby={`${id}-min`} className="h-11 w-full bg-surface md:h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Bất kỳ</SelectItem>
              {TRAVEL_MIN_OPTIONS.map((m) => (
                <SelectItem key={m} value={String(m)}>
                  Tới trong ≤ {m} phút
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-ink-subtle">
            Ước tính theo đường chim bay × 1,4 ở 18 km/h, cộng 10 phút.
          </p>
        </div>
        <fieldset className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-1">
          <legend className="mb-1.5 text-sm font-medium text-ink">Danh mục</legend>
          <div className="flex flex-wrap gap-1.5">
            {categories.map((c) => {
              const on = filters.categories.includes(c.code);
              return (
                <button
                  key={c.code}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onChange({ ...filters, categories: toggle(filters.categories, c.code) })}
                  className={cn(
                    "inline-flex min-h-11 items-center rounded-md border px-3 text-sm transition-colors duration-100 md:min-h-9",
                    on
                      ? "border-primary bg-primary-soft font-medium text-primary-active"
                      : "border-border-strong/40 bg-surface text-ink hover:bg-bg",
                  )}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        </fieldset>
      </div>

      {active > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-t pt-3 text-sm">
          <span className="text-ink-muted">Đang lọc:</span>
          {filters.labels.length > 0 && filters.labels.length < LABEL_FILTERS.length ? (
            <ActiveChip
              label={`Nhãn ${LABEL_FILTERS.filter((l) => filters.labels.includes(l))
                .map((l) => LABEL_CHIP[l].text)
                .join(", ")}`}
              onRemove={() => onChange({ ...filters, labels: [] })}
            />
          ) : null}
          {effectiveMaxKm(filters.maxKm, radiusKm) !== null ? (
            <ActiveChip
              label={`≤ ${formatKm(filters.maxKm!)}`}
              onRemove={() => onChange({ ...filters, maxKm: null })}
            />
          ) : null}
          {filters.maxMin !== null ? (
            <ActiveChip
              label={`≤ ${filters.maxMin} phút`}
              onRemove={() => onChange({ ...filters, maxMin: null })}
            />
          ) : null}
          {filters.categories.length > 0 ? (
            <ActiveChip
              label={`${filters.categories.length} danh mục`}
              onRemove={() => onChange({ ...filters, categories: [] })}
            />
          ) : null}
          <Button type="button" variant="link" size="sm" onClick={() => onChange(clearFilters(filters))}>
            Xóa tất cả lọc
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function ActiveChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex h-8 items-center gap-1 rounded-full border border-border-strong/40 bg-surface pr-1 pl-3 text-ink tabular-nums">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Bỏ lọc ${label}`}
        className="grid size-6 place-items-center rounded-full text-ink-muted hover:bg-bg-sunken hover:text-ink"
      >
        <X aria-hidden className="size-3.5" />
      </button>
    </span>
  );
}

/**
 * Thanh khoảng cách (0,5 km → bán kính phục vụ) kèm số hiển thị; kéo xong 400 ms mới đổi URL.
 * Phím mũi tên dùng được ngay (WCAG 2.5.7 — không bắt buộc kéo).
 */
function DistanceField({
  id,
  radiusKm,
  value,
  onCommit,
}: {
  id: string;
  radiusKm: number;
  value: number | null;
  onCommit: (km: number | null) => void;
}) {
  const [km, setKm] = useState(value ?? radiusKm);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function change(next: number) {
    setKm(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onCommit(next >= radiusKm ? null : next), 400);
  }

  const whole = km >= radiusKm;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-ink">
          Khoảng cách tối đa
        </label>
        <output htmlFor={id} className="text-sm font-semibold text-ink tabular-nums">
          {whole ? `Cả bán kính ${formatKm(radiusKm)}` : `≤ ${formatKm(km)}`}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={Math.min(MIN_KM, radiusKm)}
        max={radiusKm}
        step={KM_STEP}
        value={km}
        onChange={(e) => change(Number(e.target.value))}
        aria-valuetext={whole ? `Cả bán kính ${formatKm(radiusKm)}` : `Tối đa ${formatKm(km)}`}
        className="h-11 w-full cursor-pointer accent-primary md:h-9"
      />
      <p className="text-xs text-ink-subtle">Không vượt quá bán kính phục vụ của điểm nhận.</p>
    </div>
  );
}
