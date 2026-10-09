import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Next.js 16 Proxy (thay cho middleware): làm mới phiên Supabase trên mỗi request.
 * KHÔNG phân quyền ở đây — kiểm tra vai trò thực hiện phía server (src/server/auth) và RLS.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });

  // Bắt buộc gọi getUser() để xác thực và làm mới token (không dùng getSession()).
  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: [
    // Bỏ qua static, ảnh, file PWA, API job (tự xác thực bằng HMAC) và các trang công khai không cần phiên
    // (trang chủ tĩnh qua CDN — `$` = đường dẫn "/" — số tác động, pháp lý, nguồn ảnh, offline): mỗi lần
    // proxy chạy là một vòng getUser() tới Supabase trước khi trả trang.
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|api/jobs|api/health|api/public-impact|terms|privacy|credits|offline|$|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
