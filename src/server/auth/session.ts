import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { createClient } from "@/server/db/supabase";

/** Người dùng đã xác thực (getUser() xác minh token với Auth server — không tin cookie suông). */
export const getUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
});

/** Bắt buộc đăng nhập; chưa đăng nhập thì chuyển tới /login kèm đường quay lại. */
export async function requireUser(nextPath: string) {
  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return user;
}
