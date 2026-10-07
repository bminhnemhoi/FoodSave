import { Building2, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { OrgList, Pagination, QueueToolbar, StatusTabs } from "@/features/org-reviews/components/queue-views";
import { OrgStandingButton } from "@/features/org-reviews/components/review-actions";
import { listOrganizations, PAGE_SIZE } from "@/features/org-reviews/queries";
import {
  ORG_LIST_VIEWS,
  parseQueueFilters,
  queueHref,
  type OrgListView,
} from "@/features/org-reviews/schemas";
import { requireAdmin } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Tổ chức — Admin" };

const BASE = "/admin/organizations";
const DEFAULT_VIEW: OrgListView = "approved";

/**
 * Tổ chức & cửa hàng đã duyệt (F-69): tìm kiếm, lọc loại, xem hồ sơ, tạm khóa (gõ lại tên) / mở khóa có lý do.
 */
export default async function AdminOrganizationsPage(props: PageProps<"/admin/organizations">) {
  await requireAdmin();
  const filters = parseQueueFilters(await props.searchParams, ORG_LIST_VIEWS, DEFAULT_VIEW);
  const result = await listOrganizations({
    statuses: [filters.view],
    kind: filters.kind,
    q: filters.q,
    page: filters.page,
    order: "recent",
  });
  const filtered = filters.kind !== null || filters.q !== "";

  return (
    <>
      <PageHeader
        title="Tổ chức"
        description="Cửa hàng và tổ chức đã duyệt. Tạm khóa hoặc mở khóa luôn cần lý do và được ghi nhật ký."
        breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "Tổ chức" }]}
      >
        <StatusTabs
          base={BASE}
          filters={filters}
          defaultView={DEFAULT_VIEW}
          label="Lọc theo trạng thái"
          tabs={[
            { view: "approved", label: "Đang hoạt động" },
            { view: "suspended", label: "Tạm khóa" },
          ]}
        />
      </PageHeader>

      <div className="flex flex-col gap-4">
        <QueueToolbar
          base={BASE}
          filters={filters}
          defaultView={DEFAULT_VIEW}
          total={result.total}
          unit="tổ chức"
          sortNote="mới duyệt trước"
        />
        {result.rows.length > 0 ? (
          <OrgList
            rows={result.rows}
            mode="decided"
            detailBase="/admin/reviews"
            now={new Date()}
            rowAction={(r) =>
              r.status === "approved" || r.status === "suspended" ? (
                <OrgStandingButton orgId={r.id} orgName={r.name} status={r.status} compact />
              ) : null
            }
          />
        ) : (
          <EmptyState
            icon={filtered ? SearchX : Building2}
            variant="section"
            title={
              filtered
                ? "Không có kết quả khớp bộ lọc"
                : filters.view === "approved"
                  ? "Chưa có tổ chức nào được duyệt"
                  : "Không có tổ chức bị tạm khóa"
            }
            description={
              filtered
                ? "Thử bỏ bớt điều kiện lọc hoặc tìm bằng một phần tên."
                : "Hồ sơ được duyệt trong Hàng đợi duyệt sẽ xuất hiện tại đây."
            }
            action={
              <Button asChild variant="outline">
                <Link
                  href={
                    filtered
                      ? queueHref(BASE, filters, { kind: null, q: "", page: 1 }, DEFAULT_VIEW)
                      : "/admin/reviews"
                  }
                >
                  {filtered ? "Xóa lọc" : "Mở hàng đợi duyệt"}
                </Link>
              </Button>
            }
          />
        )}
        <Pagination
          base={BASE}
          filters={filters}
          defaultView={DEFAULT_VIEW}
          total={result.total}
          pageSize={PAGE_SIZE}
        />
      </div>
    </>
  );
}
