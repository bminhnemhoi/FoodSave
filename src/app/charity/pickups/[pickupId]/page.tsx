import { CircleCheckBig, Clock3, ExternalLink, Info, MapPinned, Package, Route } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { formatKg } from "@/features/catalog/labels";
import { AutoRefresh } from "@/features/charity-allocations/components/auto-refresh";
import { loadCharityContext, requestNow } from "@/features/charity-allocations/context";
import { formatDayTime, formatMinutes } from "@/features/charity-allocations/present";
import { DispatchView } from "@/features/pickups/components/dispatch-view";
import { PickupStatusBadge } from "@/features/pickups/components/pickup-status-badge";
import { TripView } from "@/features/pickups/components/trip-view";
import { googleMapsDirectionsUrl } from "@/features/pickups/geo";
import { isRunning, loadTrip } from "@/features/pickups/queries";
import { listVolunteers } from "@/features/volunteers/queries";
import { formatDistance } from "@/lib/format";

export const metadata: Metadata = { title: "Chi tiết chuyến — Tổ chức" };

/** Mobile chỉ nhận tối đa 3 điểm trung gian trong link Google Maps (Maps URLs). */
const MOBILE_WAYPOINTS = 3;

/**
 * Trang chuyến: tự đến lấy (US-CHA-20 — điểm dừng, chỉ đường, mở mã bàn giao) hoặc chuyến tình nguyện viên
 * (bản đồ điều phối US-CHA-18, P3-11 — trạng thái trực tiếp, vị trí TNV khi được chia sẻ, hủy/bỏ qua/sự cố/đổi
 * người, nhận hàng).
 */
export default async function CharityTripPage({ params }: PageProps<"/charity/pickups/[pickupId]">) {
  const { pickupId } = await params;
  const ctx = await loadCharityContext();
  const trip = await loadTrip(ctx.orgId, pickupId);
  if (!trip) notFound();

  const now = requestNow();
  const running = isRunning(trip.status);
  const volunteerTrip = trip.mode === "volunteer";
  const volunteers =
    volunteerTrip && (trip.status === "planned" || trip.status === "assigned")
      ? await listVolunteers(ctx.orgId).catch(() => [])
      : [];
  const pickups = trip.stops.filter((s) => s.kind === "pickup");
  const dropoff = trip.stops.find((s) => s.kind === "dropoff");
  const done = pickups.filter((s) => s.status === "done").length;
  const kg = trip.stops
    .flatMap((s) => s.allocations)
    .reduce((sum, a) => sum + (a.status === "delivered" ? a.kgDelivered : a.qtyHeld * a.unitWeightKg), 0);
  const pending = pickups.filter((s) => (s.status === "pending" || s.status === "arrived") && s.location);
  const wholeRoute =
    running && !volunteerTrip && dropoff?.location && pending.length > 0 && pending.length <= MOBILE_WAYPOINTS
      ? googleMapsDirectionsUrl(dropoff.location, { waypoints: pending.map((s) => s.location!) })
      : null;

  return (
    <>
      <PageHeader
        title={trip.mode === "self" ? "Chuyến tự đến lấy" : "Chuyến tình nguyện viên"}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <PickupStatusBadge status={trip.status} mode={trip.mode} />
            <span className="tabular-nums">
              Giao về {dropoff?.siteName ?? "điểm nhận"} · tạo {formatDayTime(trip.createdAt, new Date(now))}
            </span>
          </span>
        }
        breadcrumb={[
          { label: "Tổng quan", href: "/charity" },
          { label: "Chuyến lấy hàng", href: "/charity/pickups" },
          { label: "Chi tiết chuyến" },
        ]}
        actions={
          wholeRoute ? (
            <Button asChild variant="outline">
              <a href={wholeRoute} target="_blank" rel="noopener noreferrer">
                <ExternalLink aria-hidden />
                Mở cả tuyến trên Google Maps
                <span className="sr-only"> (mở trong tab mới)</span>
              </a>
            </Button>
          ) : null
        }
      />

      <div className="flex flex-col gap-6">
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Fact icon={Route} label="Điểm lấy đã xong" value={`${done}/${pickups.length}`} />
          <Fact icon={Package} label="Tổng khối lượng" value={`≈ ${formatKg(kg)}`} />
          <Fact
            icon={MapPinned}
            label="Quãng đường"
            value={
              trip.routeDistanceM !== null && trip.route
                ? formatDistance(trip.routeDistanceM)
                : "Chưa có tuyến"
            }
          />
          <Fact
            icon={Clock3}
            label="Thời gian dự kiến"
            value={
              trip.routeDurationS !== null && trip.route ? `~${formatMinutes(trip.routeDurationS / 60)}` : "—"
            }
          />
        </dl>

        {trip.status === "cancelled" ? (
          <p
            role="status"
            className="flex items-start gap-2 rounded-lg border bg-bg-sunken px-4 py-3 text-sm text-ink"
          >
            <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" />
            <span>
              Chuyến đã hủy{trip.cancelledAt ? ` lúc ${formatDayTime(trip.cancelledAt, new Date(now))}` : ""}
              {trip.cancelReason ? ` — lý do: ${trip.cancelReason}` : ""}. Các lô chưa lấy đã trở về mục “Đã
              xác nhận — cần lên chuyến”: hãy{" "}
              <Link href="/charity/pickups" className="font-medium text-primary underline underline-offset-2">
                giao tình nguyện viên khác hoặc tự đến lấy
              </Link>
              .
            </span>
          </p>
        ) : trip.status === "completed" ? (
          <p
            role="status"
            className="flex items-start gap-2 rounded-lg border border-success/30 bg-success-soft px-4 py-3 text-sm text-ink"
          >
            <CircleCheckBig aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
            Chuyến đã hoàn tất
            {trip.completedAt ? ` lúc ${formatDayTime(trip.completedAt, new Date(now))}` : ""}. Hàng đã được
            ghi vào sổ tác động của tổ chức.
          </p>
        ) : !trip.route ? (
          <p className="flex items-start gap-2 text-sm text-ink-muted">
            <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
            Bản đồ nối thẳng các điểm theo thứ tự (tuyến ước tính). Bấm “Mở Google Maps” ở từng điểm để được
            chỉ đường xe máy.
          </p>
        ) : null}

        {running ? <AutoRefresh serverNow={now} className="-mb-3 justify-end" /> : null}
        {volunteerTrip ? (
          <DispatchView
            trip={trip}
            serverNow={now}
            canCancel={ctx.role === "owner" || ctx.role === "manager"}
            volunteers={volunteers}
          />
        ) : (
          <TripView trip={trip} running={running} serverNow={now} />
        )}
      </div>
    </>
  );
}

function Fact({ icon: Icon, label, value }: { icon: typeof Route; label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-surface p-3 shadow-1">
      <dt className="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
        <Icon aria-hidden className="size-4 text-role-accent" />
        {label}
      </dt>
      <dd className="text-lg font-semibold text-ink tabular-nums">{value}</dd>
    </div>
  );
}
