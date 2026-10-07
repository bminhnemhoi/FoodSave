# ADR-013: PWA dùng service worker tự viết (không Serwist)

- **Trạng thái:** Accepted
- **Ngày:** 2026-10-08
- **Liên quan:** ROADMAP P0-19 (spike), P5 (PWA tình nguyện viên, Web Push), SECURITY-PRIVACY

## Bối cảnh

- PWA cho tình nguyện viên cần 4 thứ: cài đặt lên màn hình chính, thông báo đẩy (Web Push), trang dự phòng khi mất mạng, và sau này hàng đợi thao tác offline (thuộc danh sách cắt C1).
- Next.js 16 build bằng Turbopack mặc định. Plugin webpack của Serwist không dùng được với Turbopack; muốn dùng phải theo một tích hợp riêng.
- Hướng dẫn PWA chính thức của Next 16 (`node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md`) dùng `app/manifest.ts` cùng một service worker tự viết cho push.

## Quyết định

- Dùng `src/app/manifest.ts` (start_url `/volunteer`, icon 192/512 + maskable) và **`public/sw.js` tự viết**:
  - Precache trang `/offline` cùng icon. Điều hướng lỗi mạng thì trả `/offline`.
  - **Không cache API, auth hay dữ liệu cá nhân** (máy dùng chung, quyền riêng tư).
  - Xử lý `push` và `notificationclick`. URL đích chỉ chấp nhận đường dẫn nội bộ bắt đầu bằng `/`.
- Đăng ký service worker ở production qua `ServiceWorkerRegister` (client component trong root layout).
- Header bảo mật trong `next.config.ts`: `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` (geolocation/camera chỉ self), HSTS. Riêng `sw.js` có `no-store` và CSP `script-src 'self'`.
- Nếu ở P5 cần hàng đợi offline phức tạp hơn thì đánh giá lại Serwist (bản tích hợp Turbopack).

## Hệ quả

- **Tích cực:** không phụ thuộc thư viện ngoài, dễ đọc, an toàn, cài đặt được ngay; Web Push sẵn khung.
- **Tiêu cực:** phải tự viết chiến lược cache. Hiện cố ý tối giản, chỉ có trang offline.

## Kiểm chứng (spike)

E2E `tests/e2e/public/pwa.spec.ts`:
- `/manifest.webmanifest` hợp lệ.
- Service worker đăng ký và `activated` trên bản build production.
- Mất mạng thì điều hướng hiển thị "Bạn đang ngoại tuyến".
