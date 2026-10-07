---
name: ui-screen
description: Thiết kế và dựng một màn hình hoặc component giao diện FoodSave đạt chuẩn chuyên nghiệp (design system, responsive, a11y, đủ trạng thái loading/empty/error, bản đồ, tiếng Việt) và xác minh bằng screenshot. Dùng cho mọi trang mới, mọi chỉnh sửa giao diện lớn, landing, dashboard, bản đồ.
---

# ui-screen — màn hình đẹp, đúng chuẩn, được xác minh

## 1. Chuẩn bị

- Đọc `docs/DESIGN-SYSTEM.md` (token, component, pattern, văn phong) và user story trong `docs/PRD.md`.
- Có plugin thì dùng:
  - **frontend-design**: định hướng bố cục có cá tính, tránh giao diện "AI generic"
  - **UI UX Pro Max**: tra pattern, biểu đồ, anti-pattern cho loại màn hình (`search.py "<loại màn hình>"`); file `design-system/foodsave/pages/<trang>.md` nếu có
  - **web-design-guidelines** (Vercel): rà theo quy tắc a11y, form, animation
- Khi có xung đột, **DESIGN-SYSTEM.md luôn thắng**.

## 2. Dựng

- Dùng component shadcn/ui trong `src/components/ui` và component dùng chung (`FreshnessBadge`, `CountdownTimer`, `MapView`, `EmptyState`, `KpiTile`…). Không tạo bản trùng.
- Chỉ dùng token màu, khoảng cách, bo góc; **không hardcode hex**. Nhãn Xanh/Vàng/Đỏ luôn có icon + chữ.
- Server Component mặc định. Chỉ thêm `"use client"` cho phần tương tác.
- Bản đồ: `dynamic(() => import(...), { ssr: false })`, có skeleton, có danh sách thay thế cho người dùng bàn phím hoặc trình đọc màn hình.
- **Bắt buộc đủ 3 trạng thái:** loading (skeleton đúng hình), empty (minh họa + câu hướng dẫn + CTA), error (thông báo dễ hiểu + thử lại).
- **Văn bản tiếng Việt** theo văn phong trong DESIGN-SYSTEM:
  - số và đơn vị định dạng `vi-VN`
  - giờ theo `Asia/Ho_Chi_Minh`
  - không để lọt chữ tiếng Anh như "Submit" hay "Loading…"
- Responsive từ 360 px. Mobile: bottom tab bar, vùng chạm ≥ 44 px.

## 3. Xác minh (không bỏ qua)

1. Chạy `pnpm dev`. Dùng Playwright MCP, hoặc `tests/e2e`, chụp screenshot ở **390×844** và **1440×900**, trạng thái có dữ liệu và trạng thái rỗng.
2. Tự xem screenshot. Kiểm tra căn lề, độ tương phản, chữ tràn, dấu tiếng Việt, khoảng trắng.
3. Chạy axe (`@axe-core/playwright`). Không được có vi phạm `serious`/`critical`.
4. Kiểm tra bàn phím: Tab qua toàn trang, focus nhìn thấy được, dialog bẫy focus đúng.
5. Với màn quan trọng (landing, kho tặng, bàn giao QR, ESG), gọi agent **ux-reviewer** kèm screenshot.

## 4. Đầu ra

- Màn hình chạy được; screenshot lưu ở `tests/e2e/__screenshots__/` (nếu là visual test).
- Báo cho Minh: route, ảnh chụp, các trạng thái đã kiểm, vấn đề còn lại.
