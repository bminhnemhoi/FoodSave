/** Lý do từ chối yêu cầu nhận lô (US-STO-13 AC3) — dùng chung hộp thoại và server action. */

export const REQUEST_REASON_MAX = 500;

export const REJECT_REASONS = [
  "Hàng không còn đủ số lượng",
  "Hàng không còn đảm bảo chất lượng",
  "Cửa hàng không có người bàn giao trong khung giờ lấy",
  "Đã hẹn tặng lô này cho tổ chức khác",
] as const;

/** Hoàn tác "Đã đóng gói" được trong 2 phút (DATA-MODEL §6.4). */
export const PACK_UNDO_MS = 2 * 60 * 1000;
