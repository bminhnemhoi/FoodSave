import "server-only";

import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { decidePortalAccess, type Membership, type Portal } from "@/core/access/portal";
import { createClient } from "@/server/db/supabase";

import { requireUser } from "./session";

/**
 * Guard cổng nghiệp vụ (F-02, P1-11). Vai trò LUÔN đọc từ DB (`org_members`, `profiles.platform_role`)
 * bằng client của người dùng (RLS áp dụng) — không bao giờ từ metadata.
 *
 * Layout không chạy lại khi điều hướng phía client (docs Next "Layouts and auth checks"), nên mỗi page
 * cũng gọi guard. Kết quả được `cache()` theo request nên layout + page chỉ truy vấn một lần.
 */

export type ViewerProfile = {
  id: string;
  email: string | null;
  fullName: string;
  platformRole: "user" | "admin";
  activeOrgId: string | null;
  isDemo: boolean;
};

export type ViewerContext = {
  profile: ViewerProfile;
  memberships: Membership[];
};

export type PortalContext = ViewerContext & { membership: Membership };

/** Nạp hồ sơ + thành viên một lần mỗi request (React cache). */
const loadViewer = cache(async (userId: string, userEmail: string | null): Promise<ViewerContext> => {
  const supabase = await createClient();

  const [profileRes, membersRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, full_name, platform_role, active_org_id, is_demo")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("org_members")
      .select("org_id, role, organizations!inner(id, kind, name, status, is_demo, rejection_reason)")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: true }),
  ]);

  if (profileRes.error) throw new Error(`Không tải được hồ sơ người dùng (${profileRes.error.code})`);
  if (membersRes.error) throw new Error(`Không tải được danh sách tổ chức (${membersRes.error.code})`);

  const p = profileRes.data;
  const profile: ViewerProfile = {
    id: userId,
    email: p?.email ?? userEmail,
    fullName: p?.full_name?.trim() || userEmail || "Bạn",
    // Không có dòng profiles (trigger chưa chạy) ⇒ coi như người dùng thường
    platformRole: p?.platform_role === "admin" ? "admin" : "user",
    activeOrgId: p?.active_org_id ?? null,
    isDemo: p?.is_demo ?? false,
  };

  const memberships: Membership[] = (membersRes.data ?? []).map((row) => ({
    orgId: row.org_id,
    role: row.role,
    org: {
      id: row.organizations.id,
      kind: row.organizations.kind,
      name: row.organizations.name,
      status: row.organizations.status,
      isDemo: row.organizations.is_demo,
      rejectionReason: row.organizations.rejection_reason,
    },
  }));

  return { profile, memberships };
});

/**
 * Hồ sơ + danh sách thành viên `active` của người đang đăng nhập (không redirect khi thiếu tổ chức).
 * Chưa đăng nhập ⇒ /login?next=<nextPath>.
 */
export async function getViewerContext(nextPath: string): Promise<ViewerContext> {
  const user = await requireUser(nextPath);
  return loadViewer(user.id, user.email ?? null);
}

const PORTAL_HOME: Record<Portal, string> = { store: "/store", charity: "/charity", volunteer: "/volunteer" };

async function requirePortalAccess(portal: Portal): Promise<PortalContext> {
  const ctx = await getViewerContext(PORTAL_HOME[portal]);
  const decision = decidePortalAccess(ctx.memberships, portal, ctx.profile.activeOrgId);
  switch (decision.kind) {
    case "ok":
      return { ...ctx, membership: decision.membership };
    case "no-org":
      // Đã thuộc tổ chức/vai trò khác ⇒ trang của mình kèm câu giải thích (UAT 09/10 C5); chưa có gì ⇒ onboarding
      return redirect(ctx.memberships.length > 0 ? `/onboarding?denied=${portal}` : "/onboarding");
    case "not-approved":
      return redirect(`/onboarding/status?org=${encodeURIComponent(decision.membership.orgId)}`);
  }
}

/**
 * Cổng Cửa hàng / Tổ chức: bắt buộc đăng nhập, là owner/manager/staff của một tổ chức đúng loại.
 * Chưa có tổ chức ⇒ /onboarding; tổ chức chưa `approved` ⇒ /onboarding/status.
 */
export function requirePortal(kind: "store" | "charity"): Promise<PortalContext> {
  return requirePortalAccess(kind);
}

/** PWA tình nguyện viên: cần vai trò `volunteer` (đang hoạt động) tại một tổ chức đã duyệt. */
export function requireVolunteer(): Promise<PortalContext> {
  return requirePortalAccess("volunteer");
}

/** Mức xác thực (aal) của phiên hiện tại, lấy từ JWT đã được xác minh chữ ký (getClaims). */
const getSessionAal = cache(async (): Promise<"aal1" | "aal2" | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) return null;
  const aal = (data.claims as { aal?: unknown }).aal;
  return aal === "aal2" ? "aal2" : aal === "aal1" ? "aal1" : null;
});

export type AdminContext = ViewerContext & { aal: "aal1" | "aal2" | null };

/**
 * Khu vực Admin: `profiles.platform_role = 'admin'` (từ DB), nếu không ⇒ 404 (không để lộ khu vực).
 * Mặc định còn bắt buộc phiên aal2 (MFA, F-62) — chưa đạt ⇒ /admin/mfa.
 * `allowAal1` chỉ dùng cho chính trang /admin/mfa.
 */
export async function requireAdmin(opts: { allowAal1?: boolean } = {}): Promise<AdminContext> {
  const ctx = await getViewerContext("/admin");
  if (ctx.profile.platformRole !== "admin") notFound();
  const aal = await getSessionAal();
  if (aal !== "aal2" && !opts.allowAal1) redirect("/admin/mfa");
  return { ...ctx, aal };
}
