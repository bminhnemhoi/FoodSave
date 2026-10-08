import "server-only";

import { randomBytes } from "node:crypto";

import { sha256Hex } from "@/lib/hash";

/**
 * Token lời mời (DATA-MODEL §2.1 `org_invitations.token_hash`): 32 byte ngẫu nhiên, base64url (43 ký tự),
 * chỉ nằm trong link email. DB chỉ lưu `sha256(convert_to(token, 'UTF8'))` — băm đúng chuỗi trong link.
 * Payload outbox không chứa token, nên server action tự gửi email mời ngay sau khi RPC thành công.
 */
export const INVITE_TOKEN_BYTES = 32;

export function generateInviteToken(): string {
  return randomBytes(INVITE_TOKEN_BYTES).toString("base64url");
}

/** sha256 của chuỗi token (UTF-8), dạng hex. */
export function inviteTokenHashHex(token: string): Promise<string> {
  return sha256Hex(token);
}

/** Tham số `bytea` cho PostgREST: định dạng hex của Postgres ("\x" + 64 ký tự hex). */
export async function inviteTokenHashParam(token: string): Promise<string> {
  return `\\x${await inviteTokenHashHex(token)}`;
}
