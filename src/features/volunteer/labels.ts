import type { Database } from "@/types/database.types";

/**
 * Nhãn tiếng Việt cho màn tình nguyện viên (PRD US-VOL-*; DATA-MODEL §1 enum, §6.5). Một nguồn duy nhất —
 * không tự viết lại nhãn trong component.
 */

type Enums = Database["public"]["Enums"];
export type VehicleType = Enums["vehicle_type"];
export type IncidentKind = Enums["incident_kind"];

export const VEHICLE_LABEL: Record<VehicleType, string> = {
  motorbike: "Xe máy",
  bicycle: "Xe đạp",
  car: "Ô tô",
  on_foot: "Đi bộ",
};

export const VEHICLE_ORDER: readonly VehicleType[] = ["motorbike", "bicycle", "car", "on_foot"];

/** Loại sự cố TNV hay gặp trong chuyến (US-VOL-13), mô tả ngắn để chọn nhanh ngoài đường. */
export const INCIDENT_KIND_LABEL: Record<IncidentKind, { label: string; hint: string }> = {
  no_show: {
    label: "Cửa hàng không giao được",
    hint: "Đóng cửa, không có người, hoặc không còn hàng.",
  },
  quantity_dispute: { label: "Sai số lượng", hint: "Số hàng thực tế khác số đã đặt." },
  quality: { label: "Hàng không đạt chất lượng", hint: "Hỏng, dập, có mùi lạ…" },
  food_safety: { label: "An toàn thực phẩm", hint: "Nghi ngờ hàng không an toàn để ăn." },
  conduct: { label: "Thái độ, ứng xử", hint: "Bị đối xử không phù hợp." },
  privacy: { label: "Quyền riêng tư", hint: "Bị chụp ảnh, hỏi thông tin cá nhân không cần thiết." },
  other: { label: "Khác", hint: "Xe hỏng, tai nạn nhỏ, trời mưa lớn…" },
};

export const INCIDENT_KIND_ORDER: readonly IncidentKind[] = [
  "no_show",
  "quantity_dispute",
  "quality",
  "food_safety",
  "conduct",
  "privacy",
  "other",
];

/** Lý do nhanh khi từ chối chuyến (respond_pickup false — lý do ≤ 300 ký tự, chỉ ghi nhật ký). */
export const DECLINE_REASONS = [
  "Bận việc đột xuất",
  "Không đủ sức chở",
  "Phương tiện gặp sự cố",
  "Ở quá xa điểm lấy hàng",
] as const;

/** Lý do khi check-in ngoài 100 m (US-VOL-06 AC2). */
export const OUTSIDE_FENCE_REASONS = ["GPS không chính xác", "Cửa hàng đổi lối vào"] as const;

/** Lý do khi không lấy được vị trí (US-VOL-06 AC3). */
export const NO_LOCATION_REASONS = [
  "Điện thoại không bật được định vị",
  "Đã tắt quyền vị trí cho FoodSave",
] as const;

/** Lý do khi bỏ qua một điểm lấy hàng (skip_stop — lý do ≤ 300 ký tự). */
export const SKIP_REASONS = [
  "Cửa hàng đóng cửa",
  "Không liên lạc được cửa hàng",
  "Cửa hàng không còn hàng",
  "Không kịp khung giờ lấy",
] as const;

/** Chữ "Khác" trong mọi danh sách lý do (mở ô ghi rõ). */
export const OTHER_REASON = "Khác";
