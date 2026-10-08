import {
  Bike,
  ChevronRight,
  PackageCheck,
  PackageSearch,
  Route,
  Search,
  Store,
  UserRound,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { NoTripsIllustration } from "@/components/illustrations";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { loadCharityContext, requestNow } from "@/features/charity-allocations/context";
import { formatDayTime } from "@/features/charity-allocations/present";
import { loadAllocations } from "@/features/charity-allocations/queries";
import { PickupPlanner } from "@/features/pickups/components/pickup-planner";
import { PickupStatusBadge } from "@/features/pickups/components/pickup-status-badge";
import { groupBy } from "@/features/pickups/plan";
import { isRunning, loadPlannerGeo, loadTrips, type TripSummary } from "@/features/pickups/queries";
import { listVolunteers } from "@/features/volunteers/queries";

export const metadata: Metadata = { title: "Chuyến lấy hàng — Tổ chức" };

/**
 * Chuyến lấy hàng: chọn phân bổ đã xác nhận → tạo chuyến tự đến lấy (US-CHA-20) hoặc giao cho 1–2 tình
 * nguyện viên (US-CHA-16/17, P3-09); danh sách chuyến đang chạy/đã xong; lối tắt "Nhận hàng" (US-CHA-21).
 */
export default async function CharityPickupsPage() {
  const ctx = await loadCharityContext();
  const now = requestNow();
  const [confirmed, trips, volunteers] = await Promise.all([
    loadAllocations(ctx.orgId, { statuses: ["confirmed"] }),
    loadTrips(ctx.orgId),
    listVolunteers(ctx.orgId).catch((err: unknown) => {
      // Danh sách TNV không được làm hỏng chế độ tự đến lấy
      console.error("[pickups] list volunteers", err instanceof Error ? err.message : String(err));
      return [];
    }),
  ]);
  const bySite = groupBy(
    confirmed.filter((a) => a.pickupId === null),
    (a) => a.charitySiteId,
  );
  const geo =
    bySite.size > 0
      ? await loadPlannerGeo(
          [...new Set([...bySite.values()].flat().map((a) => a.storeSiteId))],
          [...bySite.keys()],
        )
      : { stores: [], dropoffs: {} as Record<string, null> };
  const running = trips.filter((t) => isRunning(t.status));
  const past = trips.filter((t) => !isRunning(t.status)).slice(0, 20);
  const awaiting = running.filter((t) => t.awaitingDropoff);

  return (
    <>
      <PageHeader
        title="Chuyến lấy hàng"
        description="Gom các lô đã được cửa hàng xác nhận thành chuyến tự đến lấy hoặc giao cho tình nguyện viên, rồi theo dõi từng điểm dừng."
        breadcrumb={[{ label: "Tổng quan", href: "/charity" }, { label: "Chuyến lấy hàng" }]}
        actions={
          <Button asChild variant="outline">
            <Link href="/charity/receive">
              <PackageCheck aria-hidden />
              Nhận hàng{awaiting.length > 0 ? ` (${awaiting.length})` : ""}
            </Link>
          </Button>
        }
      />

      <div className="flex flex-col gap-10">
        {awaiting.length > 0 ? (
          <p
            role="status"
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-info/30 bg-info-soft px-4 py-3 text-sm text-ink"
          >
            <span className="flex items-start gap-2">
              <PackageCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-info" />
              {awaiting.length === 1
                ? "1 chuyến tình nguyện viên đã lấy xong hàng và đang chờ bạn xác nhận nhận hàng."
                : `${awaiting.length} chuyến tình nguyện viên đã lấy xong hàng và đang chờ bạn xác nhận nhận hàng.`}
            </span>
            <Button asChild size="sm">
              <Link href="/charity/receive">Mở màn nhận hàng</Link>
            </Button>
          </p>
        ) : null}

        <section aria-labelledby="ready-heading" className="flex flex-col gap-4">
          <h2 id="ready-heading" className="text-[1.375rem] leading-[1.875rem] font-semibold">
            Lô đã xác nhận — chờ lên chuyến
          </h2>
          {bySite.size === 0 ? (
            <EmptyState
              variant="section"
              icon={PackageSearch}
              illustration={<NoTripsIllustration />}
              title="Chưa có lô nào chờ đi lấy"
              description={
                <p>
                  Khi cửa hàng xác nhận yêu cầu “Xin nhận” của bạn, lô sẽ xuất hiện ở đây để tạo chuyến tự đến
                  lấy hoặc giao cho tình nguyện viên.
                </p>
              }
              action={
                <Button asChild>
                  <Link href="/charity/donations">
                    <Search aria-hidden />
                    Tìm thực phẩm gần bạn
                  </Link>
                </Button>
              }
            />
          ) : (
            [...bySite.entries()].map(([siteId, list]) => {
              const storeIds = new Set(list.map((a) => a.storeSiteId));
              return (
                <PickupPlanner
                  key={`${siteId}:${list.map((a) => a.id).join(",")}`}
                  siteId={siteId}
                  siteName={list[0]!.charitySiteName}
                  allocations={list}
                  serverNow={now}
                  headingLevel={3}
                  stores={geo.stores.filter((s) => storeIds.has(s.siteId))}
                  dropoff={geo.dropoffs[siteId] ?? null}
                  volunteers={volunteers}
                />
              );
            })
          )}
        </section>

        <TripSection
          id="running-heading"
          title="Chuyến đang chạy"
          trips={running}
          empty="Không có chuyến nào đang chạy."
          now={now}
        />
        {past.length > 0 ? (
          <TripSection id="past-heading" title="Chuyến đã xong" trips={past} empty="" now={now} />
        ) : null}
      </div>
    </>
  );
}

function TripSection({
  id,
  title,
  trips,
  empty,
  now,
}: {
  id: string;
  title: string;
  trips: TripSummary[];
  empty: string;
  now: number;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <h2 id={id} className="text-[1.375rem] leading-[1.875rem] font-semibold">
        {title}
      </h2>
      {trips.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-ink-muted">{empty}</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {trips.map((t) => (
            <li key={t.id}>
              <Link
                href={`/charity/pickups/${t.id}`}
                className="flex h-full items-start gap-3 rounded-lg border bg-surface p-4 shadow-1 transition-colors duration-100 hover:border-border-strong/50 hover:bg-bg"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-md bg-role-accent-soft text-role-accent">
                  {t.mode === "volunteer" ? (
                    <Bike aria-hidden className="size-5" />
                  ) : (
                    <Route aria-hidden className="size-5" />
                  )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">
                      {t.mode === "self" ? "Tự đến lấy" : "Tình nguyện viên"} · {t.pickupStops} điểm lấy
                    </span>
                    <PickupStatusBadge status={t.status} mode={t.mode} />
                  </span>
                  {t.mode === "volunteer" ? (
                    <span className="flex items-center gap-1 text-sm text-ink-muted">
                      <UserRound aria-hidden className="size-4 shrink-0" />
                      {t.assigneeName
                        ? `${t.assigneeName}${t.status === "assigned" && !t.acceptedAt ? " · chờ nhận chuyến" : ""}`
                        : "Chờ phân công"}
                    </span>
                  ) : null}
                  <span className="flex items-center gap-1 truncate text-sm text-ink-muted">
                    <Store aria-hidden className="size-4 shrink-0" />
                    <span className="truncate">{t.storeNames.join(", ") || "—"}</span>
                  </span>
                  <span className="text-sm text-ink-subtle tabular-nums">
                    Giao về {t.charitySiteName} · tạo {formatDayTime(t.createdAt, new Date(now))}
                    {isRunning(t.status) ? ` · đã lấy ${t.doneStops}/${t.pickupStops}` : ""}
                  </span>
                  {t.awaitingDropoff ? (
                    <span className="text-sm font-medium text-info">Chờ bạn nhận hàng</span>
                  ) : null}
                </span>
                <ChevronRight aria-hidden className="mt-2 size-5 shrink-0 text-ink-subtle" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
