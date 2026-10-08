import { Ban, CircleCheckBig, CircleSlash, PauseCircle, Settings } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { UNIT_LABEL } from "@/features/catalog/labels";
import { AutoRefresh } from "@/features/charity-allocations/components/auto-refresh";
import { requestNow } from "@/features/charity-allocations/context";
import { formatDayTime } from "@/features/charity-allocations/present";
import { BundleList } from "@/features/needs/components/bundle-list";
import { CancelNeedButton } from "@/features/needs/components/cancel-need-button";
import { NeedSummary } from "@/features/needs/components/need-summary";
import { PlanCompare } from "@/features/needs/components/plan-compare";
import { RefreshError } from "@/features/needs/components/refresh-error";
import { ShortfallFinder } from "@/features/needs/components/shortfall-finder";
import { formatAmount } from "@/features/needs/present";
import {
  computePlans,
  loadNeedCategories,
  loadNeedDetail,
  planContextFrom,
  type NeedRecord,
} from "@/features/needs/queries";

export const metadata: Metadata = { title: "Phương án ghép — Nhu cầu" };

/**
 * Chi tiết nhu cầu + "Phương án ghép" (P3-05; US-CHA-10, -11, -12, -13): tối đa 3 phương án trên bản đồ, chọn ⇒
 * giữ chỗ nguyên tử ở mọi cửa hàng; sau khi chọn: trạng thái từng cửa hàng (tự làm mới 15 giây) và ghép lại
 * phần còn thiếu khi cửa hàng từ chối.
 */
export default async function NeedDetailPage({ params }: PageProps<"/charity/needs/[needId]">) {
  const { needId } = await params;
  if (!z.uuid().safeParse(needId).success) notFound();
  const now = requestNow();
  const detail = await loadNeedDetail(needId, now);
  if (!detail) notFound();

  const { need } = detail;
  const categories = await loadNeedCategories();
  const unitLabel = UNIT_LABEL[need.unit];
  const summary = `${formatAmount(need.quantity)} ${unitLabel}`;
  const catNames = need.categoryCodes.map((c) => categories.find((x) => x.code === c)?.name ?? c);
  const perishabilityOf = Object.fromEntries(categories.map((c) => [c.code, c.perishability]));

  const ctx = planContextFrom(detail);
  const hasAllocations = detail.allocations.length > 0;
  // Nhu cầu mới (chưa từng giữ hàng) ⇒ tính phương án ngay khi mở trang (US-CHA-09 AC2: "engine ghép chạy ngay")
  const plans = ctx && !hasAllocations ? await computePlans(ctx, categories) : null;

  const liveStores = new Set(
    detail.allocations
      .filter((a) => ["requested", "confirmed", "assigned"].includes(a.status))
      .map((a) => a.storeSiteId),
  ).size;
  const waiting = need.live && detail.allocations.some((a) => a.status === "requested");
  const disabledReason = detail.isPaused
    ? "Tổ chức đang tạm ngưng nhận thực phẩm — bật lại trong Cài đặt để giữ hàng."
    : !detail.canAct
      ? "Bạn không có quyền với điểm nhận của nhu cầu này. Liên hệ chủ tổ chức."
      : null;
  const homeName = detail.siteName;

  return (
    <>
      <PageHeader
        title={`Nhu cầu ${summary}`}
        description={`${catNames.join(", ")} · cần trước ${formatDayTime(need.neededBy, new Date(now))} · ${homeName}`}
        breadcrumb={[
          { label: "Tổng quan", href: "/charity" },
          { label: "Nhu cầu", href: "/charity/needs" },
          { label: summary },
        ]}
        actions={
          need.live && detail.canCancel ? (
            <CancelNeedButton needId={need.id} summary={summary} liveStores={liveStores} size="default" />
          ) : undefined
        }
      />

      <div className="flex flex-col gap-8">
        {detail.isPaused ? (
          <div
            role="status"
            className="flex flex-wrap items-start gap-3 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-ink"
          >
            <PauseCircle aria-hidden className="mt-0.5 size-5 shrink-0 text-warning" />
            <p className="min-w-0 flex-1">
              <span className="font-semibold">Tổ chức đang tạm ngưng nhận thực phẩm.</span> Bạn vẫn xem được
              phương án nhưng chưa giữ hàng được.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href="/charity/settings">
                <Settings aria-hidden />
                Mở Cài đặt
              </Link>
            </Button>
          </div>
        ) : null}

        <NeedSummary need={need} siteName={homeName} categories={categories} serverNow={now} />

        <ClosedNotice need={need} now={now} />

        {waiting ? <AutoRefresh serverNow={now} intervalMs={15_000} className="-mb-6 self-end" /> : null}

        {plans ? (
          plans.ok ? (
            <PlanCompare
              key={plans.data.plans.map((p) => p.key).join("|") || "empty"}
              needId={need.id}
              data={plans.data}
              home={ctx!.home}
              homeName={homeName}
              neededBy={need.neededBy}
              serverNow={now}
              canChoose={!disabledReason}
              disabledReason={disabledReason}
              heading="Phương án ghép"
            />
          ) : (
            <RefreshError title="Không tính được phương án ghép" description={plans.error.message} />
          )
        ) : null}

        {ctx && hasAllocations ? (
          <ShortfallFinder
            key={`${need.remaining}:${detail.bundles.length}`}
            needId={need.id}
            remaining={need.remaining}
            unitLabel={unitLabel}
            home={ctx.home}
            homeName={homeName}
            neededBy={need.neededBy}
            serverNow={now}
            canChoose={!disabledReason}
            disabledReason={disabledReason}
          />
        ) : null}

        {detail.bundles.length > 0 ? (
          <BundleList
            bundles={detail.bundles}
            unitLabel={unitLabel}
            home={detail.home}
            homeName={homeName}
            serverNow={now}
            perishabilityOf={perishabilityOf}
          />
        ) : null}

        {need.live && !detail.canAct ? (
          <p role="status" className="rounded-lg border bg-bg-sunken px-4 py-3 text-sm text-ink">
            Bạn xem được nhu cầu này nhưng không có quyền với điểm nhận {homeName}, nên không chọn phương án
            được. Liên hệ chủ sở hữu tổ chức nếu cần thêm quyền.
          </p>
        ) : null}

        {need.live && !ctx && !hasAllocations && !detail.home && detail.canAct ? (
          <RefreshError
            title="Chưa đọc được vị trí điểm nhận"
            description="FoodSave cần toạ độ điểm nhận để tính phương án. Hãy thử lại, hoặc kiểm tra điểm nhận trong Cài đặt."
          />
        ) : null}
      </div>
    </>
  );
}

function ClosedNotice({ need, now }: { need: NeedRecord; now: number }) {
  if (need.live) return null;
  const at = need.closedAt ? formatDayTime(need.closedAt, new Date(now)) : null;
  const box = "flex items-start gap-3 rounded-lg border px-4 py-3 text-sm text-ink";
  switch (need.displayStatus) {
    case "fulfilled":
      return (
        <p role="status" className={`${box} border-success/30 bg-success-soft`}>
          <CircleCheckBig aria-hidden className="mt-0.5 size-5 shrink-0 text-success" />
          Nhu cầu đã nhận đủ{at ? ` lúc ${at}` : ""}. Hãy đăng minh chứng để cửa hàng thấy thực phẩm đã đến
          đúng nơi.
        </p>
      );
    case "cancelled":
      return (
        <p role="status" className={`${box} border-border-strong/40 bg-bg-sunken`}>
          <Ban aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-muted" />
          Nhu cầu đã hủy{at ? ` lúc ${at}` : ""}
          {need.cancelReason ? `. Lý do: ${need.cancelReason}` : ""}.
        </p>
      );
    default:
      return (
        <p role="status" className={`${box} border-border-strong/40 bg-bg-sunken`}>
          <CircleSlash aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-muted" />
          Đã quá thời điểm cần nhận nên nhu cầu đã đóng
          {need.qtyDelivered > 0 ? " (đã nhận một phần)" : ""}. Hàng đang trên đường vẫn được giao về bình
          thường.
        </p>
      );
  }
}
