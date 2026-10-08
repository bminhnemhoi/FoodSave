import { z } from "zod";

/**
 * Schema dùng chung client/server cho trang Tình nguyện viên của tổ chức (PRD US-CHA-14, US-CHA-15). Quyền
 * thật ở RPC `set_volunteer_paused`, `revoke_invitation` (migration 20261008170200_coordinator).
 */

export const PAUSE_REASON_MAX = 300;

export const pauseVolunteerSchema = z.object({
  orgId: z.uuid(),
  userId: z.uuid(),
  paused: z.boolean(),
  reason: z
    .string()
    .trim()
    .max(PAUSE_REASON_MAX, { error: `Lý do tối đa ${PAUSE_REASON_MAX} ký tự.` })
    .nullable(),
});
export type PauseVolunteerInput = z.input<typeof pauseVolunteerSchema>;

export const revokeInvitationSchema = z.object({ invitationId: z.uuid() });
