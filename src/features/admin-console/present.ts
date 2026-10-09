import type { Database } from "@/types/database.types";

/** Trình bày phân bổ & chuyến cho Admin (US-ADM-07) — thuần, có unit test. */

type PickupMode = Database["public"]["Enums"]["pickup_mode"];

export const PICKUP_MODE_LABEL: Record<PickupMode, string> = {
  self: "Tự đến lấy",
  volunteer: "Tình nguyện viên",
};

/** `allocations.cancel_actor` (DATA-MODEL §2.3, ma trận hủy §7). */
export const CANCEL_ACTOR_LABEL: Record<string, string> = {
  charity: "Tổ chức",
  store: "Cửa hàng",
  admin: "Admin",
  system: "Hệ thống",
};

/** Thời gian đã chờ: "dưới 1 phút", "45 phút", "2 giờ 05 phút", "3 ngày 4 giờ". */
export function formatWaiting(ms: number): string {
  if (!Number.isFinite(ms) || ms < 60_000) return "dưới 1 phút";
  const totalMin = Math.floor(ms / 60_000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const minutes = totalMin % 60;
  if (days > 0) return `${days} ngày${hours ? ` ${hours} giờ` : ""}`;
  if (hours > 0) return `${hours} giờ ${String(minutes).padStart(2, "0")} phút`;
  return `${minutes} phút`;
}
