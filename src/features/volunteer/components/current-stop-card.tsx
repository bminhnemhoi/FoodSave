"use client";

import {
  Clock3,
  ExternalLink,
  MapPin,
  MapPinCheck,
  Navigation,
  Phone,
  Scale,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { DirectionsLinks } from "@/core/routing";
import { formatKg, formatQty } from "@/features/catalog/labels";
import { formatClock, formatWindow } from "@/features/charity-allocations/present";
import { CarrierHandover } from "@/features/handover/components/carrier-handover";
import { cn } from "@/lib/utils";

import type { VolunteerStop } from "../queries";
import { stopStatusText, type VolunteerPhase } from "../trip-model";
import { CheckInControl } from "./check-in-control";
import { IncidentButton, SkipStopButton } from "./stop-sheets";
import { stopTitle } from "./stop-timeline";

const GRACE_MS = 30 * 60_000;

const CHECK_TEXT: Record<"geofence" | "manual" | "no_location", string> = {
  geofence: "trong phạm vi 100 m",
  manual: "check-in thủ công",
  no_location: "chưa xác minh vị trí",
};

/**
 * Thẻ "Điểm kế tiếp" (PRD US-VOL-05…09): to, tương phản cao, hành động chính ở nửa dưới thẻ (vùng ngón cái).
 * Điểm lấy: chưa tới ⇒ "Tôi đã tới"; đã tới ⇒ "Hiện mã cho cửa hàng". Điểm giao về ⇒ "Hiện mã giao hàng".
 */
export function CurrentStopCard({
  pickupId,
  stop,
  order,
  phase,
  eta,
  directions,
  charityName,
  serverNow,
}: {
  pickupId: string;
  stop: VolunteerStop;
  order: { index: number; total: number };
  phase: VolunteerPhase;
  eta: string | null;
  directions: DirectionsLinks | null;
  charityName: string;
  serverNow: number;
}) {
  const now = new Date(serverNow);
  const titleId = `current-stop-${stop.id}`;
  const running = phase === "in_progress";
  const notStarted = phase === "awaiting_response" || phase === "accepted";
  const isPickup = stop.kind === "pickup";
  const place = isPickup ? stop.orgName || stop.siteName : charityName;
  const kg = stop.lines.reduce((sum, l) => sum + l.qty * l.unitWeightKg, 0);
  const pickupWindow = stop.window
    ? { start: new Date(stop.window.start), end: new Date(stop.window.end) }
    : null;
  const windowState = pickupWindow
    ? serverNow < pickupWindow.start.getTime() - GRACE_MS
      ? "before"
      : serverNow > pickupWindow.end.getTime() + GRACE_MS
        ? "after"
        : "open"
    : null;
  const firstAllocation = stop.lines.find((l) => l.status === "assigned")?.allocationId ?? null;

  return (
    <section
      aria-labelledby={titleId}
      data-current-stop={stop.id}
      className="flex flex-col gap-4 rounded-2xl border-2 border-role-accent-fill bg-surface p-4 shadow-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold tracking-wide text-role-accent uppercase">
          {isPickup ? `Điểm kế tiếp · ${order.index}/${order.total}` : "Điểm cuối · Giao về tổ chức"}
        </p>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-sm font-medium",
            stop.status === "arrived"
              ? "border-success/30 bg-success-soft text-success"
              : "border-info/30 bg-info-soft text-info",
          )}
        >
          {stop.status === "arrived" ? <MapPinCheck aria-hidden className="size-4" /> : null}
          {stopStatusText(stop.kind, stop.status)}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <h2 id={titleId} className="text-[1.375rem] leading-7 font-bold text-pretty text-ink">
          {stopTitle(stop)}
        </h2>
        <p className="flex items-start gap-2 text-[0.9375rem] text-ink">
          <MapPin aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-subtle" />
          <span>{stop.address ?? "Chưa có địa chỉ — liên hệ điều phối viên."}</span>
        </p>
        {pickupWindow ? (
          <p className="flex items-start gap-2 text-[0.9375rem] text-ink tabular-nums">
            <Clock3 aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-subtle" />
            <span>
              Khung giờ lấy <strong className="font-semibold">{formatWindow(pickupWindow, now)}</strong>
              {eta && stop.status === "pending" ? ` · dự kiến tới ${formatClock(eta)}` : ""}
            </span>
          </p>
        ) : eta && stop.status === "pending" ? (
          <p className="flex items-start gap-2 text-[0.9375rem] text-ink tabular-nums">
            <Clock3 aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-subtle" />
            <span>Dự kiến tới {formatClock(eta)}</span>
          </p>
        ) : null}
        {stop.status === "arrived" && stop.arrivedAt ? (
          <p className="flex items-start gap-2 text-[0.9375rem] text-success">
            <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0" />
            <span>
              Đã check-in lúc {formatClock(stop.arrivedAt)}
              {stop.arrivalCheck ? ` (${CHECK_TEXT[stop.arrivalCheck]})` : ""}.
            </span>
          </p>
        ) : null}
      </div>

      {stop.lines.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-base font-semibold text-ink">{isPickup ? "Cần lấy" : "Hàng mang về"}</h3>
          <ul className="divide-y rounded-lg border bg-bg">
            {stop.lines.map((l) => (
              <li
                key={l.allocationId}
                className="flex items-baseline justify-between gap-3 px-3 py-2.5 text-[0.9375rem]"
              >
                <span className="min-w-0 text-ink">{l.title}</span>
                <span className="shrink-0 text-lg font-bold text-ink tabular-nums">
                  {formatQty(l.qty, l.unit)}
                </span>
              </li>
            ))}
          </ul>
          {kg > 0 ? (
            <p className="flex items-center gap-1.5 text-sm text-ink-muted tabular-nums">
              <Scale aria-hidden className="size-4" />
              Tổng khoảng {formatKg(kg)}
            </p>
          ) : null}
        </div>
      ) : null}

      {stop.contact ? (
        <div className="flex items-start gap-2 rounded-lg bg-bg-sunken px-3 py-2.5 text-[0.9375rem]">
          <Phone aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-subtle" />
          <div className="min-w-0">
            <p className="text-ink">
              {isPickup ? "Liên hệ cửa hàng" : "Liên hệ tổ chức"}:{" "}
              <span className="font-semibold tabular-nums">{stop.contact.phoneMasked ?? "chưa có số"}</span>
            </p>
            <p className="text-sm text-ink-muted">
              Số được che một phần để bảo vệ riêng tư. Cần gọi gấp, hãy nhắn điều phối viên của {charityName}.
            </p>
          </div>
        </div>
      ) : null}

      {/* Hành động: nửa dưới thẻ, nút chính cao 52 px toàn chiều rộng */}
      <div className="flex flex-col gap-3">
        {notStarted ? (
          <p className="rounded-md bg-info-soft px-3 py-2 text-sm text-ink">
            Bấm “Bắt đầu chuyến” ở trên khi bạn lên đường để check-in và hiện mã bàn giao.
          </p>
        ) : null}

        {running && isPickup && stop.status === "pending" ? (
          <CheckInControl pickupId={pickupId} stopId={stop.id} placeName={place} />
        ) : null}

        {running && isPickup && stop.status === "arrived" && stop.carrierLines.length > 0 ? (
          <>
            {windowState === "before" && pickupWindow ? (
              <p
                role="status"
                className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-ink"
              >
                Chưa tới khung giờ lấy hàng. Mã mở được từ{" "}
                {formatClock(new Date(pickupWindow.start.getTime() - GRACE_MS))}.
              </p>
            ) : null}
            {windowState === "after" ? (
              <p
                role="status"
                className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-ink"
              >
                Đã quá khung giờ lấy (kể cả 30 phút ân hạn) nên không mở được mã. Hãy báo sự cố hoặc bỏ qua
                điểm này.
              </p>
            ) : null}
            <CarrierHandover
              key={stop.id}
              pickupId={pickupId}
              stopId={stop.id}
              storeName={stop.orgName || "cửa hàng"}
              siteName={stop.siteName}
              lines={stop.carrierLines}
              existing={stop.handover ? { id: stop.handover.id, expiresAt: stop.handover.expiresAt } : null}
              kind="pickup"
              variant="embedded"
              triggerLabel="Hiện mã cho cửa hàng"
            />
          </>
        ) : null}

        {running && !isPickup && stop.carrierLines.length > 0 ? (
          <>
            <CarrierHandover
              key={stop.id}
              pickupId={pickupId}
              stopId={stop.id}
              storeName={charityName}
              siteName={stop.siteName}
              lines={stop.carrierLines}
              existing={stop.handover ? { id: stop.handover.id, expiresAt: stop.handover.expiresAt } : null}
              kind="dropoff"
              variant="embedded"
              triggerLabel="Hiện mã giao hàng"
            />
            {stop.status === "pending" ? (
              <details className="rounded-lg border bg-bg px-3 py-2">
                <summary className="flex min-h-11 cursor-pointer items-center text-[0.9375rem] font-medium text-ink">
                  Báo cho điều phối viên là bạn đã về tới
                </summary>
                <div className="pt-2 pb-1">
                  <CheckInControl
                    pickupId={pickupId}
                    stopId={stop.id}
                    placeName={stop.siteName || charityName}
                  />
                </div>
              </details>
            ) : null}
          </>
        ) : null}

        {directions && (directions.google || directions.apple) ? (
          <div className="grid grid-cols-[1fr_auto] gap-2">
            {directions.google ? (
              <Button asChild variant="outline" size="lg" className="h-12 text-base">
                <a
                  href={directions.google}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-describedby={titleId}
                >
                  <Navigation aria-hidden />
                  Chỉ đường
                  <span className="sr-only"> bằng Google Maps (mở ứng dụng hoặc tab mới)</span>
                </a>
              </Button>
            ) : null}
            {directions.apple ? (
              <Button asChild variant="outline" size="lg" className="h-12 px-3 text-base">
                <a
                  href={directions.apple}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-describedby={titleId}
                >
                  <ExternalLink aria-hidden />
                  Apple Maps
                  <span className="sr-only"> (mở ứng dụng hoặc tab mới)</span>
                </a>
              </Button>
            ) : null}
          </div>
        ) : null}

        {running || notStarted ? (
          <div className="flex flex-wrap gap-x-2 border-t pt-2">
            {isPickup ? <SkipStopButton pickupId={pickupId} stopId={stop.id} placeName={place} /> : null}
            <IncidentButton
              pickupId={pickupId}
              stop={
                isPickup
                  ? { id: stop.id, placeName: place, allocationId: firstAllocation, canSkip: true }
                  : null
              }
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
