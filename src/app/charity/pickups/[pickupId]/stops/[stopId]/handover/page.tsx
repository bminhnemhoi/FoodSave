import { ArrowLeft, Bike, CircleCheckBig, Clock3, PackageX, Store } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ImpactCounters } from "@/components/charts/impact-counters";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { CarrierHandover } from "@/features/handover/components/carrier-handover";
import { HandoverSummaryLines } from "@/features/handover/components/handover-summary";
import { formatClock, formatWindow } from "@/features/handover/format";
import { HANDOVER_METHOD_PHRASE } from "@/features/handover/labels";
import { getCarrierStop } from "@/features/handover/queries";
import { requirePortal } from "@/server/auth/guards";

/**
 * Màn người mang hàng tại một điểm dừng (P2-12; PRD US-CHA-20, F-39; SECURITY-PRIVACY C10). Trang chứa mã
 * dùng một lần ⇒ không index, không gửi Referer khi rời trang.
 */
export const metadata: Metadata = {
  title: "Mã bàn giao — Tổ chức",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CarrierHandoverPage(
  props: PageProps<"/charity/pickups/[pickupId]/stops/[stopId]/handover">,
) {
  const { profile } = await requirePortal("charity");
  const { pickupId, stopId } = await props.params;
  if (!UUID_RE.test(pickupId) || !UUID_RE.test(stopId)) notFound();

  const view = await getCarrierStop(pickupId, stopId, profile.id);
  if (!view || view.stop.kind !== "pickup") notFound();

  const tripHref = `/charity/pickups/${pickupId}`;
  const backLink = (
    <Button asChild variant="outline" className="h-11">
      <Link href={tripHref}>
        <ArrowLeft aria-hidden />
        Về chuyến lấy hàng
      </Link>
    </Button>
  );
  const windowText = view.pickupWindow
    ? `Khung giờ lấy: ${formatWindow(new Date(view.pickupWindow.start), new Date(view.pickupWindow.end))}`
    : null;

  const header = (
    <PageHeader
      title={`Bàn giao tại ${view.store.name}`}
      description={
        <>
          <span className="inline-flex items-center gap-1.5">
            <Store aria-hidden className="size-4" />
            {[view.store.siteName, view.store.address].filter(Boolean).join(" · ")}
          </span>
          {windowText ? (
            <span className="mt-1 flex items-center gap-1.5">
              <Clock3 aria-hidden className="size-4" />
              {windowText}
            </span>
          ) : null}
        </>
      }
      breadcrumb={[
        { label: "Chuyến lấy hàng", href: "/charity/pickups" },
        { label: "Chuyến", href: tripHref },
        { label: "Bàn giao" },
      ]}
    />
  );

  // 1) Đã bàn giao
  if (view.handover?.consumedAt) {
    const autoDropoff = view.pickup.mode === "self";
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        {header}
        <section
          role="status"
          className="flex items-start gap-3 rounded-xl border border-success/30 bg-success-soft p-5"
          data-handover-done
        >
          <CircleCheckBig aria-hidden className="mt-0.5 size-7 shrink-0 text-success" />
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-semibold text-ink">
              Đã bàn giao lúc {formatClock(view.handover.consumedAt)}
            </h2>
            <p className="text-ink-muted">
              {view.store.name} đã xác nhận
              {view.handover.method ? ` (${HANDOVER_METHOD_PHRASE[view.handover.method]})` : ""}.{" "}
              {autoDropoff
                ? "Vì tổ chức tự đến lấy, đây đồng thời là lần nhận hàng: số liệu đã vào sổ tác động và minh chứng cần nộp trong 48 giờ."
                : "Hàng sẽ được ghi vào sổ tác động khi giao về tổ chức."}
            </p>
          </div>
        </section>

        <section aria-labelledby="received-heading" className="flex flex-col gap-3">
          <h2 id="received-heading" className="text-lg font-semibold">
            Hàng đã nhận
          </h2>
          <HandoverSummaryLines lines={view.received} qtyHeading="Đã nhận" />
        </section>

        {view.impact ? (
          <section aria-labelledby="impact-heading" className="flex flex-col gap-3">
            <h2 id="impact-heading" className="text-lg font-semibold">
              Đã ghi vào sổ tác động
            </h2>
            <ImpactCounters label="Tác động của lần bàn giao này" totals={view.impact} />
          </section>
        ) : null}

        <div>{backLink}</div>
      </div>
    );
  }

  // 2) Không còn gì để nhận (điểm bị bỏ qua, chuyến hủy, phân bổ hết hạn)
  if (
    view.lines.length === 0 ||
    view.stop.status === "skipped" ||
    view.pickup.status === "cancelled" ||
    view.pickup.status === "completed"
  ) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        {header}
        <EmptyState
          icon={PackageX}
          title="Điểm dừng này không còn hàng cần nhận"
          description="Phân bổ đã bị hủy, hết hạn hoặc chuyến đã kết thúc nên không mở mã bàn giao được nữa. Xem chi tiết chuyến để biết lý do."
          action={backLink}
        />
      </div>
    );
  }

  // 3) Chuyến tình nguyện viên: chỉ người được gán mới hiện mã (C10)
  if (view.pickup.mode === "volunteer" && !view.pickup.isAssignee) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        {header}
        <EmptyState
          icon={Bike}
          title="Mã bàn giao nằm trên điện thoại tình nguyện viên"
          description={
            view.pickup.hasAssignee
              ? "Chuyến này do tình nguyện viên được phân công mang hàng. Chỉ người mang hàng mới hiện được mã để cửa hàng quét."
              : "Chuyến chưa có tình nguyện viên nhận. Phân công tình nguyện viên trong trang chuyến trước."
          }
          action={backLink}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      {header}
      {view.windowState === "before" && view.opensAt ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft p-4 text-sm text-ink"
        >
          <Clock3 aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
          Chưa tới khung giờ lấy hàng. Mã bàn giao mở được từ {formatClock(view.opensAt)} (sớm nhất 30 phút
          trước giờ lấy).
        </p>
      ) : null}
      {view.windowState === "after" ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft p-4 text-sm text-ink"
        >
          <Clock3 aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
          Đã quá khung giờ lấy hàng (kể cả 30 phút ân hạn) nên không mở được mã. Liên hệ cửa hàng hoặc xem chi
          tiết chuyến.
        </p>
      ) : null}
      <CarrierHandover
        pickupId={pickupId}
        stopId={stopId}
        storeName={view.store.name}
        siteName={view.store.siteName}
        lines={view.lines}
        existing={view.handover ? { id: view.handover.id, expiresAt: view.handover.expiresAt } : null}
      />
    </div>
  );
}
