"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";

import { mapSettingsError, SETTINGS_MESSAGES, type ActionResult } from "@/features/org-settings/errors";
import { getUser } from "@/server/auth/session";
import { createClient } from "@/server/db/supabase";

import { pauseVolunteerSchema, revokeInvitationSchema } from "./schemas";

/**
 * Server Action trang Tình nguyện viên (PRD US-CHA-14 AC3, US-CHA-15 AC2). zod → client Supabase của NGƯỜI
 * DÙNG → RPC `security definer` (quyền kiểm ở DB) → lỗi tiếng Việt. Mời/gửi lại/xóa thành viên dùng lại
 * `features/members/actions`.
 */

const OVERRIDES: Record<string, string> = {
  not_a_volunteer: "Chỉ tạm ngưng được tình nguyện viên. Đổi vai trò thành viên khác trong Cài đặt.",
  already_accepted: "Lời mời này đã được nhận — người này đã là thành viên.",
};

function revalidate() {
  revalidatePath("/charity/volunteers");
  revalidatePath("/charity/pickups");
  revalidatePath("/charity/settings");
}

export async function setVolunteerPaused(
  input: z.input<typeof pauseVolunteerSchema>,
): Promise<ActionResult<{ paused: boolean }>> {
  const parsed = pauseVolunteerSchema.safeParse(input);
  if (!parsed.success) {
    const reason = parsed.error.issues.find((i) => i.path[0] === "reason")?.message;
    return {
      ok: false,
      error: {
        code: "validation_failed",
        message: reason ?? SETTINGS_MESSAGES.invalid,
        fieldErrors: reason ? { reason } : undefined,
      },
    };
  }
  if (!(await getUser()))
    return { ok: false, error: { code: "unauthenticated", message: SETTINGS_MESSAGES.unauthenticated } };

  const { orgId, userId, paused, reason } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_volunteer_paused", {
    p_org_id: orgId,
    p_user_id: userId,
    p_paused: paused,
    p_reason: (reason || null) as string,
  });
  if (error) {
    if (error.details?.includes("not_a_volunteer"))
      return { ok: false, error: { code: "validation_failed", message: OVERRIDES.not_a_volunteer! } };
    const mapped = mapSettingsError(error);
    if (mapped.code === "server_error")
      console.error("[volunteers] set_volunteer_paused", { code: error.code });
    return { ok: false, error: mapped };
  }
  revalidate();
  return { ok: true, data: { paused } };
}

export async function revokeInvitation(
  input: z.input<typeof revokeInvitationSchema>,
): Promise<ActionResult<null>> {
  const parsed = revokeInvitationSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: { code: "validation_failed", message: SETTINGS_MESSAGES.invalid } };
  if (!(await getUser()))
    return { ok: false, error: { code: "unauthenticated", message: SETTINGS_MESSAGES.unauthenticated } };

  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_invitation", { p_invitation_id: parsed.data.invitationId });
  if (error) {
    if (error.details === "already_accepted")
      return { ok: false, error: { code: "invalid_state", message: OVERRIDES.already_accepted! } };
    const mapped = mapSettingsError(error);
    if (mapped.code === "server_error") console.error("[volunteers] revoke_invitation", { code: error.code });
    return { ok: false, error: mapped };
  }
  revalidate();
  return { ok: true, data: null };
}
