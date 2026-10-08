import { createClient } from "@supabase/supabase-js";

import { clientEnv } from "@/lib/env.client";
import type { Database } from "@/types/database.types";

/**
 * GET /api/health — kiểm tra sống + keepalive Supabase (gói Free tạm dừng project sau 7 ngày không hoạt
 * động). Vercel Cron gọi mỗi ngày (vercel.json), thay cho GitHub Actions `keepalive.yml` khi Actions bị khóa.
 * Chỉ đọc một dòng bảng công khai bằng khóa anon; không trả dữ liệu, không cần đăng nhập.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 10;

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  const started = Date.now();
  const db = createClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const { error } = await db.from("food_categories").select("code").limit(1);
  if (error) {
    console.error("[health] db check failed", { code: error.code });
    return Response.json({ ok: false, db: false }, { status: 503, headers: NO_STORE });
  }
  return Response.json({ ok: true, db: true, ms: Date.now() - started }, { headers: NO_STORE });
}
