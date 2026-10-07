---
name: new-migration
description: Tạo migration Supabase mới cho FoodSave (bảng, cột, index, enum, function, policy). Dùng mỗi khi thay đổi schema DB. Bắt buộc RLS, pgTAP test, sinh lại type và cập nhật docs/DATA-MODEL.md trong cùng thay đổi. Trigger: "thêm bảng", "sửa schema", "migration", "add column", "create table", "RLS policy".
---

# new-migration — thay đổi schema đúng chuẩn FoodSave

## Trước khi viết SQL

1. Đọc phần liên quan trong `docs/DATA-MODEL.md` (bảng, enum, invariant, ma trận RLS). Nếu thiết kế mới khác docs thì **cập nhật docs trước**.
2. Nếu skill cộng đồng `supabase` hoặc `postgres-best-practices` có sẵn, áp dụng quy tắc của chúng cho index, kiểu dữ liệu và RLS hiệu năng (`(select auth.uid())` thay vì `auth.uid()` trong policy).
3. **Không sửa migration đã có trên `origin/main`.** Luôn tạo file mới:
   ```bash
   pnpm supabase migration new <ten_ngan_snake_case>
   ```

## Checklist nội dung migration

- [ ] Kiểu chuẩn: `uuid` PK (`gen_random_uuid()`), `timestamptz`, `numeric(12,3)` cho số lượng, `geography(Point,4326)` cho vị trí (kèm index GIST).
- [ ] `created_at` và `updated_at`, gắn trigger `set_updated_at`.
- [ ] Ràng buộc bằng `CHECK`, ví dụ `qty_reserved >= qty_picked`, hoặc `unit = 'kg' or qty = trunc(qty)`.
- [ ] FK có `on delete` hợp lý. Index cho mọi FK và mọi cột dùng trong policy.
- [ ] `alter table … enable row level security;` cùng **policy riêng cho từng thao tác** (select/insert/update/delete):
  - dùng helper `is_admin()`, `is_org_member(org_id, roles[])`, `is_active_org_member(...)`
  - không viết policy `using (true)` cho bảng chứa dữ liệu người dùng
- [ ] Cột trạng thái hoặc cột duyệt được bảo vệ bằng **allow-list cột**. `revoke update (col)` đơn lẻ **không có tác dụng** khi grant UPDATE cấp bảng của Supabase vẫn còn. Mẫu đúng (`docs/DATA-MODEL.md` §9.4):
  ```sql
  revoke update on public.<table> from authenticated, anon;
  grant update (name, description /* chỉ cột người dùng được sửa */) on public.<table> to authenticated;
  ```
  Chuyển trạng thái đi qua RPC (skill `state-transition`).
- [ ] Cột vị trí chính xác hoặc nhạy cảm (ví dụ `sites.location`): không grant SELECT, chỉ đọc qua RPC. Query phải liệt kê cột, không dùng `select('*')`.
- [ ] Dữ liệu public chỉ lộ qua view `with (security_invoker = true)` gồm các cột an toàn.
- [ ] Không có giá trị mặc định nào lấy vai trò từ `raw_user_meta_data`.
- [ ] Function: `security definer` + `set search_path = ''` + tên đầy đủ schema. Chỉ `grant execute` cho role cần.

## Test (bắt buộc)

- Thêm `supabase/tests/<nn>_<ten>.test.sql` (pgTAP). Tối thiểu kiểm tra:
  - bảng có RLS (`policies_are` / kiểm tra `relrowsecurity`)
  - **anon** không đọc được dữ liệu riêng tư
  - **thành viên tổ chức khác** không đọc/sửa được
  - **owner** làm được đúng việc của mình, không đổi được cột trạng thái
  - **admin aal1** (chưa MFA) không có quyền admin; **admin aal2** thì có
- Chạy:
  ```bash
  pnpm db:reset && pnpm db:test
  ```

## Sau khi migration chạy được

```bash
pnpm db:types        # cập nhật src/types/database.types.ts
pnpm typecheck
```

- Cập nhật `docs/DATA-MODEL.md`: bảng/cột, ERD Mermaid, ma trận RLS.
- Nếu đổi seed: cập nhật `supabase/seed/`, giữ thời gian dạng `now() + interval`.
- Báo lại: tên file migration, bảng/policy đã thêm, kết quả pgTAP.
