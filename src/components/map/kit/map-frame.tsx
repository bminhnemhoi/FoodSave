"use client";

import { Info, Scan, X } from "lucide-react";
import { cloneElement, isValidElement } from "react";

import { cn } from "@/lib/utils";

/**
 * Khung bản đồ dùng chung (DESIGN-SYSTEM §13): vùng `role="region"` có `aria-label`, dòng chú thích một câu phía
 * trên ("bản đồ này cho thấy gì"), thân bản đồ chứa canvas + thẻ thông tin, chân khung gồm chú giải và nút "Vừa
 * khung" (không che marker, không đè nút điều khiển của bản đồ).
 * Esc trong vùng bản đồ ⇒ `onEscape` (bỏ chọn / đóng thẻ).
 */
export function MapFrame({
  ariaLabel,
  caption,
  legend,
  fit,
  onEscape,
  className,
  children,
}: {
  ariaLabel: string;
  caption?: React.ReactNode;
  /** Chú giải (`MapLegend`) — chân khung, dưới bản đồ. */
  legend?: React.ReactNode;
  /** Nút "Vừa khung" ở chân khung (đưa mọi điểm vào khung nhìn). */
  fit?: { onClick: () => void; hint?: string } | null;
  onEscape?: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="region"
      aria-label={ariaLabel}
      onKeyDown={(e) => {
        if (e.key === "Escape" && onEscape) onEscape();
      }}
      className={cn(
        "flex size-full flex-col overflow-hidden rounded-xl border bg-bg-sunken",
        // Nút phóng to/thu nhỏ 44 px (DESIGN-SYSTEM §13.1)
        "[&_.maplibregl-ctrl-group_button]:size-11",
        className,
      )}
    >
      {caption ? <MapCaption>{caption}</MapCaption> : null}
      <div className="relative min-h-0 flex-1">{children}</div>
      {legend || fit ? (
        <div className="shrink-0 border-t bg-surface">
          {isValidElement<{ action?: React.ReactNode }>(legend) ? (
            cloneElement(legend, {
              action: fit ? <FitFooterButton onClick={fit.onClick} hint={fit.hint} /> : undefined,
            })
          ) : (
            <div className="flex justify-end px-2">
              {fit ? <FitFooterButton onClick={fit.onClick} hint={fit.hint} /> : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** Một câu nói bản đồ cho thấy gì, đặt trên bản đồ (không chồng lên tile). */
export function MapCaption({ children }: { children: React.ReactNode }) {
  return (
    <p
      data-map-caption
      className="flex shrink-0 items-start gap-2 border-b bg-surface px-3 py-2 text-sm leading-5 text-ink"
    >
      <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-info" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/** Nút "Vừa khung" nổi trên bản đồ (góc trên trái, 44 px) — dùng khi khung không có chân (bộ chọn vị trí). */
export function FitButton({ onClick, hint }: { onClick: () => void; hint?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute top-2.5 left-2.5 z-[2] inline-flex min-h-11 items-center gap-1.5 rounded-lg border bg-surface px-3 text-sm font-medium text-ink shadow-2 hover:bg-bg"
    >
      <Scan aria-hidden className="size-4" />
      Vừa khung
      {hint ? <span className="sr-only">: {hint}</span> : null}
    </button>
  );
}

/** "Vừa khung" ở chân khung, cạnh chú giải — không đè lên marker hay nút điều khiển của bản đồ. */
function FitFooterButton({ onClick, hint }: { onClick: () => void; hint?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-ink hover:bg-bg-sunken sm:min-h-8"
    >
      <Scan aria-hidden className="size-4 text-ink-muted" />
      Vừa khung
      {hint ? <span className="sr-only">: {hint}</span> : null}
    </button>
  );
}

/** Thẻ thông tin khi chạm một điểm (đáy khung bản đồ; Esc hoặc nút X để đóng). */
export function MapInfoCard({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children?: React.ReactNode;
}) {
  return (
    <section
      aria-label={title}
      data-map-card
      className="absolute inset-x-2 bottom-2 z-10 flex items-start gap-2 rounded-xl border bg-surface p-3 shadow-3 sm:right-auto sm:max-w-sm"
    >
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold text-ink">{title}</p>
        {children ? <div className="mt-1 text-ink-muted">{children}</div> : null}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Đóng thẻ thông tin"
        className="-m-1 grid size-11 shrink-0 place-items-center rounded-lg text-ink-muted hover:bg-bg-sunken hover:text-ink"
      >
        <X aria-hidden className="size-5" />
      </button>
    </section>
  );
}

/** Đang dùng nền dự phòng (OpenFreeMap). */
export function FallbackNotice() {
  return (
    <p className="absolute top-16 left-1/2 z-[2] -translate-x-1/2 rounded bg-surface/90 px-2 py-1 text-xs whitespace-nowrap text-ink-muted shadow-1 sm:top-2.5">
      Đang dùng bản đồ dự phòng
    </p>
  );
}
