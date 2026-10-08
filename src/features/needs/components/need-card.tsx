import { ArrowRight, CalendarClock, Home } from "lucide-react";
import Link from "next/link";

import { Countdown } from "@/components/labels/live-freshness";
import { Button } from "@/components/ui/button";
import { UNIT_LABEL } from "@/features/catalog/labels";
import { formatDayTime } from "@/features/charity-allocations/present";
import { cn } from "@/lib/utils";

import { formatAmount } from "../present";
import type { NeedRecord } from "../queries";
import { CancelNeedButton } from "./cancel-need-button";
import { NeedProgressBar, NeedStatusBadge } from "./need-badges";

/** Thẻ nhu cầu trong danh sách (NeedCard, DESIGN-SYSTEM §11.2): số cần, danh mục, cần trước, tiến độ ba lớp. */
export function NeedCard({
  need,
  siteName,
  categoryNames,
  serverNow,
  canCancel,
  compact = false,
}: {
  need: NeedRecord;
  siteName: string;
  categoryNames: string[];
  serverNow: number;
  canCancel: boolean;
  compact?: boolean;
}) {
  const unitLabel = UNIT_LABEL[need.unit];
  const titleId = `need-${need.id}`;
  const summary = `${formatAmount(need.quantity)} ${unitLabel}`;
  const href = `/charity/needs/${need.id}`;
  return (
    <article
      aria-labelledby={titleId}
      className={cn(
        "flex flex-col gap-4 rounded-xl border bg-surface p-4 shadow-1 sm:p-5",
        compact && "gap-3 bg-bg shadow-none",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 id={titleId} className="text-lg font-semibold">
            <Link href={href} className="rounded-sm underline-offset-4 hover:underline">
              <span className="tabular-nums">{summary}</span>
              <span className="font-normal text-ink-muted"> · {categoryNames.join(", ")}</span>
            </Link>
          </h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted tabular-nums">
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock aria-hidden className="size-4 shrink-0" />
              <span>
                Cần trước {formatDayTime(need.neededBy, new Date(serverNow))}
                {need.live ? (
                  <>
                    {" "}
                    (<Countdown deadline={need.neededBy} serverNow={serverNow} />)
                  </>
                ) : null}
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Home aria-hidden className="size-4" />
              {siteName}
            </span>
          </p>
        </div>
        <NeedStatusBadge status={need.displayStatus} className="shrink-0" />
      </div>

      {compact ? null : <NeedProgressBar progress={need.progress} unitLabel={unitLabel} size="sm" />}

      <div className="flex flex-wrap items-center justify-between gap-2">
        {compact ? (
          <p className="text-sm text-ink-muted tabular-nums">
            Đã giao {formatAmount(need.qtyDelivered)}/{formatAmount(need.quantity)} {unitLabel}
            {need.cancelReason ? ` · Lý do hủy: ${need.cancelReason}` : ""}
          </p>
        ) : (
          <p className="text-sm text-ink-muted">
            {need.remaining > 0
              ? `Còn thiếu ${formatAmount(need.remaining)} ${unitLabel}`
              : "Đã có cửa hàng giữ đủ"}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-1">
          {need.live && canCancel ? (
            <CancelNeedButton
              needId={need.id}
              summary={summary}
              liveStores={need.qtyInFlight > 0 ? null : 0}
            />
          ) : null}
          <Button asChild variant={compact ? "ghost" : "outline"} size="sm">
            <Link href={href} aria-describedby={titleId}>
              {need.live && need.remaining > 0 ? "Xem phương án ghép" : "Xem chi tiết"}
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        </div>
      </div>
    </article>
  );
}
