import { NextResponse, type NextRequest } from "next/server";

import { safeNextPath } from "@/features/auth/schemas";
import { createClient } from "@/server/db/supabase";

/** Đích của liên kết trong email (xác nhận đăng ký, đặt lại mật khẩu, lời mời) — luồng PKCE. */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const next = safeNextPath(url.searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  const errorCode = url.searchParams.get("error_code") ?? "otp_expired";
  return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(errorCode)}`, url.origin));
}
