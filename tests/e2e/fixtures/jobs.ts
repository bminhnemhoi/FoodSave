import { createHmac } from "node:crypto";

/**
 * Gọi dispatcher `/api/jobs/dispatch` như pg_net (ARCHITECTURE §8.3): ký HMAC-SHA256 trên
 * `${timestamp}.${rawBody}`. Secret: JOBS_HMAC_SECRET của tiến trình test, nếu không có thì giá trị chỉ
 * dành cho E2E — playwright.config.ts truyền đúng giá trị này cho máy chủ test (không đọc file .env).
 */
export const E2E_JOBS_HMAC_SECRET = process.env.JOBS_HMAC_SECRET || "e2e-local-only-jobs-hmac-secret-4f1d";

export function signedJobHeaders(rawBody: string, secret = E2E_JOBS_HMAC_SECRET, timestamp?: number) {
  const ts = String(timestamp ?? Math.floor(Date.now() / 1000));
  return {
    "content-type": "application/json",
    "x-fs-timestamp": ts,
    "x-fs-signature": createHmac("sha256", secret).update(`${ts}.${rawBody}`, "utf8").digest("hex"),
  };
}

export type DispatchResponse = {
  ok: boolean;
  fanout: { claimed: number; done: number; retried: number; dead: number; notifications: number };
  email: { claimed: number; sent: number; failed: number };
  errors: string[];
};

/** POST có chữ ký tới dispatcher của máy chủ test. */
export async function callDispatch(baseURL: string): Promise<{ status: number; body: DispatchResponse }> {
  const rawBody = JSON.stringify({ job: "dispatch", source: "e2e" });
  const res = await fetch(new URL("/api/jobs/dispatch", baseURL), {
    method: "POST",
    headers: signedJobHeaders(rawBody),
    body: rawBody,
  });
  return { status: res.status, body: (await res.json()) as DispatchResponse };
}
