import { Building2, FileStack } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { StatusBadge } from "@/components/labels/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import {
  ChangeRequestSection,
  ConsentsSection,
  DecisionCard,
  HistorySection,
  InfoList,
  LegalSection,
  Section,
  SitesSection,
} from "@/features/org-reviews/components/detail-sections";
import { DocumentList } from "@/features/org-reviews/components/document-list";
import { waitingDays, waitingLabel } from "@/features/org-reviews/present";
import { getOrgReviewDetail } from "@/features/org-reviews/queries";
import { orgSubtypeLabel } from "@/features/organizations/labels";
import { ORG_KIND_LABEL } from "@/features/organizations/status-copy";
import { formatDate, formatDateTime } from "@/lib/format";
import { requireAdmin } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Chi tiết hồ sơ — Admin" };

/**
 * Chi tiết hồ sơ để duyệt (US-ADM-02..04): thông tin chung, pháp lý (CCCD 4 số cuối), điểm + bản đồ,
 * giấy tờ (signed URL 60 s), yêu cầu cập nhật, đồng ý, lịch sử; quyết định duyệt có lý do.
 * Không có khối "dữ liệu gốc" dump toàn bộ cột (hồi quy B3).
 */
export default async function AdminReviewDetailPage(props: PageProps<"/admin/reviews/[orgId]">) {
  const { orgId } = await props.params;
  if (!z.uuid().safeParse(orgId).success) notFound();

  const { profile } = await requireAdmin();
  const detail = await getOrgReviewDetail(orgId);
  if (!detail) notFound();

  const { org } = detail;
  const now = new Date();
  const selfDealing = org.createdBy === profile.id || detail.memberIds.includes(profile.id);
  const canDecide = !selfDealing;
  const onboardingDocs = detail.documents.filter((d) => d.changeRequestId === null);

  const summary = [
    `${ORG_KIND_LABEL[org.kind]} · ${orgSubtypeLabel(org.kind, org.subtype)}`,
    org.submittedAt ? `Gửi ${formatDateTime(org.submittedAt)}` : "Chưa gửi duyệt",
    org.status === "submitted" ? waitingLabel(waitingDays(org.submittedAt, now)) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <PageHeader
        title={org.name}
        description={summary}
        breadcrumb={[
          { label: "Admin", href: "/admin" },
          { label: "Hàng đợi duyệt", href: "/admin/reviews" },
          { label: org.name },
        ]}
        actions={<StatusBadge status={org.status} />}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          <Section title="Thông tin chung" icon={Building2}>
            <InfoList
              items={[
                { label: "Tên hiển thị", value: org.name },
                {
                  label: "Loại hình",
                  value: `${ORG_KIND_LABEL[org.kind]} · ${orgSubtypeLabel(org.kind, org.subtype)}`,
                },
                { label: "Mô tả", value: org.description || "—", wide: true },
                {
                  label: "Website",
                  value: org.website ? (
                    <a
                      href={org.website}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="font-medium break-all text-primary underline underline-offset-4"
                    >
                      {org.website}
                    </a>
                  ) : (
                    "—"
                  ),
                },
                { label: "Ngày thành lập", value: org.foundedOn ? formatDate(org.foundedOn) : "—" },
                ...(org.kind === "charity"
                  ? [{ label: "Số người phục vụ (tự khai)", value: org.declaredBeneficiaries ?? "—" }]
                  : []),
                { label: "Chủ hồ sơ", value: detail.owners.map((o) => o.name).join(", ") || "—" },
                { label: "Tạo lúc", value: formatDateTime(org.createdAt) },
                {
                  label: "Dữ liệu demo",
                  value: org.isDemo ? "Có — tổ chức hư cấu dùng để trình diễn" : "Không",
                },
              ]}
            />
          </Section>

          <LegalSection
            orgId={org.id}
            legal={detail.legal}
            canVerify={
              canDecide && org.status !== "rejected" && org.status !== "closed" && org.status !== "draft"
            }
          />

          <SitesSection sites={detail.sites} kind={org.kind} />

          <Section
            title="Giấy tờ"
            icon={FileStack}
            note="Mỗi lần bấm “Xem” tạo một liên kết riêng hết hạn sau 60 giây. Tệp tự xóa 30 ngày sau quyết định duyệt hoặc từ chối."
          >
            <DocumentList documents={onboardingDocs} orgName={org.name} />
          </Section>

          <ChangeRequestSection
            orgName={org.name}
            requests={detail.changeRequests}
            documents={detail.documents}
            canDecide={canDecide}
          />
        </div>

        <aside aria-label="Quyết định và lịch sử" className="flex flex-col gap-6">
          <DecisionCard detail={detail} selfDealing={selfDealing} />
          <ConsentsSection consents={detail.consents} />
          <HistorySection history={detail.history} now={now} />
        </aside>
      </div>
    </>
  );
}
