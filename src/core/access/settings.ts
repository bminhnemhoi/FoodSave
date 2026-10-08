import type { OrgKind, OrgRole } from "./portal";

/**
 * Quyền trong trang Cài đặt của cổng Cửa hàng/Tổ chức (F-09, F-10, F-11, US-STO-06). Thuần, không IO.
 * Đây chỉ là lớp giao diện (ẩn nút không dùng được); quyền thật nằm ở RPC + RLS (DATA-MODEL §8.2, §9.2)
 * và các hàm dưới đây được viết khớp đúng điều kiện ở DB:
 * - `private.can_manage_site`: owner, hoặc manager có `site_ids` null/chứa điểm (tạo điểm: manager không giới hạn);
 * - `private.can_access_site(site, '{owner,manager}')`: ghi `site_closures` (kể cả owner bị giới hạn điểm);
 * - `invite_member`: owner/manager, manager không mời owner, `volunteer` chỉ cho tổ chức từ thiện;
 * - `update_member` / `remove_member` / `submit_org_change_request`: chỉ owner;
 * - `set_org_paused`: owner/manager.
 */

export type MemberScope = { role: OrgRole; siteIds: readonly string[] | null };

const isOwner = (m: MemberScope) => m.role === "owner";
const isManager = (m: MemberScope) => m.role === "manager";
const inScope = (m: MemberScope, siteId: string) => m.siteIds === null || m.siteIds.includes(siteId);

/** Nhân viên (`staff`) và tình nguyện viên không mở được Cài đặt (US-STO-06 AC2). */
export function canOpenSettings(m: MemberScope): boolean {
  return isOwner(m) || isManager(m);
}

/** Sửa trường không pháp lý của hồ sơ (UPDATE theo grant cột, policy owner/manager). */
export function canEditProfile(m: MemberScope): boolean {
  return canOpenSettings(m);
}

/** Đề nghị sửa trường pháp lý (`submit_org_change_request`). */
export function canRequestLegalChange(m: MemberScope): boolean {
  return isOwner(m);
}

/** Tạo điểm mới (`upsert_site` không có id). */
export function canCreateSite(m: MemberScope): boolean {
  return isOwner(m) || (isManager(m) && m.siteIds === null);
}

/** Sửa điểm và giờ (`upsert_site`, `set_site_hours`). */
export function canManageSite(m: MemberScope, siteId: string): boolean {
  return isOwner(m) || (isManager(m) && inScope(m, siteId));
}

/** Thêm/bỏ ngày nghỉ (RLS `site_closures`, `can_access_site`). */
export function canEditClosures(m: MemberScope, siteId: string): boolean {
  return (isOwner(m) || isManager(m)) && inScope(m, siteId);
}

export function canInvite(m: MemberScope): boolean {
  return canOpenSettings(m);
}

/** Vai trò được phép mời, theo thứ tự hiển thị. */
export function invitableRoles(m: MemberScope, kind: OrgKind): OrgRole[] {
  if (!canInvite(m)) return [];
  const roles: OrgRole[] = isOwner(m) ? ["owner", "manager", "staff"] : ["manager", "staff"];
  if (kind === "charity") roles.push("volunteer");
  return roles;
}

/** Đổi vai trò/điểm và gỡ thành viên. */
export function canManageMembers(m: MemberScope): boolean {
  return isOwner(m);
}

/** Vai trò có thể gán khi sửa thành viên (owner). */
export function assignableRoles(kind: OrgKind): OrgRole[] {
  return kind === "charity" ? ["owner", "manager", "staff", "volunteer"] : ["owner", "manager", "staff"];
}

export function canPause(m: MemberScope): boolean {
  return canOpenSettings(m);
}

/** Giới hạn điểm chỉ có nghĩa với vai trò thao tác tại điểm (không áp cho owner/TNV). */
export function roleUsesSiteScope(role: OrgRole): boolean {
  return role === "manager" || role === "staff";
}
