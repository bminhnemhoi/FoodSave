import { ClipboardList, Package, ScrollText, Store } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { FreshnessBadge } from "@/components/labels/freshness-badge";
import { LiveFreshness } from "@/components/labels/live-freshness";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { OfferAllocationsList } from "@/features/admin-console/components/allocations-view";
import { DemoBadge } from "@/features/admin-console/components/console-ui";
import { getAdminOfferDetail } from "@/features/admin-console/queries";
import { formatKg, formatQty } from "@/features/catalog/labels";
import { formatDeadline, formatWindow, parseTstzRange } from "@/features/offers/datetime";
import { OfferStatusBadge } from "@/features/offers/components/status-badges";
import { InfoList, Section } from "@/features/org-reviews/components/detail-sections";
import { formatDate, formatDateTime } from "@/lib/format";
import { requireAdmin } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Chi tiết lô — Admin" };

/**
 * Chi tiết một lô cho Admin (US-ADM-05, US-ADM-07): nhãn + đếm ngược, số lượng đăng/giữ/còn, hạn, cửa hàng,
 * và mọi phân bổ của lô (tổ chức, số đặt/lấy/giao, trạng thái, chuyến). Dòng thời gian từng bước kèm người
 * thực hiện nằm ở Nhật ký kiểm toán (liên kết "Nhật ký").
 */
export default async function AdminOfferDetailPage(props: PageProps<"/admin/offers/[offerId]">) {
  const { offerId } = await props.params;
  if (!z.uuid().safeParse(offerId).success) notFound();
  await requireAdmin();
  const offer = await getAdminOfferDetail(offerId);
  if (!offer) notFound();

  const now = new Date();
  const live = offer.status === "open" || offer.status === "fully_allocated";
  const window = parseTstzRange(offer.pickupWindow);
  const unit = offer.unit;

  return (
    <>
      <PageHeader
        title={offer.title}
        description={`${offer.categoryName} · ${offer.store.name}`}
        breadcrumb={[
          { label: "Admin", href: "/admin" },
          { label: "Lô hàng", href: "/admin/offers" },
          { label: offer.title },
        ]}
        actions={
          <>
            {offer.store.isDemo ? <DemoBadge /> : null}
            <OfferStatusBadge status={offer.status} />
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          <Section title="Tình trạng lô" icon={Package}>
            <div>
              {live && offer.effectiveDeadline ? (
                <LiveFreshness
                  deadline={offer.effectiveDeadline}
                  serverNow={now.getTime()}
                  perishability={offer.perishability}
                />
              ) : offer.label === "expired" ? (
                <FreshnessBadge label="expired" />
              ) : (
                <p className="text-sm text-ink-muted">Lô không còn nhận nên không có nhãn tươi.</p>
              )}
            </div>
            <InfoList
              items={[
                { label: "Còn lại", value: formatQty(offer.qtyAvailable, unit) },
                { label: "Đã giữ", value: formatQty(offer.qtyCommitted, unit) },
                {
                  label: "Đăng",
                  value: `${formatQty(offer.quantity, unit)} (~${formatKg(offer.quantity * offer.unitWeightKg)})`,
                },
                {
                  label: "Chưa ai nhận khi đóng",
                  value: offer.qtyUnclaimed === null ? "—" : formatQty(offer.qtyUnclaimed, unit),
                },
                {
                  label: "Hạn hiệu lực",
                  value: offer.effectiveDeadline
                    ? `${formatDeadline(new Date(offer.effectiveDeadline), now)} (${formatDateTime(offer.effectiveDeadline)})`
                    : "Chưa đăng",
                },
                {
                  label: "Hạn sử dụng",
                  value: offer.expiryIsDateOnly
                    ? `${formatDate(offer.expiresAt)} (hết ngày)`
                    : formatDateTime(offer.expiresAt),
                },
                { label: "Khung giờ lấy", value: window ? formatWindow(window.start, window.end, now) : "—" },
                { label: "Danh mục", value: offer.categoryName },
                { label: "Tạo lúc", value: formatDateTime(offer.createdAt) },
                { label: "Đăng lúc", value: offer.publishedAt ? formatDateTime(offer.publishedAt) : "—" },
                { label: "Đóng lúc", value: offer.closedAt ? formatDateTime(offer.closedAt) : "—" },
                { label: "Dùng AI tự điền", value: offer.aiAssisted ? "Có" : "Không" },
                ...(offer.cancelReason
                  ? [{ label: "Lý do hủy", value: offer.cancelReason, wide: true }]
                  : []),
                ...(offer.description ? [{ label: "Mô tả", value: offer.description, wide: true }] : []),
              ]}
            />
          </Section>

          <Section
            title="Phân bổ của lô"
            icon={ClipboardList}
            note="Tổ chức đã xin nhận, số lượng đặt – lấy – giao và chuyến. Mới nhất trước."
          >
            {offer.allocations.length > 0 ? (
              <OfferAllocationsList rows={offer.allocations} now={now} />
            ) : (
              <EmptyState
                icon={ClipboardList}
                variant="inline"
                headingLevel={3}
                title="Chưa có tổ chức nào xin nhận"
                description="Khi một tổ chức gửi yêu cầu, phân bổ sẽ hiện ở đây kèm trạng thái và chuyến."
              />
            )}
          </Section>
        </div>

        <div className="flex flex-col gap-6">
          <Section title="Cửa hàng" icon={Store}>
            <InfoList
              items={[
                {
                  label: "Tên",
                  value: (
                    <Link
                      href={`/admin/reviews/${offer.store.id}`}
                      className="font-medium text-primary underline underline-offset-4"
                    >
                      {offer.store.name}
                    </Link>
                  ),
                  wide: true,
                },
                {
                  label: "Điểm",
                  value: offer.site
                    ? [offer.site.name, offer.site.ward, offer.site.city].filter(Boolean).join(", ")
                    : "—",
                  wide: true,
                },
              ]}
            />
          </Section>
          <Section title="Truy vết" icon={ScrollText} note="Ai đăng, sửa, hủy lô và lúc nào.">
            <Button asChild variant="outline" className="w-full">
              <Link href={`/admin/audit?type=offer&id=${offer.id}`}>
                <ScrollText aria-hidden />
                Xem nhật ký của lô
              </Link>
            </Button>
          </Section>
        </div>
      </div>
    </>
  );
}
