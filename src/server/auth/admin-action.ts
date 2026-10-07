import "server-only";

import { createClient } from "@/server/db/supabase";

/**
 * Kiểm tra quyền trong Server Action của Admin (Server Action gọi được bằng POST trực tiếp — docs Next
 * "Data Security"). Khác `requireAdmin()` (dùng cho trang, có redirect/404): ở đây trả kết quả để action
 * báo lỗi tiếng Việt. DB vẫn kiểm lại bằng `private.is_admin()` (aal2) trong mọi RPC/RLS.
 */
export type AdminActionCheck =
  | { ok: true; userId: string; aal: "aal1" | "aal2" }
  | { ok: false; reason: "not_authenticated" | "not_admin" | "mfa_required" };

export async function checkAdminAction(opts: { allowAal1?: boolean } = {}): Promise<AdminActionCheck> {
  const supabase = await createClient();
  const { data: claimsData, error } = await supabase.auth.getClaims();
  const claims = claimsData?.claims as { sub?: string; aal?: string } | undefined;
  if (error || !claims?.sub) return { ok: false, reason: "not_authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("platform_role")
    .eq("id", claims.sub)
    .maybeSingle();
  if (profile?.platform_role !== "admin") return { ok: false, reason: "not_admin" };

  const aal = claims.aal === "aal2" ? "aal2" : "aal1";
  if (aal !== "aal2" && !opts.allowAal1) return { ok: false, reason: "mfa_required" };
  return { ok: true, userId: claims.sub, aal };
}
