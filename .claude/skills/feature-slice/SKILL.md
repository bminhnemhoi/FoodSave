---
name: feature-slice
description: Xây một tính năng FoodSave trọn vẹn theo lát dọc (schema → DB/RPC → server action/query → UI → test → docs) cho một task trong docs/ROADMAP.md hoặc user story trong docs/PRD.md. Dùng khi bắt đầu một task tính năng mới.
---

# feature-slice — dựng tính năng theo lát dọc

## 0. Xác định phạm vi

- Lấy task ID trong `docs/ROADMAP.md` (ví dụ `P2-07`) và các user story `US-…` tương ứng trong `docs/PRD.md`.
- Liệt kê acceptance criteria thành checklist. **Không làm ngoài phạm vi.** Ý tưởng thêm thì ghi vào phần ghi chú của ROADMAP.
- Áp dụng tinh thần ponytail:
  - có sẵn trong code, thư viện đã cài, hoặc tính năng native thì dùng lại
  - viết tối thiểu nhưng đủ validation, lỗi, a11y và các trạng thái UI

## 1. Dữ liệu

- Cần bảng/cột mới → skill `new-migration`.
- Cần chuyển trạng thái → skill `state-transition`.
- Logic thuần (nhãn, ghép, tuyến, tác động) đặt trong `src/core/<module>`, kèm unit test và property test (fast-check).

## 2. Server

Cấu trúc `src/features/<domain>/`:

```
schemas.ts    # zod: input form + output, dùng chung client/server
queries.ts    # đọc dữ liệu (RSC), client Supabase theo người dùng
actions.ts    # 'use server' — validate → rpc → map lỗi → `updateTag()` (Next 16)
errors.ts     # mã lỗi RPC → câu tiếng Việt
components/   # UI riêng của domain
```

- Gọi provider bên ngoài (bản đồ, AI, email) **chỉ qua** `src/server/providers/*`. Tuyệt đối không fetch thẳng API Goong hay Anthropic trong feature.
- Không dùng service role trừ job hệ thống trong `src/server/jobs`.

## 3. UI

- Dùng skill `ui-screen` cho mỗi màn hình mới.
- Form dùng react-hook-form + zod: thông báo lỗi tiếng Việt, disable khi đang gửi, `client_op_id` cố định cho mỗi lần mở form.
- Dữ liệu realtime: subscribe đúng kênh và hủy khi unmount.

## 4. Test

- Unit/property test (`pnpm test`) cho logic `core/`.
- pgTAP cho RPC/policy mới (`pnpm db:test`).
- E2E Playwright cho luồng người dùng chính trong `tests/e2e/<role>/<feature>.spec.ts`. Dùng fixture đăng nhập theo vai trò và seed tương đối.

## 5. Hoàn tất

- Chạy `pnpm typecheck && pnpm lint && pnpm test`, cộng `pnpm db:test` và `pnpm test:e2e` nếu liên quan.
- Đánh dấu task trong `docs/ROADMAP.md`; cập nhật PRD/DATA-MODEL nếu có thay đổi.
- Tóm tắt cho Minh bằng tiếng Việt: đã làm gì, cách thử (đường dẫn, tài khoản demo), test nào chạy, còn gì chưa làm.
