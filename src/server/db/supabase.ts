import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { clientEnv } from "@/lib/env.client";
import { serverEnv } from "@/server/env";
import type { Database } from "@/types/database.types";

/**
 * Supabase client cho Server Component / Server Action / Route Handler,
 * chạy dưới quyền NGƯỜI DÙNG đang đăng nhập (RLS áp dụng). Dùng mặc định.
 */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
          } catch {
            // Gọi từ Server Component (không ghi được cookie) — proxy.ts đã làm mới phiên.
          }
        },
      },
    },
  );
}

/**
 * Client SERVICE ROLE — bỏ qua RLS. Chỉ dùng cho job hệ thống (src/server/jobs),
 * script seed và thao tác quản trị đã kiểm tra quyền ở tầng trên. Không bao giờ trả về client.
 */
export function createServiceClient() {
  return createSupabaseClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
