import "server-only";

import { clientEnv } from "@/lib/env.client";
import { createClient } from "@/server/db/supabase";
import { getEmailProvider } from "@/server/providers/notify";

import { orgApprovedEmail, orgChangesRequestedEmail, orgRejectedEmail } from "./templates";

/**
 * Email kết quả duyệt hồ sơ cho chủ hồ sơ (US-ADM-04 AC1). Gọi SAU khi `review_organization` thành công.
 *
 * Email của chủ hồ sơ đọc bằng client của Admin đang thao tác (RLS: admin aal2 đọc được `profiles`,
 * `org_members`) — không dùng service role, và địa chỉ không bao giờ trả về trình duyệt.
 * Lỗi gửi không làm hỏng quyết định đã ghi: trả `false` để giao diện báo "chưa gửi được email".
 *
 * Lưu ý P2: RPC cũng ghi outbox `org_reviewed`; dispatcher P2 không được gửi email trùng cho sự kiện này.
 */
export async function sendOrgReviewEmail(input: {
  orgId: string;
  decision: "approve" | "request_changes" | "reject";
  reason?: string;
}): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("organizations")
      .select(
        "id, name, kind, org_members(role, status, profiles!org_members_user_id_fkey(full_name, email))",
      )
      .eq("id", input.orgId)
      .eq("org_members.role", "owner")
      .eq("org_members.status", "active")
      .maybeSingle();
    if (error || !data) {
      console.error("[org-review-email] owner lookup failed", { code: error?.code });
      return false;
    }
    const owner = data.org_members[0]?.profiles;
    if (!owner?.email) {
      console.error("[org-review-email] owner has no email");
      return false;
    }

    const base = {
      to: owner.email,
      ownerName: owner.full_name,
      orgName: data.name,
      kind: data.kind,
      appUrl: clientEnv.NEXT_PUBLIC_APP_URL,
      orgId: data.id,
    };
    const reason =
      input.reason?.trim() || "FoodSave chưa ghi lý do. Hãy trả lời email này để được giải thích.";
    const message =
      input.decision === "approve"
        ? orgApprovedEmail(base)
        : input.decision === "request_changes"
          ? orgChangesRequestedEmail({ ...base, reason })
          : orgRejectedEmail({ ...base, reason });

    await getEmailProvider().send(message);
    return true;
  } catch (err) {
    console.error("[org-review-email] send failed", { err: String(err).slice(0, 200) });
    return false;
  }
}
