"use client";

import { ArrowLeft, Ban, CircleCheckBig, HeartHandshake, MapPinned } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { formatKg, formatQty } from "@/features/catalog/labels";
import { formatDayTime } from "@/features/charity-allocations/present";
import { straightLine } from "@/features/pickups/geo";

import type { LocationConsent, TripContactConsent } from "../consent";
import type { VolunteerTrip } from "../queries";
import { currentStop, directionsFromHere, pickupProgress } from "../trip-model";
import { CurrentStopCard } from "./current-stop-card";
import { LocationBanner, LocationCard } from "./location-sharing";
import { OfflineNotice } from "./offline-notice";
import { PhaseBadge } from "./phase-badge";
import { IncidentButton } from "./stop-sheets";
import { StopTimeline, stopTitle } from "./stop-timeline";
import { RespondButtons, StartTripButton } from "./trip-actions";
import { TripContactSwitch } from "./trip-contact-switch";
import { useLocationSharing } from "./use-location-sharing";
import type { VolunteerMapStop } from "./volunteer-trip-map";
import { VolunteerTripMapLazy } from "./volunteer-trip-map-lazy";

/**
 * Màn chuyến của tình nguyện viên (ROADMAP P3-10; PRD US-VOL-04…09, 12, 13; DESIGN-SYSTEM §10.3): tập trung vào
 * điểm kế tiếp — thẻ lớn với hành động chính, bản đồ nhỏ, lộ trình, chia sẻ vị trí (chỉ khi đã đồng ý).
 */
export function TripScreen({
  trip,
  consent,
  tripContact,
  serverNow,
}: {
  trip: VolunteerTrip;
  consent: LocationConsent;
  /** Công tắc "cho phép gọi tôi khi chuyến đang chạy" ở bước nhận / trước khi bắt đầu (B1). */
  tripContact: TripContactConsent;
  serverNow: number;
}) {
  const router = useRouter();
  const [etas, setEtas] = useState<Record<string, string>>({});
  const [paused, setPaused] = useState(false);

  const running = trip.phase === "in_progress";
  const notStarted = trip.phase === "awaiting_response" || trip.phase === "accepted";

  const onEtas = useCallback((next: Record<string, string>) => setEtas((prev) => ({ ...prev, ...next })), []);
  const onStopped = useCallback(
    (cause: "consent" | "trip") => {
      if (cause === "consent") toast.info("Đã ngừng chia sẻ vị trí vì đồng ý không còn hiệu lực.");
      router.refresh();
    },
    [router],
  );
  const sharing = useLocationSharing({
    pickupId: trip.id,
    enabled: running && consent.active && !paused,
    onEtas,
    onStopped,
  });

  const current = currentStop(trip.stops);
  const progress = pickupProgress(trip.stops);
  const directions = useMemo(() => directionsFromHere(trip.stops), [trip.stops]);
  const pickupStops = trip.stops.filter((s) => s.kind === "pickup");
  const order = {
    index: current ? pickupStops.findIndex((s) => s.id === current.id) + 1 : 0,
    total: pickupStops.length,
  };

  const located = useMemo(
    () =>
      trip.stops
        .filter((s) => s.location !== null)
        .map<VolunteerMapStop>((s) => ({
          id: s.id,
          seq: s.seq,
          kind: s.kind,
          status: s.status,
          location: s.location!,
          title: `${s.seq}. ${stopTitle(s)}`,
        })),
    [trip.stops],
  );
  const route = useMemo(
    () => trip.route ?? straightLine(located.map((s) => s.location)),
    [trip.route, located],
  );

  return (
    <div className="flex flex-col gap-5">
      <LocationBanner
        status={sharing.status}
        lastSentAt={sharing.lastSentAt}
        onStop={() => setPaused(true)}
      />

      <header className="flex flex-col gap-2">
        <Link
          href="/volunteer"
          className="-ml-1 inline-flex min-h-11 w-fit items-center gap-1.5 rounded-md px-1 text-[0.9375rem] font-medium text-ink-muted hover:text-ink"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Hôm nay
        </Link>
        <h1 className="text-[1.625rem] leading-[2.125rem] font-bold text-balance">
          Chuyến cho {trip.charityName}
        </h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <PhaseBadge phase={trip.phase} />
          <p className="text-[0.9375rem] text-ink-muted tabular-nums">
            {running || trip.phase === "completed"
              ? `Đã xong ${progress.closed}/${progress.total} điểm lấy`
              : `${progress.total} điểm lấy · bắt đầu ${formatDayTime(trip.startAt, new Date(serverNow))}`}
            {trip.totalKg > 0 ? ` · khoảng ${formatKg(trip.totalKg)}` : ""}
          </p>
        </div>
      </header>

      <OfflineNotice loadedAt={new Date(serverNow).toISOString()} />

      {trip.phase === "awaiting_response" ? (
        <section
          aria-label="Phản hồi chuyến"
          className="flex flex-col gap-2 rounded-xl border bg-surface p-4"
        >
          <p className="text-[0.9375rem] text-ink">
            Điều phối viên của {trip.charityName} vừa giao chuyến này cho bạn. Bạn nhận được không?
          </p>
          <RespondButtons pickupId={trip.id} afterDecline="home" />
          <TripContactSwitch consent={tripContact} compact />
        </section>
      ) : null}
      {trip.phase === "accepted" ? (
        <section aria-label="Bắt đầu chuyến" className="flex flex-col gap-2 rounded-xl border bg-surface p-4">
          <p className="text-[0.9375rem] text-ink">Bấm khi bạn lên đường tới điểm lấy đầu tiên.</p>
          <StartTripButton pickupId={trip.id} consent={consent} />
          <TripContactSwitch consent={tripContact} compact />
        </section>
      ) : null}

      {trip.phase === "cancelled" ? (
        <section
          role="status"
          className="flex items-start gap-3 rounded-xl border border-border-strong/40 bg-bg-sunken p-4"
        >
          <Ban aria-hidden className="mt-0.5 size-6 shrink-0 text-ink-muted" />
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold">Chuyến đã bị hủy</h2>
            <p className="text-ink-muted">
              {trip.cancelReason ? `Lý do: ${trip.cancelReason}. ` : ""}Bạn không cần đi chuyến này nữa.
            </p>
          </div>
        </section>
      ) : null}

      {trip.phase === "completed" ? <TripDone trip={trip} serverNow={serverNow} /> : null}

      {current && (running || notStarted) ? (
        <CurrentStopCard
          pickupId={trip.id}
          stop={current}
          order={order}
          phase={trip.phase}
          eta={etas[current.id] ?? current.eta}
          directions={directions}
          charityName={trip.charityName}
          serverNow={serverNow}
        />
      ) : null}

      {located.length > 0 && trip.phase !== "cancelled" ? (
        <div className="h-96 sm:h-[28rem]">
          <VolunteerTripMapLazy
            stops={located}
            route={route}
            estimated={!trip.route}
            currentStopId={current?.id ?? null}
            me={sharing.position}
            ariaLabel={`Bản đồ chuyến: ${trip.stops.length} điểm dừng${
              sharing.position ? ", có vị trí của bạn" : ""
            }. Danh sách “Lộ trình” bên dưới có cùng thông tin.`}
          />
        </div>
      ) : running || notStarted ? (
        <p className="flex items-center gap-2 rounded-xl border border-dashed bg-bg-sunken p-4 text-sm text-ink-muted">
          <MapPinned aria-hidden className="size-5 shrink-0" />
          Chưa hiện được bản đồ (điểm dừng chưa có toạ độ). Địa chỉ có trong danh sách bên dưới.
        </p>
      ) : null}

      <section aria-labelledby="route-heading" className="flex flex-col gap-3">
        <h2 id="route-heading" className="text-lg font-semibold">
          Lộ trình
        </h2>
        <StopTimeline stops={trip.stops} currentStopId={current?.id ?? null} etas={etas} />
      </section>

      {running || notStarted ? (
        <LocationCard
          consentActive={consent.active}
          tripRunning={running}
          paused={paused}
          onPausedChange={setPaused}
          status={sharing.status}
          lastSentAt={sharing.lastSentAt}
        />
      ) : null}

      {/* Thẻ điểm kế tiếp đã có "Báo sự cố"; chỉ cần nút riêng khi không còn điểm nào đang mở */}
      {(running || notStarted) && !current ? (
        <IncidentButton
          pickupId={trip.id}
          stop={null}
          variant="outline"
          className="h-12 w-full justify-center"
        />
      ) : null}
    </div>
  );
}

/** Tóm tắt sau khi giao xong (PRD US-VOL-09 AC2). */
function TripDone({ trip, serverNow }: { trip: VolunteerTrip; serverNow: number }) {
  const kg = trip.delivered.reduce((sum, d) => sum + d.kg, 0);
  const items = trip.delivered.map((d) => `${formatQty(d.qty, d.unit)} ${d.title.toLocaleLowerCase("vi")}`);
  return (
    <section
      role="status"
      data-trip-done
      className="flex flex-col gap-3 rounded-2xl border border-success/30 bg-success-soft p-5"
    >
      <CircleCheckBig aria-hidden className="size-9 text-success" />
      <h2 className="text-xl font-bold text-ink">
        {trip.completedAt
          ? `Hoàn tất lúc ${formatDayTime(trip.completedAt, new Date(serverNow))}`
          : "Chuyến đã hoàn tất"}
      </h2>
      <p className="flex items-start gap-2 text-[1.0625rem] text-ink">
        <HeartHandshake aria-hidden className="mt-1 size-5 shrink-0 text-success" />
        <span>
          {items.length > 0
            ? `Bạn vừa giúp chuyển ${items.join(", ")}${kg > 0 ? ` (≈ ${formatKg(kg)})` : ""} tới ${trip.charityName}. Cảm ơn bạn!`
            : `Chuyến tới ${trip.charityName} đã kết thúc. Cảm ơn bạn!`}
        </span>
      </p>
      <p className="text-sm text-ink-muted">
        Vị trí trong chuyến (nếu có) đã được xóa. Số liệu đã ghi vào sổ tác động của tổ chức.
      </p>
      <Button asChild size="lg" className="h-12 w-full text-base sm:w-fit">
        <Link href="/volunteer">Về “Hôm nay”</Link>
      </Button>
    </section>
  );
}
