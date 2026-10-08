import { Archive, FilePen, MapPinOff, Package, PackagePlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyInventoryIllustration } from "@/components/illustrations";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { InventoryTabs, inventoryHref, SiteFilter } from "@/features/offers/components/inventory-nav";
import { OfferCard } from "@/features/offers/components/offer-card";
import { PausedNotice } from "@/features/offers/components/paused-notice";
import { CLOSED_LIMIT, listInventory, loadStoreContext, type InventoryTab } from "@/features/offers/queries";

export const metadata: Metadata = { title: "Lô tặng — Cửa hàng" };

const TABS: InventoryTab[] = ["open", "draft", "closed"];

function NewOfferButton() {
  return (
    <Button asChild size="lg">
      <Link href="/store/inventory/new">
        <PackagePlus aria-hidden />
        Đăng lô mới
      </Link>
    </Button>
  );
}

/** Kho lô của cửa hàng (P2-06, US-STO-10/12/29): theo trạng thái, Đỏ trước, đếm ngược, số lượng, thao tác nhanh. */
export default async function StoreInventoryPage(props: PageProps<"/store/inventory">) {
  const sp = await props.searchParams;
  const ctx = await loadStoreContext();
  const tabParam = typeof sp.tab === "string" ? sp.tab : "";
  const tab: InventoryTab = (TABS as string[]).includes(tabParam) ? (tabParam as InventoryTab) : "open";
  const siteParam = typeof sp.site === "string" ? sp.site : null;
  const siteId = siteParam && ctx.sites.some((s) => s.id === siteParam) ? siteParam : null;

  const now = new Date();
  const { offers, counts } = await listInventory({ orgId: ctx.orgId, tab, siteId, now });
  const serverNow = now.getTime();
  const multiSite = ctx.sites.length > 1;

  return (
    <>
      <PageHeader
        title="Lô tặng"
        description="Lô Đỏ được xếp đầu tiên. Nhãn và đếm ngược tự cập nhật theo hạn hiệu lực."
        breadcrumb={[{ label: "Tổng quan", href: "/store" }, { label: "Lô tặng" }]}
        actions={ctx.sites.length > 0 ? <NewOfferButton /> : null}
      >
        <InventoryTabs active={tab} counts={counts} siteId={siteId} />
      </PageHeader>

      <div className="flex flex-col gap-4">
        {ctx.isPaused ? <PausedNotice canManage={ctx.canCancel} /> : null}
        <SiteFilter sites={ctx.sites} active={siteId} tab={tab} />

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
        ) : offers.length === 0 ? (
          <EmptyForTab tab={tab} draftCount={counts.draft} siteId={siteId} filtered={Boolean(siteId)} />
        ) : (
          <section
            aria-label={`Danh sách lô — ${tab === "open" ? "đang mở" : tab === "draft" ? "nháp" : "đã kết thúc"}`}
          >
            <ul className="grid gap-3 md:gap-4 xl:grid-cols-2">
              {offers.map((o) => (
                <li key={o.id} className="h-full">
                  <OfferCard offer={o} serverNow={serverNow} showSite={multiSite} canCancel={ctx.canCancel} />
                </li>
              ))}
            </ul>
            {tab === "closed" && counts.closed > CLOSED_LIMIT ? (
              <p className="mt-4 text-sm text-ink-subtle">
                Đang hiện {CLOSED_LIMIT} lô kết thúc gần nhất trên tổng {counts.closed} lô.
              </p>
            ) : null}
          </section>
        )}
      </div>
    </>
  );
}

function EmptyForTab({
  tab,
  draftCount,
  siteId,
  filtered,
}: {
  tab: InventoryTab;
  draftCount: number;
  siteId: string | null;
  filtered: boolean;
}) {
  if (tab === "draft") {
    return (
      <EmptyState
        icon={FilePen}
        title="Không có bản nháp"
        description="Lô bạn bấm “Lưu nháp” sẽ nằm ở đây cho tới khi đăng. Bản nháp chưa hiển thị với tổ chức nào."
        action={<NewOfferButton />}
      />
    );
  }
  if (tab === "closed") {
    return (
      <EmptyState
        icon={Archive}
        title="Chưa có lô nào kết thúc"
        description="Lô đã giao xong, hết hạn hoặc đã hủy sẽ hiện ở đây, kèm số lượng chưa được nhận để bạn điều chỉnh lượng đăng."
        action={
          <Button asChild variant="outline">
            <Link href={inventoryHref("open", siteId)}>Xem lô đang mở</Link>
          </Button>
        }
      />
    );
  }
  return (
    <EmptyState
      icon={Package}
      illustration={<EmptyInventoryIllustration />}
      title={filtered ? "Chi nhánh này chưa có lô đang mở" : "Chưa có lô nào đang mở"}
      description="Đăng lô đầu tiên để các tổ chức gần bạn nhận được. Chỉ mất khoảng một phút."
      action={
        <>
          <NewOfferButton />
          {draftCount > 0 ? (
            <Button asChild variant="outline" size="lg">
              <Link href={inventoryHref("draft", siteId)}>Xem {draftCount} bản nháp</Link>
            </Button>
          ) : null}
        </>
      }
    />
  );
}
