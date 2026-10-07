/**
 * Quyết định quyền vào cổng nghiệp vụ từ danh sách thành viên (đọc từ DB, không từ metadata — F-02).
 * Thuần, không IO: guard phía server (src/server/auth/guards.ts) nạp dữ liệu rồi gọi hàm này.
 */

export type OrgKind = "store" | "charity";
export type OrgStatus =
  "draft" | "submitted" | "needs_changes" | "approved" | "rejected" | "suspended" | "closed";
export type OrgRole = "owner" | "manager" | "staff" | "volunteer";
export type Portal = "store" | "charity" | "volunteer";

export interface MembershipOrg {
  id: string;
  kind: OrgKind;
  name: string;
  status: OrgStatus;
  isDemo: boolean;
  rejectionReason: string | null;
}

export interface Membership {
  orgId: string;
  role: OrgRole;
  org: MembershipOrg;
}

export type PortalDecision =
  | { kind: "ok"; membership: Membership }
  | { kind: "no-org" }
  | { kind: "not-approved"; membership: Membership };

const STAFF_ROLES: readonly OrgRole[] = ["owner", "manager", "staff"];

/** Thành viên có quyền vào cổng: cửa hàng/tổ chức cần vai trò nhân sự; cổng TNV cần vai trò volunteer. */
export function isEligible(m: Membership, portal: Portal): boolean {
  if (portal === "volunteer") return m.org.kind === "charity" && m.role === "volunteer";
  return m.org.kind === portal && STAFF_ROLES.includes(m.role);
}

/**
 * Chọn tổ chức đang làm việc cho cổng:
 * 1. tổ chức `active_org_id` nếu hợp lệ và đã duyệt;
 * 2. nếu không, tổ chức đã duyệt đầu tiên;
 * 3. không có tổ chức đã duyệt ⇒ `not-approved` (trang trạng thái), ưu tiên `active_org_id`;
 * 4. không có thành viên phù hợp ⇒ `no-org` (onboarding).
 */
export function decidePortalAccess(
  memberships: readonly Membership[],
  portal: Portal,
  activeOrgId: string | null,
): PortalDecision {
  const eligible = memberships.filter((m) => isEligible(m, portal));
  if (eligible.length === 0) return { kind: "no-org" };

  const approved = eligible.filter((m) => m.org.status === "approved");
  const preferred = approved.find((m) => m.orgId === activeOrgId) ?? approved[0];
  if (preferred) return { kind: "ok", membership: preferred };

  const pending = eligible.find((m) => m.orgId === activeOrgId) ?? eligible[0]!;
  return { kind: "not-approved", membership: pending };
}
