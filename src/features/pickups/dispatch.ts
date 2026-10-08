/**
 * Hằng số và nhãn cho thao tác điều phối chuyến (thuần, dùng chung client/server — PRD US-CHA-18, US-CHA-22,
 * US-CHA-23, US-CHA-38; DATA-MODEL §7 C5/C6/C10). Lời văn theo góc nhìn điều phối viên.
 */

export const INCIDENT_KINDS = [
  "no_show",
  "quantity_dispute",
  "quality",
  "food_safety",
  "conduct",
  "other",
] as const;
export type CoordinatorIncidentKind = (typeof INCIDENT_KINDS)[number];

export const INCIDENT_KIND_TEXT: Record<CoordinatorIncidentKind, { label: string; hint: string }> = {
  no_show: {
    label: "Không đến / không giao được",
    hint: "Tình nguyện viên hoặc cửa hàng không có mặt như hẹn.",
  },
  quantity_dispute: { label: "Sai số lượng", hint: "Số hàng thực tế khác số đã đặt hoặc đã lấy." },
  quality: { label: "Hàng không đạt chất lượng", hint: "Hỏng, dập, có mùi lạ…" },
  food_safety: {
    label: "An toàn thực phẩm",
    hint: "Nghi ngờ hàng không an toàn để ăn — FoodSave xử lý gấp.",
  },
  conduct: { label: "Thái độ, ứng xử", hint: "Ứng xử không phù hợp trong chuyến." },
  other: { label: "Khác", hint: "Tai nạn nhỏ, xe hỏng, thời tiết…" },
};

/** Lý do nhanh khi hủy chuyến (C5) — lưu nguyên văn vào `pickups.cancel_reason`. */
export const CANCEL_REASONS = [
  "Tình nguyện viên không đến",
  "Không liên lạc được tình nguyện viên",
  "Tổ chức tự đến lấy thay",
  "Không còn nhu cầu nhận",
] as const;

/** Lý do nhanh khi bỏ qua một điểm lấy hàng (C6). */
export const SKIP_REASONS = [
  "Cửa hàng đóng cửa",
  "Không liên lạc được cửa hàng",
  "Không kịp khung giờ lấy",
  "Tình nguyện viên không đủ sức chở",
] as const;

export const OTHER_REASON = "Khác";
