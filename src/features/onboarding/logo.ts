import "server-only";

import type { createClient } from "@/server/db/supabase";

import { isOrgLogoPath } from "./documents";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type PgError = { code?: string; message?: string; details?: string | null; hint?: string | null };

/**
 * Gắn (hoặc gỡ, `path = null`) logo đã tải lên bucket `media` vào `organizations.logo_path` bằng client
 * của NGƯỜI DÙNG (grant cột + policy owner/manager), rồi xóa tệp logo cũ của chính tổ chức.
 * Dùng chung cho wizard (hồ sơ nháp) và trang Cài đặt (tổ chức đã duyệt) — nơi gọi tự kiểm trạng thái.
 */
export async function replaceOrgLogo(
  supabase: Supabase,
  orgId: string,
  path: string | null,
): Promise<{ ok: true } | { ok: false; op: string; error: PgError }> {
  const current = await supabase.from("organizations").select("logo_path").eq("id", orgId).single();
  if (current.error) return { ok: false, op: "load_logo", error: current.error };

  const { data, error } = await supabase
    .from("organizations")
    .update({ logo_path: path })
    .eq("id", orgId)
    .select("id");
  if (error) return { ok: false, op: "update_logo", error };
  if (data.length === 0) return { ok: false, op: "update_logo", error: { code: "PT404" } };

  const old = current.data.logo_path;
  if (old && old !== path && isOrgLogoPath(orgId, old)) {
    const removed = await supabase.storage.from("media").remove([old]);
    if (removed.error) console.error("[logo] old logo remove failed", { message: removed.error.message });
  }
  return { ok: true };
}
