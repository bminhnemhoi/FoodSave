import "server-only";

import { clientEnv } from "@/lib/env.client";
import { createServiceClient } from "@/server/db/supabase";
import { serverEnv } from "@/server/env";
import { runDispatch } from "@/server/jobs/dispatch";
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, verifyJobSignature } from "@/server/jobs/hmac";
import { getEmailProvider } from "@/server/providers/notify";

/**
 * POST /api/jobs/dispatch — gọi bởi pg_net (trigger outbox + pg_cron `fs_dispatch_tick`), ký HMAC-SHA256
 * trên `${x-fs-timestamp}.${rawBody}` bằng JOBS_HMAC_SECRET (cùng giá trị Vault `jobs_hmac_secret`).
 * Lệch đồng hồ > 300 giây hoặc sai chữ ký ⇒ 401. Request lặp lại trong cửa sổ chỉ chạy lại dispatcher
 * (idempotent). `proxy.ts` bỏ qua đường dẫn này (không có phiên người dùng).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const MAX_BODY_BYTES = 4_096;
const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const secret = serverEnv.JOBS_HMAC_SECRET;
  if (!secret) {
    console.error("[jobs/dispatch] JOBS_HMAC_SECRET chưa được cấu hình");
    return Response.json({ error: "not_configured" }, { status: 503, headers: NO_STORE });
  }

  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return Response.json({ error: "payload_too_large" }, { status: 413, headers: NO_STORE });
  }
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
    return Response.json({ error: "payload_too_large" }, { status: 413, headers: NO_STORE });
  }

  const check = verifyJobSignature({
    secret,
    timestamp: request.headers.get(TIMESTAMP_HEADER),
    signature: request.headers.get(SIGNATURE_HEADER),
    rawBody,
  });
  if (!check.ok) {
    console.warn(`[jobs/dispatch] từ chối request: ${check.reason}`);
    return Response.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }

  try {
    const summary = await runDispatch({
      db: createServiceClient(),
      getEmailProvider,
      appUrl: clientEnv.NEXT_PUBLIC_APP_URL,
      isProduction: clientEnv.NEXT_PUBLIC_APP_ENV === "production",
    });
    if (summary.errors.length > 0) console.error("[jobs/dispatch] lỗi một phần", { errors: summary.errors });
    return Response.json({ ok: true, ...summary }, { headers: NO_STORE });
  } catch (err) {
    console.error("[jobs/dispatch] thất bại", { err: String(err).slice(0, 200) });
    return Response.json({ ok: false, error: "dispatch_failed" }, { status: 500, headers: NO_STORE });
  }
}
