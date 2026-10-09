import "server-only";

import { createClient } from "@/server/db/supabase";

/**
 * Hotline của chính tổ chức (bảng `org_contacts`, RLS: chỉ owner/manager và admin aal2 đọc trực tiếp).
 * Người khác không đọc được ⇒ luôn trả `null` — vì vậy chỉ gọi khi người xem là owner/manager.
 */
export type OwnHotline = { phone: string | null; email: string | null };

export async function loadOwnHotline(orgId: string): Promise<OwnHotline | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("org_contacts")
    .select("hotline_phone, hotline_email")
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw new Error(`Không tải được hotline (${error.code})`);
  return data ? { phone: data.hotline_phone, email: data.hotline_email } : null;
}
