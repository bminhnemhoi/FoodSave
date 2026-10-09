import { Package, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { ListPagination, ResultBar } from "@/features/admin-console/components/console-ui";
import {
  OFFERS_BASE,
  OfferFilterBar,
  OfferKpiStrip,
  OffersList,
} from "@/features/admin-console/components/offers-view";
import {
  ADMIN_PAGE_SIZE,
  hasOfferFilter,
  offerSortOf,
  offersHref,
  parseOfferFilters,
} from "@/features/admin-console/filters";
import { getOfferKpis, listAdminOffers, listCategoryOptions } from "@/features/admin-console/queries";
import { requireAdmin } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Lô hàng — Admin" };

const SORT_NOTE = {
  urgency: "Đỏ trước, hạn hiệu lực gần trước",
  closed: "mới đóng trước",
  created: "mới tạo trước",
} as const;

/**
 * Giám sát lô (US-ADM-05, F-64; UAT P2-12): mọi lô của mọi cửa hàng với nhãn Xanh/Vàng/Đỏ tính lúc đọc,
 * lọc trên URL (trạng thái, nhãn, cửa hàng, danh mục, dữ liệu demo), Đỏ trước, 50 lô/trang.
 * Đọc bằng RLS của Admin aal2 (computed field `offer_label`), không service role.
 */
export default async function AdminOffersPage(props: PageProps<"/admin/offers">) {
  await requireAdmin();
  const filters = parseOfferFilters(await props.searchParams);
  const now = new Date();
  const [kpis, result, categories] = await Promise.all([
    getOfferKpis(filters.demo, now),
    listAdminOffers(filters, now),
    listCategoryOptions(),
  ]);
  const filtered = hasOfferFilter(filters);
  const clearHref = offersHref(OFFERS_BASE, filters, {
    labels: [],
    q: "",
    cat: null,
    unclaimed: false,
    soon: false,
    page: 1,
  });

  return (
    <>
      <PageHeader
        title="Lô hàng"
        description="Mọi lô tặng của các cửa hàng: nhãn Xanh/Vàng/Đỏ tính theo hạn hiệu lực, số lượng còn và yêu cầu đang chờ."
        breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "Lô hàng" }]}
      />

      <div className="flex flex-col gap-6">
        <OfferKpiStrip kpis={kpis} filters={filters} />
        <OfferFilterBar filters={filters} categories={categories} />

        <div className="flex flex-col gap-4">
          <ResultBar
            total={result.total}
            unit="lô"
            sortNote={SORT_NOTE[offerSortOf(filters.view)]}
            clearHref={filtered ? clearHref : null}
            refreshHref={offersHref(OFFERS_BASE, filters)}
            at={now}
          />
          {result.rows.length > 0 ? (
            <OffersList rows={result.rows} now={now} />
          ) : result.outOfRange ? (
            <EmptyState
              icon={SearchX}
              variant="section"
              title="Trang này không còn lô nào"
              description="Danh sách vừa thay đổi. Quay về trang đầu để xem lô mới nhất."
              action={
                <Button asChild variant="outline">
                  <Link href={offersHref(OFFERS_BASE, filters, { page: 1 })}>Về trang đầu</Link>
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={filtered ? SearchX : Package}
              variant="section"
              title={filtered ? "Không có lô khớp bộ lọc" : "Chưa có lô nào ở trạng thái này"}
              description={
                filtered
                  ? "Thử bỏ bớt nhãn, danh mục hoặc tìm bằng một phần tên cửa hàng."
                  : filters.demo
                    ? "Khi cửa hàng đăng lô, lô hiện ở đây cùng nhãn Xanh/Vàng/Đỏ và đếm ngược."
                    : 'Chỉ đang xem dữ liệu thật. Bật "Gồm dữ liệu demo" để xem cả lô của tổ chức demo.'
              }
              action={
                <Button asChild variant="outline">
                  <Link
                    href={
                      filtered
                        ? clearHref
                        : offersHref(OFFERS_BASE, filters, { view: "all", demo: true, page: 1 })
                    }
                  >
                    {filtered ? "Xóa lọc" : "Xem mọi lô, gồm demo"}
                  </Link>
                </Button>
              }
            />
          )}
          <ListPagination
            page={filters.page}
            total={result.total}
            pageSize={ADMIN_PAGE_SIZE}
            hrefFor={(page) => offersHref(OFFERS_BASE, filters, { page })}
          />
        </div>
      </div>
    </>
  );
}
