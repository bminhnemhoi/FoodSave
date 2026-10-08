import "server-only";

import { createClient } from "@/server/db/supabase";

import type { OrgRoleValue } from "./schemas";

/**
 * Đọc thành viên và lời mời (RSC, client của NGƯỜI DÙNG — RLS §9.2):
 * `org_members` đọc được bởi owner/manager/staff của tổ chức đã duyệt; tên/email qua `profiles`
 * (đồng nghiệp cùng tổ chức đã duyệt); `org_invitations` chỉ owner/manager (không bao giờ có `token_hash`).
 */

export type MemberRow = {
  userId: string;
  role: OrgRoleValue;
  siteIds: string[] | null;
  joinedAt: string | null;
  fullName: string;
  email: string | null;
};

export type InvitationRow = {
  id: string;
  email: string;
  role: OrgRoleValue;
  siteIds: string[] | null;
  expiresAt: string;
  createdAt: string;
};

function fail(what: string, code: string | undefined): never {
  throw new Error(`Không tải được ${what} (${code ?? "unknown"})`);
}

export async function listMembers(orgId: string): Promise<MemberRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("org_members")
    .select(
      "user_id, role, site_ids, joined_at, created_at, profiles!org_members_user_id_fkey(full_name, email)",
    )
    .eq("org_id", orgId)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (error) fail("danh sách thành viên", error.code);
  return (data ?? []).map((m) => ({
    userId: m.user_id,
    role: m.role,
    siteIds: m.site_ids,
    joinedAt: m.joined_at ?? m.created_at,
    fullName: m.profiles?.full_name?.trim() ?? "",
    email: m.profiles?.email ?? null,
  }));
}

/** Lời mời chưa nhận và chưa thu hồi (kể cả đã hết hạn — để "Gửi lại"), mới nhất trước. */
export async function listOpenInvitations(orgId: string): Promise<InvitationRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("org_invitations")
    .select("id, email, role, site_ids, expires_at, created_at")
    .eq("org_id", orgId)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) fail("danh sách lời mời", error.code);
  return (data ?? []).map((i) => ({
    id: i.id,
    email: i.email,
    role: i.role,
    siteIds: i.site_ids,
    expiresAt: i.expires_at,
    createdAt: i.created_at,
  }));
}
