import "server-only";

import type { createClient } from "@/server/db/supabase";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type DbError = { code?: string; message?: string; details?: string | null; hint?: string | null };

/**
 * Ghi hotline của tổ chức (`org_contacts`) bằng client của NGƯỜI DÙNG — RLS chỉ cho owner/manager của chính tổ
 * chức. Khóa thiếu (`undefined`) giữ giá trị đang có; cả hai rỗng ⇒ xóa dòng (CHECK `org_contacts_not_empty`).
 * Không upsert qua PostgREST vì `on conflict do update` cần quyền UPDATE cột `org_id` (không được grant).
 */
export async function writeOrgHotline(
  supabase: Supabase,
  orgId: string,
  patch: { phone?: string | null; email?: string | null },
): Promise<{ ok: true } | { ok: false; error: DbError }> {
  if (patch.phone === undefined && patch.email === undefined) return { ok: true };

  const cur = await supabase
    .from("org_contacts")
    .select("hotline_phone, hotline_email")
    .eq("org_id", orgId)
    .maybeSingle();
  if (cur.error) return { ok: false, error: cur.error };

  const phone = patch.phone !== undefined ? patch.phone : (cur.data?.hotline_phone ?? null);
  const email = patch.email !== undefined ? patch.email : (cur.data?.hotline_email ?? null);

  if (!phone && !email) {
    if (!cur.data) return { ok: true };
    const del = await supabase.from("org_contacts").delete().eq("org_id", orgId);
    return del.error ? { ok: false, error: del.error } : { ok: true };
  }

  if (cur.data) {
    const upd = await supabase
      .from("org_contacts")
      .update({ hotline_phone: phone, hotline_email: email })
      .eq("org_id", orgId)
      .select("org_id");
    if (upd.error) return { ok: false, error: upd.error };
    if (upd.data.length === 0) return { ok: false, error: { code: "42501", message: "not_authorized" } };
    return { ok: true };
  }

  const ins = await supabase
    .from("org_contacts")
    .insert({ org_id: orgId, hotline_phone: phone, hotline_email: email });
  return ins.error ? { ok: false, error: ins.error } : { ok: true };
}
