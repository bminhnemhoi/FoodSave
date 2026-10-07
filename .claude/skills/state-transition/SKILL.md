---
name: state-transition
description: Thêm hoặc sửa RPC chuyển trạng thái trong FoodSave (offer, need, bundle, allocation, pickup, handover, proof, organization). Dùng khi viết logic duyệt hồ sơ, đặt chỗ, xác nhận, phân công, bàn giao QR, giao hàng, duyệt minh chứng, hủy. Đảm bảo state machine, khóa dòng, idempotency (client_op_id), audit, side effect (ledger, outbox) và test.
---

# state-transition — RPC chuyển trạng thái an toàn

Nguồn sự thật: mục **State machines**, **Ma trận hủy** và **RPC** trong `docs/DATA-MODEL.md`.

## Mẫu RPC bắt buộc

```sql
create or replace function public.<verb_noun>(
  p_<entity>_id uuid,
  ...,
  p_client_op_id uuid
) returns <result>
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.<table>%rowtype;
begin
  -- 1. Idempotency: thao tác trùng thì trả kết quả cũ
  if exists (select 1 from public.audit_logs where client_op_id = p_client_op_id) then
    return ...;
  end if;

  -- 2. Khóa dòng; nhiều dòng thì khóa theo ORDER BY id để tránh deadlock
  select * into v_row from public.<table> where id = p_<entity>_id for update;

  -- 3. Quyền: người gọi có vai trò phù hợp (is_active_org_member / is_admin)
  -- 4. Tiền điều kiện: trạng thái hiện tại nằm trong tập cho phép, invariant số lượng
  --    lỗi thì: raise exception using errcode = 'P0001', message = '<ma_loi>';
  -- 5. Cập nhật trạng thái + timestamp (<x>_at)
  -- 6. Side effect trong CÙNG transaction: impact_ledger, notification_outbox, trả số lượng về lô...
  -- 7. Ghi audit_logs (actor, action, entity, before, after, client_op_id)
  return ...;
end $$;

revoke all on function public.<verb_noun>(...) from public, anon;
grant execute on function public.<verb_noun>(...) to authenticated;
```

## Quy tắc

- **Mã lỗi** dạng chuỗi ổn định (`offer_not_open`, `insufficient_qty`, `not_member`…). UI ánh xạ sang câu tiếng Việt trong `features/<domain>/errors.ts`.
- **Không phụ thuộc cron cho tính đúng đắn:** RPC tự hết hạn các yêu cầu quá `reserved_until` trên dòng nó khóa.
- **Số lượng:**
  - Luôn giữ `qty_reserved ≥ qty_picked ≥ qty_delivered`.
  - Chỉ shortfall `capacity`/`no_show` mới trả số lượng về lô, và phải trước `effective_deadline`.
- **Ledger:** chỉ ghi thêm (credit/reversal), unique theo `handover_line`. Ghi ở lúc **dropoff**.
- **Thông báo:** chỉ INSERT vào `notification_outbox`; job `dispatch` sẽ gửi. Không gọi HTTP trong RPC.
- **Ma trận hủy:** sau `picked_up` không hủy được, chỉ tạo `incident`.

## Phía ứng dụng

- Server Action trong `features/<domain>/actions.ts`:
  1. validate bằng zod
  2. gọi `supabase.rpc(...)` bằng client **của người dùng** (không dùng service role)
  3. ánh xạ lỗi, `revalidatePath`/`revalidateTag`
- Client tạo `client_op_id` bằng `crypto.randomUUID()` khi mở form hoặc nút, để retry dùng lại cùng ID.

## Test (bắt buộc)

- **pgTAP** cho mỗi RPC:
  - đúng vai trò chuyển đúng trạng thái
  - sai vai trò hoặc sai trạng thái thì báo đúng mã lỗi
  - gọi lại cùng `client_op_id` thì không tạo bản ghi thứ hai
  - invariant số lượng giữ nguyên
  - audit được ghi
- Có tranh chấp (ví dụ 2 tổ chức cùng đặt 1 lô): test 2 transaction đồng thời. Không bao giờ cấp vượt.
- Cập nhật bảng transition trong `docs/DATA-MODEL.md` nếu thêm cạnh mới.
