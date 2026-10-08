import { ArrowRight, Clock3, Home, Scale, Store } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { formatKg } from "@/features/catalog/labels";
import { formatDayTime } from "@/features/charity-allocations/present";
import { cn } from "@/lib/utils";

import type { LocationConsent } from "../consent";
import type { VolunteerTripSummary } from "../queries";
import { PhaseBadge } from "./phase-badge";
import { RespondButtons, StartTripButton } from "./trip-actions";

/**
 * Thẻ chuyến trên "Hôm nay"/"Chuyến" (US-VOL-03 AC1): giờ bắt đầu dự kiến, số điểm dừng, tổng kg, tổ chức,
 * trạng thái — và đúng một hành động chính theo trạng thái (nhận/từ chối, bắt đầu, tiếp tục).
 */
export function TripCard({
  trip,
  consent,
  now,
  showActions = true,
}: {
  trip: VolunteerTripSummary;
  consent: LocationConsent;
  now: Date;
  showActions?: boolean;
}) {
  const href = `/volunteer/trips/${trip.id}`;
  const titleId = `trip-${trip.id}-title`;
  const stores =
    trip.storeNames.length > 2
      ? `${trip.storeNames.slice(0, 2).join(", ")} và ${trip.storeNames.length - 2} nơi khác`
      : trip.storeNames.join(", ");
  const finished = trip.phase === "completed" || trip.phase === "cancelled";
  const timeText =
    trip.phase === "completed" && trip.completedAt
      ? `Xong lúc ${formatDayTime(trip.completedAt, now)}`
      : trip.phase === "cancelled" && trip.cancelledAt
        ? `Hủy lúc ${formatDayTime(trip.cancelledAt, now)}`
        : `Bắt đầu ${formatDayTime(trip.startAt, now)}`;

  return (
    <article
      aria-labelledby={titleId}
      data-trip-card={trip.id}
      className={cn(
        "flex flex-col gap-3 rounded-xl border bg-surface p-4 shadow-1",
        trip.phase === "in_progress" && "border-role-accent/50 ring-1 ring-role-accent/30",
        finished && "bg-bg",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PhaseBadge phase={trip.phase} />
        <p className="flex items-center gap-1.5 text-sm text-ink-muted tabular-nums">
          <Clock3 aria-hidden className="size-4" />
          {timeText}
        </p>
      </div>

      <h3 id={titleId} className="text-lg leading-snug font-semibold text-pretty">
        <Link href={href} className="rounded-sm underline-offset-4 hover:underline">
          Chuyến cho {trip.charityName}
        </Link>
      </h3>

      <ul className="flex flex-col gap-1.5 text-[0.9375rem] text-ink-muted">
        <li className="flex items-start gap-2">
          <Store aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-subtle" />
          <span>
            <span className="font-medium text-ink tabular-nums">
              {trip.phase === "in_progress"
                ? `Đã xong ${trip.closedStops}/${trip.pickupStops} điểm lấy`
                : `${trip.pickupStops} điểm lấy hàng`}
            </span>
            {stores ? `: ${stores}` : ""}
          </span>
        </li>
        <li className="flex items-start gap-2">
          <Home aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-subtle" />
          <span>Giao về {trip.dropoffSiteName}</span>
        </li>
        {trip.totalKg > 0 ? (
          <li className="flex items-start gap-2 tabular-nums">
            <Scale aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-subtle" />
            <span>Khoảng {formatKg(trip.totalKg)}</span>
          </li>
        ) : null}
      </ul>

      {showActions && trip.phase === "awaiting_response" ? <RespondButtons pickupId={trip.id} /> : null}
      {showActions && trip.phase === "accepted" ? (
        <StartTripButton pickupId={trip.id} consent={consent} navigateTo={href} />
      ) : null}
      {showActions && trip.phase === "in_progress" ? (
        <Button asChild size="lg" className="h-[3.25rem] w-full text-lg">
          <Link href={href} aria-describedby={titleId}>
            Tiếp tục chuyến
            <ArrowRight aria-hidden className="size-5" />
          </Link>
        </Button>
      ) : null}
      {!showActions || trip.phase !== "in_progress" ? (
        <Link
          href={href}
          aria-describedby={titleId}
          className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-md text-[0.9375rem] font-medium text-ink underline-offset-4 hover:underline"
        >
          Xem chi tiết chuyến
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      ) : null}
    </article>
  );
}
