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
  const checks = [
    { key: `auth_${action}:ip:${hmac(await clientIp())}`, limit: perIp },
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

export async function registerWithEmail(input: {
  email: string;
  password: string;
  fullName: string;
}): Promise<AuthEmailResult> {
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
      const base = clientEnv.NEXT_PUBLIC_APP_URL;
      await deliver(
        existingAccountEmail({
          to: input.email,
          loginUrl: new URL("/login", base).toString(),
          resetUrl: new URL("/forgot-password", base).toString(),
        }),
      );
      return { ok: true };
    }
    console.error("[auth-email] generateLink(signup) failed", { code: error.code, status: error.status });
    return { ok: false, reason: "failed" };
  }

  const { hashed_token, verification_type } = data.properties;
  const sent = await deliver(
    signupConfirmationEmail({
      to: input.email,
      fullName: input.fullName,
      link: confirmLink(hashed_token, verification_type, "/onboarding"),
    }),
  );
  return sent ? { ok: true } : { ok: false, reason: "failed" };
}

export async function sendPasswordReset(email: string): Promise<AuthEmailResult> {
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
