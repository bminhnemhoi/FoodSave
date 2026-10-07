# ADR-002: Supabase RLS-first

- **Trạng thái:** Accepted
- **Ngày:** 2026-10-07
- **Người quyết định:** Minh
- **Liên quan:** [DATA-MODEL.md §9, §10](../DATA-MODEL.md), [ARCHITECTURE.md §5](../ARCHITECTURE.md), ADR-004, `SECURITY-PRIVACY.md`

## Bối cảnh

- Bản cũ dùng Supabase nhưng coi RLS là phụ: policy cho khách đọc mọi cột (B3), bucket public (B4), chủ hồ sơ sửa được cột uy tín (B6), tổ chức chưa duyệt vẫn đọc được lô (B8), trigger chống tự nâng quyền bị tắt (B2), metadata quyết định quyền admin (B1). Backend Express dùng service role nên bỏ qua RLS hoàn toàn.
- Khóa publishable của Supabase luôn công khai trong trình duyệt; vì vậy RLS là **lớp bảo vệ duy nhất** đối với mọi request đi thẳng tới PostgREST.
- Cần: Postgres + PostGIS, auth có MFA, storage có signed URL, realtime, cron — mà không tự vận hành server. Ngân sách gần 0.

## Quyết định

1. **Supabase là nền dữ liệu và danh tính**: Postgres (PostGIS, pg_cron, pg_net, pgcrypto, Vault), Auth (email + mật khẩu, OTP email, MFA TOTP, SMTP qua Resend), Storage, Realtime. Một project mới (không dùng lại project cũ có key đã lộ).
2. **RLS-first:** RLS bật trên **100%** bảng ở schema `public`; mỗi migration `revoke all` khỏi `anon`/`authenticated` rồi grant tường minh theo ma trận (DATA-MODEL §9.2). Quyền cột dùng **whitelist** (`revoke update on table` + `grant update (cột…)`), vì revoke từng cột không có tác dụng khi còn grant mức bảng.
3. **Postgres là ranh giới bảo mật**, không phải Next.js: helper `private.is_admin()` (yêu cầu `platform_role='admin'` **và** JWT `aal='aal2'`), `private.is_org_member(org, roles[])`, `private.is_active_org_member(org, roles[])` (tổ chức `approved`), `private.can_access_site(site, roles[])`. Helper `security definer`, `stable`, `search_path=''`, đặt ở schema `private` không expose qua API.
4. **Vai trò không bao giờ lấy từ metadata**; `handle_new_user` chỉ tạo `profiles` với `platform_role='user'`. Cấp admin chỉ qua RPC `grant_platform_admin` (service role cho admin đầu tiên, sau đó admin aal2), có audit (DATA-MODEL §8.2).
5. **Truy cập công khai chỉ qua view `security_invoker = true`** (`public_org_cards`, `public_impact_stats`) và RPC tổng hợp (`public_activity_grid`) trên bảng/cột đã được thiết kế an toàn; materialized view `esg_monthly` bị revoke và chỉ đọc qua RPC kiểm quyền.
6. **Service role chỉ trong `src/server`** cho job không có người dùng (dispatch, xóa file, demo reset). Luồng của người dùng luôn dùng JWT người dùng.
7. Storage: `kyc` private (signed URL 60 s), `proofs` private (300 s), `media` public; policy theo thư mục `{org_id}/…`.
8. Mỗi bảng và mỗi RPC có **pgTAP** kiểm từng ô của ma trận RLS; hồi quy B1–B8 không bao giờ bị xóa.

## Hệ quả

**Tích cực**
- Một lỗi ở UI hoặc Server Action không làm lộ dữ liệu; kẻ tấn công gọi thẳng PostgREST cũng chỉ thấy đúng phần RLS cho phép.
- Không có backend riêng phải vận hành; Realtime tự áp RLS cho từng người nhận.
- Kiểm thử bảo mật tự động được ở tầng DB (pgTAP chạy trong CI trên Supabase local).

**Tiêu cực**
- Logic phân quyền nằm trong SQL, khó đọc hơn TypeScript; cần kỷ luật (skill `rls-audit`, agent `security-reviewer`).
- Policy viết kém có thể chậm (subquery mỗi dòng); phải dùng `(select auth.uid())`, helper `security definer`, index phù hợp.
- Quyền cột làm `select('*')` của supabase-js lỗi trên bảng có cột ẩn (`sites.location`); truy vấn phải liệt kê cột (type sinh tự động giúp việc này).
- Phụ thuộc Supabase (Auth, Storage, Realtime). Chấp nhận: Postgres chuẩn nên dữ liệu và SQL mang đi được; ARCHITECTURE §15 mô tả đường rời nếu cần.
- Gói Free tạm dừng project sau 7 ngày không hoạt động và giới hạn 2 project ⇒ keepalive hằng ngày; cân nhắc Pro vào tháng 11.

## Phương án đã cân nhắc

| Phương án | Lý do không chọn |
|---|---|
| Backend Express/Nest dùng service role, phân quyền trong code (như bản cũ) | Một lỗi code là lộ toàn bộ; đúng mô hình đã sinh B3, B8 |
| Postgres tự quản (Neon/RDS) + Prisma + Auth.js | Phải tự làm storage có signed URL, realtime, cron, MFA; nhiều việc hơn trong 6 tuần |
| Firebase | Không có PostGIS/SQL; quy tắc bảo mật khó mô hình hóa ma trận vai trò × tổ chức × điểm; khó ESG dạng báo cáo |
| AWS Amplify Gen 2 (AppSync + Cognito + DynamoDB) | Chưa có tài khoản AWS; DynamoDB không hợp truy vấn không gian và báo cáo |
