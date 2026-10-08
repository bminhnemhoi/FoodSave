import { BadgeCheck, Hourglass, PackageSearch, Route, Scale, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ImpactCounters } from "@/components/charts/impact-counters";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { formatDecimal } from "@/lib/format";
import { AllocationItem } from "@/features/charity-allocations/components/allocation-item";
import { AutoRefresh } from "@/features/charity-allocations/components/auto-refresh";
import { KpiTile } from "@/features/charity-allocations/components/kpi-tile";
import { loadCharityContext, requestNow } from "@/features/charity-allocations/context";
import { vnMonthLabel } from "@/features/charity-allocations/present";
import {
  loadAllocations,
  loadKgThisMonth,
  type CharityAllocation,
} from "@/features/charity-allocations/queries";
import { getOrgImpact } from "@/features/impact/queries";
import { requirePortal } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Tổng quan — Tổ chức" };

const DAY = 86_400_000;

/** Tổng quan tổ chức (P2-10 phía tổ chức): KPI thật + "Yêu cầu của tôi" nhóm theo trạng thái, hủy yêu cầu. */
export default async function CharityHomePage() {
  const { profile } = await requirePortal("charity");
  const ctx = await loadCharityContext();
  const now = requestNow();
  const [live, delivered, closed, kgMonth] = await Promise.all([
    loadAllocations(ctx.orgId, { statuses: ["requested", "confirmed", "assigned", "picked_up"] }),
    loadAllocations(ctx.orgId, {
      statuses: ["delivered"],
      closedSince: new Date(now - 30 * DAY).toISOString(),
      limit: 10,
    }),
    loadAllocations(ctx.orgId, {
      statuses: ["cancelled", "rejected", "expired"],
      closedSince: new Date(now - 7 * DAY).toISOString(),
      limit: 10,
    }),
    loadKgThisMonth(ctx.orgId, new Date(now)),
  ]);
  // Bộ đếm tác động không được làm hỏng trang tổng quan nếu sổ tạm thời không đọc được
  const impact = await getOrgImpact(ctx.orgId).catch(() => null);

  const requested = live.filter((a) => a.status === "requested");
  const confirmed = live.filter((a) => a.status === "confirmed");
  const inTrip = live.filter((a) => a.status === "assigned" || a.status === "picked_up");
  const showSite = ctx.sites.length > 1;
  const nothingYet = live.length === 0 && delivered.length === 0 && closed.length === 0;

  const findFood = (
    <Button asChild size="lg">
      <Link href="/charity/donations">
        <Search aria-hidden />
        Tìm thực phẩm gần bạn
      </Link>
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Tổng quan"
        description={`Xin chào ${profile.fullName} · ${ctx.orgName}`}
        actions={findFood}
      />

      <div className="flex flex-col gap-8">
        <section aria-labelledby="kpi-heading">
          <h2 id="kpi-heading" className="sr-only">
            Chỉ số chính
          </h2>
          <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
            <KpiTile
              icon={Hourglass}
              label="Chờ cửa hàng xác nhận"
              value={String(requested.length)}
              unit="yêu cầu"
            />
            <KpiTile
              icon={BadgeCheck}
              label="Chờ lên chuyến"
              value={String(confirmed.length)}
              unit="phân bổ"
            />
            <KpiTile icon={Route} label="Đang lấy" value={String(inTrip.length)} unit="phân bổ" />
            <KpiTile
              icon={Scale}
              label={`Đã nhận ${vnMonthLabel(new Date(now))}`}
              value={kgMonth === null ? null : formatDecimal(kgMonth)}
              unit="kg"
              method="Theo sổ tác động: tổng kg đã bàn giao trong tháng, đã trừ điều chỉnh."
              emptyNote="Chưa đọc được sổ tác động. Tải lại trang sau ít phút."
            />
          </div>
        </section>

        <section aria-labelledby="yeu-cau-cua-toi" className="flex scroll-mt-24 flex-col gap-6">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 id="yeu-cau-cua-toi" className="text-[1.375rem] leading-[1.875rem] font-semibold">
              Yêu cầu của tôi
            </h2>
            <div className="flex flex-col items-end gap-1">
              <AutoRefresh serverNow={now} />
              {!ctx.canCancel && !nothingYet ? (
                <p className="text-sm text-ink-subtle">
                  Chỉ chủ sở hữu hoặc quản lý tổ chức hủy được yêu cầu.
                </p>
              ) : null}
            </div>
          </div>

          {nothingYet ? (
            <EmptyState
              icon={PackageSearch}
              title="Chưa có yêu cầu nào"
              description={
                <p>
                  Mở Kho tặng để xem lô thực phẩm quanh điểm nhận của tổ chức — lô Đỏ cần được lấy sớm nhất.
                  Bấm “Xin nhận” và theo dõi trạng thái ngay tại đây.
                </p>
              }
              action={findFood}
            />
          ) : (
            <>
              <Group
                id="nhom-cho-xac-nhan"
                title="Chờ cửa hàng xác nhận"
                items={requested}
                empty="Không có yêu cầu nào đang chờ cửa hàng trả lời."
                ctx={{ serverNow: now, canCancel: ctx.canCancel, showSite }}
              />
              <Group
                id="nhom-da-xac-nhan"
                title="Đã xác nhận — cần lên chuyến"
                items={confirmed}
                empty="Chưa có phân bổ nào chờ đi lấy."
                action={
                  confirmed.length > 0 ? (
                    <Button asChild size="sm">
                      <Link href="/charity/pickups">
                        <Route aria-hidden />
                        Tạo chuyến tự đến lấy
                      </Link>
                    </Button>
                  ) : null
                }
                ctx={{ serverNow: now, canCancel: ctx.canCancel, showSite }}
              />
              <Group
                id="nhom-dang-lay"
                title="Đang lấy"
                items={inTrip}
                empty="Không có chuyến nào đang chạy."
                ctx={{ serverNow: now, canCancel: ctx.canCancel, showSite }}
              />
              <Group
                id="nhom-da-nhan"
                title="Đã nhận (30 ngày qua)"
                items={delivered}
                empty="Chưa nhận lô nào trong 30 ngày qua."
                ctx={{ serverNow: now, canCancel: false, showSite }}
              />
              {closed.length > 0 ? (
                <details className="group rounded-lg border bg-surface">
                  <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 px-4 py-2 font-medium">
                    Đã đóng trong 7 ngày qua ({closed.length})
                    <span className="text-sm font-normal text-ink-muted group-open:hidden">Xem</span>
                  </summary>
                  <ul className="flex flex-col gap-3 border-t p-4">
                    {closed.map((a) => (
                      <li key={a.id}>
                        <AllocationItem a={a} serverNow={now} canCancel={false} showSite={showSite} />
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </>
          )}
        </section>

        {impact ? (
          <section aria-labelledby="impact-heading" className="flex flex-col gap-3">
            <h2 id="impact-heading" className="text-[1.375rem] leading-[1.875rem] font-semibold">
              Tác động của tổ chức
            </h2>
            <ImpactCounters
              label="Tác động của tổ chức từ khi tham gia"
              totals={impact.totals}
              metrics={["kg", "meals", "co2e", "lots"]}
              factorVersion={impact.factors.current?.version}
              sources={impact.factors.sources.filter((src) => src.metric !== "water_l_per_kg")}
              isDemo={impact.isDemo}
              empty={{
                title: "Chưa nhận lô nào",
                description:
                  "Sau mỗi lần nhận hàng được đối soát, số kg và suất ăn tương đương tự cộng vào đây — dùng cho báo cáo với nhà tài trợ.",
              }}
            />
          </section>
        ) : null}
      </div>
    </>
  );
}

function Group({
  id,
  title,
  items,
  empty,
  action,
  ctx,
}: {
  id: string;
  title: string;
  items: CharityAllocation[];
  empty: string;
  action?: React.ReactNode;
  ctx: { serverNow: number; canCancel: boolean; showSite: boolean };
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={id} className="flex items-center gap-2 text-lg font-semibold">
          {title}
          <span className="grid h-6 min-w-6 place-items-center rounded-full bg-bg-sunken px-1.5 text-sm text-ink-muted tabular-nums">
            {items.length}
          </span>
        </h3>
        {action}
      </div>
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-ink-muted">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((a) => (
            <li key={a.id}>
              <AllocationItem
                a={a}
                serverNow={ctx.serverNow}
                canCancel={ctx.canCancel}
                showSite={ctx.showSite}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
