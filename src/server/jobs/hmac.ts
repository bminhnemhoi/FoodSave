import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Chữ ký request job (ARCHITECTURE §8.3): pg_net gửi `x-fs-timestamp` (giây Unix) và
 * `x-fs-signature` = hex(HMAC-SHA256(JOBS_HMAC_SECRET, `${timestamp}.${rawBody}`)).
 * Postgres tính cùng chuỗi bằng pgcrypto trong `private.kick_dispatch()` (secret lấy từ Vault).
 */

export const TIMESTAMP_HEADER = "x-fs-timestamp";
export const SIGNATURE_HEADER = "x-fs-signature";
/** Lệch đồng hồ tối đa giữa Postgres và server (chống phát lại request cũ). */
export const MAX_SKEW_SECONDS = 300;

export type SignatureCheck =
  | { ok: true }
  | {
      ok: false;
      reason: "missing_secret" | "missing_headers" | "bad_timestamp" | "stale" | "bad_signature";
    };

/** hex(HMAC-SHA256(secret, `${timestamp}.${rawBody}`)). */
export function signJobRequest(secret: string, timestamp: string, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
}

/** Kiểm chữ ký bằng so sánh thời gian hằng (timingSafeEqual) và cửa sổ thời gian ±300 giây. */
export function verifyJobSignature(input: {
  secret: string | undefined;
  timestamp: string | null;
  signature: string | null;
  rawBody: string;
  nowMs?: number;
}): SignatureCheck {
  const { secret, timestamp, signature, rawBody } = input;
  if (!secret) return { ok: false, reason: "missing_secret" };
  if (!timestamp || !signature) return { ok: false, reason: "missing_headers" };
  if (!/^\d{9,11}$/.test(timestamp)) return { ok: false, reason: "bad_timestamp" };

  const nowS = Math.floor((input.nowMs ?? Date.now()) / 1000);
  if (Math.abs(nowS - Number(timestamp)) > MAX_SKEW_SECONDS) return { ok: false, reason: "stale" };

  if (!/^[0-9a-f]{64}$/i.test(signature)) return { ok: false, reason: "bad_signature" };
  const expected = Buffer.from(signJobRequest(secret, timestamp, rawBody), "hex");
  const given = Buffer.from(signature, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: "bad_signature" };
  }
  return { ok: true };
}
