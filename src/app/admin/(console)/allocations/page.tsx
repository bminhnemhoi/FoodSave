import { ClipboardList, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import {
  ALLOCATIONS_BASE,
  AllocationFilterBar,
  AllocationsList,
} from "@/features/admin-console/components/allocations-view";
import { ListPagination, ResultBar } from "@/features/admin-console/components/console-ui";
import { ADMIN_PAGE_SIZE, allocationsHref, parseAllocationFilters } from "@/features/admin-console/filters";
import { countAllocationQuick, listAdminAllocations } from "@/features/admin-console/queries";
import { requireAdmin } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Phân bổ & chuyến — Admin" };

/**
 * Phân bổ & chuyến (US-ADM-07, F-65; UAT P2-12): tổ chức nào nhận từ cửa hàng nào, số đặt/lấy/giao,
 * trạng thái, chuyến, lý do thiếu. Lọc nhanh "chờ cửa hàng quá 1 giờ" và "chuyến đang chạy"; mặc định chỉ
 * dữ liệu thật. Chỉ đọc (can thiệp theo ma trận hủy làm ở P4).
 */
export default async function AdminAllocationsPage(props: PageProps<"/admin/allocations">) {
  await requireAdmin();
  const filters = parseAllocationFilters(await props.searchParams);
  const now = new Date();
  const [result, quickCounts] = await Promise.all([
    listAdminAllocations(filters, now),
    countAllocationQuick(filters.demo, now),
  ]);
  const filtered = filters.view !== "all" || filters.quick !== null || filters.id !== null;
  const clearHref = allocationsHref(ALLOCATIONS_BASE, filters, {
    view: "all",
    quick: null,
    id: null,
    page: 1,
  });

  return (
    <>
      <PageHeader
        title="Phân bổ & chuyến"
        description="Tổ chức nào nhận từ cửa hàng nào, số lượng đặt – lấy – giao, trạng thái chuyến và lý do thiếu."
        breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "Phân bổ & chuyến" }]}
      />

      <div className="flex flex-col gap-6">
        <AllocationFilterBar filters={filters} quickCounts={quickCounts} />
        <div className="flex flex-col gap-4">
          <ResultBar
            total={result.total}
            unit="phân bổ"
            sortNote={filters.quick === "stale" ? "chờ lâu nhất trước" : "yêu cầu mới nhất trước"}
            clearHref={filtered ? clearHref : null}
            refreshHref={allocationsHref(ALLOCATIONS_BASE, filters)}
            at={now}
          />
          {result.rows.length > 0 ? (
            <AllocationsList rows={result.rows} now={now} />
          ) : result.outOfRange ? (
            <EmptyState
              icon={SearchX}
              variant="section"
              title="Trang này không còn phân bổ nào"
              description="Danh sách vừa thay đổi. Quay về trang đầu để xem phân bổ mới nhất."
              action={
                <Button asChild variant="outline">
                  <Link href={allocationsHref(ALLOCATIONS_BASE, filters, { page: 1 })}>Về trang đầu</Link>
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={filtered ? SearchX : ClipboardList}
              variant="section"
              title={
                filters.quick === "stale"
                  ? "Không có yêu cầu nào chờ quá 1 giờ"
                  : filters.quick === "running"
                    ? "Không có chuyến nào đang chạy"
                    : filtered
                      ? "Không có phân bổ khớp bộ lọc"
                      : "Chưa có phân bổ nào"
              }
              description={
                filtered
                  ? "Thử bỏ bộ lọc để xem mọi phân bổ."
                  : filters.demo
                    ? "Khi tổ chức xin nhận một lô, phân bổ hiện ở đây cùng trạng thái và chuyến."
                    : 'Chỉ đang xem dữ liệu thật. Bật "Gồm dữ liệu demo" để xem cả phân bổ của tổ chức demo.'
              }
              action={
                <Button asChild variant="outline">
                  <Link
                    href={
                      filtered
                        ? clearHref
                        : allocationsHref(ALLOCATIONS_BASE, filters, { demo: true, page: 1 })
                    }
                  >
                    {filtered ? "Xóa lọc" : "Gồm dữ liệu demo"}
                  </Link>
                </Button>
              }
            />
          )}
          <ListPagination
            page={filters.page}
            total={result.total}
            pageSize={ADMIN_PAGE_SIZE}
            hrefFor={(page) => allocationsHref(ALLOCATIONS_BASE, filters, { page })}
          />
        </div>
      </div>
    </>
  );
}
