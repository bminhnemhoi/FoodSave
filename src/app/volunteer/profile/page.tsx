import { Bike, Building2 } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { ConsentPanel } from "@/features/volunteer/components/consent-panel";
import { OfflineNotice } from "@/features/volunteer/components/offline-notice";
import { VolunteerProfileForm } from "@/features/volunteer/components/profile-form";
import {
  loadLocationConsent,
  loadTripContactConsent,
  loadVolunteerProfile,
  requestNow,
} from "@/features/volunteer/queries";
import { requireVolunteer } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Tài khoản — Tình nguyện viên" };

const kgInput = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1, useGrouping: false });

/** Tài khoản tình nguyện viên (PRD US-VOL-01 AC2, US-VOL-02 AC2; ROADMAP P3-08 phía TNV). */
export default async function VolunteerProfilePage() {
  const { profile, memberships } = await requireVolunteer();
  const [vp, consent, tripContact] = await Promise.all([
    loadVolunteerProfile(profile.id),
    loadLocationConsent(profile.id),
    loadTripContactConsent(profile.id),
  ]);
  const orgs = memberships.filter((m) => m.role === "volunteer" && m.org.kind === "charity");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tài khoản"
        description="Hồ sơ tình nguyện viên, phương tiện, khu vực, quyền chia sẻ vị trí và cho phép gọi trong chuyến."
        className="pb-0"
      />
      <OfflineNotice loadedAt={new Date(requestNow()).toISOString()} />

      {!vp.exists ? (
        <p className="rounded-lg border border-role-accent/40 bg-role-accent-soft p-3 text-[0.9375rem] text-ink">
          Bạn chưa có hồ sơ tình nguyện viên. Điền và bấm “Lưu hồ sơ” để điều phối viên giao chuyến phù hợp.
        </p>
      ) : null}

      <VolunteerProfileForm
        tripContact={tripContact}
        initial={{
          fullName: vp.fullName,
          phone: vp.phone ?? "",
          vehicle: vp.vehicle,
          capacityKg: kgInput.format(vp.capacityKg),
          area: vp.area,
          areaLabel: vp.areaLabel ?? "",
          availabilityNote: vp.availabilityNote ?? "",
        }}
      />

      <ConsentPanel consent={consent} />

      <section
        aria-labelledby="orgs-heading"
        className="flex flex-col gap-3 rounded-xl border bg-surface p-4 sm:p-6"
      >
        <h2 id="orgs-heading" className="text-lg font-semibold">
          Tổ chức bạn tham gia
        </h2>
        {orgs.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {orgs.map((m) => (
              <li key={m.orgId} className="flex items-center gap-3 rounded-lg border bg-bg px-3 py-2.5">
                <Building2 aria-hidden className="size-5 shrink-0 text-ink-subtle" />
                <span className="min-w-0 flex-1 font-medium text-ink">{m.org.name}</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-role-accent-soft px-2.5 py-0.5 text-sm font-medium text-role-accent">
                  <Bike aria-hidden className="size-4" />
                  Tình nguyện viên
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-muted">Bạn chưa là tình nguyện viên của tổ chức nào.</p>
        )}
        <p className="text-sm text-ink-muted">
          Muốn tham gia thêm tổ chức? Nhờ điều phối viên của tổ chức đó gửi lời mời tới email của bạn.
        </p>
      </section>
    </div>
  );
}
