import { MapPinOff } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { isOfferAutofillAvailable } from "@/features/offers/ai.server";
import { OfferForm } from "@/features/offers/components/offer-form";
import { PausedNotice } from "@/features/offers/components/paused-notice";
import { vnDateKey } from "@/features/offers/datetime";
import { newOfferValues } from "@/features/offers/mapping";
import { loadCategories, loadStoreContext } from "@/features/offers/queries";

export const metadata: Metadata = { title: "Đăng lô mới — Cửa hàng" };

/** Đăng lô tặng (P2-04, P2-05; US-STO-07, US-STO-08, US-STO-09). */
export default async function NewOfferPage() {
  const ctx = await loadStoreContext();
  const [categories, aiAvailable] = await Promise.all([loadCategories(), isOfferAutofillAvailable()]);
  const now = new Date();

  return (
    <>
      <PageHeader
        title="Đăng lô mới"
        description="Điền thông tin lô, xem trước nhãn và hạn hiệu lực, rồi đăng để các tổ chức gần bạn nhận được."
        breadcrumb={[
          { label: "Tổng quan", href: "/store" },
          { label: "Lô tặng", href: "/store/inventory" },
          { label: "Đăng lô mới" },
        ]}
      />
      {ctx.sites.length === 0 ? (
        <EmptyState
          icon={MapPinOff}
          title="Chưa có điểm lấy hàng"
          description={
            ctx.canCancel
              ? "Lô tặng gắn với một chi nhánh để tổ chức biết lấy hàng ở đâu. Hãy thêm chi nhánh trong Cài đặt."
              : "Tài khoản của bạn chưa được giao chi nhánh nào. Liên hệ chủ cửa hàng để được giao chi nhánh."
          }
          action={
            ctx.canCancel ? (
              <Button asChild>
                <Link href="/store/settings?tab=sites">Thêm chi nhánh</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          {ctx.isPaused ? <PausedNotice canManage={ctx.canCancel} /> : null}
          <OfferForm
            orgId={ctx.orgId}
            offerId={null}
            status="new"
            hasAllocations={false}
            initial={newOfferValues(ctx.sites[0]!.id, now)}
            categories={categories}
            sites={ctx.sites}
            aiAvailable={aiAvailable}
            serverNow={now.getTime()}
            today={vnDateKey(now)}
            isPaused={ctx.isPaused}
          />
        </div>
      )}
    </>
  );
}
