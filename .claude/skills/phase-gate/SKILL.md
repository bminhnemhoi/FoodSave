---
name: phase-gate
description: Kiểm tra cổng (gate) cuối mỗi phase FoodSave (G0–G6) theo docs/ROADMAP.md — chạy toàn bộ test, kiểm bảo mật, a11y, hiệu năng, đối chiếu acceptance criteria, xuất báo cáo docs/phase-reports/Gx.md, cập nhật trạng thái ROADMAP và áp dụng quy tắc cắt phạm vi khi trễ. Dùng khi kết thúc một phase hoặc khi Minh hỏi "đã qua gate chưa".
---

# phase-gate — kiểm soát chất lượng từng phase

## 1. Xác định gate

- Đọc khối `STATUS` và mục gate của phase hiện tại trong `docs/ROADMAP.md`.
- Liệt kê các task của phase: xong / chưa xong / bị cắt.

## 2. Chạy kiểm tra (ghi lại output tóm tắt)

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm db:reset && pnpm db:test
pnpm test:e2e
pnpm build
```

- **Từ P2:** Lighthouse cho landing và PWA (mục tiêu ≥ 90 ở P5), axe trên các màn hình của phase.
- **Bảo mật:** skill `rls-audit` và agent `security-reviewer` trên diff của phase. Có phát hiện High/Critical thì **không qua gate**.
- **UI:** screenshot các màn hình mới (mobile + desktop), agent `ux-reviewer` cho màn hình chủ lực.
- **Acceptance criteria:** đối chiếu từng user story của phase trong `docs/PRD.md`.
- **Từ P2:** chạy `/ponytail-review` trên diff để loại code thừa.

## 3. Quyết định

| Kết quả | Hành động |
|---|---|
| Đạt toàn bộ tiêu chí | Gate **PASS** → nhờ Khanh chạy UAT `docs/uat/Px-*.md` → Minh gắn tag `v0.x` (chỉ khi Minh đồng ý). Mốc ★ thì quay video demo dự phòng |
| Trễ ≤ 2 ngày | Lập danh sách việc còn lại kèm ước lượng; tiếp tục phase |
| Trễ > 2 ngày | **Cắt mục kế tiếp trong Danh sách cắt** của ROADMAP (ghi vào "Nhật ký thay đổi roadmap"). Không kéo dài phase |

## 4. Báo cáo `docs/phase-reports/Gx.md`

```markdown
# Gate Gx — <tên phase> — <ngày>
Kết quả: PASS / FAIL / PASS có điều kiện
## Tiêu chí gate (bảng: tiêu chí | kết quả | bằng chứng)
## Test (số lượng pass/fail: unit, pgTAP, E2E, Lighthouse, axe)
## Bảo mật (phát hiện + trạng thái)
## Tính năng đã xong / bị cắt / chuyển phase
## Rủi ro mới và cách xử lý
## Việc cần Minh/Khanh làm
```

## 5. Cập nhật ROADMAP

- Tick các task đã xong, cập nhật khối `STATUS` (phase mới, mốc kế tiếp, việc kế tiếp).
- Báo cáo ngắn cho Minh bằng tiếng Việt kèm đường dẫn báo cáo.
