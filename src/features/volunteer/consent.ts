import { POLICY_VERSION } from "@/lib/legal";

/**
 * Đồng ý chia sẻ vị trí trong chuyến — `consents.purpose = location_trip` (SECURITY-PRIVACY §6, PRD US-VOL-02).
 * Văn bản hiển thị là đầu vào của `text_hash`: server băm đúng chuỗi này nên bản ghi luôn khớp chữ người dùng
 * đã đọc. Đổi chữ ⇒ hash đổi ⇒ `grant_consent` ghi bản mới (bản cũ tự đóng).
 */

export const LOCATION_CONSENT_TITLE = "Chia sẻ vị trí khi chuyến đang chạy";

export const LOCATION_CONSENT_POINTS = [
  "Dùng để: tự cập nhật giờ dự kiến tới (ETA) cho điều phối viên và cửa hàng, và hỗ trợ check-in tại điểm dừng.",
  "Chỉ gửi khi chuyến đang chạy và màn hình chuyến đang mở — tắt màn hình hoặc rời trang là ngừng gửi.",
  "Vị trí được làm tròn khoảng 11 m, tối đa một lần mỗi 30 giây. FoodSave chỉ giữ điểm mới nhất, không lưu lịch sử, và xóa khi chuyến kết thúc.",
  "Ai xem được: điều phối viên của tổ chức bạn. Cửa hàng chỉ thấy giờ dự kiến tới, không thấy vị trí.",
  "Bạn có thể dừng hoặc rút lại đồng ý bất cứ lúc nào trong chuyến hoặc ở mục Tài khoản. Không đồng ý thì vẫn chạy chuyến bình thường bằng check-in.",
] as const;

/** Toàn bộ chữ người dùng đọc (đầu vào `text_hash`). */
export function locationConsentText(): string {
  return [`${LOCATION_CONSENT_TITLE} (phiên bản ${POLICY_VERSION})`, ...LOCATION_CONSENT_POINTS].join("\n");
}

export { POLICY_VERSION as LOCATION_POLICY_VERSION };

/** Khóa nhớ trên máy: người dùng đã chọn "Không, chỉ dùng check-in" (chỉ là lựa chọn giao diện, không phải vị trí). */
export const LOCATION_PROMPT_DECLINED_KEY = "foodsave.volunteer.locationPrompt";

export type LocationConsent = {
  /** Đang có hiệu lực (chưa rút). */
  active: boolean;
  grantedAt: string | null;
  withdrawnAt: string | null;
  policyVersion: string | null;
  /** Đã từng trả lời (có bản ghi, kể cả đã rút) ⇒ không hỏi lại khi bắt đầu chuyến. */
  everAnswered: boolean;
};
