/**
 * Phiên bản chính sách hiện hành (SECURITY-PRIVACY §6, §11; app_settings.terms_policy_version /
 * privacy_policy_version). Đổi nội dung Điều khoản hoặc Chính sách ⇒ tăng phiên bản cùng migration + seed
 * (`supabase/migrations/20261009120300_policy_v2.sql`, `supabase/seed/00_reference.sql`).
 */
export const POLICY_VERSION = "2026-10-v2";

/** Ngày có hiệu lực hiển thị trên trang pháp lý (dd/mm/yyyy) = ngày công bố bản 2026-10-v2. */
export const POLICY_EFFECTIVE_DATE = "09/10/2026";

/** Bên kiểm soát dữ liệu giai đoạn thi: nhóm dự án chưa có pháp nhân (SECURITY-PRIVACY §4.3). */
export const DATA_CONTROLLER = "Nhóm dự án FoodSave";

/**
 * Điểm thay đổi của phiên bản hiện hành so với bản trước — hiện ở `/privacy#thay-doi` và trong banner đồng ý lại.
 * Banner băm đúng chữ này (cùng tiêu đề) làm `text_hash` của đồng ý `terms`.
 */
export const POLICY_CHANGES: readonly string[] = [
  "Hotline của cửa hàng/tổ chức (không bắt buộc) hiển thị cho các cửa hàng, tổ chức đã được duyệt và tình nguyện viên đang chạy chuyến qua đó.",
  "Tình nguyện viên có thể tự bật “Cho phép cửa hàng và điều phối viên gọi tôi khi chuyến đang chạy” (mặc định tắt); mỗi lần xem số đều được ghi nhật ký.",
  "Người đại diện khai số CCCD (12 số) — FoodSave không thu ảnh CCCD; số đầy đủ chỉ quản trị viên xem được và được xóa 30 ngày sau khi tổ chức ngừng hoạt động.",
  "Bổ sung OpenAI vào danh sách bên xử lý dữ liệu (chỉ nhận ảnh thực phẩm khi bạn dùng “Chụp ảnh để điền nhanh”).",
];
