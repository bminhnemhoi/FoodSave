import type { Database } from "@/types/database.types";

/**
 * Trung tâm thông báo (P2-15, F-55, DESIGN-SYSTEM §10.1): kiểu dữ liệu và hàm thuần dùng chung server
 * (nạp lần đầu) và client (Realtime, đánh dấu đã đọc). Không IO.
 */

export type NotificationEvent = Database["public"]["Enums"]["notification_event"];
type Row = Database["public"]["Tables"]["notifications"]["Row"];
export type NotificationRow = Pick<
  Row,
  "id" | "event" | "title" | "body" | "link_path" | "urgency" | "read_at" | "deliver_after"
>;

export type NotificationItem = {
  id: string;
  event: NotificationEvent;
  title: string;
  body: string;
  /** Đường dẫn nội bộ đã kiểm tra (null nếu không có hoặc không an toàn). */
  href: string | null;
  urgent: boolean;
  read: boolean;
  /** Thời điểm thông báo tới người nhận (deliver_after — đợt công bằng). */
  at: string;
};

export type NotificationSnapshot = { items: NotificationItem[]; unread: number };

/** Liệt kê cột tường minh (không select('*')). */
export const NOTIFICATION_COLUMNS = "id, event, title, body, link_path, urgency, read_at, deliver_after";
export const NOTIFICATION_LIMIT = 20;

/** Chỉ nhận đường dẫn nội bộ "/…" (không "//host", không giao thức, không khoảng trắng/gạch ngược). */
export function safeLinkPath(path: string | null | undefined): string | null {
  if (!path || path.length > 300) return null;
  return /^\/(?!\/)[^\s\\]*$/.test(path) ? path : null;
}

export function toNotificationItem(row: NotificationRow): NotificationItem {
  return {
    id: row.id,
    event: row.event,
    title: row.title,
    body: row.body ?? "",
    href: safeLinkPath(row.link_path),
    urgent: row.urgency === "urgent",
    read: row.read_at !== null,
    at: row.deliver_after,
  };
}

/** Gộp mục mới vào danh sách: bỏ trùng theo id (bản mới thắng), mới nhất trước, tối đa `limit`. */
export function mergeNotifications(
  current: NotificationItem[],
  incoming: NotificationItem[],
  limit = NOTIFICATION_LIMIT,
): NotificationItem[] {
  const byId = new Map(current.map((i) => [i.id, i]));
  for (const item of incoming) byId.set(item.id, item);
  return [...byId.values()]
    .sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id))
    .slice(0, limit);
}

/** Nhãn chuông cho trình đọc màn hình: "Thông báo, 3 chưa đọc". */
export function bellLabel(unread: number): string {
  return unread > 0 ? `Thông báo, ${unread} chưa đọc` : "Thông báo";
}

/** Số trên huy hiệu: 1–99, quá thì "99+". */
export function badgeText(unread: number): string {
  return unread > 99 ? "99+" : String(unread);
}

const vnDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });

export type NotificationGroup = {
  key: "urgent" | "today" | "yesterday" | "earlier";
  label: string;
  items: NotificationItem[];
};

/**
 * Nhóm hiển thị (DESIGN-SYSTEM §10.1): "GẤP" (GẤP chưa đọc) lên đầu, rồi "Hôm nay", "Hôm qua",
 * "Trước đó" theo ngày giờ Việt Nam. Nhóm rỗng bị bỏ.
 */
export function groupNotifications(items: NotificationItem[], now: Date = new Date()): NotificationGroup[] {
  const today = vnDay.format(now);
  const yesterday = vnDay.format(new Date(now.getTime() - 86_400_000));
  const groups: NotificationGroup[] = [
    { key: "urgent", label: "GẤP", items: [] },
    { key: "today", label: "Hôm nay", items: [] },
    { key: "yesterday", label: "Hôm qua", items: [] },
    { key: "earlier", label: "Trước đó", items: [] },
  ];
  for (const item of items) {
    if (item.urgent && !item.read) {
      groups[0]!.items.push(item);
      continue;
    }
    const day = vnDay.format(new Date(item.at));
    groups[day === today ? 1 : day === yesterday ? 2 : 3]!.items.push(item);
  }
  return groups.filter((g) => g.items.length > 0);
}

export type IconKind =
  | "offer"
  | "request"
  | "confirmed"
  | "rejected"
  | "expired"
  | "cancelled"
  | "packed"
  | "trip"
  | "delivered"
  | "need"
  | "org"
  | "warning"
  | "other";

/** Nhóm icon theo loại sự kiện. */
export function iconKind(event: NotificationEvent): IconKind {
  switch (event) {
    case "offer_published":
    case "offer_turned_red":
    case "offer_expired":
      return "offer";
    case "allocation_requested":
      return "request";
    case "allocation_confirmed":
      return "confirmed";
    case "allocation_rejected":
      return "rejected";
    case "allocation_expired":
      return "expired";
    case "allocation_cancelled":
    case "pickup_cancelled":
      return "cancelled";
    case "allocation_packed":
      return "packed";
    case "pickup_assigned":
    case "pickup_started":
    case "pickup_handover_done":
      return "trip";
    case "delivery_completed":
      return "delivered";
    case "need_closed":
    case "bundle_confirmed":
    case "bundle_shortfall":
      return "need";
    case "org_submitted":
    case "org_reviewed":
    case "org_change_submitted":
    case "org_change_reviewed":
    case "org_reinstated":
      return "org";
    case "org_suspended":
      return "warning";
    default:
      return "other";
  }
}
