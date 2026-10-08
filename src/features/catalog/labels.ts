import type { Database } from "@/types/database.types";

/**
 * Nhãn tiếng Việt cho enum vòng lõi P2 (DATA-MODEL §3, §6) và định dạng số lượng theo đơn vị.
 * Một nguồn duy nhất cho mọi cổng — không tự viết lại nhãn trong component.
 */

type Enums = Database["public"]["Enums"];
export type UnitCode = Enums["unit_code"];
export type OfferStatus = Enums["offer_status"];
export type AllocationStatus = Enums["allocation_status"];
export type PickupStatus = Enums["pickup_status"];

export const UNIT_LABEL: Record<UnitCode, string> = {
  piece: "cái",
  loaf: "ổ",
  box: "hộp",
  portion: "suất",
  bottle: "chai",
  bag: "túi",
  kg: "kg",
  liter: "lít",
};

/** Đơn vị đo liên tục (cho phép số lẻ); các đơn vị còn lại phải là số nguyên (DATA-MODEL §3.3). */
export const CONTINUOUS_UNITS: ReadonlySet<UnitCode> = new Set<UnitCode>(["kg", "liter"]);

export const OFFER_STATUS_LABEL: Record<OfferStatus, string> = {
  draft: "Nháp",
  open: "Đang mở",
  fully_allocated: "Đã được giữ hết",
  completed: "Hoàn tất",
  expired: "Hết hạn",
  cancelled: "Đã hủy",
};

export const ALLOCATION_STATUS_LABEL: Record<AllocationStatus, string> = {
  requested: "Chờ cửa hàng xác nhận",
  confirmed: "Đã xác nhận",
  assigned: "Đã lên chuyến",
  picked_up: "Đã lấy hàng",
  delivered: "Đã giao",
  cancelled: "Đã hủy",
  rejected: "Bị từ chối",
  expired: "Hết hạn giữ chỗ",
};

export const PICKUP_STATUS_LABEL: Record<PickupStatus, string> = {
  planned: "Đã lên kế hoạch",
  assigned: "Đã phân công",
  in_progress: "Đang thực hiện",
  completed: "Hoàn tất",
  cancelled: "Đã hủy",
};

const qtyFormat = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 3 });
const kgFormat = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });

/** "12 ổ", "2,5 kg". */
export function formatQty(qty: number, unit: UnitCode): string {
  if (!Number.isFinite(qty)) return "—";
  return `${qtyFormat.format(qty)} ${UNIT_LABEL[unit]}`;
}

/** Khối lượng: "1,4 kg"; dưới 1 kg vẫn dùng kg một chữ số thập phân ("0,5 kg"). */
export function formatKg(kg: number): string {
  if (!Number.isFinite(kg)) return "—";
  return `${kgFormat.format(kg)} kg`;
}
