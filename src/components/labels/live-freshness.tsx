"use client";

import { useEffect, useState } from "react";

import { freshnessLabel, nextLabelChangeAt, type Perishability } from "@/core/labels";
import { cn } from "@/lib/utils";

import { FreshnessBadge } from "./freshness-badge";

/**
 * Nhãn tươi + đếm ngược "sống" (DESIGN-SYSTEM §3.6, ADR-005): nhãn tính lúc đọc từ `effective_deadline`,
 * tự chuyển Xanh → Vàng → Đỏ → Hết hạn đúng thời điểm mà không cần tải lại trang.
 * Server render giá trị tại `serverNow` (tránh lệch hydrate), client cập nhật mỗi 30 giây
 * (mỗi giây khi còn dưới 1 giờ).
 */

function useNow(deadlineMs: number, serverNow: number): number {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      const remaining = deadlineMs - t;
      if (remaining <= 0) return;
      timer = setTimeout(tick, remaining < 60 * 60 * 1000 ? 1000 : 30_000);
    };
    tick();
    return () => clearTimeout(timer);
  }, [deadlineMs]);
  return now;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "còn 2 ngày 3 giờ" · "còn 3 giờ 05 phút" · "còn 12:04" (dưới 1 giờ, phút:giây) · "đã hết hạn". */
export function formatRemaining(ms: number): string {
  if (ms <= 0) return "đã hết hạn";
  const totalMin = Math.floor(ms / 60_000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const minutes = totalMin % 60;
  if (days > 0) return `còn ${days} ngày${hours ? ` ${hours} giờ` : ""}`;
  if (hours > 0) return `còn ${hours} giờ ${pad(minutes)} phút`;
  const seconds = Math.floor((ms % 60_000) / 1000);
  return `còn ${pad(minutes)}:${pad(seconds)}`;
}

type CountdownProps = {
  /** ISO `effective_deadline`. */
  deadline: string;
  /** `Date.now()` lúc server render (ms). */
  serverNow: number;
  className?: string;
};

/** Đếm ngược tới hạn hiệu lực, số tabular; `<time>` cho trình đọc màn hình. */
export function Countdown({ deadline, serverNow, className }: CountdownProps) {
  const deadlineMs = new Date(deadline).getTime();
  const now = useNow(deadlineMs, serverNow);
  return (
    <time dateTime={deadline} className={cn("tabular-nums", className)} suppressHydrationWarning>
      {formatRemaining(deadlineMs - now)}
    </time>
  );
}

type LiveFreshnessProps = CountdownProps & {
  perishability: Perishability;
  size?: "sm" | "md";
  /** Ẩn đếm ngược, chỉ hiện nhãn. */
  badgeOnly?: boolean;
};

/** Pill nhãn tươi tự cập nhật + đếm ngược bên cạnh. */
export function LiveFreshness({
  deadline,
  serverNow,
  perishability,
  size = "md",
  badgeOnly = false,
  className,
}: LiveFreshnessProps) {
  const deadlineMs = new Date(deadline).getTime();
  const now = useNow(deadlineMs, serverNow);
  const label = freshnessLabel(new Date(deadlineMs), perishability, new Date(now));
  const changeAt = nextLabelChangeAt(new Date(deadlineMs), perishability, new Date(now));
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-2", className)}>
      <FreshnessBadge label={label} size={size} />
      {badgeOnly ? null : (
        <time
          dateTime={deadline}
          className={cn(
            "tabular-nums",
            size === "sm" ? "text-xs" : "text-sm",
            label === "red" ? "font-semibold text-label-red-fg" : "text-ink-muted",
          )}
          title={changeAt ? undefined : "Lô đã quá hạn hiệu lực"}
          suppressHydrationWarning
        >
          {formatRemaining(deadlineMs - now)}
        </time>
      )}
    </span>
  );
}
