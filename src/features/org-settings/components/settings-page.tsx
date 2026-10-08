import { Lock, ShieldCheck } from "lucide-react";
import { Suspense } from "react";

import { EmptyState } from "@/components/layout/empty-state";
import { findNavItem, PORTAL_NAV } from "@/components/layout/nav-config";
import { PageHeader } from "@/components/layout/page-header";
import { ListSkeleton } from "@/components/layout/skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import {
  assignableRoles,
  canCreateSite,
  canEditClosures,
  canInvite,
  canManageMembers,
  canManageSite,
  canOpenSettings,
  canRequestLegalChange,
  invitableRoles,
  type MemberScope,
} from "@/core/access/settings";
import { MembersPanel } from "@/features/members/components/members-panel";
import { listMembers, listOpenInvitations } from "@/features/members/queries";
import { LogoField } from "@/features/onboarding/components/logo-field";
import { EMPTY_BASICS } from "@/features/onboarding/schemas";
import type { OrgKind } from "@/features/onboarding/options";
import { formatDecimal } from "@/lib/format";

import { saveSettingsLogo } from "../actions";
import {
  loadProfile,
  loadSettingsContext,
  loadSiteOptions,
  loadSites,
  type SettingsContext,
} from "../queries";
import { TAB_LABEL, type SettingsTab } from "../schemas";
import { LegalSection } from "./legal-section";
import { Notice } from "./notice";
import { PausePanel } from "./pause-panel";
import { ProfileForm } from "./profile-form";
import { SettingsTabs } from "./settings-tabs";
import { SitesPanel, type SitePermissions } from "./sites-panel";

function scopeOf(ctx: SettingsContext): MemberScope {
  return { role: ctx.role, siteIds: ctx.siteIds };
}

async function ProfileTab({ ctx }: { ctx: SettingsContext }) {
  const data = await loadProfile(ctx.orgId);
  const scope = scopeOf(ctx);
  return (
    <div className="flex flex-col gap-6">
      <ProfileForm
        kind={ctx.kind}
        orgId={ctx.orgId}
        initial={{
          ...EMPTY_BASICS,
          name: data.name,
          subtype: data.subtype,
          description: data.description ?? "",
          contactPhone: data.contactPhone ?? "",
          contactEmail: data.contactEmail ?? "",
          beneficiaries: data.beneficiaries != null ? String(data.beneficiaries) : "",
          foundedOn: data.foundedOn ?? "",
        }}
      />
      <LogoField
        orgId={ctx.orgId}
        initialPath={data.logoPath}
        save={saveSettingsLogo}
        title="Logo"
        description="Hiển thị công khai trên FoodSave. Ảnh vuông, rõ nét là đẹp nhất; ảnh được xóa thông tin vị trí trước khi tải lên."
      />
      <LegalSection
        kind={ctx.kind}
        orgId={ctx.orgId}
        legal={data.legal}
        requests={data.changeRequests}
        canRequest={canRequestLegalChange(scope)}
      />
      <Notice tone="info" icon={ShieldCheck} title={`Điểm uy tín: ${formatDecimal(data.trustScore)}/100`}>
        Chỉ đọc — FoodSave tính từ lịch sử nhận, giao và minh chứng của bạn.
      </Notice>
    </div>
  );
}

async function SitesTab({ ctx }: { ctx: SettingsContext }) {
  const sites = await loadSites(ctx.orgId, ctx.today);
  const scope = scopeOf(ctx);
  const perms: SitePermissions = Object.fromEntries(
    sites.map((s) => [s.id, { manage: canManageSite(scope, s.id), closures: canEditClosures(scope, s.id) }]),
  );
  return (
    <SitesPanel
      kind={ctx.kind}
      orgId={ctx.orgId}
      sites={sites}
      today={ctx.today}
      canCreate={canCreateSite(scope)}
      perms={perms}
    />
  );
}

async function MembersTab({ ctx }: { ctx: SettingsContext }) {
  const scope = scopeOf(ctx);
  const [members, invitations, sites] = await Promise.all([
    listMembers(ctx.orgId),
    canInvite(scope) ? listOpenInvitations(ctx.orgId) : Promise.resolve([]),
    loadSiteOptions(ctx.orgId),
  ]);
  return (
    <MembersPanel
      kind={ctx.kind}
      orgId={ctx.orgId}
      orgName={ctx.orgName}
      viewerId={ctx.userId}
      members={members}
      invitations={invitations}
      sites={sites}
      invitable={invitableRoles(scope, ctx.kind)}
      assignable={assignableRoles(ctx.kind)}
      canManage={canManageMembers(scope)}
    />
  );
}

function TabSkeleton() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-4">
      <span className="sr-only">Đang tải nội dung…</span>
      <Skeleton className="h-48 w-full rounded-xl" />
      <ListSkeleton rows={2} />
    </div>
  );
}

/**
 * Trang Cài đặt của cổng Cửa hàng/Tổ chức đã duyệt (P1-06, F-08–F-11, US-STO-05/06/27, US-CHA-34/37).
 * Nhân viên (`staff`) không mở được (US-STO-06 AC2); quyền từng nút theo `core/access/settings` (khớp DB).
 */
export async function OrgSettingsPage({ kind, tab }: { kind: OrgKind; tab: SettingsTab }) {
  const ctx = await loadSettingsContext(kind);
  const nav = PORTAL_NAV[kind];
  const item = findNavItem(kind, `/${kind}/settings`);
  const breadcrumb = [{ label: nav.roleLabel, href: nav.home }, { label: item.label }];

  if (!canOpenSettings(scopeOf(ctx))) {
    return (
      <>
        <PageHeader title={item.label} breadcrumb={breadcrumb} />
        <EmptyState
          icon={Lock}
          title="Bạn chưa có quyền mở Cài đặt"
          description={
            kind === "store"
              ? "Tài khoản nhân viên không xem được mục này. Liên hệ chủ cửa hàng."
              : "Tài khoản của bạn không xem được mục này. Liên hệ người phụ trách tổ chức."
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader title={item.label} description={item.description} breadcrumb={breadcrumb}>
        <SettingsTabs kind={kind} active={tab} />
      </PageHeader>
      {ctx.isPaused && tab !== "pause" ? (
        <Notice
          tone="warning"
          role="status"
          className="mb-6"
          title={kind === "store" ? "Cửa hàng đang tạm ngưng" : "Đang tạm ngưng nhận donation"}
        >
          Bật lại ở mục “{TAB_LABEL[kind].pause}”.
        </Notice>
      ) : null}
      <h2 className="sr-only">{TAB_LABEL[kind][tab]}</h2>
      <Suspense key={tab} fallback={<TabSkeleton />}>
        {tab === "profile" ? <ProfileTab ctx={ctx} /> : null}
        {tab === "sites" ? <SitesTab ctx={ctx} /> : null}
        {tab === "members" ? <MembersTab ctx={ctx} /> : null}
        {tab === "pause" ? (
          <PausePanel kind={kind} orgId={ctx.orgId} isPaused={ctx.isPaused} pausedReason={ctx.pausedReason} />
        ) : null}
      </Suspense>
    </>
  );
}
