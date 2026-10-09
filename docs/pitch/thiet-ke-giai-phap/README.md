# Hồ sơ thiết kế giải pháp FoodSave (theo khung FixForward của BTC)

BTC TISPA 2026 gửi bài mẫu "FixForward" (18 slide) và mời các đội thiết kế giải pháp theo cùng khung để anh Khánh review. Thư mục này giữ bản nguồn của hồ sơ FoodSave.

- **Bộ slide (20 trang + 1 trang phụ lục):** https://claude.ai/artifact/RWb86Sd7CcA6KDUa8G8U8R (riêng tư; Minh bấm Share để chia sẻ, hoặc tải PPTX/PDF ở menu Export).
- **Bản nguồn slide:** [`slides/`](slides/). Mỗi trang là một tệp HTML; thứ tự trong `slides/deck.json`. Ảnh và icon nằm trong kho tài sản của artifact (`/_blob/…`), không nằm trong repo.
- **Sơ đồ tự vẽ:** [`so-do/`](so-do/) — `workflow.png` (quy trình 4 bên, 9 bước; trang 4) và `pipeline.png` (pipeline kiến trúc 5 luồng; trang 9). Nguồn là HTML cùng tên; xuất lại ảnh bằng `node so-do/shoot.mjs workflow pipeline` (Playwright, 2x). Trang 11 (nền AWS) vẽ trực tiếp trên slide bằng biểu tượng AWS chính thức. Phụ lục: sơ đồ tuần tự một lần bàn giao QR.
- Bản 09/10/2026, đã qua một vòng rà soát bằng agent giám khảo (tự chấm 17/37 trước khi sửa; đã sửa các khẳng định sai về vai trò bàn giao, số 2,7 giây, CI, sao lưu, làm mờ mặt, cấu hình cụm, mất mạng). Cập nhật lại sau mỗi thay đổi lớn (khảo sát, pilot, AWS).

## Mạch 20 trang và đối chiếu với bài mẫu

| # | Trang FoodSave | Trang tương ứng trong FixForward | Nguồn số liệu, sự thật |
|---|---|---|---|
| 1 | Bìa | — | Ảnh: Quân Nguyễn / Pexels (`public/images/credits.json`) |
| 2 | Vai trò, sứ mệnh và nguyên tắc | Role · Mission · Rule | [PRD](../../PRD.md) |
| 3 | Một sự cố nhỏ, một quy trình thật | A small failure, a real workflow | Tình huống minh họa; UNEP FWI 2024 qua [so-lieu-cap-thiet.md](../so-lieu-cap-thiet.md) §2.2 |
| 4 | Quy trình: 4 bên, 9 bước (ảnh `so-do/workflow.png`) | A real workflow (sơ đồ) | Luồng đang chạy trên production |
| 5 | Không code điều chưa biết | Do not code the unknown | ROADMAP B-03 (chưa làm); ngưỡng cổng do nhóm đề xuất |
| 6 | Ai dùng, ai hưởng lợi, ai có thể trả tiền | Who uses · beneficiary · who may pay | [mo-hinh-ben-vung.md](../mo-hinh-ben-vung.md) §2–3 (giả định giá) |
| 7 | Sản phẩm đầu tiên chỉ làm bốn việc | What the first product must do | Ảnh chụp màn hình thật (`public/images/product/`) |
| 8 | Bốn lớp, mỗi lớp một việc | Technology 101 | [ARCHITECTURE.md](../../ARCHITECTURE.md), migrations (36 bảng) |
| 9 | Pipeline kiến trúc đang chạy (ảnh `so-do/pipeline.png`) | Technology 101 (pipeline) | Code: Server Actions, RPC, outbox/pg_net/dispatch, AI, Goong, CI |
| 10 | Bản ghi không phải là ảnh | Records are not photos | [SECURITY-PRIVACY.md](../../SECURITY-PRIVACY.md) §4.5 (NĐ 356/2025 Điều 3, 4) |
| 11 | Một nền AWS nhỏ: đích đến sau giải | One small AWS baseline | [AWS-MIGRATION.md](../../AWS-MIGRATION.md) §2, §7 |
| 12 | Đi theo một lần bàn giao QR | Follow one report | `issue_handover_token` do người mang hàng phát (TTL 15 phút), khóa sau 5 lần sai; sổ tác động ghi lúc giao (`private.credit_impact`); 2,7 giây = yêu cầu nhận lô → chuông cửa hàng (ROADMAP P2-15) |
| 13 | Thiết kế cho niềm tin trước khi ra mắt | Design for trust before launch | RLS, MFA, pgTAP, 47 tệp spec E2E (ngoài CI); chưa có sao lưu tải về được |
| 14 | Luyện AWS khi chưa có tài khoản AWS | Practice without an AWS account | `src/server/providers/*` (chỉ có goong, openai, smtp, fake; interface `MapsProvider`, `AiProvider`, `EmailProvider`) |
| 15 | AI có người duyệt: chụp ảnh để điền nhanh | CaseBrief AI (human review) | [ADR-010](../../adr/ADR-010-ai-openai.md); giới hạn 20 lượt/giờ/cửa hàng; bật trên prod 09/10 (job `ai_verify`) |
| 16 | AI phải tự chứng minh là đáng đầu tư | Earn the AI investment | Chưa đo; ngưỡng 8/10 từ ROADMAP P2-05 |
| 17 | Điều gì cho phép mở cụm phường thứ hai | What earns a second center | [ke-hoach-6-thang.md](../ke-hoach-6-thang.md) §4; mo-hinh-ben-vung §7 |
| 18 | Chỉ xếp hàng những việc chậm | Queue only the slow work | Outbox: thử lại 1m/5m/15m/1h/6h, dead-letter ở lần hỏng thứ 6 |
| 19 | Đo giá trị và toàn bộ chi phí | Measure value and full cost | `/api/public-impact` (0 kg thật, 750 kg demo ngày 09/10); mo-hinh-ben-vung §6; [ADR-009](../../adr/ADR-009-esg-factors.md) |
| 20 | Sáu câu trả lời của FoodSave | Your turn: Problem · Workflow · AWS · Edge · Evidence · Next gate | Tổng hợp |

## Nguyên tắc khi sửa

- Không đưa số chưa kiểm chứng lên slide. Số ước tính ghi "ước tính"; dữ liệu demo ghi "demo".
- Phần chưa làm (phỏng vấn, pilot giấy, đo AI, diễn tập khôi phục) ghi thẳng "chưa làm". Đây là điều bài mẫu FixForward đánh giá cao nhất.
- Khi có số liệu khảo sát (B-03) hoặc pilot (B-07), cập nhật trang 4, 14, 17, 18 trước.
