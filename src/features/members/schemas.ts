import { z } from "zod";

import { emailSchema } from "@/features/onboarding/schemas";

/**
 * Schema dùng chung client/server cho thành viên & lời mời (F-09, F-32, US-STO-06, US-CHA-14).
 * Quyền thật nằm ở RPC `invite_member` / `update_member` / `remove_member` / `accept_invite` (DATA-MODEL §8.2).
 */

export const ORG_ROLES = ["owner", "manager", "staff", "volunteer"] as const;
export type OrgRoleValue = (typeof ORG_ROLES)[number];

export const MEMBER_MESSAGES = {
  role: "Vui lòng chọn vai trò.",
  sites: "Chọn ít nhất một điểm, hoặc chọn “Mọi điểm”.",
} as const;

const roleSchema = z.enum(ORG_ROLES, { error: MEMBER_MESSAGES.role });

/** `null` = mọi điểm; danh sách phải khác rỗng, không trùng (khớp `private.assert_site_ids`). */
export const siteScopeSchema = z
  .array(z.uuid())
  .min(1, { error: MEMBER_MESSAGES.sites })
  .max(50)
  .refine((ids) => new Set(ids).size === ids.length, { error: MEMBER_MESSAGES.sites })
  .nullable();

export const inviteSchema = z.object({
  orgId: z.uuid(),
  email: emailSchema,
  role: roleSchema,
  siteIds: siteScopeSchema,
});
export type InviteInput = z.input<typeof inviteSchema>;

export const resendInviteSchema = z.object({ invitationId: z.uuid() });

export const updateMemberSchema = z.object({
  orgId: z.uuid(),
  userId: z.uuid(),
  role: roleSchema,
  siteIds: siteScopeSchema,
});
export type UpdateMemberInput = z.input<typeof updateMemberSchema>;

export const removeMemberSchema = z.object({ orgId: z.uuid(), userId: z.uuid() });

/**
 * Token trong link mời: 32 byte ngẫu nhiên mã hóa base64url (43 ký tự). Chấp nhận rộng hơn (16–200,
 * đúng giới hạn `accept_invite`) để thông báo lỗi do DB quyết định, không đoán ở client.
 */
export const INVITE_TOKEN_RE = /^[A-Za-z0-9_-]{16,200}$/;

export function isInviteToken(value: unknown): value is string {
  return typeof value === "string" && INVITE_TOKEN_RE.test(value);
}

export function invitePath(token: string): string {
  return `/invite/${token}`;
}

export const acceptInviteSchema = z.object({
  token: z.string().regex(INVITE_TOKEN_RE),
});

/** Trạng thái hiển thị của một lời mời chưa nhận. */
export function invitationState(expiresAt: string, now: Date = new Date()): "pending" | "expired" {
  return new Date(expiresAt).getTime() <= now.getTime() ? "expired" : "pending";
}

/** Nơi đến sau khi nhận lời mời: TNV → PWA tình nguyện viên; còn lại → cổng theo loại tổ chức. */
export function portalAfterAccept(role: OrgRoleValue, kind: "store" | "charity"): string {
  if (role === "volunteer") return "/volunteer";
  return kind === "store" ? "/store" : "/charity";
}
