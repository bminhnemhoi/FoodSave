# Architecture Decision Records — FoodSave v2

ADR ghi lại các quyết định kiến trúc có ảnh hưởng lâu dài: bối cảnh, quyết định, hệ quả và phương án đã cân nhắc. Tổng quan kiến trúc: [ARCHITECTURE.md](../ARCHITECTURE.md); schema: [DATA-MODEL.md](../DATA-MODEL.md).

## Danh mục

| ID | Tiêu đề | Trạng thái | Ngày | Phase áp dụng |
|---|---|---|---|---|
| [ADR-001](ADR-001-nextjs-vercel.md) | Next.js + Vercel (Amplify sau) | Accepted | 2026-10-07 | P0 |
| [ADR-002](ADR-002-supabase-rls-first.md) | Supabase RLS-first | Accepted | 2026-10-07 | P0 |
| [ADR-003](ADR-003-provider-adapters.md) | Provider adapters | Accepted | 2026-10-07 | P0 |
| [ADR-004](ADR-004-chuyen-trang-thai-qua-rpc.md) | Chuyển trạng thái qua RPC | Accepted | 2026-10-07 | P0–P4 |
| [ADR-005](ADR-005-nhan-tinh-luc-doc.md) | Nhãn tính lúc đọc | Accepted | 2026-10-07 | P2 |
| [ADR-006](ADR-006-goong-ban-do.md) | Goong làm nhà cung cấp bản đồ | Accepted (gate P0) | 2026-10-07 | P0–P4 |
| [ADR-007](ADR-007-thuat-toan-ghep-don.md) | Thuật toán ghép đơn tổ hợp nhỏ | Accepted | 2026-10-07 | P3 |
| [ADR-008](ADR-008-lam-mo-mat-phia-client.md) | Làm mờ mặt phía client | Accepted | 2026-10-07 | P4 |
| [ADR-009](ADR-009-esg-factors.md) | Hệ số quy đổi ESG v1 (CO₂e, nước, suất ăn) | Proposed — chốt tại P0 (P0-20) | 2026-10-07 | P0–P4 |
| [ADR-010](ADR-010-ai-openai.md) | Nhà cung cấp AI mặc định là OpenAI (gpt-5.4-mini / nano) | Accepted |
| [ADR-011](ADR-011-khong-domain-gmail-smtp.md) | Chưa mua domain — *.vercel.app + Gmail SMTP | Accepted |

## Quy ước

- Tên file: `ADR-NNN-<slug-khong-dau>.md`, số tăng dần, không tái sử dụng.
- Cấu trúc: tiêu đề; Trạng thái; Ngày; Người quyết định; Liên quan; **Bối cảnh**; **Quyết định**; **Hệ quả** (Tích cực / Tiêu cực); **Phương án đã cân nhắc**.
- Trạng thái: `Proposed` → `Accepted` → (`Deprecated` | `Superseded by ADR-NNN`). Không sửa nội dung ADR đã Accepted ngoài lỗi chính tả; thay đổi quyết định bằng ADR mới và cập nhật trạng thái ADR cũ.
- Khi một ADR mâu thuẫn với code hoặc tài liệu khác, ADR mới nhất thắng; PR thay đổi kiến trúc phải kèm ADR.
