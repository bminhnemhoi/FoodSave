---
name: rls-audit
description: Rà soát bảo mật dữ liệu FoodSave — ma trận vai trò × bảng, policy RLS, view/materialized view, storage bucket, RPC security definer, rò rỉ PII (CCCD, giấy tờ, vị trí, ảnh minh chứng). Dùng trước mỗi gate, sau khi thêm bảng/policy/RPC, hoặc khi nghi có lỗ hổng phân quyền.
---

# rls-audit — kiểm toán phân quyền

Nguồn: ma trận RLS trong `docs/DATA-MODEL.md`, bảng truy vết L/B trong `docs/SECURITY-PRIVACY.md`.

## 1. Quét tự động (chạy trên DB local)

```sql
-- Bảng public chưa bật RLS (phải rỗng)
select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

-- Policy quá rộng (xem kỹ từng dòng)
select tablename, policyname, cmd, qual, with_check from pg_policies
where schemaname = 'public' and (qual = 'true' or with_check = 'true');

-- Function security definer thiếu search_path
select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%');

-- View không phải security_invoker
select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'v'
  and not coalesce((select bool_or(o = 'security_invoker=true') from unnest(c.reloptions) o), false);

-- Materialized view còn quyền select cho anon/authenticated (phải rỗng)
select table_name, grantee from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon','authenticated')
  and table_name in (select matviewname from pg_matviews where schemaname = 'public');

-- Bucket public
select id, public from storage.buckets;
```

Nếu Supabase MCP đang kết nối (chế độ read-only, staging), có thể chạy thêm advisor bảo mật của Supabase.

## 2. Kiểm tra theo kịch bản (pgTAP, `pnpm db:test`)

Với mỗi bảng chứa dữ liệu người dùng, có test cho 6 vai trò:
- `anon`
- người dùng chưa thuộc tổ chức
- thành viên tổ chức khác
- thành viên đúng tổ chức (staff/volunteer/manager/owner)
- admin `aal1`
- admin `aal2`

Hồi quy bắt buộc:
- **B1:** đăng ký với metadata `role=admin` không thành admin.
- **B2:** người dùng không tự đổi `platform_role` hay `status`.
- **B3:** anon không đọc được cột nhạy cảm (`org_sensitive`, CCCD, MST).
- **B4:** không truy cập được `kyc/`, `proofs/` qua URL public.
- **B6:** owner không tự sửa `trust_score` hay `is_verified`.
- **B8:** tổ chức chưa duyệt không thấy lô đang mở.
- **QR:** token dùng lại, hoặc dùng ngoài khung giờ, đều bị từ chối.
- **Vị trí:** cửa hàng chỉ thấy ETA, không thấy tọa độ tình nguyện viên.

## 3. Kiểm tra phía ứng dụng

- `grep` để chắc service role không xuất hiện ngoài `src/server/`, và không có `import` từ `src/server` trong file `"use client"`.
- Signed URL dùng đúng TTL (kyc 60 s, proofs 300 s).
- Ảnh upload đi qua bước mã hóa lại (xóa EXIF).
- Route Handler `/api/jobs/*` kiểm tra chữ ký HMAC.

## 4. Báo cáo

- Lập bảng phát hiện: mức độ (Critical/High/Medium/Low), vị trí, kịch bản khai thác, cách sửa.
- Mọi phát hiện High trở lên chặn gate.
- Có thể giao agent **security-reviewer** đánh giá độc lập rồi đối chiếu kết quả.
