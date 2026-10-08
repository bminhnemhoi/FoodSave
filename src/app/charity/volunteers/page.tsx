import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { loadCharityContext, requestNow } from "@/features/charity-allocations/context";
import { VolunteersView } from "@/features/volunteers/components/volunteers-view";
import { listVolunteerInvitations, listVolunteers } from "@/features/volunteers/queries";

export const metadata: Metadata = { title: "Tình nguyện viên — Tổ chức" };

/**
 * Tình nguyện viên (PRD US-CHA-14, US-CHA-15; ROADMAP P3-08 phía điều phối): danh sách + mời + tạm ngưng.
 * Đọc qua RPC `list_org_volunteers` (SĐT che, khu vực gần đúng, cờ đồng ý vị trí) và `org_invitations` (RLS).
 */
export default async function CharityVolunteersPage() {
  const ctx = await loadCharityContext();
  const canManage = ctx.role === "owner" || ctx.role === "manager";
  const [volunteers, invitations] = await Promise.all([
    listVolunteers(ctx.orgId),
    canManage ? listVolunteerInvitations(ctx.orgId) : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        title="Tình nguyện viên"
        description="Mời tình nguyện viên, xem phương tiện, sức chở và khu vực để giao chuyến phù hợp."
        breadcrumb={[{ label: "Tổng quan", href: "/charity" }, { label: "Tình nguyện viên" }]}
      />
      <VolunteersView
        orgId={ctx.orgId}
        orgName={ctx.orgName}
        volunteers={volunteers}
        invitations={invitations}
        canManage={canManage}
        canRemove={ctx.role === "owner"}
        serverNow={requestNow()}
      />
    </>
  );
}
