import { CalendarClock, Home, NotebookText, Users } from "lucide-react";

import { Countdown } from "@/components/labels/live-freshness";
import { UNIT_LABEL } from "@/features/catalog/labels";
import { formatDayTime } from "@/features/charity-allocations/present";
import { categoryIcon } from "@/features/marketplace/components/category-icon";
import { cn } from "@/lib/utils";

import { formatAmount } from "../present";
import type { CategoryInfo, NeedRecord } from "../queries";
import { NeedProgressBar, NeedStatusBadge } from "./need-badges";

/** Thẻ tóm tắt nhu cầu (US-CHA-13): số cần, danh mục, cần trước + đếm ngược, điểm nhận, tiến độ ba lớp. */
export function NeedSummary({
  need,
  siteName,
  categories,
  serverNow,
}: {
  need: NeedRecord;
  siteName: string;
  categories: CategoryInfo[];
  serverNow: number;
}) {
  const unitLabel = UNIT_LABEL[need.unit];
  const now = new Date(serverNow);
  const cats = need.categoryCodes.map(
    (c) => categories.find((x) => x.code === c) ?? { code: c, name: c, icon: "" },
  );
  return (
    <section
      aria-labelledby="need-summary-heading"
      className="grid gap-6 rounded-xl border bg-surface p-4 shadow-1 sm:p-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-center"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="need-summary-heading" className="sr-only">
            Tóm tắt nhu cầu
          </h2>
          <NeedStatusBadge status={need.displayStatus} />
          {need.live ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-ink-muted tabular-nums">
              <CalendarClock aria-hidden className="size-4" />
              <Countdown deadline={need.neededBy} serverNow={serverNow} className="font-medium text-ink" />
            </span>
          ) : null}
        </div>
        <p className="flex items-baseline gap-2">
          <span className="text-5xl leading-none font-bold tracking-tight text-ink tabular-nums">
            {formatAmount(need.quantity)}
          </span>
          <span className="text-xl font-semibold text-ink-muted">{unitLabel}</span>
        </p>
        <ul aria-label="Danh mục thay thế được" className="flex flex-wrap gap-2">
          {cats.map((c) => {
            const Icon = categoryIcon(c.icon);
            return (
              <li
                key={c.code}
                className="inline-flex items-center gap-1.5 rounded-full border bg-bg-sunken px-3 py-1 text-sm text-ink"
              >
                <Icon aria-hidden className="size-4 text-ink-muted" />
                {c.name}
              </li>
            );
          })}
        </ul>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="flex items-center gap-1.5 text-ink-subtle">
              <CalendarClock aria-hidden className="size-4" />
              Cần trước
            </dt>
            <dd className="font-medium text-ink tabular-nums">{formatDayTime(need.neededBy, now)}</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1.5 text-ink-subtle">
              <Home aria-hidden className="size-4" />
              Điểm nhận
            </dt>
            <dd className="font-medium text-ink">{siteName}</dd>
          </div>
          {need.peopleToServe ? (
            <div>
              <dt className="flex items-center gap-1.5 text-ink-subtle">
                <Users aria-hidden className="size-4" />
                Người được hỗ trợ
              </dt>
              <dd className="font-medium text-ink tabular-nums">{formatAmount(need.peopleToServe)} người</dd>
            </div>
          ) : null}
          {need.note ? (
            <div className="sm:col-span-2">
              <dt className="flex items-center gap-1.5 text-ink-subtle">
                <NotebookText aria-hidden className="size-4" />
                Ghi chú
              </dt>
              <dd className="text-ink">{need.note}</dd>
            </div>
          ) : null}
        </dl>
      </div>
      <div className={cn("flex flex-col gap-3 rounded-lg border bg-bg p-4")}>
        <p className="text-sm font-medium text-ink">Tiến độ</p>
        <NeedProgressBar progress={need.progress} unitLabel={unitLabel} />
        <p className="text-sm text-ink-muted">
          {need.displayStatus === "fulfilled"
            ? "Đã nhận đủ — cảm ơn các cửa hàng đã đồng hành."
            : need.remaining > 0
              ? `Còn thiếu ${formatAmount(need.remaining)} ${unitLabel} chưa có cửa hàng giữ.`
              : "Đã có cửa hàng giữ đủ số lượng — chờ lấy và giao về điểm nhận."}
        </p>
      </div>
    </section>
  );
}
