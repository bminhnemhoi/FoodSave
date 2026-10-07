/** Mã lỗi Supabase Auth (MFA) → câu tiếng Việt, thân thiện với giới hạn tốc độ (F-62). */
export function mfaErrorMessage(code: string | undefined | null): string {
  switch (code) {
    case "mfa_verification_failed":
    case "mfa_verification_rejected":
      return "Mã chưa đúng hoặc đã hết hạn. Hãy nhập mã mới đang hiển thị trong ứng dụng xác thực.";
    case "mfa_challenge_expired":
      return "Phiên nhập mã đã hết hạn. Hãy nhập mã mới đang hiển thị trong ứng dụng.";
    case "over_request_rate_limit":
      return "Bạn đã thử quá nhiều lần. Vui lòng đợi khoảng 5 phút rồi thử lại.";
    case "mfa_factor_not_found":
      return "Không tìm thấy thiết lập xác thực. Tải lại trang để bắt đầu lại.";
    case "too_many_enrolled_mfa_factors":
      return "Tài khoản có quá nhiều thiết lập chưa hoàn tất. Tải lại trang để thử lại hoặc liên hệ người phụ trách kỹ thuật.";
    case "mfa_totp_enroll_not_enabled":
    case "mfa_totp_verify_not_enabled":
      return "Xác thực hai lớp đang tắt trên máy chủ. Hãy báo người phụ trách kỹ thuật.";
    case "session_not_found":
    case "session_expired":
    case "not_authenticated":
      return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
    case "not_admin":
      return "Tài khoản này không có quyền quản trị.";
    default:
      return "Chưa xác thực được. Vui lòng thử lại; nếu vẫn lỗi, báo người phụ trách kỹ thuật.";
  }
}
