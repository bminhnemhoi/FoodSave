import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { safeNextPath } from "@/features/auth/schemas";
import { createClient } from "@/server/db/supabase";

const ALLOWED_TYPES: EmailOtpType[] = ["email", "signup", "magiclink", "recovery", "invite", "email_change"];

/**
 * Đích của liên kết trong email (xác nhận đăng ký, đặt lại mật khẩu, lời mời, đổi email).
 * Dùng token_hash + verifyOtp nên mở được trên thiết bị khác với thiết bị đăng ký (không phụ thuộc PKCE cookie).
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = safeNextPath(url.searchParams.get("next"));

  if (tokenHash && type && ALLOWED_TYPES.includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.code ?? "otp_expired")}`, url.origin),
    );
  }
  return NextResponse.redirect(new URL("/login?error=otp_expired", url.origin));
}
