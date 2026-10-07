# ADR-011: Chưa mua domain — dùng *.vercel.app và Gmail SMTP

- **Trạng thái:** Accepted
- **Ngày:** 2026-10-07
- **Điều chỉnh:** P0-08, P0-09 trong ROADMAP; DEPLOYMENT §domain/email

## Bối cảnh

Chủ dự án quyết định chưa mua domain trong giai đoạn thi. Vẫn còn 2 vấn đề cần giải quyết:
- Email mặc định của Supabase chỉ gửi khoảng 2 thư/giờ, không đủ cho đăng ký, OTP và mời thành viên.
- Resend chỉ gửi tới email chủ tài khoản nếu không xác minh domain.

## Quyết định

- **URL:**
  - Production: `https://<project>.vercel.app`, deploy từ nhánh `release`.
  - Staging: URL Vercel cố định của nhánh `main`.
  - Preview: URL theo từng PR.
- **Email Auth (Supabase):**
  - Cấu hình **custom SMTP bằng Gmail** (`smtp.gmail.com:465`) với **App Password** của Gmail chủ dự án (Minh; cần bật xác minh 2 bước). Cập nhật 08/10: chủ dự án chọn dùng Gmail cá nhân thay vì tài khoản nhóm; người gửi hiển thị "FoodSave <SMTP_USER>", giới hạn khoảng 500 thư/ngày.
  - Template email tiếng Việt.
- **Email thông báo của ứng dụng** (outbox): `NOTIFY_PROVIDER=smtp` dùng cùng tài khoản Gmail qua `nodemailer`. Resend và SES giữ lại làm provider thay thế.
- **Local:** email được bắt tại Inbucket/Mailpit của Supabase local, không gửi thật.

## Hệ quả

- **Tích cực:** 0 đồng; triển khai ngay; đủ cho demo và pilot nhỏ (≤ 500 thư/ngày).
- **Tiêu cực:**
  - Người gửi là địa chỉ gmail.com, kém chuyên nghiệp hơn và dễ vào mục Quảng cáo hoặc Spam.
  - URL `vercel.app` dài.
  - Khi pilot lớn hoặc có tài trợ thì mua domain và chuyển sang Resend hoặc SES (đổi biến môi trường, không đổi code).

## Phương án đã cân nhắc

- **Mua domain + Resend:** chuyên nghiệp nhất, tốn khoảng 250–500 nghìn đồng/năm. Hoãn tới sau giải hoặc khi có tài trợ.
- **Tắt xác nhận email:** nhanh nhưng mở cửa cho tài khoản rác và không gửi được lời mời tình nguyện viên. Loại.
