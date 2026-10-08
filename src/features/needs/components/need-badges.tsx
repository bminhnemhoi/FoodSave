import { cn } from "@/lib/utils";

import { BUNDLE_STATUS, NEED_STATUS, STATUS_TONE_CLASS, type BundleStatus, type NeedStatus } from "../labels";
import { formatAmount, type NeedProgress } from "../present";

/** Badge trạng thái nhu cầu (DESIGN-SYSTEM §12.7) — tông ngữ nghĩa, luôn icon + chữ. */
export function NeedStatusBadge({ status, className }: { status: NeedStatus; className?: string }) {
  const { text, tone, icon: Icon } = NEED_STATUS[status];
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        STATUS_TONE_CLASS[tone],
        className,
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {text}
    </span>
  );
}

export function BundleStatusBadge({ status, className }: { status: BundleStatus; className?: string }) {
  const { text, tone, icon: Icon } = BUNDLE_STATUS[status];
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        STATUS_TONE_CLASS[tone],
        className,
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {text}
    </span>
  );
}

/**
 * Thanh tiến độ ba lớp (US-CHA-13 AC1): đã giao (đặc) · đang giữ (sọc) · còn thiếu (nền). Hình dạng khác nhau
 * nên không chỉ dựa vào màu; chú giải bằng chữ + số ngay bên dưới là bản tương đương cho trình đọc màn hình.
 */
export function NeedProgressBar({
  progress,
  unitLabel,
  size = "md",
  className,
}: {
  progress: NeedProgress;
  unitLabel: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const { delivered, inFlight, missing, pctDelivered, pctInFlight } = progress;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div
        aria-hidden
        className={cn(
          "flex w-full overflow-hidden rounded-full border border-border bg-bg-sunken",
          size === "sm" ? "h-2" : "h-3",
        )}
      >
        <span className="h-full bg-success" style={{ width: `${pctDelivered}%` }} />
        <span
          className="h-full bg-[repeating-linear-gradient(135deg,var(--info)_0_5px,color-mix(in_oklch,var(--info),var(--surface)_45%)_5px_10px)]"
          style={{ width: `${pctInFlight}%` }}
        />
      </div>
      <dl className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-ink-muted tabular-nums">
        <div className="flex items-center gap-1.5">
          <dt className="flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-full bg-success" />
            Đã giao
          </dt>
          <dd className="font-semibold text-ink">
            {formatAmount(delivered)} {unitLabel}
          </dd>
        </div>
        <div className="flex items-center gap-1.5">
          <dt className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2.5 rounded-full bg-[repeating-linear-gradient(135deg,var(--info)_0_2px,color-mix(in_oklch,var(--info),var(--surface)_45%)_2px_4px)]"
            />
            Đang giữ
          </dt>
          <dd className="font-semibold text-ink">
            {formatAmount(inFlight)} {unitLabel}
          </dd>
        </div>
        <div className="flex items-center gap-1.5">
          <dt className="flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-full border border-border-strong bg-bg-sunken" />
            Còn thiếu
          </dt>
          <dd className={cn("font-semibold", missing > 0 ? "text-warning" : "text-ink")}>
            {formatAmount(missing)} {unitLabel}
          </dd>
        </div>
      </dl>
    </div>
  );
}
