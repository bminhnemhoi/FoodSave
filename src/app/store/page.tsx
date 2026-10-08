import {
  AlarmClock,
  ChevronRight,
  ClipboardList,
  HeartHandshake,
  Leaf,
  Package,
  PackageCheck,
  PackagePlus,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ImpactCounters } from "@/components/charts/impact-counters";
import { LiveFreshness } from "@/components/labels/live-freshness";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { LABEL_THRESHOLDS_V1 } from "@/core/labels";
import { formatQty } from "@/features/catalog/labels";
import { getOrgImpact } from "@/features/impact/queries";
import { KpiTile } from "@/features/offers/components/kpi-tile";
import { OfferThumb } from "@/features/offers/components/offer-card";
import { PausedNotice } from "@/features/offers/components/paused-notice";
import { formatDeadline, vnDateKey } from "@/features/offers/datetime";
import {
  kgHandedOverThisMonth,
  listLiveOffers,
  loadStoreContext,
  type InventoryOffer,
} from "@/features/offers/queries";
import { RequestCard } from "@/features/store-requests/components/request-card";
import { listStoreAllocations } from "@/features/store-requests/queries";
import { formatDecimal } from "@/lib/format";
import { requirePortal } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Tổng quan — Cửa hàng" };

/** "Sắp chuyển Đỏ": đang Đỏ hoặc chuyển Đỏ trong 3 giờ tới (theo nhóm hàng, label_rules v1). */
const RED_SOON_MS = 3 * 60 * 60 * 1000;

function isRedSoon(o: InventoryOffer, now: Date): boolean {
  if (!o.effectiveDeadline || !o.label || o.label === "expired") return false;
  if (o.label === "red") return true;
  const redFrom = Date.parse(o.effectiveDeadline) - LABEL_THRESHOLDS_V1[o.perishability].redBelowMs;
  return redFrom - now.getTime() <= RED_SOON_MS;
}

/** Tổng quan cửa hàng (P2): số liệu thật — lô đang mở, yêu cầu chờ, lô sắp Đỏ, kg đã trao trong tháng. */
export default async function StoreHomePage() {
  const { profile } = await requirePortal("store");
  const ctx = await loadStoreContext();
  const now = new Date();
  // Nhân viên không xem số liệu tác động/ESG (PRD US-STO-06 AC2; RLS impact_ledger chỉ owner/manager)
  const canSeeImpact = ctx.canCancel;
  const [live, pending, preparing, kg, impact] = await Promise.all([
    listLiveOffers(ctx.orgId, now),
    listStoreAllocations({ orgId: ctx.orgId, statuses: ["requested"], now, limit: 50 }),
    listStoreAllocations({ orgId: ctx.orgId, statuses: ["confirmed", "assigned"], now, limit: 50 }),
    canSeeImpact ? kgHandedOverThisMonth(ctx.orgId, now) : Promise.resolve(null),
    canSeeImpact ? getOrgImpact(ctx.orgId) : Promise.resolve(null),
  ]);
  const serverNow = now.getTime();
  const redSoon = live.filter((o) => isRedSoon(o, now));
  const fullyHeld = live.filter((o) => o.status === "fully_allocated").length;
  const month = vnDateKey(now).slice(5, 7);
  const firstTime = live.length === 0 && pending.length === 0 && preparing.length === 0;

  return (
    <>
      <PageHeader
        title="Tổng quan"
        description={`Xin chào ${profile.fullName} · ${ctx.orgName}`}
        actions={
          ctx.sites.length > 0 ? (
            <Button asChild size="lg">
              <Link href="/store/inventory/new">
                <PackagePlus aria-hidden />
                Đăng lô mới
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="flex flex-col gap-8">
        {ctx.isPaused ? <PausedNotice canManage={ctx.canCancel} /> : null}

        <section aria-label="Chỉ số hôm nay">
          <ul className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
            <li>
              <KpiTile
                icon={Package}
                label="Lô đang mở"
                value={String(live.length)}
                hint={
                  fullyHeld > 0
                    ? `${fullyHeld} lô đã được giữ hết`
                    : "Đang hiển thị trong kho tặng của tổ chức"
                }
                href="/store/inventory"
              />
            </li>
            <li>
              <KpiTile
                icon={ClipboardList}
                label="Chờ xác nhận"
                value={String(pending.length)}
                hint="Yêu cầu nhận lô cần bạn phản hồi trước hạn giữ chỗ"
                href="#cho-xac-nhan"
                emphasis={pending.length > 0}
              />
            </li>
            <li>
              <KpiTile
                icon={AlarmClock}
                label="Đỏ / sắp Đỏ"
                value={String(redSoon.length)}
                hint="Lô đang Đỏ hoặc chuyển Đỏ trong 3 giờ tới"
                href="#sap-do"
              />
            </li>
            <li>
              {kg !== null ? (
                <KpiTile
                  icon={HeartHandshake}
                  label={`Đã trao tháng ${month}`}
                  value={formatDecimal(kg)}
                  unit="kg"
                  hint="Từ sổ tác động: chỉ tính hàng đã bàn giao tới tổ chức"
                />
              ) : (
                <KpiTile
                  icon={PackageCheck}
                  label="Chuẩn bị bàn giao"
                  value={String(preparing.length)}
                  hint="Lô đã xác nhận, chờ tổ chức tới lấy"
                  href="/store/handover"
                />
              )}
            </li>
          </ul>
        </section>

        {firstTime ? (
          <EmptyState
            icon={PackagePlus}
            title="Chưa có lô nào đang mở"
            description="Đăng lô đầu tiên để các tổ chức gần bạn nhận được. Yêu cầu nhận lô và lô sắp chuyển Đỏ sẽ hiện ở đây."
            action={
              ctx.sites.length > 0 ? (
                <Button asChild size="lg">
                  <Link href="/store/inventory/new">
                    <PackagePlus aria-hidden />
                    Đăng lô mới
                  </Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid gap-8 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
            <section
              id="cho-xac-nhan"
              aria-labelledby="pending-title"
              className="flex scroll-mt-24 flex-col gap-3"
            >
              <SectionTitle id="pending-title" title="Chờ xác nhận" count={pending.length} />
              {pending.length > 0 ? (
                <ul className="flex flex-col gap-3">
                  {pending.slice(0, 10).map((a) => (
                    <li key={a.id}>
                      <RequestCard allocation={a} serverNow={serverNow} showOffer />
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  variant="section"
                  headingLevel={3}
                  icon={ClipboardList}
                  title="Không có yêu cầu nào đang chờ"
                  description="Khi một tổ chức gửi yêu cầu nhận lô, bạn xác nhận hoặc từ chối ngay tại đây."
                />
              )}
            </section>

            <section id="sap-do" aria-labelledby="red-title" className="flex scroll-mt-24 flex-col gap-3">
              <SectionTitle id="red-title" title="Lô Đỏ và sắp chuyển Đỏ" count={redSoon.length} />
              {redSoon.length > 0 ? (
                <ul className="flex flex-col divide-y rounded-xl border bg-surface shadow-1">
                  {redSoon.slice(0, 8).map((o) => (
                    <li key={o.id} className="flex items-center gap-3 p-3 sm:p-4">
                      <OfferThumb photoPath={o.photoPath} icon={o.icon} size="sm" />
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <Link
                          href={`/store/inventory/${o.id}`}
                          className="truncate font-medium underline-offset-4 hover:underline"
                        >
                          {o.title}
                        </Link>
                        <LiveFreshness
                          deadline={o.effectiveDeadline!}
                          serverNow={serverNow}
                          perishability={o.perishability}
                          size="sm"
                        />
                        <p className="text-xs text-ink-muted tabular-nums">
                          Còn {formatQty(o.available, o.unit)} · hạn{" "}
                          {formatDeadline(new Date(o.effectiveDeadline!), now)}
                          {o.stats.pending > 0 ? ` · ${o.stats.pending} yêu cầu chờ` : ""}
                        </p>
                      </div>
                      <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-subtle" />
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  variant="section"
                  headingLevel={3}
                  icon={Leaf}
                  title="Không có lô nào sắp chuyển Đỏ"
                  description="Lô đang mở đều còn đủ thời gian. Lô sẽ hiện ở đây khi còn dưới 3 giờ nữa là chuyển Đỏ."
                />
              )}
            </section>
          </div>
        )}

        {preparing.length > 0 ? (
          <section aria-labelledby="preparing-title" className="flex flex-col gap-3">
            <SectionTitle
              id="preparing-title"
              title="Chuẩn bị bàn giao"
              count={preparing.length}
              icon={PackageCheck}
            />
            <ul className="grid gap-3 lg:grid-cols-2">
              {preparing.slice(0, 10).map((a) => (
                <li key={a.id}>
                  <RequestCard allocation={a} serverNow={serverNow} showOffer />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {impact ? (
          <section aria-labelledby="impact-title" className="flex flex-col gap-3">
            <SectionTitle
              id="impact-title"
              title="Tác động của cửa hàng"
              count={impact.totals.deliveries}
              icon={Leaf}
            />
            <ImpactCounters
              label="Tác động của cửa hàng từ khi tham gia"
              totals={impact.totals}
              metrics={["kg", "meals", "co2e", "water"]}
              factorVersion={impact.factors.current?.version}
              sources={impact.factors.sources}
              isDemo={impact.isDemo}
              empty={{
                title: "Chưa có lần bàn giao nào",
                description:
                  "Số liệu tự cập nhật sau mỗi lần bàn giao được hai bên đối soát — dùng được cho báo cáo CSR/ESG.",
              }}
            />
          </section>
        ) : null}
      </div>
    </>
  );
}

function SectionTitle({
  id,
  title,
  count,
  icon: Icon,
}: {
  id: string;
  title: string;
  count: number;
  icon?: typeof Package;
}) {
  return (
    <h2 id={id} className="flex items-center gap-2 text-[1.375rem] leading-[1.875rem] font-semibold">
      {Icon ? <Icon aria-hidden className="size-5 text-role-accent" /> : null}
      {title}
      <span className="rounded-full bg-bg-sunken px-2.5 py-0.5 text-sm font-medium text-ink-muted tabular-nums">
        {count}
      </span>
    </h2>
  );
}
