import { Route } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { OfflineNotice } from "@/features/volunteer/components/offline-notice";
import { TripCard } from "@/features/volunteer/components/trip-card";
import { loadLocationConsent, loadMyTrips, requestNow } from "@/features/volunteer/queries";
import { requireVolunteer } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Chuyến — Tình nguyện viên" };

/**
 * Tất cả chuyến của tôi (thông báo "Bạn được giao chuyến" dẫn về đây): đang chạy & sắp tới ở trên, đã xong/đã hủy
 * ở dưới (mới nhất trước).
 */
export default async function VolunteerTripsPage() {
  const { profile, membership } = await requireVolunteer();
  const [trips, consent] = await Promise.all([loadMyTrips(profile.id), loadLocationConsent(profile.id)]);
  const now = new Date(requestNow());
  const order = { in_progress: 0, awaiting_response: 1, accepted: 2 } as const;
  const active = trips
    .filter((t) => t.phase === "in_progress" || t.phase === "awaiting_response" || t.phase === "accepted")
    .sort(
      (a, b) =>
        order[a.phase as keyof typeof order] - order[b.phase as keyof typeof order] ||
        a.startAt.localeCompare(b.startAt),
    );
  const past = trips
    .filter((t) => t.phase === "completed" || t.phase === "cancelled")
    .sort((a, b) =>
      (b.completedAt ?? b.cancelledAt ?? "").localeCompare(a.completedAt ?? a.cancelledAt ?? ""),
    );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Chuyến"
        description={`Các chuyến ${membership.org.name} giao cho bạn — đang chạy, sắp tới và đã xong.`}
        className="pb-0"
      />
      <OfflineNotice loadedAt={now.toISOString()} />

      {trips.length === 0 ? (
        <EmptyState
          icon={Route}
          title="Bạn chưa có chuyến nào"
          description={
            <p>
              Khi điều phối viên của {membership.org.name} giao chuyến, chuyến sẽ hiện ở đây và ở “Hôm nay”,
              kèm thông báo ở chuông góc trên.
            </p>
          }
          action={
            <Button asChild variant="outline" size="lg" className="h-12 text-base">
              <Link href="/volunteer">Về “Hôm nay”</Link>
            </Button>
          }
        />
      ) : null}

      {active.length > 0 ? (
        <section aria-labelledby="active-heading" className="flex flex-col gap-3">
          <h2 id="active-heading" className="text-lg font-semibold">
            Đang chạy và sắp tới{" "}
            <span className="font-normal text-ink-muted tabular-nums">({active.length})</span>
          </h2>
          <ul className="flex flex-col gap-3">
            {active.map((t) => (
              <li key={t.id}>
                <TripCard trip={t} consent={consent} now={now} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {past.length > 0 ? (
        <section aria-labelledby="past-heading" className="flex flex-col gap-3">
          <h2 id="past-heading" className="text-lg font-semibold">
            Đã xong <span className="font-normal text-ink-muted tabular-nums">({past.length})</span>
          </h2>
          <ul className="flex flex-col gap-3">
            {past.map((t) => (
              <li key={t.id}>
                <TripCard trip={t} consent={consent} now={now} showActions={false} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
