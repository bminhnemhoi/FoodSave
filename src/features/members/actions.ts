"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { z } from "zod";

import {
  mapSettingsError,
  SETTINGS_MESSAGES,
  type ActionError,
  type ActionResult,
} from "@/features/org-settings/errors";
import { getUser } from "@/server/auth/session";
import { createClient } from "@/server/db/supabase";
import { sendMemberInviteEmail } from "@/server/email/invite";

import {
  acceptInviteSchema,
  invitePath,
  inviteSchema,
  portalAfterAccept,
  removeMemberSchema,
  resendInviteSchema,
  updateMemberSchema,
  type OrgRoleValue,
} from "./schemas";
import { generateInviteToken, inviteTokenHashParam } from "./token";

/**
 * Server Action thành viên & lời mời (F-09, F-32, US-STO-06, US-CHA-14, US-VOL-01).
 * Mỗi action: zod (schema dùng chung) → client Supabase của NGƯỜI DÙNG → RPC (quyền thật ở DB:
 * `invite_member`, `update_member`, `remove_member`, `accept_invite` — DATA-MODEL §8.2) → lỗi tiếng Việt.
 * Token mời chỉ sinh và nằm trong bộ nhớ của action này: DB lưu sha256, email mang link.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;

function fail(
  code: string,
  message: string,
  extra: Partial<ActionError> = {},
): { ok: false; error: ActionError } {
  return { ok: false, error: { code, message, ...extra } };
}

function dbFail(
  e: { code?: string; message?: string; details?: string | null; hint?: string | null },
  op: string,
) {
  const mapped = mapSettingsError(e);
  if (mapped.code === "server_error")
    console.error("[members] db error", { op, code: e.code, message: e.message });
  return { ok: false as const, error: mapped };
}

function zodFail(error: z.ZodError) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) fieldErrors[String(issue.path[0] ?? "form")] ??= issue.message;
  return fail("validation_failed", SETTINGS_MESSAGES.invalid, { fieldErrors });
}

/** Trang Cài đặt của cả hai cổng đọc danh sách thành viên/lời mời. */
function revalidateSettings() {
  revalidatePath("/store/settings");
  revalidatePath("/charity/settings");
}

export type InviteResult = { email: string; emailSent: boolean };

async function createInvitation(
  supabase: Supabase,
  inviterId: string,
  args: { orgId: string; email: string; role: OrgRoleValue; siteIds: string[] | null },
): Promise<ActionResult<InviteResult>> {
  const token = generateInviteToken();
  const { data: invitationId, error } = await supabase.rpc("invite_member", {
    p_org_id: args.orgId,
    p_email: args.email,
    p_role: args.role,
    // null = mọi điểm (kiểu sinh tự động chưa biểu diễn được tham số mảng null)
    p_site_ids: args.siteIds as string[],
    p_token_hash: await inviteTokenHashParam(token),
  });
  if (error) return dbFail(error, "invite_member");
  const emailSent = await sendMemberInviteEmail({ invitationId, token, inviterId });
  return { ok: true, data: { email: args.email, emailSent } };
}

export async function inviteMember(input: z.input<typeof inviteSchema>): Promise<ActionResult<InviteResult>> {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  const user = await getUser();
  if (!user) return fail("unauthenticated", SETTINGS_MESSAGES.unauthenticated);

  const supabase = await createClient();
  const res = await createInvitation(supabase, user.id, parsed.data);
  if (res.ok) revalidateSettings();
  return res;
}

/** "Gửi lại": lời mời mới cùng email/vai trò/điểm với token mới — `invite_member` tự thu hồi lời mời cũ. */
export async function resendInvite(
  input: z.input<typeof resendInviteSchema>,
): Promise<ActionResult<InviteResult>> {
  const parsed = resendInviteSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  const user = await getUser();
  if (!user) return fail("unauthenticated", SETTINGS_MESSAGES.unauthenticated);

  const supabase = await createClient();
  const { data: inv, error } = await supabase
    .from("org_invitations")
    .select("org_id, email, role, site_ids, accepted_at, revoked_at")
    .eq("id", parsed.data.invitationId)
    .maybeSingle();
  if (error) return dbFail(error, "load_invitation");
  if (!inv) return fail("not_found", SETTINGS_MESSAGES.notFound);
  if (inv.accepted_at || inv.revoked_at) return fail("invalid_state", SETTINGS_MESSAGES.invalidState);

  const res = await createInvitation(supabase, user.id, {
    orgId: inv.org_id,
    email: inv.email,
    role: inv.role,
    siteIds: inv.site_ids,
  });
  if (res.ok) revalidateSettings();
  return res;
}

export async function updateMember(input: z.input<typeof updateMemberSchema>): Promise<ActionResult<null>> {
  const parsed = updateMemberSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  if (!(await getUser())) return fail("unauthenticated", SETTINGS_MESSAGES.unauthenticated);

  const { orgId, userId, role, siteIds } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_member", {
    p_org_id: orgId,
    p_user_id: userId,
    p_role: role,
    p_site_ids: siteIds as string[],
  });
  if (error) return dbFail(error, "update_member");
  revalidateSettings();
  return { ok: true, data: null };
}

export async function removeMember(input: z.input<typeof removeMemberSchema>): Promise<ActionResult<null>> {
  const parsed = removeMemberSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  if (!(await getUser())) return fail("unauthenticated", SETTINGS_MESSAGES.unauthenticated);

  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_member", {
    p_org_id: parsed.data.orgId,
    p_user_id: parsed.data.userId,
  });
  if (error) return dbFail(error, "remove_member");
  revalidateSettings();
  return { ok: true, data: null };
}

// ---------------------------------------------------------------------------
// Nhận lời mời (/invite/[token]) — form có progressive enhancement (useActionState)
// ---------------------------------------------------------------------------

export type AcceptInviteState = { status: "idle" } | { status: "error"; code: string; message: string };

export async function acceptInvite(_prev: AcceptInviteState, formData: FormData): Promise<AcceptInviteState> {
  const parsed = acceptInviteSchema.safeParse({ token: formData.get("token") });
  if (!parsed.success)
    return { status: "error", code: "token_invalid", message: SETTINGS_MESSAGES.tokenInvalid };
  const { token } = parsed.data;

  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(invitePath(token))}`);

  const supabase = await createClient();
  const { data: orgId, error } = await supabase.rpc("accept_invite", { p_token: token });
  if (error) {
    const mapped = mapSettingsError(error);
    if (mapped.code === "server_error")
      console.error("[members] accept_invite failed", { code: error.code, message: error.message });
    return { status: "error", code: mapped.code, message: mapped.message };
  }

  // Vai trò vừa nhận + loại tổ chức để đưa vào đúng cổng (RLS: người dùng đọc được dòng của mình)
  const { data: member } = await supabase
    .from("org_members")
    .select("role, organizations!inner(kind)")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  revalidatePath("/", "layout");
  redirect(member ? portalAfterAccept(member.role, member.organizations.kind) : "/onboarding");
}
