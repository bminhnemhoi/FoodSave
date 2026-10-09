import { ScrollText, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { AUDIT_BASE, AuditFilterBar, AuditList } from "@/features/admin-console/components/audit-view";
import { ListPagination, ResultBar } from "@/features/admin-console/components/console-ui";
import {
  ADMIN_PAGE_SIZE,
  auditHref,
  hasAuditFilter,
  parseAuditFilters,
} from "@/features/admin-console/filters";
import { listAuditLogs } from "@/features/admin-console/queries";
import { requireAdmin } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Nhật ký kiểm toán — Admin" };

/**
 * Nhật ký kiểm toán (US-ADM-11, F-63; UAT P1-29): chỉ đọc, mới nhất trước, 50 dòng/trang; lọc theo nhóm
 * hành động, loại đối tượng, người thực hiện (tên/email), khoảng ngày giờ VN. Dòng mở rộng hiện trước/sau
 * đã che khóa nhạy cảm. Đọc bằng RLS `audit_logs_select` (Admin aal2), không service role.
 */
export default async function AdminAuditPage(props: PageProps<"/admin/audit">) {
  await requireAdmin();
  const filters = parseAuditFilters(await props.searchParams);
  const now = new Date();
  const result = await listAuditLogs(filters);
  const filtered = hasAuditFilter(filters);
  const clearHref = AUDIT_BASE;

  return (
    <>
      <PageHeader
        title="Nhật ký kiểm toán"
        description="Ai làm gì, lúc nào, với đối tượng nào — gồm mọi quyết định duyệt hồ sơ và thao tác của Admin."
        breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "Nhật ký kiểm toán" }]}
      />

      <div className="flex flex-col gap-6">
        <AuditFilterBar filters={filters} />
        <div className="flex flex-col gap-4">
          <ResultBar
            total={result.total}
            unit="dòng"
            sortNote="mới nhất trước"
            clearHref={filtered ? clearHref : null}
            refreshHref={auditHref(AUDIT_BASE, filters)}
            at={now}
          />
          {result.rows.length > 0 ? (
            <AuditList rows={result.rows} />
          ) : result.outOfRange ? (
            <EmptyState
              icon={SearchX}
              variant="section"
              title="Trang này không còn dòng nào"
              description="Quay về trang đầu để xem hoạt động mới nhất."
              action={
                <Button asChild variant="outline">
                  <Link href={auditHref(AUDIT_BASE, filters, { page: 1 })}>Về trang đầu</Link>
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={filtered ? SearchX : ScrollText}
              variant="section"
              title={filtered ? "Không có dòng nhật ký khớp bộ lọc" : "Chưa có hoạt động nào được ghi"}
              description={
                filtered
                  ? "Thử mở rộng khoảng ngày, bỏ nhóm hành động hoặc tìm bằng một phần tên/email."
                  : "Mọi thao tác chuyển trạng thái, duyệt hồ sơ và cấu hình sẽ được ghi tại đây."
              }
              action={
                filtered ? (
                  <Button asChild variant="outline">
                    <Link href={clearHref}>Xóa lọc</Link>
                  </Button>
                ) : undefined
              }
            />
          )}
          <ListPagination
            page={filters.page}
            total={result.total}
            pageSize={ADMIN_PAGE_SIZE}
            hrefFor={(page) => auditHref(AUDIT_BASE, filters, { page })}
          />
        </div>
      </div>
    </>
  );
}
