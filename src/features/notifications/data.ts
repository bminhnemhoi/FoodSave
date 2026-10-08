import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

import {
  NOTIFICATION_COLUMNS,
  NOTIFICATION_LIMIT,
  type NotificationSnapshot,
  toNotificationItem,
} from "./model";

/**
 * Đọc/ghi thông báo bằng client CỦA NGƯỜI DÙNG (server hoặc trình duyệt) — RLS chỉ trả dòng của chính họ
 * đã tới `deliver_after`; chỉ `read_at` sửa được. Không bao giờ dùng service role ở đây.
 */

type Db = SupabaseClient<Database>;

export async function loadNotifications(db: Db, userId: string): Promise<NotificationSnapshot> {
  const [list, unread] = await Promise.all([
    db
      .from("notifications")
      .select(NOTIFICATION_COLUMNS)
      .eq("user_id", userId)
      .order("deliver_after", { ascending: false })
      .order("id", { ascending: false })
      .limit(NOTIFICATION_LIMIT),
    db
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("read_at", null),
  ]);
  if (list.error) throw new Error(`notifications_list:${list.error.code}`);
  if (unread.error) throw new Error(`notifications_unread:${unread.error.code}`);
  return { items: list.data.map(toNotificationItem), unread: unread.count ?? 0 };
}

/** Đánh dấu đã đọc (null = tất cả). Trả số dòng đổi. */
export async function markNotificationsRead(db: Db, ids: string[] | null): Promise<number> {
  const { data, error } = await db.rpc("mark_notifications_read", ids ? { p_ids: ids } : {});
  if (error) throw new Error(`notifications_mark_read:${error.code}`);
  return data;
}
