import "server-only";

import { createClient } from "@/server/db/supabase";

import { needsReconsent } from "./consent";

/**
 * Phiên bản `terms` mới nhất người dùng đã đồng ý (RLS: chỉ dòng của chính mình). Lỗi đọc ⇒ không hỏi lại (banner
 * không bao giờ được làm hỏng hay chặn trang).
 */
export async function loadNeedsReconsent(userId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("consents")
    .select("policy_version")
    .eq("user_id", userId)
    .eq("purpose", "terms")
    .order("granted_at", { ascending: false })
    .limit(1);
  if (error) return false;
  return needsReconsent(data?.[0]?.policy_version);
}
