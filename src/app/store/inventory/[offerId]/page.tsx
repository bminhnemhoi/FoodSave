import { ClipboardList, Send } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { OfferActions } from "@/features/offers/components/offer-actions";
import { OfferSummary } from "@/features/offers/components/offer-summary";
import { getStoreOffer, loadStoreContext, getOfferTitle } from "@/features/offers/queries";
import { RequestGroups } from "@/features/store-requests/components/request-groups";
import { listStoreAllocations } from "@/features/store-requests/queries";

export async function generateMetadata(props: PageProps<"/store/inventory/[offerId]">): Promise<Metadata> {
  const title = await getOfferTitle((await props.params).offerId);
  return { title: title ? `${title} — Lô tặng` : "Chi tiết lô — Cửa hàng" };
}

/** Chi tiết một lô (P2-06) + yêu cầu nhận và phân bổ của lô (P2-10, US-STO-13, US-STO-16). */
export default async function OfferDetailPage(props: PageProps<"/store/inventory/[offerId]">) {
  const { offerId } = await props.params;
  const ctx = await loadStoreContext();
  const now = new Date();
  const offer = await getStoreOffer(offerId, now);
  if (!offer) notFound();
  const allocations = await listStoreAllocations({ orgId: ctx.orgId, offerId: offer.id, now });
  const serverNow = now.getTime();
  const live = offer.status === "open" || offer.status === "fully_allocated";

  return (
    <>
      <PageHeader
        title={offer.title}
        description={`${offer.categoryName}${offer.siteName && ctx.sites.length > 1 ? ` · ${offer.siteName}` : ""}`}
        breadcrumb={[
          { label: "Tổng quan", href: "/store" },
          {
            label: "Lô tặng",
            href: offer.status === "draft" ? "/store/inventory?tab=draft" : "/store/inventory",
          },
          { label: offer.title },
        ]}
        actions={
          <OfferActions
            variant="header"
            status={offer.status}
            canCancel={ctx.canCancel}
            offer={{
              id: offer.id,
              title: offer.title,
              unit: offer.unit,
              quantity: offer.quantity,
              committed: offer.committed,
              picked: offer.stats.picked,
              pending: offer.stats.pending,
              confirmed: offer.stats.confirmed,
            }}
          />
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-start">
        <OfferSummary offer={offer} serverNow={serverNow} />

        <section id="yeu-cau" aria-labelledby="requests-title" className="flex scroll-mt-24 flex-col gap-4">
          <div>
            <h2 id="requests-title" className="text-[1.375rem] leading-[1.875rem] font-semibold">
              Yêu cầu nhận và phân bổ
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              Xác nhận sớm để tổ chức kịp đến lấy. Yêu cầu không được phản hồi trước hạn sẽ tự hết hạn và số
              lượng trả lại lô.
            </p>
          </div>
          {allocations.length > 0 ? (
            <RequestGroups allocations={allocations} serverNow={serverNow} />
          ) : (
            <EmptyState
              variant="section"
              headingLevel={3}
              icon={offer.status === "draft" ? Send : ClipboardList}
              title={offer.status === "draft" ? "Lô chưa được đăng" : "Chưa có yêu cầu nhận lô này"}
              description={
                offer.status === "draft"
                  ? "Đăng lô để các tổ chức quanh cửa hàng thấy và gửi yêu cầu nhận."
                  : live
                    ? "Khi một tổ chức gửi yêu cầu, bạn xác nhận hoặc từ chối ngay tại đây. FoodSave cũng báo cho bạn khi có yêu cầu mới."
                    : "Lô đã kết thúc mà không có tổ chức nào yêu cầu nhận. Số chưa được nhận giúp bạn điều chỉnh lượng đăng lần sau."
              }
            />
          )}
        </section>
      </div>
    </>
  );
}
