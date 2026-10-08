---
name: seed-demo
description: Tạo hoặc cập nhật dữ liệu demo FoodSave (cửa hàng, tổ chức, tình nguyện viên, lô hàng đủ nhãn Xanh/Vàng/Đỏ, nhu cầu, lịch sử 90 ngày cho biểu đồ ESG, tài khoản giám khảo) theo thời gian tương đối để không bao giờ hết hạn vào ngày demo. Dùng khi cần dữ liệu cho dev, E2E, demo hoặc chung kết.
---

# seed-demo — dữ liệu demo luôn "tươi"

## Nguyên tắc

- **Thời gian tương đối:** mọi mốc viết dạng `now() + interval '...'`, không bao giờ ghi ngày cố định. Seed chạy hôm nào thì lô vẫn đúng nhãn hôm đó.
- **Tên hư cấu**, địa chỉ là địa điểm thật ở TP.HCM nhưng không dùng thương hiệu thật. Ví dụ: "Tiệm bánh Mầm Xanh", "Bếp ăn Tình Thương". Địa chỉ ghi theo phường mới (không dùng "Quận").
- Mọi tổ chức demo có `is_demo = true`, để `demo-reset` chỉ đụng vào chúng.
- **Lịch sử 90 ngày được sinh bằng cách gọi RPC thật** (reserve → confirm → handover pickup/dropoff → submit_proof → review), không INSERT thẳng vào bảng trạng thái. Dữ liệu vì thế tuân theo đúng invariant, ledger và audit.
- Không có dữ liệu cá nhân thật. CCCD demo dùng 4 số cuối dạng `0000`–`9999` hư cấu.

## Bộ dữ liệu chuẩn

| Thực thể | Số lượng | Ghi chú |
|---|---|---|
| Cửa hàng | 12 | Cụm 3–5 phường lân cận ở trung tâm TP.HCM (địa chỉ theo đơn vị hành chính 2 cấp từ 01/7/2025: phường → TP.HCM, không còn quận); có tiệm bánh, nhà hàng, cửa hàng tiện lợi, siêu thị mini; giờ đóng cửa khác nhau |
| Tổ chức | 6 | mái ấm, bếp ăn, viện dưỡng lão…; bán kính 3–10 km; 1 điểm `visibility = approximate` |
| Tình nguyện viên | 10 | xe máy/xe đạp; có/không consent vị trí |
| Lô đang mở | ~25 | đủ 3 nhãn + vài lô sắp chuyển Đỏ trong 30–60 phút (để demo đếm ngược) |
| Nhu cầu mở | 4 | gồm kịch bản **"50 bánh"** cần ghép 3 cửa hàng (20 + 18 + 12) |
| Lịch sử | 90 ngày | khoảng 150 lần bàn giao, minh chứng đủ trạng thái, vài phản ánh, để biểu đồ ESG có xu hướng |
| Tài khoản | theo vai trò | đuôi `@foodsave.test` (không nhận được thư): giám khảo `giamkhao.cuahang`, `giamkhao.tochuc`, `giamkhao.tnv`; nhóm `demo.store`, `demo.charity`, `demo.charity2`, `demo.volunteer`, `demo.volunteer2`. **Không** có admin demo. Mật khẩu qua `DEMO_JUDGE_PASSWORD` / `DEMO_TEAM_PASSWORD` (không hard-code) |

## Vị trí file

- `supabase/seed/00_reference.sql`: danh mục thực phẩm, `label_rules`, `impact_factors` (dữ liệu tham chiếu, chạy ở mọi môi trường).
- `scripts/seed-demo.mjs` (`pnpm seed:demo`) + `scripts/lib/demo/*`: tạo tài khoản bằng Admin API, tổ chức/điểm/giờ/lô/yêu cầu/bàn giao qua **RPC thật** với phiên của từng người dùng; idempotent (chạy lại chỉ bù phần thiếu). Cờ: `--local` | `--env-file`, `--yes` (đích không phải localhost), `--allow-prod`, `--history-days`.
- `scripts/demo-reset.mjs` (`pnpm demo:reset`): gọi `public.demo_reset()` (chỉ xóa tổ chức `is_demo`) rồi seed lại.
- Migration `20261008120500_demo_ops.sql`: `demo_approve_organization`, `demo_seed_history` (lịch sử lùi ngày; ledger vẫn do `credit_impact` ghi), `demo_reset` — chỉ service role, từ chối mọi tổ chức không phải demo, có audit. Hướng dẫn giám khảo: `docs/pitch/tai-khoan-demo.md`.

## Kiểm tra sau khi seed

- Kho tặng của `charity.demo` có lô ở cả 3 nhãn và bản đồ có marker.
- Kịch bản 50 bánh trả về phương án 3 cửa hàng.
- Trang ESG có số liệu khác 0 và biểu đồ 90 ngày.
- `pnpm test:e2e` xanh trên dữ liệu vừa seed.
