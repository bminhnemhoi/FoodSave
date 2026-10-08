import "server-only";

import { clientEnv } from "@/lib/env.client";
import { createClient } from "@/server/db/supabase";
import { getEmailProvider } from "@/server/providers/notify";

import { memberInviteEmail } from "./templates";

/**
 * Gửi email mời thành viên (N-03) NGAY sau khi `invite_member` thành công. Outbox `member_invited` không
 * chứa token (không chứa bí mật) nên dispatcher không dựng được link — server action gửi trực tiếp
 * (DATA-MODEL §8.2 "Mở"). Dữ liệu đọc bằng client của người mời (RLS: owner/manager đọc được lời mời,
 * tên tổ chức, hồ sơ của chính mình) — không dùng service role.
 * Lỗi gửi không hủy lời mời: trả `false` để giao diện gợi ý "Gửi lại".
 */
export async function sendMemberInviteEmail(input: {
  invitationId: string;
  token: string;
  inviterId: string;
}): Promise<boolean> {
  try {
    const provider = getEmailProvider();
    if (provider.id === "fake" && clientEnv.NEXT_PUBLIC_APP_ENV === "production") {
      console.error("[invite-email] NOTIFY_PROVIDER=fake ở production — chưa gửi được thư mời");
      return false;
    }

    const supabase = await createClient();
    const [invRes, inviterRes] = await Promise.all([
      supabase
        .from("org_invitations")
        .select("email, role, expires_at, organizations!inner(name, kind)")
        .eq("id", input.invitationId)
        .maybeSingle(),
      supabase.from("profiles").select("full_name").eq("id", input.inviterId).maybeSingle(),
    ]);
    if (invRes.error || !invRes.data) {
      console.error("[invite-email] invitation lookup failed", { code: invRes.error?.code });
      return false;
    }
    const inv = invRes.data;
    const link = new URL(`/invite/${input.token}`, clientEnv.NEXT_PUBLIC_APP_URL).toString();

    await provider.send(
      memberInviteEmail({
        to: inv.email,
        orgName: inv.organizations.name,
        orgKind: inv.organizations.kind,
        role: inv.role,
        inviterName: inviterRes.data?.full_name ?? "",
        link,
        expiresAt: inv.expires_at,
      }),
    );
    return true;
  } catch (err) {
    console.error("[invite-email] send failed", { err: String(err).slice(0, 200) });
    return false;
  }
}
