import { Archive } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { isOfferAutofillAvailable } from "@/features/offers/ai.server";
import { OfferForm } from "@/features/offers/components/offer-form";
import { PausedNotice } from "@/features/offers/components/paused-notice";
import { vnDateKey } from "@/features/offers/datetime";
import { offerToFormValues } from "@/features/offers/mapping";
import {
  getStoreOffer,
  loadCategories,
  loadStoreContext,
  offerRecord,
  getOfferTitle,
} from "@/features/offers/queries";

export async function generateMetadata(
  props: PageProps<"/store/inventory/[offerId]/edit">,
): Promise<Metadata> {
  const title = await getOfferTitle((await props.params).offerId);
  return { title: title ? `Sửa: ${title} — Lô tặng` : "Sửa lô — Cửa hàng" };
}

/** Sửa lô (US-STO-12): nháp sửa mọi trường; đã đăng thì theo quy tắc của `update_offer`. */
export default async function EditOfferPage(props: PageProps<"/store/inventory/[offerId]/edit">) {
  const { offerId } = await props.params;
  const ctx = await loadStoreContext();
  const now = new Date();
  const offer = await getStoreOffer(offerId, now);
  if (!offer) notFound();

  const detailHref = `/store/inventory/${offer.id}`;
  const status = offer.status;
  const editable = status === "draft" || status === "open" || status === "fully_allocated";
  const breadcrumb = [
    { label: "Lô tặng", href: "/store/inventory" },
    { label: offer.title, href: detailHref },
    { label: "Sửa" },
  ];

  if (!editable) {
    return (
      <>
        <PageHeader title="Sửa lô" breadcrumb={breadcrumb} />
        <EmptyState
          icon={Archive}
          title="Lô đã kết thúc nên không sửa được"
          description="Lô đã giao xong, hết hạn hoặc đã hủy. Bạn có thể đăng một lô mới với thông tin cập nhật."
          action={
            <>
              <Button asChild>
                <Link href="/store/inventory/new">Đăng lô mới</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={detailHref}>Xem chi tiết lô</Link>
              </Button>
            </>
          }
        />
      </>
    );
  }

  const [categories, aiAvailable] = await Promise.all([loadCategories(), isOfferAutofillAvailable()]);
  // Điểm của lô luôn có trong danh sách (kể cả khi điểm vừa tạm ngưng) để form hiển thị đúng
  const sites = ctx.sites.some((s) => s.id === offer.siteId)
    ? ctx.sites
    : [{ id: offer.siteId, name: offer.siteName ?? "Chi nhánh hiện tại", ward: null }, ...ctx.sites];

  return (
    <>
      <PageHeader
        title={offer.status === "draft" ? "Sửa bản nháp" : "Sửa lô"}
        description={
          offer.status === "draft"
            ? "Hoàn thiện thông tin rồi tick cam kết an toàn để đăng lô."
            : "Lô đang mở: thay đổi giờ hoặc hạn dùng sẽ tính lại hạn hiệu lực ngay khi lưu."
        }
        breadcrumb={breadcrumb}
      />
      <div className="flex flex-col gap-6">
        {ctx.isPaused && offer.status === "draft" ? <PausedNotice canManage={ctx.canCancel} /> : null}
        <OfferForm
          orgId={ctx.orgId}
          offerId={offer.id}
          status={status}
          hasAllocations={offer.stats.total > 0}
          initial={offerToFormValues(offerRecord(offer))}
          categories={categories}
          sites={sites}
          aiAvailable={aiAvailable && offer.status === "draft"}
          serverNow={now.getTime()}
          today={vnDateKey(now)}
          isPaused={ctx.isPaused}
        />
      </div>
    </>
  );
}
