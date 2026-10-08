"use client";

import { AlarmClock, CalendarClock, Clock, Eye, MapPin, Store } from "lucide-react";

import { LiveFreshness } from "@/components/labels/live-freshness";
import { formatKg, formatQty } from "@/features/catalog/labels";

import { formatDeadline, formatWindow } from "../datetime";
import { computeDeadlinePreview, DEADLINE_REASON_LABEL } from "../preview";
import { parseDecimal, parseOfferTimes, type CategoryOption, type OfferFormValues } from "../schemas";
import { OfferThumbClient } from "./offer-thumb-client";

/**
 * Xem trước lô khi đăng (US-STO-09): hạn hiệu lực = mốc đến trước trong (hạn dùng, cuối khung lấy, giờ đóng
 * cửa của điểm — RPC `site_close_at`), nhãn hiện tại, giờ chuyển Vàng/Đỏ. Giá trị chính thức do RPC tính lúc đăng.
 */
export function OfferPreview({
  values,
  category,
  siteName,
  photoUrl,
  siteClose,
  serverNow,
  now,
}: {
  values: OfferFormValues;
  category: CategoryOption | null;
  siteName: string | null;
  photoUrl: string | null;
  /** `undefined` = đang tải; `null` = điểm không khai giờ (mở 24/7). */
  siteClose: string | null | undefined;
  serverNow: number;
  now: Date;
}) {
  const times = parseOfferTimes(values);
  const siteCloseAt = siteClose ? new Date(siteClose) : null;
  const preview = computeDeadlinePreview({
    expiresAt: times.expiresAt,
    pickupEnd: times.pickupEnd,
    siteCloseAt,
    perishability: category?.perishability ?? null,
    now,
  });
  const qty = parseDecimal(values.quantity);
  const unit = values.unit || null;
  const weight =
    unit === "kg"
      ? 1
      : values.weightSource === "category_default"
        ? (category?.defaultUnitWeightKg ?? null)
        : parseDecimal(values.unitWeightKg);
  const title = values.title.trim();

  return (
    <section
      aria-labelledby="offer-preview-title"
      className="flex flex-col gap-4 rounded-xl border bg-surface p-4 shadow-1 sm:p-5"
    >
      <div className="flex items-center gap-2">
        <Eye aria-hidden className="size-4 text-ink-subtle" />
        <h2 id="offer-preview-title" className="text-base font-semibold">
          Xem trước
        </h2>
        <span className="text-xs text-ink-subtle">— tổ chức sẽ thấy lô như sau</span>
      </div>

      <div className="flex gap-3">
        <OfferThumbClient photoUrl={photoUrl} icon={category?.icon ?? null} />
        <div className="min-w-0">
          <p className={title ? "font-semibold break-words" : "font-semibold text-ink-subtle"}>
            {title || "Tên lô"}
          </p>
          <p className="text-sm text-ink-muted">{category?.nameVi ?? "Chưa chọn danh mục"}</p>
          {siteName ? (
            <p className="mt-0.5 flex items-center gap-1 text-sm text-ink-muted">
              <Store aria-hidden className="size-3.5" />
              {siteName}
            </p>
          ) : null}
        </div>
      </div>

      <p className="text-sm tabular-nums">
        {qty && unit ? (
          <>
            <span className="font-semibold">{formatQty(qty, unit)}</span>
            {weight ? <span className="text-ink-muted"> · ≈ {formatKg(qty * weight)}</span> : null}
          </>
        ) : (
          <span className="text-ink-subtle">Chưa nhập số lượng</span>
        )}
      </p>

      {preview ? (
        <div className="flex flex-col gap-3 rounded-lg border bg-bg p-3">
          <LiveFreshness
            deadline={preview.deadline.toISOString()}
            serverNow={serverNow}
            perishability={category!.perishability}
          />
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
            <dt className="flex items-center gap-1.5 text-ink-muted">
              <CalendarClock aria-hidden className="size-4" />
              Hạn hiệu lực
            </dt>
            <dd className="font-semibold tabular-nums">
              {formatDeadline(preview.deadline, now)}{" "}
              <span className="font-normal text-ink-muted">({DEADLINE_REASON_LABEL[preview.reason]})</span>
            </dd>
            {preview.turnsYellowAt ? (
              <>
                <dt className="flex items-center gap-1.5 text-ink-muted">
                  <Clock aria-hidden className="size-4" />
                  Chuyển Vàng
                </dt>
                <dd className="tabular-nums">{formatDeadline(preview.turnsYellowAt, now)}</dd>
              </>
            ) : null}
            {preview.turnsRedAt ? (
              <>
                <dt className="flex items-center gap-1.5 text-ink-muted">
                  <AlarmClock aria-hidden className="size-4" />
                  Chuyển Đỏ
                </dt>
                <dd className="tabular-nums">{formatDeadline(preview.turnsRedAt, now)}</dd>
              </>
            ) : null}
          </dl>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed bg-bg p-3 text-sm text-ink-muted">
          Chọn danh mục và hạn sử dụng để xem nhãn Xanh/Vàng/Đỏ và hạn hiệu lực của lô.
        </p>
      )}

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-ink-muted">Hạn sử dụng</dt>
        <dd className="tabular-nums">
          {times.expiresAt ? (
            <>
              {formatDeadline(times.expiresAt, now)}
              {values.expiryTime.trim() === "" ? (
                <span className="text-ink-subtle"> (chỉ có ngày, tính đến 23:59)</span>
              ) : null}
            </>
          ) : (
            <span className="text-ink-subtle">—</span>
          )}
        </dd>
        <dt className="text-ink-muted">Khung giờ lấy</dt>
        <dd className="tabular-nums">
          {times.pickupStart && times.pickupEnd && times.pickupEnd > times.pickupStart ? (
            formatWindow(times.pickupStart, times.pickupEnd, now)
          ) : (
            <span className="text-ink-subtle">—</span>
          )}
        </dd>
        <dt className="flex items-center gap-1 text-ink-muted">
          <MapPin aria-hidden className="size-3.5" />
          Đóng cửa
        </dt>
        <dd className="tabular-nums">
          {siteClose === undefined ? (
            <span className="text-ink-subtle">Đang kiểm tra giờ mở cửa…</span>
          ) : siteCloseAt ? (
            formatDeadline(siteCloseAt, now)
          ) : (
            <span className="text-ink-muted">Điểm mở cả ngày (chưa khai giờ đóng cửa)</span>
          )}
        </dd>
      </dl>

      <p className="text-xs text-ink-subtle">
        Nhãn tự cập nhật theo thời gian thực. Hạn hiệu lực chính thức do FoodSave tính ngay lúc đăng.
      </p>
    </section>
  );
}
