import { Bike, UserRoundPen } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { OfflineNotice } from "@/features/volunteer/components/offline-notice";
import { TripCard } from "@/features/volunteer/components/trip-card";
import {
  countCompletedTrips,
  hasVolunteerProfile,
  loadLocationConsent,
  loadMyTrips,
  requestNow,
} from "@/features/volunteer/queries";
import { groupTodayTrips } from "@/features/volunteer/trip-model";
import { requireVolunteer } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Hôm nay — Tình nguyện viên" };

const weekday = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
});

const integer = new Intl.NumberFormat("vi-VN");

/** "Hôm nay" — màn đầu tiên của PWA tình nguyện viên (PRD US-VOL-03, US-VOL-04; DESIGN-SYSTEM §10.3). */
export default async function VolunteerTodayPage() {
  const { profile, membership } = await requireVolunteer();
  const [trips, consent, completed, hasProfile] = await Promise.all([
    loadMyTrips(profile.id),
    loadLocationConsent(profile.id),
    countCompletedTrips(profile.id),
    hasVolunteerProfile(profile.id),
  ]);
  const now = new Date(requestNow());
  const groups = groupTodayTrips(trips, now);
  const nothingToDo = groups.running.length + groups.today.length + groups.upcoming.length === 0;
  const today = weekday.format(now);

  const section = (id: string, title: string, list: typeof trips, opts: { actions?: boolean } = {}) =>
    list.length > 0 ? (
      <section aria-labelledby={id} className="flex flex-col gap-3">
        <h2 id={id} className="text-lg font-semibold">
          {title} <span className="font-normal text-ink-muted tabular-nums">({list.length})</span>
        </h2>
        <ul className="flex flex-col gap-3">
          {list.map((t) => (
            <li key={t.id}>
              <TripCard trip={t} consent={consent} now={now} showActions={opts.actions ?? true} />
            </li>
          ))}
        </ul>
      </section>
    ) : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Hôm nay"
        description={`${today.charAt(0).toUpperCase()}${today.slice(1)} · Chuyến ${membership.org.name} giao cho bạn`}
        className="pb-0"
      />
      <OfflineNotice loadedAt={now.toISOString()} />

      {!hasProfile ? (
        <aside
          aria-labelledby="profile-callout"
          className="flex flex-col gap-3 rounded-xl border border-role-accent/40 bg-role-accent-soft p-4"
        >
          <h2 id="profile-callout" className="flex items-center gap-2 font-semibold text-ink">
            <UserRoundPen aria-hidden className="size-5 text-role-accent" />
            Hoàn thiện hồ sơ tình nguyện viên
          </h2>
          <p className="text-[0.9375rem] text-ink">
            Cho điều phối viên biết phương tiện, sức chở và khu vực bạn hay hoạt động để được giao chuyến phù
            hợp.
          </p>
          <Button asChild size="lg" className="h-12 w-full text-base sm:w-fit">
            <Link href="/volunteer/profile">Cập nhật hồ sơ</Link>
          </Button>
        </aside>
      ) : null}

      {nothingToDo ? (
        <EmptyState
          icon={Bike}
          title={
            groups.finishedToday.length > 0
              ? "Bạn đã xong các chuyến hôm nay"
              : "Hôm nay bạn chưa có chuyến nào"
          }
          description={
            <>
              <p>
                Điều phối viên của {membership.org.name} giao chuyến khi có cửa hàng tặng thực phẩm. Bạn sẽ
                nhận thông báo ở chuông góc trên, rồi bấm “Nhận chuyến” tại đây.
              </p>
              <p className="mt-2 font-medium text-ink">
                {completed > 0
                  ? `Bạn đã hoàn thành ${integer.format(completed)} chuyến. Cảm ơn bạn!`
                  : "Chuyến đầu tiên của bạn sẽ hiện ở đây."}
              </p>
            </>
          }
          action={
            <Button asChild variant="outline" size="lg" className="h-12 text-base">
              <Link href="/volunteer/profile">Xem hồ sơ và khu vực</Link>
            </Button>
          }
        />
      ) : null}

      {section("running-heading", "Đang chạy", groups.running)}
      {section("today-heading", "Chuyến hôm nay", groups.today)}
      {section("upcoming-heading", "Sắp tới", groups.upcoming)}
      {section("finished-heading", "Đã xong hôm nay", groups.finishedToday, { actions: false })}
    </div>
  );
}
