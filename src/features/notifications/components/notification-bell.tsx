"use client";

import { useEffect, useMemo, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";

import { NotificationCenter } from "./notification-center";

/**
 * Chuông thông báo trong topbar của mọi cổng. Chỉ chạy phía client: app shell được cả client component
 * import (SkipLink) nên không được kéo module server vào. Id người dùng lấy từ phiên trong trình duyệt —
 * chỉ để lọc kênh Realtime/truy vấn; quyền đọc do RLS quyết định.
 */
export function NotificationBell() {
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setUserId(data.session?.user.id ?? null);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setUserId(session?.user.id ?? null);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [supabase]);

  if (userId === undefined) return <Skeleton aria-hidden className="size-11 rounded-full" />;
  if (userId === null) return null;
  return <NotificationCenter key={userId} userId={userId} />;
}
