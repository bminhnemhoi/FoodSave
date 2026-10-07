import { ClipboardCheck, FileSearch, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import {
  ChangeRequestList,
  OrgList,
  Pagination,
  QueueToolbar,
  StatusTabs,
  type Tab,
} from "@/features/org-reviews/components/queue-views";
import {
  countPending,
  listOrganizations,
  listPendingChangeRequests,
  PAGE_SIZE,
} from "@/features/org-reviews/queries";
import { parseQueueFilters, QUEUE_VIEWS, queueHref, type QueueView } from "@/features/org-reviews/schemas";
import { requireAdmin } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Hàng đợi duyệt — Admin" };

const BASE = "/admin/reviews";
const DEFAULT_VIEW: QueueView = "submitted";

const EMPTY_COPY: Record<QueueView, { title: string; description: string }> = {
  submitted: {
    title: "Không còn hồ sơ chờ duyệt",
    description:
      "Hồ sơ cửa hàng và tổ chức gửi duyệt sẽ xuất hiện tại đây, hồ sơ chờ lâu nhất ở đầu danh sách.",
  },
  changes: {
    title: "Không có yêu cầu cập nhật nào",
    description:
      "Khi tổ chức đã duyệt muốn sửa thông tin pháp lý, yêu cầu sẽ xuất hiện tại đây để bạn so sánh cũ/mới.",
  },
  needs_changes: {
    title: "Không có hồ sơ đang chờ bổ sung",
    description: "Hồ sơ bạn yêu cầu bổ sung sẽ nằm ở đây cho tới khi bên đăng ký gửi lại.",
  },
  approved: { title: "Chưa có hồ sơ được duyệt", description: "Hồ sơ đã duyệt sẽ xuất hiện tại đây." },
  rejected: {
    title: "Chưa có hồ sơ bị từ chối",
    description: "Hồ sơ bị từ chối sẽ xuất hiện tại đây kèm lý do.",
  },
  suspended: {
    title: "Không có tổ chức bị tạm khóa",
    description: "Tổ chức bị tạm khóa sẽ xuất hiện tại đây.",
  },
};

/** Hàng đợi duyệt (P1-09, US-ADM-02): hồ sơ theo trạng thái, yêu cầu cập nhật, lọc loại, tìm tên, phân trang. */
export default async function AdminReviewsPage(props: PageProps<"/admin/reviews">) {
  await requireAdmin();
  const filters = parseQueueFilters(await props.searchParams, QUEUE_VIEWS, DEFAULT_VIEW);
  const now = new Date();

  const countsPromise = countPending();
  let list: { total: number; outOfRange: boolean; node: React.ReactNode | null };
  if (filters.view === "changes") {
    const r = await listPendingChangeRequests(filters);
    list = {
      total: r.total,
      outOfRange: r.outOfRange,
      node: r.rows.length ? <ChangeRequestList rows={r.rows} now={now} /> : null,
    };
  } else {
    const r = await listOrganizations({
      statuses: [filters.view],
      kind: filters.kind,
      q: filters.q,
      page: filters.page,
      order: filters.view === "submitted" ? "waiting" : "recent",
    });
    list = {
      total: r.total,
      outOfRange: r.outOfRange,
      node: r.rows.length ? (
        <OrgList
          rows={r.rows}
          mode={filters.view === "submitted" ? "queue" : "decided"}
          detailBase={BASE}
          now={now}
        />
      ) : null,
    };
  }
  const counts = await countsPromise;

  const tabs: Tab<QueueView>[] = [
    { view: "submitted", label: "Chờ duyệt", count: counts.submitted },
    { view: "changes", label: "Cập nhật hồ sơ", count: counts.changes },
    { view: "needs_changes", label: "Cần bổ sung" },
    { view: "approved", label: "Đã duyệt" },
    { view: "rejected", label: "Bị từ chối" },
    { view: "suspended", label: "Tạm khóa" },
  ];

  const filtered = filters.kind !== null || filters.q !== "";
  const isQueue = filters.view === "submitted" || filters.view === "changes";
  const empty = EMPTY_COPY[filters.view];

  return (
    <>
      <PageHeader
        title="Hàng đợi duyệt"
        description="Duyệt hồ sơ cửa hàng và tổ chức, xem giấy tờ bằng liên kết riêng 60 giây, ghi lý do khi chưa duyệt."
        breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "Hàng đợi duyệt" }]}
      >
        <StatusTabs
          base={BASE}
          filters={filters}
          tabs={tabs}
          defaultView={DEFAULT_VIEW}
          label="Lọc theo trạng thái"
        />
      </PageHeader>

      <div className="flex flex-col gap-4">
        <QueueToolbar
          base={BASE}
          filters={filters}
          defaultView={DEFAULT_VIEW}
          total={list.total}
          unit={filters.view === "changes" ? "yêu cầu" : "hồ sơ"}
          sortNote={isQueue ? "chờ lâu nhất trước" : "mới xử lý trước"}
        />

        {list.node ?? (
          <EmptyList
            outOfRange={list.outOfRange}
            filtered={filtered}
            title={empty.title}
            description={empty.description}
            resetHref={queueHref(BASE, filters, { kind: null, q: "", page: 1 }, DEFAULT_VIEW)}
            firstPageHref={queueHref(BASE, filters, { page: 1 }, DEFAULT_VIEW)}
          />
        )}

        <Pagination
          base={BASE}
          filters={filters}
          defaultView={DEFAULT_VIEW}
          total={list.total}
          pageSize={PAGE_SIZE}
        />
      </div>
    </>
  );
}

function EmptyList({
  outOfRange,
  filtered,
  title,
  description,
  resetHref,
  firstPageHref,
}: {
  outOfRange: boolean;
  filtered: boolean;
  title: string;
  description: string;
  resetHref: string;
  firstPageHref: string;
}) {
  if (outOfRange) {
    return (
      <EmptyState
        icon={FileSearch}
        variant="section"
        title="Trang này không còn dữ liệu"
        description="Danh sách đã thay đổi kể từ lúc bạn mở. Quay về trang đầu để xem tiếp."
        action={
          <Button asChild variant="outline">
            <Link href={firstPageHref}>Về trang đầu</Link>
          </Button>
        }
      />
    );
  }
  if (filtered) {
    return (
      <EmptyState
        icon={SearchX}
        variant="section"
        title="Không có kết quả khớp bộ lọc"
        description="Thử bỏ bớt điều kiện lọc hoặc tìm bằng một phần tên."
        action={
          <Button asChild variant="outline">
            <Link href={resetHref}>Xóa lọc</Link>
          </Button>
        }
      />
    );
  }
  return (
    <EmptyState
      icon={ClipboardCheck}
      variant="section"
      title={title}
      description={description}
      action={
        <Button asChild variant="outline">
          <Link href="/admin/reviews?view=approved">Xem hồ sơ đã duyệt</Link>
        </Button>
      }
    />
  );
}
