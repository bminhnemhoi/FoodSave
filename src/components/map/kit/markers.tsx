"use client";

import { AlarmClock, Check, CircleSlash, Clock, Leaf, TriangleAlert, type LucideIcon } from "lucide-react";

import type { FreshnessLabel } from "@/core/labels";
import { cn } from "@/lib/utils";

import { HouseHeartGlyph, PIN_ROUND, PIN_SQUARE, ScooterGlyph, StoreGlyph } from "./glyphs";

/**
 * Marker minh họa dùng chung (DESIGN-SYSTEM §13.2). Quy ước:
 * - Có `onClick` ⇒ `<button>` (focus bằng bàn phím, vùng chạm ≥ 44 × 44 px); không có ⇒ `<span role="img">`.
 * - `aria-label` luôn đầy đủ bằng chữ; màu không bao giờ là tín hiệu duy nhất (nhãn có icon riêng, điểm dừng có số).
 * - Chữ hiển thị cạnh marker (số lượng, "Bạn ở đây"…) là `aria-hidden` vì đã có trong `aria-label`.
 */

export const LABEL_ICON: Record<FreshnessLabel, LucideIcon> = {
  red: AlarmClock,
  yellow: Clock,
  green: Leaf,
  expired: CircleSlash,
};

export const LABEL_TEXT: Record<FreshnessLabel, string> = {
  red: "Đỏ",
  yellow: "Vàng",
  green: "Xanh",
  expired: "Hết hạn",
};

/** Vòng nhãn = nền của nút (màu solid), viền ngoài halo trắng; Vàng bắt buộc viền `--label-yellow-fg` (§3.6). */
const RING: Record<FreshnessLabel, string> = {
  red: "bg-label-red border-(--map-halo)",
  yellow: "bg-label-yellow border-label-yellow-fg",
  green: "bg-label-green border-(--map-halo)",
  expired: "bg-label-expired border-(--map-halo)",
};

/** Vị trí gần đúng: nền nhạt của nhãn + viền nét đứt (vẫn khác màu giữa các nhãn). */
const APPROX_RING: Record<FreshnessLabel, string> = {
  red: "bg-label-red-bg border-dashed border-label-red",
  yellow: "bg-label-yellow-bg border-dashed border-label-yellow-fg",
  green: "bg-label-green-bg border-dashed border-label-green",
  expired: "bg-label-expired-bg border-dashed border-label-expired",
};

/** Huy hiệu nhãn (icon) — Vàng: icon mực trên nền vàng, viền đậm. */
const BADGE: Record<FreshnessLabel, string> = {
  red: "bg-label-red text-white border-(--map-halo)",
  yellow: "bg-label-yellow text-ink border-label-yellow-fg",
  green: "bg-label-green text-white border-(--map-halo)",
  expired: "bg-label-expired text-white border-(--map-halo)",
};

const SELECTED = "z-10 scale-110 ring-[3px] ring-ink ring-offset-2 ring-offset-(--map-halo)";

type Interactive = {
  ariaLabel: string;
  onClick?: () => void;
  /** `aria-pressed` cho marker chọn được (đồng bộ với danh sách). */
  pressed?: boolean;
  title?: string;
};

function Hit({
  ariaLabel,
  onClick,
  pressed,
  title,
  className,
  children,
  ...rest
}: Interactive & { className?: string; children: React.ReactNode } & Record<`data-${string}`, string>) {
  if (onClick)
    return (
      <button
        type="button"
        aria-label={ariaLabel}
        aria-pressed={pressed}
        title={title}
        onClick={onClick}
        className={cn("outline-offset-4", className)}
        {...rest}
      >
        {children}
      </button>
    );
  return (
    <span role="img" aria-label={ariaLabel} title={title} className={className} {...rest}>
      {children}
    </span>
  );
}

/** Chữ nhỏ dưới marker ("20 ổ", "Cần 50 ổ"). */
function Chip({
  children,
  tone = "ink",
}: {
  children: React.ReactNode;
  tone?: "ink" | "surface" | "info" | "warning";
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "fs-map-chip absolute top-full left-1/2 mt-1 -translate-x-1/2 rounded-full px-2 py-0.5 text-xs leading-4 font-semibold tabular-nums shadow-2",
        tone === "ink" && "bg-ink text-white",
        tone === "surface" && "border bg-surface text-ink",
        tone === "info" && "bg-info text-white",
        tone === "warning" && "border border-warning/40 bg-warning-soft text-ink",
      )}
    >
      {children}
    </span>
  );
}

export function LabelBadge({ label, className }: { label: FreshnessLabel; className?: string }) {
  const Icon = LABEL_ICON[label];
  return (
    <span
      aria-hidden
      className={cn("grid size-[18px] place-items-center rounded-full border-2", BADGE[label], className)}
    >
      <Icon className="size-2.5" strokeWidth={2.75} />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Cửa hàng
// ---------------------------------------------------------------------------

export type StoreMarkerProps = Interactive & {
  /** Nhãn gấp nhất; không có (chưa biết hạn) ⇒ vòng màu tuyến, không huy hiệu nhãn. */
  label?: FreshnessLabel;
  /** Số lô của cửa hàng (> 1 ⇒ huy hiệu góc trên phải). */
  count?: number;
  /** Số thứ tự điểm dừng (phương án ghép) ⇒ huy hiệu góc trên trái. */
  order?: number;
  /** Chữ dưới marker, ví dụ "20 ổ". */
  tag?: string;
  approximate?: boolean;
  selected?: boolean;
  highlighted?: boolean;
};

/** Tiệm có mái hiên, vòng màu theo nhãn gấp nhất; lô Đỏ có quầng tỏa nhẹ. */
export function StoreMarker({
  label,
  count,
  order,
  tag,
  approximate = false,
  selected = false,
  highlighted = false,
  ...hit
}: StoreMarkerProps) {
  return (
    <Hit
      {...hit}
      data-marker="store"
      data-label={label ?? "none"}
      className={cn(
        "relative isolate grid size-11 place-items-center rounded-full border-2 p-1 shadow-2 transition-transform duration-100",
        !label
          ? cn("border-(--map-halo) bg-(--map-route)", approximate && "border-dashed")
          : approximate
            ? APPROX_RING[label]
            : RING[label],
        (selected || highlighted) && SELECTED,
      )}
    >
      {label === "red" && !approximate ? <span aria-hidden className="fs-map-halo" /> : null}
      <span
        aria-hidden
        className={cn(
          "grid size-full place-items-center rounded-full",
          approximate ? "bg-surface/70" : "bg-surface",
        )}
      >
        <StoreGlyph size={22} />
      </span>
      {label ? <LabelBadge label={label} className="absolute -right-1 -bottom-1" /> : null}
      {count && count > 1 ? (
        <span
          aria-hidden
          className="absolute -top-2 -right-2 grid h-5 min-w-5 place-items-center rounded-full bg-ink px-1 text-[11px] leading-none font-bold text-white tabular-nums ring-2 ring-(--map-halo)"
        >
          {count}
        </span>
      ) : null}
      {order ? <OrderBadge n={order} className="absolute -top-2 -left-2" /> : null}
      {tag ? <Chip>{tag}</Chip> : null}
    </Hit>
  );
}

function OrderBadge({ n, className }: { n: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-6 place-items-center rounded-full border-2 border-(--map-halo) bg-(--map-route) text-xs leading-none font-bold text-white tabular-nums shadow-1",
        className,
      )}
    >
      {n}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Cụm
// ---------------------------------------------------------------------------

const CLUSTER_TONE: Record<FreshnessLabel | "charity", string> = {
  red: "bg-label-red text-white border-(--map-halo)",
  yellow: "bg-label-yellow text-ink border-label-yellow-fg",
  green: "bg-label-green text-white border-(--map-halo)",
  expired: "bg-label-expired text-white border-(--map-halo)",
  charity: "bg-surface text-ink border-role-accent",
};

/** Bong bóng cụm: chữ là đúng một con số (số điểm trong cụm); màu theo nhãn gấp nhất trong cụm. */
export function ClusterBubble({
  count,
  tone,
  ariaLabel,
  onClick,
}: {
  count: number;
  tone: FreshnessLabel | "charity";
  ariaLabel: string;
  onClick: () => void;
}) {
  // Một cỡ 44 px cho mọi cụm (cụm to hơn dễ đè lên cụm/điểm bên cạnh — vùng chạm bị che, WCAG 2.5.8)
  const size = count >= 100 ? "size-11 text-sm" : "size-11 text-base";
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      data-marker="cluster"
      {...(tone === "charity" ? { "data-role": "charity" } : {})}
      className={cn(
        "fs-map-cluster grid place-items-center rounded-full border-[3px] font-bold tabular-nums outline-offset-4",
        size,
        CLUSTER_TONE[tone],
      )}
    >
      {count}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Điểm của tôi / điểm giao
// ---------------------------------------------------------------------------

function PinHead({
  kind,
  square = false,
  fill = "var(--ink)",
  ring = "var(--role-accent-fill)",
}: {
  kind: "charity" | "store";
  square?: boolean;
  fill?: string;
  ring?: string;
}) {
  return (
    <>
      <svg width={38} height={50} viewBox="0 0 32 42" aria-hidden className="block drop-shadow-md">
        <path d={square ? PIN_SQUARE : PIN_ROUND} fill={fill} stroke="var(--map-halo)" strokeWidth={2.2} />
        <circle cx={16} cy={16} r={11} fill="var(--surface)" stroke={ring} strokeWidth={2.5} />
      </svg>
      <span aria-hidden className="absolute top-[9px] left-1/2 -translate-x-1/2">
        {kind === "charity" ? <HouseHeartGlyph size={20} /> : <StoreGlyph size={20} />}
      </span>
    </>
  );
}

export type HomePinProps = Interactive & {
  kind: "charity" | "store";
  /** Chữ luôn hiện cạnh ghim, ví dụ "Điểm nhận của bạn", "Giao về". */
  caption?: string;
  done?: boolean;
  selected?: boolean;
};

/** Điểm của chính tổ chức/cửa hàng (giọt nước mực, vòng màu vai trò) — dùng cả cho điểm giao cuối của chuyến. */
export function HomePin({ kind, caption, done = false, selected = false, ...hit }: HomePinProps) {
  return (
    <Hit
      {...hit}
      data-marker={kind === "charity" ? "home-charity" : "home-store"}
      data-role={kind}
      className={cn(
        "relative flex h-[52px] w-11 origin-bottom items-end justify-center rounded-md transition-transform duration-100",
        selected && "z-10 scale-110",
      )}
    >
      <PinHead kind={kind} />
      {done ? (
        <span
          aria-hidden
          className="absolute -top-1 -right-1 grid size-5 place-items-center rounded-full border-2 border-(--map-halo) bg-success text-white"
        >
          <Check className="size-3" strokeWidth={3} />
        </span>
      ) : null}
      {caption ? (
        <span
          aria-hidden
          className="fs-map-chip absolute top-1 left-full ml-0.5 rounded-md bg-ink px-1.5 py-0.5 text-xs leading-4 font-semibold text-white shadow-2"
        >
          {caption}
        </span>
      ) : null}
    </Hit>
  );
}

// ---------------------------------------------------------------------------
// Điểm dừng đánh số
// ---------------------------------------------------------------------------

export type StopStatus = "pending" | "arrived" | "done" | "skipped" | "late";
export type RouteTone = 0 | 1;

const TONE_FILL: Record<RouteTone, string> = { 0: "var(--map-route)", 1: "var(--chart-e)" };

export type StopPinProps = Interactive & {
  seq: number;
  status: StopStatus;
  /** 0 = tuyến chính (ghim tròn xanh dương), 1 = tuyến thứ hai (ghim vuông xanh mòng két). */
  tone?: RouteTone;
  selected?: boolean;
  /** Điểm kế tiếp của TNV: to hơn + chữ "Kế tiếp". */
  current?: boolean;
};

/**
 * Ghim giọt nước có số thứ tự (§13.2 "Điểm dừng tuyến"). Trạng thái bằng màu VÀ ký hiệu: chưa tới = màu tuyến;
 * đã đến = cam (màu TNV — "TNV đang ở đây"); đã lấy = xanh + ✓; trễ = đỏ + "!"; bỏ qua = rỗng, nét đứt, gạch số.
 */
export function StopPin({ seq, status, tone = 0, selected = false, current = false, ...hit }: StopPinProps) {
  const fill =
    status === "done"
      ? "var(--success)"
      : status === "late"
        ? "var(--danger)"
        : status === "arrived"
          ? "var(--map-volunteer)"
          : status === "skipped"
            ? "var(--surface)"
            : TONE_FILL[tone];
  const text =
    status === "arrived" ? "text-ink" : status === "skipped" ? "text-ink-subtle line-through" : "text-white";
  return (
    <Hit
      {...hit}
      data-marker="stop"
      data-status={status}
      className={cn(
        "relative flex h-12 w-11 origin-bottom items-end justify-center rounded-md transition-transform duration-100",
        current && "scale-[1.18]",
        selected && "z-10 scale-[1.22]",
      )}
    >
      <svg width={34} height={44} viewBox="0 0 32 42" aria-hidden className="block drop-shadow-md">
        <path
          d={tone === 1 ? PIN_SQUARE : PIN_ROUND}
          fill={fill}
          stroke={status === "skipped" ? "var(--ink-subtle)" : selected ? "var(--ink)" : "var(--map-halo)"}
          strokeWidth={selected ? 3 : 2.2}
          strokeDasharray={status === "skipped" ? "3 2.5" : undefined}
        />
      </svg>
      <span
        aria-hidden
        className={cn(
          "absolute top-[6px] left-1/2 grid h-5 min-w-5 -translate-x-1/2 place-items-center text-[15px] leading-none font-bold tabular-nums",
          text,
        )}
      >
        {status === "done" ? <Check className="size-4" strokeWidth={3} /> : seq}
      </span>
      {status === "late" ? (
        <span
          aria-hidden
          className="absolute -top-1 -right-1 grid size-5 place-items-center rounded-full border-2 border-(--map-halo) bg-danger text-white"
        >
          <TriangleAlert className="size-3" strokeWidth={2.75} />
        </span>
      ) : null}
      {current ? (
        <span
          aria-hidden
          className="fs-map-chip absolute top-1 left-full ml-0.5 rounded-md bg-ink px-1.5 py-0.5 text-[11px] leading-4 font-semibold text-white shadow-2"
        >
          Kế tiếp
        </span>
      ) : null}
    </Hit>
  );
}

// ---------------------------------------------------------------------------
// Tình nguyện viên / Bạn ở đây / Nhu cầu
// ---------------------------------------------------------------------------

/**
 * Tình nguyện viên trên xe máy (vị trí mới nhất, cập nhật 20 giây/lần khi TNV đồng ý). `stale` (> 10 phút) ⇒
 * xám, viền nét đứt và chữ cảnh báo — vị trí có thể đã cũ.
 */
export function VolunteerMarker({
  ariaLabel,
  label,
  stale = false,
}: {
  ariaLabel: string;
  /** Chữ dưới marker: "Minh An · cập nhật 3 phút trước". */
  label: string;
  stale?: boolean;
}) {
  return (
    <span
      role="img"
      aria-label={ariaLabel}
      data-marker="volunteer"
      data-stale={stale ? "true" : "false"}
      className="relative grid size-11 place-items-center"
    >
      <span
        aria-hidden
        className={cn(
          "grid size-10 place-items-center rounded-full border-[2.5px] shadow-2",
          stale
            ? "border-dashed border-ink-subtle bg-label-expired-bg opacity-90"
            : "border-ink bg-(--map-volunteer)",
        )}
      >
        <ScooterGlyph size={24} />
      </span>
      <span
        aria-hidden
        className={cn(
          "fs-map-chip absolute top-full left-1/2 mt-1 flex -translate-x-1/2 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] leading-4 font-medium shadow-2",
          stale ? "border border-warning/40 bg-warning-soft text-ink" : "bg-surface text-ink",
        )}
      >
        {stale ? <TriangleAlert className="size-3 text-warning" /> : null}
        {label}
      </span>
    </span>
  );
}

/** "Bạn ở đây": vị trí GPS của chính người dùng (chỉ khi đang chia sẻ). */
export function YouAreHereMarker({ ariaLabel = "Vị trí của bạn (bạn ở đây)" }: { ariaLabel?: string }) {
  return (
    <span
      role="img"
      aria-label={ariaLabel}
      title="Vị trí của bạn"
      data-marker="you"
      className="relative grid size-9 place-items-center"
    >
      <span aria-hidden className="absolute inset-0 rounded-full bg-info/20" />
      <span aria-hidden className="size-4 rounded-full border-[3px] border-(--map-halo) bg-info shadow-2" />
      <Chip tone="info">Bạn ở đây</Chip>
    </span>
  );
}

/** Nhu cầu của tổ chức (màn cửa hàng): mái nhà có tim trên nền giấy, viền màu tổ chức. */
export function NeedMarker({
  approximate = false,
  selected = false,
  tag,
  ...hit
}: Interactive & { approximate?: boolean; selected?: boolean; tag?: string }) {
  return (
    <Hit
      {...hit}
      data-marker="need"
      data-role="charity"
      className={cn(
        "relative grid size-11 place-items-center rounded-full border-[3px] bg-surface shadow-2 transition-transform duration-100",
        approximate ? "border-dashed border-role-accent" : "border-role-accent",
        selected && SELECTED,
      )}
    >
      <HouseHeartGlyph size={24} />
      {tag ? <Chip>{tag}</Chip> : null}
    </Hit>
  );
}
