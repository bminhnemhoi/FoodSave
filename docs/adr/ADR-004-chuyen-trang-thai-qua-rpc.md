# ADR-004: Chuyển trạng thái qua RPC

- **Trạng thái:** Accepted
- **Ngày:** 2026-10-07
- **Người quyết định:** Minh
- **Liên quan:** [DATA-MODEL.md §6, §7, §8, §15](../DATA-MODEL.md), ADR-002, skill `state-transition`

## Bối cảnh

- Bản cũ cho mọi tổ chức active `UPDATE` bảng `donations` khi `status='open'`; không có quy tắc chuyển trạng thái; hai tổ chức có thể "nhận" cùng một lô (đọc rồi ghi, không khóa); số lượng là chữ (`amount_text`).
- v2 có luồng nhiều bước, nhiều bên: lô → phân bổ (nhiều cửa hàng một nhu cầu) → chuyến → bàn giao QR hai chặng → ledger → minh chứng. Mỗi bước thay đổi nhiều bảng cùng lúc và phải giữ bất biến số lượng (`qty_reserved ≥ qty_picked ≥ qty_delivered`, không cấp vượt lô).
- Người dùng trên điện thoại, mạng chập chờn, hay bấm hai lần; tình nguyện viên có thể mất sóng ngay lúc quét QR.

## Quyết định

1. **Mọi thay đổi cột trạng thái và số lượng chỉ qua RPC Postgres `security definer`** (danh mục ở DATA-MODEL §8). Cột trạng thái/duyệt/uy tín/số lượng không có quyền UPDATE cho `authenticated` (whitelist cột), cộng trigger phòng thủ `guard_privileged_columns`.
2. Mỗi RPC theo khuôn cố định:
   1. `require_uid`, claim **idempotency** bằng `p_client_op_id` (bảng `rpc_idempotency`: trùng thì trả kết quả cũ, khác tham số thì `idempotency_conflict`);
   2. kiểm quyền bằng helper (ADR-002) và rate limit;
   3. **khóa hàng theo thứ tự toàn cục** `needs → offers (ORDER BY id) → allocations (ORDER BY id) → pickups → pickup_stops → handovers → proofs`, để không deadlock;
   4. kiểm điều kiện của máy trạng thái (bảng chuyển trạng thái trong DATA-MODEL §6);
   5. ghi thay đổi, cập nhật trạng thái dẫn xuất bằng `private.refresh_*`;
   6. ghi `audit_logs` và `notification_outbox` **trong cùng giao dịch**;
   7. lưu response idempotency.
3. Lỗi trả bằng `errcode` dạng PostgREST `PTxxx` + mã máy (`insufficient_quantity`, `invalid_state`…), map sang tiếng Việt ở `src/server/db/errors.ts`.
4. Tác vụ theo thời gian cũng đi qua hàm SQL có cùng quy tắc (`close_expired_offers`, `expire_stale_requests`); RPC nghiệp vụ tự hết hạn yêu cầu cũ trên lô đang khóa nên không phụ thuộc cron.
5. Trạng thái dẫn xuất (nhu cầu, phương án ghép, `open ↔ fully_allocated`) không bao giờ do client đặt.
6. RPC luôn chạy bằng JWT của người dùng (gọi từ Server Action) để `auth.uid()` và audit đúng người; không gọi RPC nghiệp vụ bằng service role thay người dùng (vì vậy "tự ghép lại" là hệ thống **đề xuất**, người dùng xác nhận một chạm).
7. Mỗi RPC có pgTAP: quyền theo vai trò, điều kiện, idempotency (gọi hai lần cùng `client_op_id`), bất biến số lượng, audit/outbox; `reserve_bundle` có thêm test hai phiên song song.

## Hệ quả

**Tích cực**
- Bất biến được giữ ở một chỗ, nguyên tử; không cấp vượt kể cả khi hai tổ chức bấm cùng lúc.
- Bấm trùng, retry khi mất mạng an toàn; client đơn giản (giữ một `client_op_id` cho mỗi ý định).
- Audit và thông báo không bao giờ lệch với dữ liệu (outbox pattern).
- Client nào (web, PWA, script seed) cũng đi đúng một đường code ⇒ seed lịch sử 90 ngày bằng chính RPC thật.

**Tiêu cực**
- Nhiều logic nghiệp vụ viết bằng plpgsql: khó debug hơn TS, cần pgTAP kỹ và quy ước đặt tên.
- Thay đổi RPC = migration mới (không sửa migration cũ); `create or replace function` phải giữ tương thích chữ ký hoặc đổi tên.
- Khóa hàng làm tuần tự hóa thao tác trên cùng lô; ở quy mô pilot không đáng kể.

## Phương án đã cân nhắc

| Phương án | Lý do không chọn |
|---|---|
| UPDATE trực tiếp qua RLS + trigger kiểm chuyển trạng thái | Trigger không biết "ý định" (ai hủy, vì sao), khó cập nhật nhiều bảng nhất quán, dễ bị tắt (B2) |
| Logic trong Server Action, gọi nhiều câu lệnh qua supabase-js | Không có giao dịch nhiều câu lệnh qua PostgREST ⇒ không nguyên tử; cần service role ⇒ mất RLS |
| Optimistic concurrency (cột `version`) thay cho khóa | Phải retry ở client khi tranh chấp; với số lượng khả dụng, khóa hàng đơn giản và chắc chắn hơn |
| Hàng đợi/saga ở tầng ứng dụng | Quá nặng cho một monolith 6 tuần |
