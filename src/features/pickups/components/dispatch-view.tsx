"use client";

import {
  AlarmClock,
  Check,
  CircleAlert,
  Clock3,
  ExternalLink,
  EyeOff,
  Home,
  LocateFixed,
  LocateOff,
  MapPin,
  PackageCheck,
  Phone,
  Radio,
  Store,
  UserRound,
  WifiOff,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { formatKg, formatQty } from "@/features/catalog/labels";
import { formatClock, formatDayTime, formatWindow, spanRanges } from "@/features/charity-allocations/present";
import { cn } from "@/lib/utils";

import { googleMapsDirectionsUrl, straightLine } from "../geo";
import { isPositionStale, isStopLate, positionAgeLabel } from "../live";
import type { Trip, TripContact, TripStop } from "../queries";
import { CancelTripDialog, IncidentDialog, ReassignPanel, SkipStopDialog } from "./trip-actions";
import type { TripMapStop } from "./trip-map";
import { TripMapLazy } from "./trip-map-lazy";
import { useLiveTrip } from "./use-live-trip";
import type { VolunteerOption } from "./volunteer-planner";

const PICKUP_TEXT: Record<TripStop["status"], string> = {
  pending: "Chưa tới",
  arrived: "Đã đến",
  done: "Đã lấy hàng",
  skipped: "Bỏ qua",
};
const DROPOFF_TEXT: Record<TripStop["status"], string> = {
  pending: "Chờ giao về",
  arrived: "Đã về tới",
  done: "Đã giao về",
  skipped: "Bỏ qua",
};
const SKIP_REASON: Record<string, string> = {
  no_allocations: "không còn lô nào ở điểm này",
  nothing_to_deliver: "không còn hàng để giao",
  trip_cancelled: "chuyến đã hủy",
};
const CONTACT_ROLE: Record<TripContact["role"], string> = {
  volunteer: "Tình nguyện viên",
  carrier: "Người đi lấy",
  charity: "Tổ chức",
  store: "Cửa hàng",
};

function stopTitle(s: TripStop): string {
  if (s.kind === "dropoff") return `Giao về ${s.siteName}`;
  return s.siteName && s.siteName !== s.orgName ? `${s.orgName} · ${s.siteName}` : s.orgName || s.siteName;
}

type DispatchViewProps = {
  trip: Trip;
  serverNow: number;
  /** owner/manager: hủy chuyến (cancel_pickup). */
  canCancel: boolean;
  /** TNV đang hoạt động của tổ chức (đổi người khi bị từ chối). */
  volunteers: VolunteerOption[];
};

/**
 * Bản đồ điều phối chuyến tình nguyện viên (PRD US-CHA-18, US-CHA-22, US-CHA-23; ROADMAP P3-11): điểm dừng với
 * trạng thái/ETA cập nhật trực tiếp (Realtime `pickup_stops`), vị trí TNV chỉ khi được chia sẻ, cảnh báo trễ
 * 15 phút, liên hệ đã che số, bỏ qua điểm, báo sự cố, hủy chuyến, đổi người, nhận hàng khi về tới.
 */
export function DispatchView({ trip, serverNow, canCancel, volunteers }: DispatchViewProps) {
  const running = trip.status === "planned" || trip.status === "assigned" || trip.status === "in_progress";
  const live = useLiveTrip(trip, running);
  const [active, setActive] = useState<string | null>(null);
  const now = new Date(serverNow);
  const nowMs = Math.max(live.nowMs, serverNow);

  const stops = live.stops;
  const pickups = stops.filter((s) => s.kind === "pickup");
  const dropoff = stops.find((s) => s.kind === "dropoff");
  const pickedSomewhere = pickups.some((s) => s.status === "done" || s.handoverConsumedAt);
  const allPicked =
    pickups.length > 0 &&
    pickups.some((s) => s.status === "done") &&
    pickups.every((s) => s.status === "done" || s.status === "skipped");
  const readyForDropoff = trip.status === "in_progress" && allPicked && dropoff && dropoff.status !== "done";
  const tripKg = trip.stops
    .flatMap((s) => s.allocations)
    .reduce((sum, a) => sum + (a.status === "delivered" ? a.kgDelivered : a.qtyHeld * a.unitWeightKg), 0);

  const located = stops.filter((s) => s.location !== null);
  const estimated = useMemo(
    () =>
      trip.route ? null : straightLine(stops.filter((s) => s.location !== null).map((s) => s.location!)),
    [trip.route, stops],
  );
  const routeLine = trip.route ?? estimated;
  const position = trip.status === "in_progress" ? live.position : null;
  const age = position ? positionAgeLabel(position.at, nowMs) : null;
  const stale = position ? isPositionStale(position.at, nowMs) : true;
  const who = trip.assigneeName ?? "Tình nguyện viên";

  const mapStops: TripMapStop[] = located.map((s) => ({
    id: s.id,
    seq: s.seq,
    kind: s.kind,
    done: s.status === "done",
    skipped: s.status === "skipped",
    arrived: s.status === "arrived",
    late: trip.status === "in_progress" && isStopLate(s, nowMs),
    location: s.location!,
    approximate: s.precision === "approximate",
    ariaLabel: `Điểm ${s.seq}: ${stopTitle(s)} — ${(s.kind === "pickup" ? PICKUP_TEXT : DROPOFF_TEXT)[s.status]}${
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

  const unassigned = trip.status === "planned" && !trip.assigneeUserId;
  const notStarted = trip.status === "assigned";

  return (
    <div className="flex flex-col-reverse gap-6 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
      <div className="flex flex-col gap-5">
        <p role="status" aria-live="polite" className="sr-only">
          {live.announcement ?? ""}
        </p>

        {/* Tình nguyện viên + vị trí */}
        <section
          aria-labelledby="volunteer-heading"
          className="flex flex-col gap-3 rounded-lg border bg-surface p-4 shadow-1"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="volunteer-heading" className="flex items-center gap-2 text-lg font-semibold">
              <UserRound aria-hidden className="size-5 text-role-accent" />
              {unassigned ? "Chưa có người nhận chuyến" : who}
            </h2>
            {running ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                  live.connected
                    ? "border-success/30 bg-success-soft text-success"
                    : "border-border-strong/40 bg-bg-sunken text-ink-muted",
                )}
              >
                {live.connected ? (
                  <Radio aria-hidden className="size-3.5" />
                ) : (
                  <WifiOff aria-hidden className="size-3.5" />
                )}
                {live.connected ? "Cập nhật trực tiếp" : "Đang kết nối lại…"}
              </span>
            ) : null}
          </div>
          <p className="text-sm text-ink-muted">
            {unassigned
              ? "Tình nguyện viên trước đã từ chối hoặc chưa giao. Chọn người khác hoặc chuyển sang tự đến lấy bên dưới."
              : trip.status === "assigned" && !trip.acceptedAt
                ? `Đã giao, chờ ${who} bấm “Nhận chuyến”.`
                : trip.status === "assigned"
                  ? `${who} đã nhận chuyến${trip.acceptedAt ? ` lúc ${formatClock(trip.acceptedAt)}` : ""}, chưa bắt đầu đi.`
                  : trip.status === "in_progress"
                    ? `Đang chạy từ ${trip.startedAt ? formatClock(trip.startedAt) : "—"} · đã lấy ${pickups.filter((s) => s.status === "done").length}/${pickups.length} điểm.`
                    : trip.status === "completed"
                      ? "Chuyến đã hoàn tất."
                      : "Chuyến đã hủy."}
          </p>
          {trip.status === "in_progress" ? (
            position ? (
              <p className={cn("flex items-start gap-2 text-sm", stale ? "text-warning" : "text-ink")}>
                <LocateFixed aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span>
                  Vị trí gần đúng của {who}: {age}
                  {position.accuracyM ? ` (sai số khoảng ${position.accuracyM} m)` : ""}.
                  {stale ? " Có thể app đã đóng — vị trí không còn cập nhật." : ""}
                </span>
              </p>
            ) : (
              <p className="flex items-start gap-2 text-sm text-ink-muted" data-testid="position-unshared">
                <LocateOff aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span>
                  Tình nguyện viên chưa chia sẻ vị trí. Bạn vẫn thấy mỗi lần check-in tại điểm dừng.
                </span>
              </p>
            )
          ) : null}
          {readyForDropoff ? (
            <div className="flex flex-col gap-2 rounded-md border border-info/30 bg-info-soft p-3 text-sm text-ink">
              <p className="flex items-start gap-2">
                <PackageCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-info" />
                {trip.dropoffHandover &&
                !trip.dropoffHandover.consumedAt &&
                trip.dropoffHandover.expiresAt &&
                Date.parse(trip.dropoffHandover.expiresAt) > nowMs
                  ? `${who} đã mở mã giao về (hiệu lực đến ${formatClock(trip.dropoffHandover.expiresAt)}). Quét QR hoặc nhập mã 6 số để nhận hàng.`
                  : `${who} đã lấy xong hàng và đang mang về. Khi tới nơi, quét QR trên điện thoại của họ để nhận hàng.`}
              </p>
              <Button asChild size="sm" className="min-h-11 w-fit">
                <Link href={`/charity/receive?trip=${trip.id}`}>
                  <PackageCheck aria-hidden />
                  Nhận hàng
                </Link>
              </Button>
            </div>
          ) : null}
        </section>

        {unassigned || (notStarted && trip.mode === "volunteer") ? (
          <ReassignPanel
            pickupId={trip.id}
            currentAssigneeId={trip.assigneeUserId}
            volunteers={volunteers}
            tripKg={tripKg}
            headline={unassigned ? "Giao lại chuyến" : "Đổi người nhận chuyến"}
          />
        ) : null}

        {/* Điểm dừng */}
        <section aria-labelledby="stops-heading" className="flex flex-col gap-3">
          <h2 id="stops-heading" className="text-lg font-semibold">
            Điểm dừng theo thứ tự
          </h2>
          <ol className="flex flex-col gap-3">
            {stops.map((s) => (
              <li key={s.id}>
                <DispatchStop
                  stop={s}
                  trip={trip}
                  running={running}
                  active={s.id === active}
                  flash={s.id === live.flashId}
                  late={trip.status === "in_progress" && isStopLate(s, nowMs)}
                  now={now}
                  onHover={(h) => setActive(h ? s.id : null)}
                />
              </li>
            ))}
          </ol>
        </section>

        {trip.contacts.length > 0 ? (
          <section
            aria-labelledby="contacts-heading"
            className="flex flex-col gap-2 rounded-lg border bg-surface p-4"
          >
            <h2 id="contacts-heading" className="text-base font-semibold">
              Liên hệ trong chuyến
            </h2>
            <ul className="flex flex-col gap-1.5 text-sm">
              {trip.contacts.map((c, i) => (
                <li key={`${c.role}-${i}`} className="flex flex-wrap items-center justify-between gap-x-3">
                  <span className="text-ink">
                    <span className="text-ink-muted">{CONTACT_ROLE[c.role]}: </span>
                    {c.name}
                  </span>
                  <span className="inline-flex items-center gap-1 text-ink-muted tabular-nums">
                    <Phone aria-hidden className="size-3.5" />
                    {c.phoneMasked ?? "Chưa có số"}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-ink-subtle">
              Số điện thoại được che một phần để bảo vệ các bên. Liên hệ qua kênh nội bộ của tổ chức nếu cần
              gọi.
            </p>
          </section>
        ) : null}

        {running ? (
          <section
            aria-labelledby="actions-heading"
            className="flex flex-col gap-3 rounded-lg border bg-surface p-4"
          >
            <h2 id="actions-heading" className="text-base font-semibold">
              Xử lý sự cố
            </h2>
            <div className="flex flex-wrap items-start gap-3">
              <IncidentDialog pickupId={trip.id} />
              <CancelTripDialog
                pickupId={trip.id}
                volunteerName={trip.assigneeName}
                disabledReason={
                  !canCancel
                    ? "Chỉ chủ sở hữu hoặc quản lý tổ chức hủy được chuyến."
                    : pickedSomewhere
                      ? "Đã lấy hàng ở ít nhất một điểm nên không hủy được chuyến — hãy báo sự cố nếu có vấn đề."
                      : null
                }
              />
            </div>
          </section>
        ) : null}
      </div>

      <div className="h-72 sm:h-96 lg:sticky lg:top-24 lg:h-[calc(100dvh-7.5rem)] lg:min-h-[440px]">
        {mapStops.length > 0 ? (
          <TripMapLazy
            stops={mapStops}
            routes={
              routeLine
                ? [
                    {
                      id: trip.id,
                      line: routeLine,
                      estimated: !trip.route,
                      tone: 0,
                      label: trip.route ? "Tuyến xe máy" : "Tuyến ước tính (đường thẳng)",
                    },
                  ]
                : []
            }
            volunteer={
              position
                ? {
                    location: position.location,
                    label: `${who} · ${age ?? ""}`,
                    ariaLabel: `Vị trí gần đúng của ${who}, ${age ?? ""}`,
                  }
                : null
            }
            activeStopId={active}
            onSelectStop={selectStop}
            ariaLabel={`Bản đồ điều phối: ${stops.length} điểm dừng${position ? ", có vị trí tình nguyện viên" : ""}. Danh sách điểm dừng có cùng thông tin.`}
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

function DispatchStop({
  stop: s,
  trip,
  running,
  active,
  flash,
  late,
  now,
  onHover,
}: {
  stop: TripStop;
  trip: Trip;
  running: boolean;
  active: boolean;
  flash: boolean;
  late: boolean;
  now: Date;
  onHover: (hovering: boolean) => void;
}) {
  const text = (s.kind === "pickup" ? PICKUP_TEXT : DROPOFF_TEXT)[s.status];
  const open = s.status === "pending" || s.status === "arrived";
  const titleId = `stop-title-${s.id}`;
  const window = spanRanges(
    s.allocations.map((a) =>
      a.pickupStart && a.pickupEnd ? { start: new Date(a.pickupStart), end: new Date(a.pickupEnd) } : null,
    ),
  );
  const deadlines = s.allocations
    .map((a) => a.effectiveDeadline)
    .filter((d): d is string => !!d)
    .sort();
  const kg = s.allocations.reduce(
    (sum, a) => sum + (a.status === "delivered" ? a.kgDelivered : a.qtyHeld * a.unitWeightKg),
    0,
  );

  return (
    <article
      id={`stop-${s.id}`}
      aria-labelledby={titleId}
      data-stop-status={s.status}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      className={cn(
        "flex scroll-mt-24 gap-3 rounded-lg border bg-surface p-4 shadow-1 transition-colors duration-300",
        active && "border-info ring-1 ring-info",
        flash && "bg-info-soft",
        late && "border-danger/40",
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
              : s.status === "arrived"
                ? "border-info bg-warning-soft text-ink"
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
            data-testid="stop-status"
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
              s.status === "done"
                ? "border-success/30 bg-success-soft text-success"
                : s.status === "skipped"
                  ? "border-border-strong/40 bg-bg-sunken text-ink-muted"
                  : s.status === "arrived"
                    ? "border-warning/30 bg-warning-soft text-warning"
                    : "border-info/30 bg-info-soft text-info",
            )}
          >
            {s.status === "done" ? <PackageCheck aria-hidden className="size-3.5" /> : null}
            {s.status === "arrived" ? <MapPin aria-hidden className="size-3.5" /> : null}
            {text}
            {s.status === "arrived" && s.arrivedAt ? ` lúc ${formatClock(s.arrivedAt)}` : ""}
          </span>
        </div>

        {s.status === "arrived" && s.arrivalCheck && s.arrivalCheck !== "geofence" ? (
          <p className="flex items-start gap-1.5 text-sm text-warning">
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {s.arrivalCheck === "manual"
              ? `Check-in thủ công (ngoài 100 m)${s.arrivalNote ? `: ${s.arrivalNote}` : ""}.`
              : `Check-in không xác minh vị trí${s.arrivalNote ? `: ${s.arrivalNote}` : ""}.`}
          </p>
        ) : null}

        {s.status === "pending" && s.eta && running ? (
          <p
            className={cn(
              "flex items-start gap-1.5 text-sm tabular-nums",
              late ? "text-danger" : "text-ink-muted",
            )}
          >
            {late ? (
              <AlarmClock aria-hidden className="mt-0.5 size-4 shrink-0" />
            ) : (
              <Clock3 aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-subtle" />
            )}
            <span>
              Dự kiến tới {formatClock(s.eta)}
              {late ? " — đã trễ hơn 15 phút, hãy liên hệ tình nguyện viên." : ""}
            </span>
          </p>
        ) : null}

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
        ) : null}

        {s.handoverConsumedAt ? (
          <p className="text-sm text-success">Đã bàn giao lúc {formatDayTime(s.handoverConsumedAt, now)}.</p>
        ) : null}
        {s.status === "skipped" && s.skipReason ? (
          <p className="text-sm text-ink-muted">Bỏ qua: {SKIP_REASON[s.skipReason] ?? s.skipReason}.</p>
        ) : null}

        {running && open ? (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {s.kind === "pickup" && !s.handoverConsumedAt ? (
              <SkipStopDialog
                pickupId={trip.id}
                stopId={s.id}
                stopTitle={stopTitle(s)}
                describedBy={titleId}
              />
            ) : null}
            {s.location ? (
              <Button asChild variant="outline" size="sm" className="min-h-11">
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
