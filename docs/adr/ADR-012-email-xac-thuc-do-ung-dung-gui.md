# ADR-012: Email xác thực do ứng dụng tự gửi (generateLink + SMTP của FoodSave)

- **Trạng thái:** Accepted
- **Ngày:** 2026-10-08
- **Liên quan:** ADR-011 (chưa có domain, dùng Gmail SMTP), ADR-002, SECURITY-PRIVACY §4 (rate limit)

## Bối cảnh

Email của Supabase Auth (xác nhận đăng ký, đặt lại mật khẩu) gặp 3 vấn đề:
1. Email mặc định của Supabase chỉ gửi khoảng 2 thư/giờ và chỉ tới thành viên team. Người dùng thật không nhận được thư.
2. Template, Site URL và danh sách redirect phải cấu hình bằng tay trên dashboard từng project. Dễ lệch giữa local, staging và prod, và không nằm trong Git.
3. Không kiểm soát được nội dung, ngôn ngữ, số lần gửi, và không test tự động được nội dung email.

## Quyết định

- **Đăng ký:**
  - Server action gọi `supabase.auth.admin.generateLink({ type: 'signup', email, password, options: { data: { full_name } } })` (service role, chỉ trong `src/server`).
  - Lệnh này tạo user chưa xác nhận và trả `hashed_token` **mà không gửi email**.
  - Ứng dụng dựng link `/auth/confirm?token_hash=…&type=<verification_type>&next=/onboarding`, rồi gửi bằng `EmailProvider` của FoodSave.
- **Quên mật khẩu:** `generateLink({ type: 'recovery', email })` → link `/auth/confirm?…&type=recovery&next=/reset-password`.
- **Email đã tồn tại khi đăng ký:**
  - Giao diện vẫn hiện cùng một thông báo, để không dò được tài khoản.
  - Hệ thống gửi thư "Bạn đã có tài khoản" kèm link đăng nhập và đặt lại mật khẩu.
- **Template:** viết bằng code (`src/server/email/templates.ts`), tiếng Việt, theo token màu thương hiệu, có bản text thuần. Kiểm tra nội dung bằng unit test.
- **Provider gửi:** `NOTIFY_PROVIDER = smtp | fake`.
  - `smtp` dùng nodemailer:
    - Local trỏ vào Mailpit của Supabase (`127.0.0.1:54325`), không gửi thật.
    - Production dùng Gmail App Password (ADR-011).
  - `fake` ghi log, dùng cho test.
- **Chống lạm dụng:** trước khi gửi, gọi `consume_rate_limit` (DATA-MODEL §15) với khóa băm HMAC của IP và email.
  - Đăng ký: 10/giờ/IP, 3/giờ/email.
  - Đặt lại mật khẩu: 10/giờ/IP, 3/giờ/email.
  - Nếu RPC lỗi hạ tầng thì cho qua (fail-open) và ghi log, để không khóa người dùng thật vì sự cố phụ.
- Supabase Auth vẫn quản lý mật khẩu, phiên, xác minh `token_hash` (`verifyOtp`) và MFA. Chỉ khâu **gửi thư** chuyển về ứng dụng.

## Hệ quả

- **Tích cực:**
  - Không phụ thuộc cấu hình dashboard; mọi môi trường cấu hình bằng biến môi trường.
  - Nội dung email nằm trong Git và có test.
  - Tự đặt hạn mức theo nhu cầu.
  - Link mở được trên thiết bị khác (token_hash).
- **Tiêu cực:**
  - Ứng dụng tự chịu trách nhiệm rate limit và độ tin cậy của SMTP.
  - Gmail giới hạn khoảng 500 thư/ngày. Khi lớn hơn thì đổi provider (Resend/SES), không đổi code gọi.

## Phương án đã cân nhắc

- **Custom SMTP trên dashboard + template dashboard:** phải thao tác tay ở mỗi project, không test được, lệch giữa các môi trường.
- **Supabase Send Email Hook:** vẫn phải cấu hình hook trên dashboard và cần endpoint công khai có ký. Phức tạp hơn mà không thêm lợi ích.
