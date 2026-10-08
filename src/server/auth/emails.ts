import "server-only";

import { createHmac } from "node:crypto";

import { headers } from "next/headers";

import { clientEnv } from "@/lib/env.client";
import { createServiceClient } from "@/server/db/supabase";
import { existingAccountEmail, passwordResetEmail, signupConfirmationEmail } from "@/server/email/templates";
import { serverEnv } from "@/server/env";
import { getEmailProvider } from "@/server/providers/notify";

/**
 * Email xác thực do FoodSave tự gửi (ADR-012): generateLink (không gửi thư) → link /auth/confirm → SMTP của FoodSave.
 * Mọi hàm trả kết quả trung tính để giao diện không làm lộ việc email có tồn tại hay không.
 */

export type AuthEmailResult = { ok: true } | { ok: false; reason: "rate_limited" | "failed" };

const LIMITS = {
  signup: { perIp: 10, perEmail: 3, window: "1 hour" },
  recovery: { perIp: 10, perEmail: 3, window: "1 hour" },
} as const;

function hmac(value: string): string {
  const secret = serverEnv.IP_HASH_SECRET ?? serverEnv.SUPABASE_SERVICE_ROLE_KEY;
  return createHmac("sha256", secret).update(value).digest("hex").slice(0, 32);
}

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/** true = được phép. Lỗi hạ tầng ⇒ cho qua (fail-open) và ghi log (ADR-012). */
async function allow(action: keyof typeof LIMITS, email: string): Promise<boolean> {
  const supabase = createServiceClient();
  const { perIp, perEmail, window } = LIMITS[action];
  const k = serverEnv.AUTH_RATE_LIMIT_MULTIPLIER;
  const checks = [
    { key: `auth_${action}:ip:${hmac(await clientIp())}`, limit: perIp * k },
    { key: `auth_${action}:email:${hmac(email)}`, limit: perEmail },
  ];
  for (const { key, limit } of checks) {
    const { data, error } = await supabase.rpc(
      "consume_rate_limit" as never,
      {
        p_key: key,
        p_limit: limit,
        p_window: window,
      } as never,
    );
    if (error) {
      console.error("[auth-email] rate limit unavailable", { code: error.code });
      return true;
    }
    if (data === false) return false;
  }
  return true;
}

function confirmLink(tokenHash: string, type: string, next: string): string {
  const url = new URL("/auth/confirm", clientEnv.NEXT_PUBLIC_APP_URL);
  url.searchParams.set("token_hash", tokenHash);
  url.searchParams.set("type", type);
  url.searchParams.set("next", next);
  return url.toString();
}

async function deliver(
  message: Parameters<ReturnType<typeof getEmailProvider>["send"]>[0],
): Promise<boolean> {
  try {
    await getEmailProvider().send(message);
    return true;
  } catch (err) {
    console.error("[auth-email] send failed", { tag: message.tag, err: String(err).slice(0, 200) });
    return false;
  }
}

/** Production chưa cấu hình gửi thư thật ⇒ không được hứa "đã gửi thư" với người dùng. */
function emailDeliveryConfigured(): boolean {
  return !(getEmailProvider().id === "fake" && clientEnv.NEXT_PUBLIC_APP_ENV === "production");
}

export async function registerWithEmail(input: {
  email: string;
  password: string;
  fullName: string;
  /** Trang mở sau khi xác nhận email (đã qua safeNextPath). Mặc định /onboarding. */
  next?: string;
}): Promise<AuthEmailResult> {
  const next = input.next ?? "/onboarding";
  if (!emailDeliveryConfigured()) {
    console.error("[auth-email] NOTIFY_PROVIDER=fake ở production — chưa thể gửi thư xác nhận");
    return { ok: false, reason: "failed" };
  }
  if (!(await allow("signup", input.email))) return { ok: false, reason: "rate_limited" };

  const supabase = createServiceClient();
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "signup",
    email: input.email,
    password: input.password,
    options: { data: { full_name: input.fullName } },
  });

  if (error) {
    if (error.code === "email_exists" || error.code === "user_already_exists") {
      return resendOrNotifyExisting(input.email, input.fullName, next);
    }
    console.error("[auth-email] generateLink(signup) failed", { code: error.code, status: error.status });
    return { ok: false, reason: "failed" };
  }

  const { hashed_token, verification_type } = data.properties;
  const sent = await deliver(
    signupConfirmationEmail({
      to: input.email,
      fullName: input.fullName,
      link: confirmLink(hashed_token, verification_type, next),
    }),
  );
  return sent ? { ok: true } : { ok: false, reason: "failed" };
}

/**
 * Email đã có tài khoản:
 * - CHƯA xác nhận (vd. lỡ xóa thư) ⇒ gửi link kích hoạt mới (magic link — xác minh cũng xác nhận email).
 * - ĐÃ xác nhận ⇒ chỉ gửi thư "bạn đã có tài khoản" (không gửi link đăng nhập).
 * Giao diện luôn hiện cùng một thông báo (không dò được tài khoản).
 */
async function resendOrNotifyExisting(
  email: string,
  fullName: string,
  next: string,
): Promise<AuthEmailResult> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.auth.admin.generateLink({ type: "magiclink", email });
  if (!error && data.user && !data.user.email_confirmed_at) {
    const { hashed_token, verification_type } = data.properties;
    const sent = await deliver(
      signupConfirmationEmail({
        to: email,
        fullName: (data.user.user_metadata?.full_name as string | undefined) ?? fullName,
        link: confirmLink(hashed_token, verification_type, next),
      }),
    );
    return sent ? { ok: true } : { ok: false, reason: "failed" };
  }
  if (error)
    console.error("[auth-email] generateLink(magiclink) failed", { code: error.code, status: error.status });
  const base = clientEnv.NEXT_PUBLIC_APP_URL;
  await deliver(
    existingAccountEmail({
      to: email,
      loginUrl: (() => {
        const url = new URL("/login", base);
        if (next !== "/onboarding") url.searchParams.set("next", next);
        return url.toString();
      })(),
      resetUrl: new URL("/forgot-password", base).toString(),
    }),
  );
  return { ok: true };
}

export async function sendPasswordReset(email: string): Promise<AuthEmailResult> {
  if (!emailDeliveryConfigured()) return { ok: false, reason: "failed" };
  if (!(await allow("recovery", email))) return { ok: false, reason: "rate_limited" };

  const supabase = createServiceClient();
  const { data, error } = await supabase.auth.admin.generateLink({ type: "recovery", email });
  if (error) {
    // Email không tồn tại ⇒ im lặng trả ok (không dò được tài khoản).
    if (error.status !== 404 && error.code !== "user_not_found") {
      console.error("[auth-email] generateLink(recovery) failed", { code: error.code, status: error.status });
    }
    return { ok: true };
  }
  const { hashed_token, verification_type } = data.properties;
  const sent = await deliver(
    passwordResetEmail({ to: email, link: confirmLink(hashed_token, verification_type, "/reset-password") }),
  );
  return sent ? { ok: true } : { ok: false, reason: "failed" };
}
