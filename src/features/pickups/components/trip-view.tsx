"use client";

import {
  Check,
  Clock3,
  ExternalLink,
  EyeOff,
  Home,
  LocateOff,
  MapPin,
  PackageCheck,
  QrCode,
  Store,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { formatKg, formatQty } from "@/features/catalog/labels";
import { formatDayTime, formatWindow, spanRanges } from "@/features/charity-allocations/present";
import { cn } from "@/lib/utils";

import { googleMapsDirectionsUrl, straightLine } from "../geo";
import type { StopStatus, Trip, TripStop } from "../queries";
import type { TripMapStop } from "./trip-map";
import { TripMapLazy } from "./trip-map-lazy";

const PICKUP_STOP_TEXT: Record<StopStatus, string> = {
  pending: "Chưa tới",
  arrived: "Đã đến",
  done: "Đã lấy hàng",
  skipped: "Bỏ qua",
};
const DROPOFF_STOP_TEXT: Record<StopStatus, string> = {
  pending: "Chờ giao về",
  arrived: "Đã về tới",
  done: "Đã giao về",
  skipped: "Bỏ qua",
};
const SKIP_REASON: Record<string, string> = {
  no_allocations: "không còn lô nào ở điểm này",
  nothing_to_deliver: "không còn hàng để giao",
};

function stopTitle(s: TripStop): string {
  if (s.kind === "dropoff") return `Giao về ${s.siteName}`;
  return s.siteName && s.siteName !== s.orgName ? `${s.orgName} · ${s.siteName}` : s.orgName || s.siteName;
}

/** Trang chuyến: danh sách điểm dừng (bản tương đương) + bản đồ tuyến, chọn đồng bộ hai bên. */
export function TripView({ trip, running, serverNow }: { trip: Trip; running: boolean; serverNow: number }) {
  const [active, setActive] = useState<string | null>(null);
  const now = new Date(serverNow);

  const located = trip.stops.filter((s) => s.location !== null);
  const estimatedRoute = useMemo(
    () => (trip.route ? null : straightLine(located.map((s) => s.location!))),
    [trip.route, located],
  );
  const route = trip.route ?? estimatedRoute;

  const mapStops: TripMapStop[] = located.map((s) => ({
    id: s.id,
    seq: s.seq,
    kind: s.kind,
    done: s.status === "done",
    skipped: s.status === "skipped",
    location: s.location!,
    approximate: s.precision === "approximate",
    ariaLabel: `Điểm ${s.seq}: ${stopTitle(s)} — ${(s.kind === "pickup" ? PICKUP_STOP_TEXT : DROPOFF_STOP_TEXT)[s.status]}${
      s.precision === "approximate" ? ", vị trí gần đúng" : ""
    }`,
  }));

  function selectStop(id: string) {
    setActive(id);
    document.getElementById(`stop-${id}`)?.scrollIntoView({
      block: "nearest",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }

  return (
    <div className="flex flex-col-reverse gap-6 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
      <section aria-labelledby="stops-heading" className="flex flex-col gap-3">
        <h2 id="stops-heading" className="text-lg font-semibold">
          Điểm dừng theo thứ tự
        </h2>
        <ol className="flex flex-col gap-3">
          {trip.stops.map((s) => (
            <li key={s.id}>
              <StopItem
                stop={s}
                tripId={trip.id}
                mode={trip.mode}
                running={running}
                active={s.id === active}
                now={now}
                onHover={(h) => setActive(h ? s.id : null)}
              />
            </li>
          ))}
        </ol>
      </section>

      <div className="h-72 sm:h-96 lg:sticky lg:top-24 lg:h-[calc(100dvh-7.5rem)] lg:min-h-[440px]">
        {mapStops.length > 0 ? (
          <TripMapLazy
            stops={mapStops}
            routes={
              route
                ? [
                    {
                      id: trip.id,
                      line: route,
                      estimated: !trip.route,
                      tone: 0,
                      label: trip.route ? "Tuyến xe máy" : "Tuyến ước tính (đường thẳng)",
                    },
                  ]
                : []
            }
            activeStopId={active}
            onSelectStop={selectStop}
            ariaLabel={`Bản đồ chuyến: ${trip.stops.length} điểm dừng${trip.route ? ", có tuyến xe máy" : ", tuyến ước tính đường thẳng"}. Danh sách điểm dừng có cùng thông tin.`}
          />
        ) : (
          <div className="grid size-full place-items-center rounded-lg border border-dashed bg-bg-sunken p-6 text-center text-sm text-ink-muted">
            <p className="flex max-w-xs flex-col items-center gap-2">
              <EyeOff aria-hidden className="size-6" />
              Các điểm dừng của chuyến này không công khai vị trí. Xem địa chỉ trong danh sách.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function StopItem({
  stop: s,
  tripId,
  mode,
  running,
  active,
  now,
  onHover,
}: {
  stop: TripStop;
  tripId: string;
  mode: "self" | "volunteer";
  running: boolean;
  active: boolean;
  now: Date;
  onHover: (hovering: boolean) => void;
}) {
  const text = (s.kind === "pickup" ? PICKUP_STOP_TEXT : DROPOFF_STOP_TEXT)[s.status];
  const window = spanRanges(
    s.allocations.map((a) =>
      a.pickupStart && a.pickupEnd ? { start: new Date(a.pickupStart), end: new Date(a.pickupEnd) } : null,
    ),
  );
  const deadlines = s.allocations
    .map((a) => a.effectiveDeadline)
    .filter((d): d is string => !!d)
    .sort();
  const open = s.status === "pending" || s.status === "arrived";
  const titleId = `stop-title-${s.id}`;
  const kg = s.allocations.reduce(
    (sum, a) => sum + (a.status === "delivered" ? a.kgDelivered : a.qtyHeld * a.unitWeightKg),
    0,
  );

  return (
    <article
      id={`stop-${s.id}`}
      aria-labelledby={titleId}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      className={cn(
        "flex scroll-mt-24 gap-3 rounded-lg border bg-surface p-4 shadow-1 transition-colors duration-100",
        active && "border-info ring-1 ring-info",
        s.status === "skipped" && "opacity-75",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-full border-[3px] text-sm font-bold tabular-nums",
          s.kind === "dropoff"
            ? "border-role-accent-fill bg-ink text-white"
            : s.status === "done"
              ? "border-success bg-success text-white"
              : "border-info bg-surface text-ink",
        )}
      >
        {s.kind === "dropoff" ? (
          <Home className="size-4" />
        ) : s.status === "done" ? (
          <Check className="size-4" />
        ) : (
          s.seq
        )}
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 id={titleId} className="text-base font-semibold text-pretty">
            <span className="sr-only">Điểm {s.seq}: </span>
            {stopTitle(s)}
          </h3>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
              s.status === "done"
                ? "border-success/30 bg-success-soft text-success"
                : s.status === "skipped"
                  ? "border-border-strong/40 bg-bg-sunken text-ink-muted"
                  : "border-info/30 bg-info-soft text-info",
            )}
          >
            {s.status === "done" ? <PackageCheck aria-hidden className="size-3.5" /> : null}
            {text}
          </span>
        </div>

        <p className="flex items-start gap-1.5 text-sm text-ink-muted">
          {s.precision === "hidden" ? (
            <EyeOff aria-hidden className="mt-0.5 size-4 shrink-0" />
          ) : s.precision === "approximate" ? (
            <LocateOff aria-hidden className="mt-0.5 size-4 shrink-0" />
          ) : (
            <MapPin aria-hidden className="mt-0.5 size-4 shrink-0" />
          )}
          <span>
            {s.address ?? "Chưa có địa chỉ"}
            {s.precision === "approximate"
              ? " · vị trí gần đúng"
              : s.precision === "hidden"
                ? " · vị trí được ẩn"
                : ""}
          </span>
        </p>

        {s.kind === "pickup" ? (
          <>
            <p className="flex items-start gap-1.5 text-sm text-ink-muted tabular-nums">
              <Clock3 aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-subtle" />
              <span>
                Khung giờ lấy {formatWindow(window, now)}
                {deadlines[0] ? ` · hạn hiệu lực ${formatDayTime(deadlines[0], now)}` : ""}
              </span>
            </p>
            {s.allocations.length > 0 ? (
              <ul className="flex flex-col gap-1 rounded-md bg-bg-sunken px-3 py-2 text-sm">
                {s.allocations.map((a) => (
                  <li key={a.id} className="flex flex-wrap justify-between gap-x-3">
                    <span className="inline-flex items-center gap-1.5 text-ink">
                      <Store aria-hidden className="size-3.5 text-ink-subtle" />
                      {a.offerTitle}
                    </span>
                    <span className="text-ink-muted tabular-nums">
                      {a.status === "delivered"
                        ? `Đã nhận ${formatQty(a.qtyDelivered, a.unit)}`
                        : a.status === "picked_up"
                          ? `Đã lấy ${formatQty(a.qtyPicked, a.unit)}`
                          : formatQty(a.qtyHeld, a.unit)}
                    </span>
                  </li>
                ))}
                {kg > 0 ? <li className="text-xs text-ink-subtle">Tổng ≈ {formatKg(kg)}</li> : null}
              </ul>
            ) : null}
          </>
        ) : mode === "self" && open ? (
          <p className="text-sm text-ink-muted">
            Tự đến lấy: FoodSave ghi nhận đã giao về ngay khi mọi điểm lấy hàng được cửa hàng xác nhận bàn
            giao.
          </p>
        ) : null}

        {s.handoverConsumedAt ? (
          <p className="text-sm text-success">Đã bàn giao lúc {formatDayTime(s.handoverConsumedAt, now)}.</p>
        ) : null}
        {s.status === "skipped" && s.skipReason ? (
          <p className="text-sm text-ink-muted">Bỏ qua: {SKIP_REASON[s.skipReason] ?? s.skipReason}.</p>
        ) : null}

        {running && open && (s.location || s.kind === "pickup") ? (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {s.kind === "pickup" ? (
              <Button asChild size="sm">
                <Link href={`/charity/pickups/${tripId}/stops/${s.id}/handover`} aria-describedby={titleId}>
                  <QrCode aria-hidden />
                  Mở mã bàn giao
                </Link>
              </Button>
            ) : null}
            {s.location ? (
              <Button asChild variant="outline" size="sm">
                <a
                  href={googleMapsDirectionsUrl(s.location)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-describedby={titleId}
                >
                  <ExternalLink aria-hidden />
                  Mở Google Maps
                  <span className="sr-only">
                    {" "}
                    (mở trong tab mới{s.precision === "approximate" ? ", vị trí gần đúng" : ""})
                  </span>
                </a>
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
