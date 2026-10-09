"use client";

import { BadgeCheck, CalendarX2, Clock, MapPin, MapPinPlus, Pencil, Star } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import { KIND_COPY, type OrgKind } from "@/features/onboarding/options";
import { SITE_VISIBILITY_LABEL } from "@/features/organizations/labels";
import { formatKm } from "@/lib/format";

import type { SettingsSite } from "../queries";
import { AutoAcceptForm } from "./auto-accept-form";
import { ClosuresCalendar } from "./closures-calendar";
import { HoursForm } from "./hours-form";
import { SiteForm } from "./site-form";

export type SitePermissions = Record<string, { manage: boolean; closures: boolean }>;

function SiteSummary({ kind, site }: { kind: OrgKind; site: SettingsSite }) {
  const address = site.location?.addressLine
    ? [site.location.addressLine, site.ward, site.city].filter(Boolean).join(", ")
    : [site.ward, site.city].filter(Boolean).join(", ");
  return (
    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
      <div className="flex flex-col gap-0.5 sm:col-span-2">
        <dt className="text-ink-subtle">Địa chỉ</dt>
        <dd className="flex items-start gap-1.5 font-medium break-words">
          <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-role-accent" />
          {address || "—"}
        </dd>
      </div>
      {kind === "charity" ? (
        <>
          <div className="flex flex-col gap-0.5">
            <dt className="text-ink-subtle">Bán kính phục vụ</dt>
            <dd className="font-medium tabular-nums">{formatKm(site.radiusKm)}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-ink-subtle">Hiển thị vị trí</dt>
            <dd className="font-medium">{SITE_VISIBILITY_LABEL[site.visibility]}</dd>
          </div>
        </>
      ) : null}
    </dl>
  );
}

function SiteCard({
  kind,
  orgId,
  site,
  today,
  perms,
  editing,
  onEdit,
}: {
  kind: OrgKind;
  orgId: string;
  site: SettingsSite;
  today: string;
  perms: { manage: boolean; closures: boolean };
  editing: boolean;
  onEdit: (on: boolean) => void;
}) {
  const copy = KIND_COPY[kind];
  const titleId = `site-${site.id}-title`;
  return (
    <article
      aria-labelledby={titleId}
      className="flex flex-col gap-6 rounded-xl border bg-surface p-4 sm:p-6"
    >
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <h2 id={titleId} className="flex flex-wrap items-center gap-2 text-lg font-semibold break-words">
            {site.name}
            {site.isPrimary ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-role-accent/30 bg-role-accent-soft px-2 py-0.5 text-xs font-medium text-ink">
                <Star aria-hidden className="size-3.5" />
                Điểm chính
              </span>
            ) : null}
          </h2>
          {!editing ? <SiteSummary kind={kind} site={site} /> : null}
        </div>
        {perms.manage && !editing ? (
          <Button type="button" variant="outline" className="min-h-11 shrink-0" onClick={() => onEdit(true)}>
            <Pencil aria-hidden />
            Sửa thông tin điểm<span className="sr-only">: {site.name}</span>
          </Button>
        ) : null}
      </header>

      {editing ? <SiteForm kind={kind} orgId={orgId} site={site} onDone={() => onEdit(false)} /> : null}

      {kind === "store" ? (
        <section aria-labelledby={`${titleId}-auto`} className="flex flex-col gap-3 border-t pt-5">
          <h3 id={`${titleId}-auto`} className="flex items-center gap-2 font-semibold">
            <BadgeCheck aria-hidden className="size-4 text-role-accent" />
            Duyệt yêu cầu nhận lô
          </h3>
          <p className="text-sm text-ink-muted">
            Chọn cách xử lý khi tổ chức xin nhận lô của chi nhánh này: tự duyệt, hoặc tự động chấp nhận.
          </p>
          <AutoAcceptForm
            siteId={site.id}
            siteName={site.name}
            initialMode={site.autoAccept.mode}
            initialMinTrust={site.autoAccept.minTrust}
            canEdit={perms.manage}
            headingId={`${titleId}-auto`}
          />
        </section>
      ) : null}

      <section aria-labelledby={`${titleId}-hours`} className="flex flex-col gap-3 border-t pt-5">
        <h3 id={`${titleId}-hours`} className="flex items-center gap-2 font-semibold">
          <Clock aria-hidden className="size-4 text-role-accent" />
          {copy.hoursTitle}
        </h3>
        <p className="text-sm text-ink-muted">Giờ theo giờ Việt Nam, dạng 24 giờ.</p>
        <HoursForm kind={kind} siteId={site.id} initialRows={site.hours} canEdit={perms.manage} />
      </section>

      <section aria-labelledby={`${titleId}-closures`} className="flex flex-col gap-3 border-t pt-5">
        <h3 id={`${titleId}-closures`} className="flex items-center gap-2 font-semibold">
          <CalendarX2 aria-hidden className="size-4 text-role-accent" />
          Ngày nghỉ
        </h3>
        <ClosuresCalendar
          siteId={site.id}
          siteName={site.name}
          closures={site.closures}
          today={today}
          canEdit={perms.closures}
        />
      </section>
    </article>
  );
}

/**
 * Tab "Chi nhánh & giờ" / "Điểm nhận & giờ" (P1-06, F-08, US-STO-05, US-CHA-34): mỗi điểm một thẻ gồm
 * thông tin điểm (sửa bằng LocationPicker), giờ 24 giờ, lịch ngày nghỉ. Chỉ một form sửa điểm mở một lúc.
 */
export function SitesPanel({
  kind,
  orgId,
  sites,
  today,
  canCreate,
  perms,
}: {
  kind: OrgKind;
  orgId: string;
  sites: SettingsSite[];
  today: string;
  canCreate: boolean;
  perms: SitePermissions;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const noun = kind === "store" ? "chi nhánh" : "điểm nhận";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-prose text-sm text-ink-muted">
          {kind === "store"
            ? "Mỗi chi nhánh có giờ mở cửa và ngày nghỉ riêng — dùng để tính hạn lấy hàng của từng lô."
            : "Mỗi điểm nhận có giờ nhận hàng và ngày nghỉ riêng — FoodSave không gợi ý lô ngoài giờ nhận."}
        </p>
        {canCreate && editing !== "new" ? (
          <Button type="button" className="min-h-11 shrink-0" onClick={() => setEditing("new")}>
            <MapPinPlus aria-hidden />
            Thêm {noun}
          </Button>
        ) : null}
      </div>

      {editing === "new" ? (
        <section
          aria-labelledby="new-site-title"
          className="flex flex-col gap-4 rounded-xl border bg-surface p-4 sm:p-6"
        >
          <h2 id="new-site-title" className="text-lg font-semibold">
            Thêm {noun}
          </h2>
          <SiteForm kind={kind} orgId={orgId} site={null} onDone={() => setEditing(null)} />
        </section>
      ) : null}

      {sites.length === 0 && editing !== "new" ? (
        <EmptyState
          icon={MapPin}
          variant="section"
          title={`Chưa có ${noun} nào`}
          description={
            canCreate
              ? `Thêm ${noun} đầu tiên để khai giờ và ngày nghỉ.`
              : `Chủ sở hữu sẽ thêm ${noun}; bạn sẽ thấy ở đây khi có.`
          }
          action={
            canCreate ? (
              <Button type="button" className="min-h-11" onClick={() => setEditing("new")}>
                <MapPinPlus aria-hidden />
                Thêm {noun}
              </Button>
            ) : undefined
          }
        />
      ) : null}

      {sites.map((site) => (
        <SiteCard
          key={site.id}
          kind={kind}
          orgId={orgId}
          site={site}
          today={today}
          perms={perms[site.id] ?? { manage: false, closures: false }}
          editing={editing === site.id}
          onEdit={(on) => setEditing(on ? site.id : null)}
        />
      ))}
    </div>
  );
}
