/** Ánh xạ lỗi Supabase Auth → câu tiếng Việt dễ hiểu (không lộ việc email có tồn tại hay không). */
export function authErrorMessage(code: string | undefined, fallback?: string): string {
  switch (code) {
    case "invalid_credentials":
      return "Email hoặc mật khẩu không đúng.";
    case "email_not_confirmed":
      return "Bạn chưa xác nhận email. Hãy mở hộp thư và bấm vào liên kết xác nhận.";
    case "user_already_exists":
    case "email_exists":
      return "Nếu email này chưa đăng ký, bạn sẽ nhận được thư xác nhận trong vài phút.";
    case "weak_password":
      return "Mật khẩu quá yếu. Dùng ít nhất 8 ký tự gồm cả chữ và số.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.";
    case "same_password":
      return "Mật khẩu mới phải khác mật khẩu cũ.";
    case "otp_expired":
      return "Liên kết đã hết hạn. Vui lòng yêu cầu gửi lại.";
    default:
      return fallback ?? "Đã có lỗi xảy ra. Vui lòng thử lại.";
  }
}
