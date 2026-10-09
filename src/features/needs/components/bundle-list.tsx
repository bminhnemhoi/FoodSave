import { CalendarClock, CircleX, Combine, Hourglass, MessageSquareQuote, Route, Zap } from "lucide-react";
import Link from "next/link";

import { LiveFreshness } from "@/components/labels/live-freshness";
import { Button } from "@/components/ui/button";
import type { LatLng } from "@/core/geo/types";
import { freshnessLabel, LABEL_PRIORITY, type Perishability } from "@/core/labels";
import { formatQty } from "@/features/catalog/labels";
import { AllocationStatusBadge } from "@/features/charity-allocations/components/allocation-status-badge";
import { formatDayTime, formatMinutes } from "@/features/charity-allocations/present";
import { OrgContactButton } from "@/features/contacts/components/org-contact-button";
import { formatDistance } from "@/lib/format";
import { cn } from "@/lib/utils";

import { bundlePath, bundleStops, formatAmount } from "../present";
import type { BundleAllocation, BundleRecord } from "../queries";
import { BundleStatusBadge } from "./need-badges";
import { PlanMapLazy } from "./plan-map-lazy";

type BundleListProps = {
  bundles: BundleRecord[];
  unitLabel: string;
  home: LatLng | null;
  homeName: string;
  serverNow: number;
  perishabilityOf: Record<string, Perishability>;
};

/**
 * "Phương án đã chọn" (US-CHA-11 AC2, US-CHA-12): mỗi bundle một thẻ — trạng thái tổng, từng cửa hàng với trạng
 * thái phân bổ (chờ / đã xác nhận / tự động xác nhận / từ chối kèm lý do / hết hạn), hạn cửa hàng phải trả lời,
 * bản đồ tuyến (tuyến xe máy thật nếu đã tính, không thì ước tính). Trang tự làm mới khi còn yêu cầu chờ.
 */
export function BundleList({
  bundles,
  unitLabel,
  home,
  homeName,
  serverNow,
  perishabilityOf,
}: BundleListProps) {
  return (
    <section aria-labelledby="bundles-heading" className="flex flex-col gap-4">
      <h2
        id="bundles-heading"
        tabIndex={-1}
        className="flex scroll-mt-24 items-center gap-2 text-xl font-semibold outline-none"
      >
        <Combine aria-hidden className="size-5 text-role-accent" />
        Phương án đã chọn
      </h2>
      <ul className="flex flex-col gap-4">
        {bundles.map((b, i) => (
          <li key={b.id}>
            <BundleCard
              bundle={b}
              unitLabel={unitLabel}
              home={home}
              homeName={homeName}
              serverNow={serverNow}
              withMap={i === 0}
              perishabilityOf={perishabilityOf}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function BundleCard({
  bundle: b,
  unitLabel,
  home,
  homeName,
  serverNow,
  withMap,
  perishabilityOf,
}: {
  bundle: BundleRecord;
  unitLabel: string;
  home: LatLng | null;
  homeName: string;
  serverNow: number;
  withMap: boolean;
  perishabilityOf: Record<string, Perishability>;
}) {
  const now = new Date(serverNow);
  const stops = bundleStops(b.stopOrder, b.allocations);
  const seqOf = new Map(stops.map((s) => [s.siteId, s.seq]));
  const allocs = [...b.allocations].sort(
    (x, y) => (seqOf.get(x.storeSiteId) ?? 99) - (seqOf.get(y.storeSiteId) ?? 99),
  );
  const ok = allocs.filter((a) => ["confirmed", "assigned", "picked_up", "delivered"].includes(a.status));
  const waiting = allocs.filter((a) => a.status === "requested");
  const held = allocs
    .filter((a) => !["rejected", "expired", "cancelled"].includes(a.status))
    .reduce((s, a) => s + a.qtyHeld, 0);
  const titleId = `bundle-${b.id}`;
  const realRoute = b.route && b.routeProvider ? b.route : null;
  const sameUnit = allocs.every((a) => a.unit === allocs[0]?.unit);

  return (
    <article aria-labelledby={titleId} className="overflow-hidden rounded-xl border bg-surface shadow-1">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b bg-bg/60 p-4">
        <div className="min-w-0">
          <h3 id={titleId} className="text-base font-semibold">
            {b.rematchOf ? "Phương án bổ sung" : `Phương án ${b.optionRank}`} · {b.stopCount} cửa hàng
          </h3>
          <p className="mt-0.5 text-sm text-ink-muted tabular-nums">
            Chọn lúc {formatDayTime(b.createdAt, now)} · cần {formatAmount(b.qtyTarget)} {unitLabel}
            {sameUnit && allocs[0] ? ` · đang giữ ${formatQty(held, allocs[0].unit)}` : ""}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-subtle tabular-nums">
            <span className="inline-flex items-center gap-1">
              <Route aria-hidden className="size-3.5" />
              {realRoute ? "Tuyến xe máy" : "Tuyến ước tính"} ~{formatDistance(b.estDistanceM)} · ~
              {formatMinutes(b.estDurationS / 60)}
            </span>
            <span>
              {ok.length}/{stops.length} cửa hàng đã xác nhận
              {waiting.length > 0 ? ` · ${waiting.length} đang chờ` : ""}
            </span>
          </p>
        </div>
        <BundleStatusBadge status={b.status} />
      </header>

      <div className={cn("grid gap-4 p-4", withMap && home && "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]")}>
        <ol aria-label="Cửa hàng trong phương án, theo thứ tự đi" className="flex flex-col divide-y">
          {allocs.map((a) => (
            <AllocationRow
              key={a.id}
              a={a}
              seq={seqOf.get(a.storeSiteId) ?? 0}
              now={now}
              serverNow={serverNow}
              perishability={perishabilityOf[a.categoryCode] ?? "packaged"}
            />
          ))}
        </ol>
        {withMap && home ? (
          <div className="h-[30rem] lg:h-auto lg:min-h-96">
            <PlanMapLazy
              home={home}
              homeName={homeName}
              plans={[
                {
                  key: b.id,
                  rank: b.optionRank,
                  path: bundlePath(stops, home),
                  route: realRoute,
                  stops: stops.map((s) => ({
                    siteId: s.siteId,
                    seq: s.seq,
                    location: s.location,
                    approximate: s.visibility === "approximate",
                    ariaLabel: `Điểm dừng ${s.seq}: ${s.storeName}${s.visibility === "approximate" ? ", vị trí gần đúng" : ""}`,
                    ...bundleStopMapInfo(s.siteId, s.storeName, allocs, perishabilityOf, now),
                  })),
                },
              ]}
              activeKey={b.id}
              caption={
                <>
                  <strong>{stops.length} cửa hàng</strong> · {realRoute ? "tuyến xe máy" : "tuyến ước tính"} ~
                  {formatDistance(b.estDistanceM)} · đi theo số {stops.map((s) => s.seq).join(" → ")} rồi về
                  điểm nhận
                </>
              }
              ariaLabel={`Bản đồ phương án đã chọn: điểm nhận ${homeName} và ${stops.length} cửa hàng theo thứ tự đi. Danh sách bên cạnh có cùng thông tin.`}
            />
          </div>
        ) : null}
      </div>

      {ok.length > 0 ? (
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t p-4">
          <p className="text-sm text-ink-muted">
            Cửa hàng đã xác nhận — tạo chuyến để tình nguyện viên (hoặc bạn) đến lấy theo tuyến.
          </p>
          <Button asChild>
            <Link href="/charity/pickups">
              <Route aria-hidden />
              Tạo chuyến lấy hàng
            </Link>
          </Button>
        </footer>
      ) : null}
    </article>
  );
}

function AllocationRow({
  a,
  seq,
  now,
  serverNow,
  perishability,
}: {
  a: BundleAllocation;
  seq: number;
  now: Date;
  serverNow: number;
  perishability: Perishability;
}) {
  const dead = a.status === "rejected" || a.status === "expired" || a.status === "cancelled";
  return (
    <li className="flex gap-3 py-3 first:pt-0 last:pb-0">
      <span
        aria-hidden
        className={cn(
          "mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border-[3px] text-sm font-bold tabular-nums",
          dead ? "border-ink-subtle bg-bg-sunken text-ink-subtle" : "border-info bg-surface text-ink",
        )}
      >
        {seq}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium text-ink">
            <span className="sr-only">Điểm dừng {seq}: </span>
            {a.storeName}
          </p>
          <span className="flex flex-wrap items-center gap-1.5">
            <AllocationStatusBadge status={a.status} />
            {a.autoConfirmed ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-info/30 bg-info-soft px-2 py-0.5 text-xs font-medium text-info">
                <Zap aria-hidden className="size-3.5" />
                Tự động xác nhận
              </span>
            ) : null}
          </span>
        </div>
        <p className={cn("text-sm", dead && "text-ink-subtle line-through decoration-ink-subtle/60")}>
          <span className="font-semibold tabular-nums">{formatQty(a.qtyReserved, a.unit)}</span>{" "}
          <span className="text-ink-muted">{a.offerTitle}</span>
        </p>
        {a.status === "requested" ? (
          <p className="flex items-center gap-1.5 text-xs text-ink-muted tabular-nums">
            <Hourglass aria-hidden className="size-3.5" />
            {a.reservedUntil
              ? `Cửa hàng cần trả lời trước ${formatDayTime(a.reservedUntil, now)}`
              : "Đang chờ cửa hàng trả lời"}
          </p>
        ) : null}
        {a.status === "confirmed" && a.confirmedAt ? (
          <p className="flex items-center gap-1.5 text-xs text-ink-muted tabular-nums">
            <CalendarClock aria-hidden className="size-3.5" />
            {a.autoConfirmed ? "Giữ chỗ ngay" : "Xác nhận"} lúc {formatDayTime(a.confirmedAt, now)}
          </p>
        ) : null}
        {!dead &&
        a.effectiveDeadline &&
        (a.status === "requested" || a.status === "confirmed" || a.status === "assigned") ? (
          <LiveFreshness
            deadline={a.effectiveDeadline}
            serverNow={serverNow}
            perishability={perishability}
            size="sm"
          />
        ) : null}
        {!dead && a.status !== "delivered" ? (
          <OrgContactButton
            orgId={a.storeOrgId}
            orgName={a.storeName}
            subject={a.offerTitle}
            className="w-fit"
          />
        ) : null}
        {a.status === "rejected" ? (
          <p className="flex items-start gap-1.5 text-xs text-ink">
            <MessageSquareQuote aria-hidden className="mt-0.5 size-3.5 shrink-0 text-danger" />
            Cửa hàng từ chối{a.cancelReason ? `: “${a.cancelReason}”` : ""} — số lượng đã trả lại cho lô.
          </p>
        ) : null}
        {a.status === "expired" ? (
          <p className="flex items-start gap-1.5 text-xs text-ink">
            <CircleX aria-hidden className="mt-0.5 size-3.5 shrink-0 text-ink-subtle" />
            Cửa hàng không trả lời kịp nên yêu cầu đã hết hạn.
          </p>
        ) : null}
        {a.status === "cancelled" ? (
          <p className="flex items-start gap-1.5 text-xs text-ink">
            <CircleX aria-hidden className="mt-0.5 size-3.5 shrink-0 text-ink-subtle" />
            {a.cancelActor === "charity"
              ? "Tổ chức đã hủy"
              : a.cancelActor === "store"
                ? "Cửa hàng đã hủy"
                : "Đã hủy"}
            {a.cancelReason ? `: “${a.cancelReason}”` : ""}.
          </p>
        ) : null}
      </div>
    </li>
  );
}

/** Marker bản đồ (C1): lượng đang giữ ở cửa hàng ("20 ổ") và nhãn gấp nhất của các lô còn hiệu lực. */
function bundleStopMapInfo(
  siteId: string,
  storeName: string,
  allocs: readonly BundleAllocation[],
  perishabilityOf: Record<string, Perishability>,
  now: Date,
) {
  const live = allocs.filter(
    (a) => a.storeSiteId === siteId && !["rejected", "expired", "cancelled"].includes(a.status),
  );
  const unit = live[0]?.unit;
  const label = live
    .filter((a) => a.effectiveDeadline)
    .map((a) =>
      freshnessLabel(new Date(a.effectiveDeadline!), perishabilityOf[a.categoryCode] ?? "packaged", now),
    )
    .sort((x, y) => LABEL_PRIORITY[x] - LABEL_PRIORITY[y])[0];
  return {
    name: storeName,
    label,
    tag:
      unit && live.every((a) => a.unit === unit)
        ? formatQty(
            live.reduce((sum, a) => sum + a.qtyHeld, 0),
            unit,
          )
        : undefined,
    details: live.map((a) => a.offerTitle).join(", ") || undefined,
  };
}
