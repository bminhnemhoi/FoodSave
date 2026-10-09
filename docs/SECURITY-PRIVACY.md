# FoodSave v2 — Bảo mật & Quyền riêng tư

> **Trạng thái:** bản thiết kế (07/10/2026), áp dụng từ P0.
> **Chủ sở hữu tài liệu:** Minh (kỹ thuật). Khanh kiểm tra phần UAT liên quan.
> **Tài liệu liên quan:** `docs/DATA-MODEL.md` (ma trận RLS chi tiết), `docs/TESTING.md` (pgTAP, E2E), `docs/DEPLOYMENT.md` (secrets, môi trường), `docs/ESG-METHODOLOGY.md`.
> **Quy ước:** chỗ ghi **"cần kiểm chứng điều khoản"** là trích dẫn pháp lý chưa đối chiếu với văn bản gốc. Không đưa các trích dẫn này vào slide hoặc Điều khoản khi chưa kiểm chứng.

---

## Mục lục

1. [Nguyên tắc](#1-nguyên-tắc)
2. [Mô hình đe dọa (STRIDE-lite theo tài sản)](#2-mô-hình-đe-dọa-stride-lite-theo-tài-sản)
3. [Biện pháp kiểm soát](#3-biện-pháp-kiểm-soát)
4. [Khung pháp lý](#4-khung-pháp-lý)
5. [Kiểm kê dữ liệu](#5-kiểm-kê-dữ-liệu)
6. [Thiết kế bản ghi đồng ý (`consents`)](#6-thiết-kế-bản-ghi-đồng-ý-consents)
7. [Quyền của chủ thể dữ liệu](#7-quyền-của-chủ-thể-dữ-liệu)
8. [An toàn thực phẩm & trách nhiệm pháp lý](#8-an-toàn-thực-phẩm--trách-nhiệm-pháp-lý)
9. [Quy trình xử lý sự cố](#9-quy-trình-xử-lý-sự-cố)
10. [Bảng truy vết lỗi cũ L1–L16, B1–B8](#10-bảng-truy-vết-lỗi-cũ-l1l16-b1b8)
11. [Việc pháp lý theo phase](#11-việc-pháp-lý-theo-phase)

---

## 1. Nguyên tắc

| # | Nguyên tắc | Ý nghĩa cụ thể trong FoodSave |
|---|---|---|
| 1 | **RLS-first** | Trình duyệt gọi Supabase bằng khóa publishable (công khai), nên RLS là ranh giới bảo mật thật. Mọi bảng trong schema `public` bật RLS; bảng nào không có policy thì mặc định không ai đọc được. |
| 2 | **Tối thiểu hóa dữ liệu** | Chỉ thu cái cần cho việc điều phối. Không lưu ảnh CCCD, không lưu toàn bộ payload QR CCCD, không lưu lịch sử vị trí. |
| 3 | **Không tin client** | Vai trò, trạng thái, số lượng, nhãn tươi, tác động ESG đều do DB/RPC tính. Không lấy từ request hay metadata. Làm mờ mặt trên điện thoại chỉ là lớp đầu, phải có người duyệt. |
| 4 | **Chuyển trạng thái chỉ qua RPC** | Revoke UPDATE cả bảng, grant UPDATE cho danh sách cột được phép (DATA-MODEL §9.4) — cột trạng thái không có trong danh sách; RPC `security definer` kiểm tra quyền, bất biến (invariant), `client_op_id` và ghi `audit_logs`. |
| 5 | **Mặc định riêng tư** | Bucket chứa giấy tờ và minh chứng là private; điểm nhạy cảm (mái ấm, nơi tạm lánh) dùng `sites.visibility`; bản đồ công khai chỉ hiện lưới 500 m. |
| 6 | **Có thể kiểm chứng** | Mỗi lỗi cũ có một test hồi quy (mục 10). Mỗi hành động nhạy cảm có audit log ghi người làm. |

---

## 2. Mô hình đe dọa (STRIDE-lite theo tài sản)

**Tác nhân đe dọa:**
- **A1** Người ngoài ẩn danh, có khóa publishable và đọc được mã nguồn (repo có thể public).
- **A2** Người dùng đã đăng ký nhưng chưa được duyệt hoặc đã bị từ chối.
- **A3** Thành viên hợp lệ của một tổ chức nhưng muốn đọc hoặc sửa dữ liệu của tổ chức khác.
- **A4** Nội gián: nhân viên cửa hàng, tình nguyện viên làm sai quy trình.
- **A5** Kẻ chiếm tài khoản admin.
- **A6** Chuỗi cung ứng: gói npm, GitHub Action, plugin hoặc skill Claude Code độc hại.

**Ký hiệu STRIDE:** S = Giả mạo, T = Sửa trái phép, R = Chối bỏ, I = Lộ thông tin, D = Từ chối dịch vụ, E = Leo thang đặc quyền.

**Mức rủi ro:** Cao / TB (trung bình) / Thấp, tính sau khi đã áp biện pháp ở mục 3. Cột "Biện pháp" dẫn tới mã ở mục 3 (C1…C20).

### 2.1 Giấy tờ KYC (bucket `kyc`, bảng `org_documents`)

Gồm giấy phép kinh doanh, giấy ATTP, quyết định thành lập tổ chức. Riêng ảnh CCCD **không thu** ở v2.

| STRIDE | Kịch bản | Biện pháp | Rủi ro còn lại |
|---|---|---|---|
| I | Đoán hoặc lấy được URL file rồi tải về (lỗi B4 cũ) | Bucket private (C7); signed URL 60 giây chỉ cấp cho chủ hồ sơ và admin aal2; đường dẫn chứa UUID ngẫu nhiên | Thấp |
| I | Tổ chức khác đọc metadata giấy tờ qua PostgREST | `org_documents` có RLS: chỉ `is_org_member(org_id, '{owner,manager}')` hoặc `is_admin()` (C1) | Thấp |
| T | Chủ hồ sơ thay file sau khi đã được duyệt | Policy storage chỉ cho INSERT khi `organizations.status in ('draft','submitted','needs_changes')`, hoặc khi tổ chức `approved` có `org_change_requests` `pending` (file mới vào `{org_id}/change/{request_id}/…`, admin duyệt trước khi áp dụng); không cho UPDATE hoặc DELETE file đã nộp | Thấp |
| R | Admin duyệt rồi chối là không duyệt | `reviewed_by`, `reviewed_at`, `audit_logs` do RPC `review_organization` ghi (C4) | Thấp |
| D | Tải lên file lớn hàng loạt | Giới hạn bucket: 10 MB/file; MIME `application/pdf`, `image/jpeg`, `image/png`, `image/webp`; rate limit 20 file/giờ/người (C11) | Thấp |
| I | File tồn tại lâu hơn mục đích | Job xóa file KYC 30 ngày sau quyết định duyệt hoặc từ chối (mục 5) | Thấp |

### 2.2 Số CCCD người đại diện (`private.org_representative_ids`, `org_sensitive.representative_id_last4`) và thông tin người đại diện

Ảnh thẻ căn cước là **dữ liệu nhạy cảm** (NĐ 356/2025 Điều 4) nên FoodSave không thu ảnh; **số** định danh là dữ liệu cơ bản (Điều 3) và chỉ được thu để xác minh người đại diện (B2, 10/2026).

| STRIDE | Kịch bản | Biện pháp | Rủi ro còn lại |
|---|---|---|---|
| I | Khách đọc cột nhạy cảm qua bảng tổ chức công khai (lỗi B3 cũ) | Tách sang bảng `org_sensitive` (chỉ owner/manager và admin); trang công khai đọc view `public_org_cards` (chỉ cột cần hiện) (C1, C6) | Thấp |
| I | Lộ payload QR CCCD (họ tên, ngày sinh, giới tính, địa chỉ thường trú, ngày cấp) | Payload QR chỉ xử lý trên trình duyệt (`parseCccdQr`, có unit test): chỉ giữ **số + họ tên** để so với người đại diện đã khai, bỏ ngay các trường còn lại; server không nhận và không log payload | Thấp |
| I | Lộ số CCCD đầy đủ | Bảng `private.org_representative_ids` (schema không lộ qua PostgREST, không grant cho `anon`/`authenticated`); chủ tổ chức chỉ thấy dạng che `079*****1234` qua `get_representative_id_summary`; số đầy đủ chỉ qua `reveal_representative_id` cho admin aal2, mỗi lần ghi `representative_id.reveal`, 30 lần/giờ; không vào audit/outbox | Thấp |
| I | Giữ số lâu hơn cần | Xóa 30 ngày sau khi tổ chức `closed`/`rejected` (`purge_retention`); số đầy đủ tự xóa khi 4 số cuối đổi (trigger đồng bộ) | Thấp |
| I | Sentry hoặc log ghi lại dữ liệu cá nhân | `sendDefaultPii: false`; `beforeSend` xóa body, email, số điện thoại; không log input form KYC (C16) | TB |
| T | Owner tự sửa `id_verified_at` hoặc `id_verified_by` | Cột không nằm trong danh sách grant UPDATE (revoke cả bảng, grant theo danh sách cột — C5); chỉ RPC `verify_representative_id` (admin aal2) được ghi (C5) | Thấp |

### 2.3 Vị trí tình nguyện viên

Theo Nghị định 13/2023, đây là dữ liệu nhạy cảm (cần kiểm chứng phân loại theo Luật 91/2025).

| STRIDE | Kịch bản | Biện pháp | Rủi ro còn lại |
|---|---|---|---|
| I | Cửa hàng hoặc người ngoài theo dõi vị trí liên tục của tình nguyện viên | Vị trí chỉ gửi khi app đang mở, đang trong chuyến, **và** có consent `location_trip` còn hiệu lực. Broadcast trên kênh Realtime **private**, authorization chỉ cho thành viên điều phối của tổ chức sở hữu chuyến. Cửa hàng chỉ thấy ETA (C9) | Thấp |
| I | Lộ lịch sử di chuyển | Chỉ lưu **điểm mới nhất** (`pickups.last_location`), làm tròn 4 chữ số thập phân (khoảng 11 m), xóa khi chuyến kết thúc hoặc bị hủy. Không có bảng lịch sử | Thấp |
| I | Lộ nơi ở của tình nguyện viên | `volunteer_profiles.base_area` chỉ là khu vực gần đúng (phường/xã hoặc ô lưới), không lưu địa chỉ nhà | Thấp |
| S | Giả vị trí để check-in khống tại cửa hàng | Check-in geofence 100 m chỉ là tín hiệu phụ; bằng chứng chính là quét QR hoặc nhập mã 6 số do **cửa hàng** thực hiện (C10) | Thấp |
| D | Spam broadcast vị trí | Tối đa 1 điểm mỗi `app_settings.location_min_interval_seconds` (mặc định 30 giây); `update_pickup_progress` từ chối điểm gửi dày hơn | Thấp |

### 2.4 Ảnh minh chứng (bucket `proofs`): người nhận, có thể có trẻ em

| STRIDE | Kịch bản | Biện pháp | Rủi ro còn lại |
|---|---|---|---|
| I | Ảnh rõ mặt người nhận, nhất là trẻ em, bị lộ | Làm mờ mặt trên máy (BlazeFace full-range, chia ô, cọ làm mờ tay). **Không tin kết quả client:** ảnh ở trạng thái `submitted` chỉ admin xem được. Admin kiểm tra từng ảnh, rồi cửa hàng liên quan mới xem được (C12). Hướng dẫn chụp: tránh mặt, ưu tiên chụp tay, món ăn, khung cảnh | TB (mặt nghiêng hoặc nhỏ có thể sót; admin là lớp chặn cuối) |
| I | EXIF/GPS trong ảnh gốc làm lộ địa điểm mái ấm | Mã hóa lại bằng canvas (`toBlob('image/webp')`, dự phòng JPEG) trước khi upload, nên metadata bị loại bỏ. Upload chỉ nhận ảnh đã qua pipeline (C13). Vị trí minh chứng hiển thị gần đúng | Thấp |
| I | Cửa hàng không liên quan xem ảnh | RLS `proof_media`: cửa hàng chỉ xem khi `proofs.status='approved'` **và** cửa hàng có `allocation` nằm trong `proof_allocations` của minh chứng đó. Signed URL 300 giây | Thấp |
| T | Tổ chức sửa minh chứng sau khi được duyệt | Minh chứng `approved` là bất biến; sửa thì phải tạo bản mới và duyệt lại | Thấp |
| S | Minh chứng giả (ảnh tải từ mạng) | Admin duyệt; AI kiểm mô tả (P5, tùy chọn); trust score; báo cáo vi phạm qua `incidents` | TB |
| R | Tổ chức chối đã đăng ảnh vi phạm quyền riêng tư | `proofs.submitted_by` và `audit_logs`; consent `proof_photo` của người đăng | Thấp |

### 2.5 Tài khoản admin

| STRIDE | Kịch bản | Biện pháp | Rủi ro còn lại |
|---|---|---|---|
| E | Tự đăng ký thành admin qua metadata (lỗi B1 cũ) | `handle_new_user` **không đọc** `raw_user_meta_data` để gán quyền; `profiles.platform_role` mặc định `'user'`. Chỉ một migration hoặc thao tác service role có audit mới cấp admin (C2) | Thấp |
| E | Tự sửa `platform_role` (lỗi B2 cũ) | `revoke update on profiles from authenticated, anon` rồi `grant update (full_name, phone, avatar_path, locale, active_org_id) on profiles to authenticated` — `platform_role` không có trong danh sách. (Chỉ `REVOKE UPDATE (platform_role)` **không có tác dụng** khi vai trò còn quyền UPDATE mức bảng.) Cấp/thu hồi admin chỉ qua `grant_platform_admin`/`revoke_platform_admin` (service role hoặc admin aal2, có audit). Không dựa vào trigger (trigger có thể bị tắt) (C5) | Thấp |
| S | Lộ mật khẩu admin (phishing, dùng lại mật khẩu) | **MFA TOTP bắt buộc.** `is_admin()` kiểm tra `auth.jwt()->>'aal' = 'aal2'` ngay trong DB, nên token aal1 bị từ chối dù UI có lỗi (C3) | Thấp |
| R | Không biết ai duyệt hồ sơ | RPC admin ghi `audit_logs(actor_id, action, target, before, after)` | Thấp |
| D | Admin duy nhất mất điện thoại MFA | Có 2 admin (Minh, Khanh) với 2 thiết bị TOTP riêng. Mã khôi phục cất ngoại tuyến. Thủ tục gỡ MFA bằng service role có ghi audit (mục 9) | Thấp |

### 2.6 Token QR bàn giao (`handovers`)

| STRIDE | Kịch bản | Biện pháp | Rủi ro còn lại |
|---|---|---|---|
| S | Đoán token | Token ngẫu nhiên **≥ 128 bit** (DATA-MODEL dùng `gen_random_bytes(32)` = 256 bit, mã hóa base64url); DB chỉ lưu `sha256(token)` (C10) | Thấp |
| S | Dùng lại ảnh chụp màn hình QR (replay) | Token dùng một lần: `UPDATE … SET consumed_at=now() WHERE token_hash=$1 AND consumed_at IS NULL RETURNING`. Token chỉ hợp lệ khi **đồng thời** còn trong TTL `handover_token_ttl_minutes` (15 phút từ lúc phát) **và** (bước pickup) trong khung giờ lấy hàng của phân bổ ± `handover_window_grace_minutes` (30 phút); chỉ phát được khi chuyến đang chạy (DATA-MODEL §2.3 "Hiệu lực token") | Thấp |
| S | Dò mã 6 số dự phòng (chỉ có 10⁶ khả năng) | Mã chỉ hợp lệ với **đúng một** handover và đúng cửa hàng ở điểm dừng đó. Sai 5 lần thì khóa mã và phải tạo mã mới. Người nhập phải là thành viên đã đăng nhập của cửa hàng đó. Mã cũng hết hạn theo TTL 15 phút và khung giờ lấy ± 30 phút | Thấp |
| T | Khai sai số lượng khi bàn giao | `handover_lines` đối soát từng dòng: đặt ≥ lấy ≥ giao; người mang hàng khai `proposed_lines`, còn **bên quét mã** chốt số lượng (cửa hàng ở bước pickup, tổ chức ở bước dropoff), nên mỗi con số đều có hai bên đối chiếu | TB |
| R | Chối đã giao hoặc đã nhận | Mỗi handover ghi `scanned_by`, `consumed_at`, `client_op_id`; hai bước pickup và dropoff là hai sự kiện độc lập | Thấp |

### 2.7 Service role key (và các secret khác)

| STRIDE | Kịch bản | Biện pháp | Rủi ro còn lại |
|---|---|---|---|
| E | Key lọt vào bundle client | Chỉ dùng trong `src/server/**` có `import 'server-only'`; ESLint cấm import `src/server` từ client component; CI quét `.next/static` tìm mẫu `sb_secret_`, `service_role`, `eyJhbGciOi` (C14) | Thấp |
| E | Key lọt vào Git (lỗi B5 cũ) | Repo mới, lịch sử sạch; `.env*` nằm trong `.gitignore`; gitleaks chạy trong CI và pre-commit; Claude Code bị `permissions.deny` đọc `.env*` | Thấp |
| E | Lạm dụng endpoint job `/api/jobs/dispatch` | Kiểm HMAC-SHA256 (`JOBS_HMAC_SECRET` lưu trong Supabase Vault và Vercel env) kèm timestamp, cửa sổ 5 phút chống replay | Thấp |
| I | Key cũ của project Supabase cũ (`idhpydhlgnxjjtyrgfkj`) | Không dùng lại. Nhắc chủ project cũ rotate key hoặc tạm dừng project; không migrate dữ liệu thật từ bản cũ | TB (ngoài phạm vi kiểm soát) |

### 2.8 Bổ sung: tính toàn vẹn số liệu tác động (ESG)

| STRIDE | Kịch bản | Biện pháp |
|---|---|---|
| T | Thổi phồng kg để làm đẹp báo cáo CSR | Ledger append-only; chỉ ghi lúc dropoff đã đối soát; `kg_snapshot` cố định lúc đặt chỗ; khối lượng mặc định của danh mục được gắn `weight_source='category_default'`. Admin thấy cảnh báo khi kg/đơn vị lệch quá 3 lần mức mặc định |
| T | Sửa hệ số để số đẹp hơn | `impact_factors` có version, không UPDATE, phải có nguồn; đổi hệ số phải qua migration và ADR |
| R | Đảo ngược tác động mà không có dấu vết | Chỉ tạo dòng `reversal` (được từng phần) tham chiếu `reverses_entry_id`, Σ reversal ≤ credit; không UPDATE/DELETE (C15) |

---

### 2.9 Hotline tổ chức và số điện thoại tình nguyện viên trong chuyến (B1, 10/2026)

| STRIDE | Kịch bản | Biện pháp | Rủi ro còn lại |
|---|---|---|---|
| I | Người ngoài thu thập hàng loạt hotline | Hotline ở bảng riêng `org_contacts` (không phải `organizations` mà anon đọc được); chỉ đọc qua `get_org_contact`: tổ chức đích phải `approved`, người gọi là owner/manager/staff của tổ chức `approved`, thành viên của chính tổ chức, hoặc TNV đang chạy chuyến qua đó; 60 lần/giờ/người; app chỉ tải khi bấm “Liên hệ” | Thấp |
| I | Cửa hàng/điều phối viên lưu số cá nhân của TNV để liên hệ ngoài chuyến | Mặc định chỉ thấy số đã che; số đầy đủ chỉ khi TNV **tự bật** đồng ý `trip_contact` (không tích sẵn — NĐ 356 cấm mặc định đồng ý) **và** chuyến đang sống; mỗi lần xem ghi `contact.reveal` (không ghi số); 10 lần/giờ; tắt là hết hiệu lực ngay | TB |
| E | Lỗi logic NULL cho phép đọc nhầm (bài học `issue_handover_token`) | Mọi điều kiện quyền bọc `coalesce(…, false)`; pgTAP gồm ca NULL, người ngoài, admin, chuyến kết thúc (`rpc/org_contacts`, `rpc/reveal_trip_contact`) | Thấp |

## 3. Biện pháp kiểm soát

### C1 — RLS trên mọi bảng
- Migration nào tạo bảng cũng phải có `alter table … enable row level security` và policy rõ ràng. Skill `new-migration` bắt buộc điều này.
- CI chạy pgTAP `rls_enabled_everywhere.test.sql`: tất cả bảng trong `public` phải có `relrowsecurity = true`.
- Helper (`security definer`, `stable`, `set search_path = ''`; schema `private`, chữ ký chính xác ở DATA-MODEL §9):
  - `is_admin()`: có `platform_role='admin'` **và** aal2.
  - `is_org_member(org_id, roles text[] default null)`.
  - `is_active_org_member(org_id, roles text[] default null)`: thành viên **và** `organizations.status='approved'`.
  - `can_access_site(site_id)`: xét `org_members.site_ids`; null nghĩa là mọi điểm.
- View dùng `with (security_invoker = true)`.
- Materialized view (`esg_monthly`) bị `revoke all … from anon, authenticated`; chỉ đọc qua RPC có kiểm tra quyền.
- Ma trận vai trò × bảng nằm trong `docs/DATA-MODEL.md`; pgTAP `rls_matrix.test.sql` kiểm từng ô.

### C2 — Vai trò không bao giờ lấy từ metadata
- `handle_new_user()` chỉ insert `profiles(id, email, platform_role='user')`.
- Vai trò trong tổ chức (`org_members.role`) chỉ được tạo qua các RPC sau:
  - `create_organization`: người tạo thành owner (idempotent theo `client_op_id`).
  - `accept_invite`: token mời được hash, dùng một lần, hết hạn sau 7 ngày.
- `platform_role='admin'` chỉ cấp bằng SQL chạy với service role, có ghi `audit_logs`. Cách làm nằm trong `DEPLOYMENT.md` §5.6.
- Không dùng `user_metadata` hay `app_metadata` để phân quyền ở bất kỳ đâu. Middleware Next.js chỉ đọc quyền từ DB.

### C3 — MFA admin, kiểm tra trong DB
```sql
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((auth.jwt() ->> 'aal') = 'aal2', false)
     and exists (select 1 from public.profiles p
                 where p.id = auth.uid() and p.platform_role = 'admin');
$$;
```
- UI `/admin` buộc enroll TOTP ở lần đăng nhập đầu, và buộc challenge mỗi phiên.
- Dù UI có lỗi, token aal1 vẫn không đọc được dữ liệu admin.
- pgTAP: giả lập JWT có `aal='aal1'` thì `is_admin()` trả về false.

### C4 — Chuyển trạng thái chỉ qua RPC, có `client_op_id`
- Mọi chuyển trạng thái (duyệt tổ chức, đặt chỗ, xác nhận, bàn giao, duyệt minh chứng, hủy) là RPC `security definer`. Mỗi RPC:
  1. Kiểm tra quyền bằng helper.
  2. Khóa dòng theo thứ tự `ORDER BY id` (tránh deadlock).
  3. Kiểm tra invariant.
  4. Ghi `audit_logs`.
  5. Ghi `notification_outbox` khi cần.
- `client_op_id uuid` do client sinh một lần cho mỗi ý định của người dùng. Bảng `rpc_idempotency` (DATA-MODEL §15) lưu `client_op_id`, `actor_id`, `rpc_name`, `request_hash`, `response`. Gọi lại thì trả kết quả cũ, không làm lại.

### C5 — Quyền cột theo danh sách cho phép (allow-list)
- `revoke update on <bảng> from authenticated;` rồi `grant update (<các cột được sửa>) on <bảng> to authenticated;` (DATA-MODEL §9.4). **Không** dùng `REVOKE UPDATE (cột)` đơn lẻ: trên Supabase, `authenticated` có sẵn quyền UPDATE mức bảng nên revoke từng cột không có tác dụng.
- Cột không có trong danh sách cho phép (chỉ RPC đổi) gồm: `status`, `platform_role`, `trust_score`, `reviewed_by/at`, `rejection_reason`, `id_verified_at`, `verified_by`, `qty_*`, `effective_deadline`, `safety_attested_at`. Chỉ RPC được đổi.
- pgTAP `column_privileges.test.sql` dùng `column_privs_are()` để khóa danh sách cột được phép.

### C6 — Tách dữ liệu nhạy cảm
- `organizations` (tên, loại, mô tả, trạng thái) tách khỏi `org_sensitive` (mã số thuế/số đăng ký, người đại diện, `representative_id_last4`, SĐT, email liên hệ nội bộ). Chỉ owner/manager và admin đọc được.
- `org_documents` chỉ chứa metadata của file trong bucket `kyc`.
- Số CCCD đầy đủ của người đại diện nằm riêng ở `private.org_representative_ids` (không grant), chỉ admin aal2 đọc qua RPC có nhật ký; không bao giờ có ảnh CCCD.
- Hotline tổ chức nằm ở `org_contacts` (RLS: chỉ owner/manager của chính tổ chức và admin đọc trực tiếp); bên khác chỉ đọc qua `get_org_contact`.
- Trang công khai chỉ đọc view `public_org_cards` và `public_impact_stats`. Bảng `sites` chỉ grant SELECT các cột an toàn; tọa độ công khai là cột sinh `public_location`, tính theo `visibility`:
  - `public`: tọa độ thật.
  - `approximate`: snap về lưới 0,005° (khoảng 550 m).
  - `hidden`: không trả tọa độ, chỉ tên phường.
- Tọa độ và địa chỉ chính xác chỉ đọc qua RPC `get_site_location`, cho đúng người cần giao nhận (DATA-MODEL §8.2).

### C7 — Storage

| Bucket | Loại | Ai đọc | Cách đọc | TTL | Giới hạn |
|---|---|---|---|---|---|
| `kyc` | private | owner của tổ chức, admin aal2 | `createSignedUrl` từ server action có kiểm quyền | **60 s** | 10 MB; pdf/jpeg/png/webp |
| `proofs` | private | tổ chức đăng; admin aal2; cửa hàng liên quan **chỉ khi đã approved** | signed URL | **300 s** | 5 MB/ảnh (sau khi nén); jpeg/webp |
| `media` | public | mọi người | public URL | — | 5 MB (bucket `media`; client nén ảnh về ≤ 1600 px, thường < 1 MB trước khi tải); ảnh lô hàng, logo, ảnh bìa; jpeg/webp/png |

- Đường dẫn file theo mẫu `{org_id}/{uuid}.{ext}`; policy `storage.objects` kiểm tra tiền tố `org_id` bằng `is_org_member`.
- Bucket, giới hạn và policy được tạo bằng migration, không tạo tay trên dashboard.
- Xóa file luôn đi qua Storage API (job dispatch). Không `DELETE` thẳng trong `storage.objects`, vì làm vậy chỉ xóa metadata còn file vẫn nằm lại.

### C8 — Bản đồ công khai lưới 500 m
- `/impact` và landing chỉ nhận dữ liệu tổng hợp từ RPC `public_activity_grid()`:
  - Ô lưới khoảng 500 m (`impact_public_daily.cell_key` = geohash của `public_location` đã snap 0,005°; điểm không public thì dùng `ward:<tên phường>`), kèm tổng kg và số lần bàn giao.
  - Ô có ít hơn 3 lần bàn giao trong khoảng truy vấn thì gộp lên cấp phường hoặc ẩn (k-anonymity tối thiểu; DATA-MODEL §8.6 `public_activity_grid`).
- Không bao giờ trả `site_id`, tên tổ chức có `visibility <> 'public'`, hay thời điểm chính xác. Dữ liệu được làm tròn theo ngày.
- Cột `sites.visibility` (`public|approximate|hidden`) do tổ chức đặt; mái ấm và nơi tạm lánh mặc định `hidden`.

### C9 — Vị trí tình nguyện viên
- Realtime **Broadcast** trên kênh private `trip:{pickup_id}`, authorization bằng RLS trên `realtime.messages`. Chỉ hai nhóm được nghe: thành viên `owner|manager` của tổ chức sở hữu chuyến, và chính tình nguyện viên.
- Server ghi `pickups.last_location` (một điểm, làm tròn khoảng 11 m) qua `update_pickup_progress`, tối đa 1 lần mỗi `location_min_interval_seconds` (30 giây), để tính ETA.
- Khi chuyến kết thúc (`record_dropoff` đưa chuyến về `completed`) hoặc bị hủy (`cancel_pickup`), RPC đặt `last_location = null`. CHECK trong DB bảo đảm chuyến đã kết thúc thì không còn vị trí.
- Rút consent `location_trip` thì ngừng gửi ngay và xóa điểm.

### C10 — Token QR và mã 6 số
- Sinh trong RPC `issue_handover_token(p_stop_id, p_lines, p_client_op_id)`. Chỉ **người mang hàng** được gọi: tình nguyện viên được gán chuyến, hoặc nhân viên tổ chức khi tự đến lấy. Người này hiện QR ở cả hai bước.
- Token ngẫu nhiên ≥ 128 bit (DATA-MODEL: 32 byte). Trả plaintext **một lần** cho client; DB chỉ lưu `token_hash = sha256(token)` và `code_hash = sha256(handover_id || ':' || code)` cho mã 6 số.
- Phát lại thì hash mới ghi đè, token và mã cũ mất hiệu lực; `failed_attempts` về 0.
- `consume_handover_token` / `consume_handover_code` (pickup, cửa hàng quét) và `record_dropoff` (dropoff, tổ chức quét) chỉ chạy khi đủ các điều kiện:
  - (a) người gọi là thành viên đã duyệt của **bên đối diện**: cửa hàng của điểm dừng ở bước pickup, tổ chức nhận ở bước dropoff, và khác người phát token;
  - (b) `now() <= token_expires_at` (TTL 15 phút từ lúc phát) **và**, ở bước pickup, `now()` nằm trong khung giờ lấy của mọi phân bổ ở điểm dừng ± `handover_window_grace_minutes` (30 phút, không vượt `offers.expires_at`); `issue_handover_token` cũng chỉ phát trong khoảng này (DATA-MODEL §2.3 "Hiệu lực token");
  - (c) `consumed_at is null`;
  - (d) `failed_attempts < handover_max_failed_attempts` (5). Nhập sai thì tăng bộ đếm và trả `{ok:false}` thay vì raise (DATA-MODEL §6.6);
  - (e) số lượng từng dòng thỏa `qty ≤` số đã đặt (pickup) hoặc `≤` số đã lấy (dropoff).
- QR chỉ mã hóa **token thô** (43 ký tự base64url), không phải URL (quyết định 08/10): ảnh chụp QR không để lộ tên miền hay đường dẫn, và chỉ màn quét trong cổng cửa hàng (đã đăng nhập, đúng cửa hàng) mới dùng được. Máy quét vẫn chấp nhận dạng cũ `/h/<token>` hoặc `?t=<token>` để tương thích. Token không bao giờ nằm trong URL, `localStorage`, log hay analytics; trang hiện QR có `referrer: no-referrer` và `noindex`.

### C11 — Rate limiting
- Bảng `rate_limits(key text, window_start timestamptz, count int, primary key(key, window_start))`; hàm `private.check_rate_limit(p_key, p_limit, p_window)` được gọi đầu các RPC nhạy cảm, vượt ngưỡng thì raise `PT429` (DATA-MODEL §15).

| Hành động | Khóa | Ngưỡng mặc định |
|---|---|---|
| Đăng ký, gửi OTP (ngoài giới hạn của Supabase Auth) | IP băm + email băm | 5/giờ |
| Nhập mã 6 số sai | handover_id | 5 lần thì khóa |
| Đăng lô | org_id | 60/giờ |
| Gửi yêu cầu nhận | org_id | 60/giờ |
| Mời tình nguyện viên | org_id | 30/ngày |
| Gọi AI (tự điền, kiểm minh chứng) | org_id | 20/giờ (`AI_OFFER_RATE_LIMIT` trong `src/features/offers/ai.server.ts`, khóa `ai_offer_draft:org:<id>`) |
| Upload minh chứng | user_id | 60/giờ |
| Export dữ liệu cá nhân | user_id | 3/ngày |

- Khóa IP luôn được băm bằng HMAC với secret, không lưu IP thô. Job dọn `rate_limits` cũ hơn 24 giờ.
- Bật thêm Vercel Firewall (Attack Challenge Mode) khi bị tấn công; xem mục 9.

### C12 — Quy trình minh chứng: không tin kết quả làm mờ trên client
- Trạng thái: `submitted → approved | needs_changes | rejected`.
- Cửa hàng chỉ thấy minh chứng `approved` (RLS).
- Màn duyệt của admin hiện từng ảnh kèm `face_count` do client báo, có nút "Phát hiện mặt chưa mờ → yêu cầu sửa".
- Lớp bảo vệ thứ hai sau giải: Amazon Rekognition `DetectFaces` phía server (xem `AWS-MIGRATION.md`).

### C13 — Mã hóa lại ảnh (loại bỏ EXIF/GPS)
- Mọi ảnh (lô hàng, minh chứng, giấy tờ dạng ảnh) đi qua `reencodeImage(file)`: `createImageBitmap` (có `imageOrientation: 'from-image'`), vẽ lên `OffscreenCanvas`/`canvas`, rồi `toBlob('image/webp', 0.85)`.
- Cạnh dài tối đa 2048 px. Ảnh đầu ra không còn EXIF, GPS, XMP.
- Unit test: ảnh fixture có GPS → sau xử lý, `exifr.gps()` trả về `undefined`.
- PDF giấy tờ không qua bước này. PDF chỉ admin xem, và bị xóa sau 30 ngày.

### C14 — CSP và header bảo mật
- Đặt trong `next.config.ts` (header tĩnh) và `middleware.ts` (CSP có nonce theo request):

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'nonce-{N}' 'strict-dynamic' 'wasm-unsafe-eval';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob: https://<project>.supabase.co https://*.goong.io;
  font-src 'self';
  connect-src 'self' https://<project>.supabase.co wss://<project>.supabase.co
              https://rsapi.goong.io https://tiles.goong.io https://*.ingest.sentry.io
              https://vitals.vercel-insights.com;
  worker-src 'self' blob:;
  frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none';
  upgrade-insecure-requests
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(self), geolocation=(self), microphone=(), payment=(), usb=()
Cross-Origin-Opener-Policy: same-origin
X-Robots-Tag: noindex   (chỉ ở staging/preview)
```

- `'wasm-unsafe-eval'` cần cho MediaPipe. Model `.tflite` và file wasm của MediaPipe **tự host** trong `public/`, không tải từ CDN.
- `blob:` trong `worker-src` cần cho MapLibre.
- Domain Goong chính xác chốt sau spike P0 rồi cập nhật bảng trên.
- Tiêu chí kiểm tra: header đầy đủ (E2E kiểm tra header); securityheaders.com đạt hạng A trở lên trước M3.

### C15 — Audit log và ledger append-only
- `audit_logs` và `impact_ledger` có `revoke update, delete … from authenticated, anon`.
- Trigger `forbid_mutation` chặn `UPDATE`/`DELETE` cả với role `postgres`. Muốn sửa phải tạo bản ghi bù.
- Cột của `audit_logs` theo DATA-MODEL §14 (nguồn sự thật): `at`, `actor_id`, `actor_kind`, `actor_org_role`, `org_id`, `action`, `entity_type`, `entity_id`, `before`, `after`, `reason`, `request_id`, `client_op_id`. Không lưu IP.

### C16 — Quản lý secrets

| Secret | Lưu ở đâu | Ai truy cập | Rotate |
|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel env (Sensitive), GitHub Environments `staging`/`production` | Minh | Khi nghi lộ; khi có thành viên rời nhóm |
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` (CI migrate) | GitHub Environments; `production` bắt buộc Minh duyệt | Minh | 90 ngày |
| `JOBS_HMAC_SECRET` | Vercel env + Supabase Vault (`vault.create_secret`) | Minh | 90 ngày |
| `RESEND_API_KEY`, `GOONG_API_KEY`, `ANTHROPIC_API_KEY`, `VAPID_PRIVATE_KEY`, `SENTRY_AUTH_TOKEN` | Vercel env (Sensitive) | Minh | Khi nghi lộ |
| Mã khôi phục MFA admin | Giấy hoặc trình quản lý mật khẩu của từng người | Từng admin | — |

- Không bao giờ để secret trong `NEXT_PUBLIC_*`. `src/lib/env.ts` (zod) tách schema server và client; build fail nếu thiếu biến.
- Không đặt giá trị mặc định cho secret (rút kinh nghiệm từ B5).
- Danh sách biến đầy đủ: `DEPLOYMENT.md` §8.

### C17 — Chuỗi cung ứng (dependency, CI, Claude Code)
- **npm/pnpm:**
  - Commit `pnpm-lock.yaml`; CI chạy `pnpm install --frozen-lockfile`.
  - pnpm 10 chặn lifecycle script mặc định; chỉ whitelist trong `pnpm.onlyBuiltDependencies` (ví dụ `sharp`, `esbuild`, `supabase`).
  - Đặt `minimumReleaseAge` (tối thiểu 3 ngày) nếu phiên bản pnpm hỗ trợ, để tránh gói vừa bị chiếm quyền.
  - `pnpm audit --prod --audit-level high` chạy trong CI và chặn merge.
  - Renovate hoặc Dependabot hằng tuần, gộp nhóm. Không auto-merge major.
- **Thêm thư viện mới:** ghi lý do trong PR, kiểm license (MIT/Apache/BSD/ISC), số lượt tải tuần, maintainer, lần phát hành gần nhất. Ưu tiên tính năng native và thư viện sẵn có (theo tinh thần ponytail).
- **GitHub Actions:**
  - Pin action theo **commit SHA**.
  - `permissions:` mặc định `contents: read`.
  - Secret production chỉ có ở Environment `production`, phải có người duyệt.
  - Không chạy workflow có secret trên PR từ fork.
- **Plugin, skill và MCP của Claude Code** (rủi ro cao vì chạy code trên máy dev):
  - Trước khi bật, đọc toàn bộ `SKILL.md`, hook, script và cấu hình MCP.
  - Ghi vào bảng "Plugin đã duyệt" (tên, nguồn, commit hoặc version, ngày duyệt, người duyệt) trong `docs/adr/`.
  - Pin version hoặc commit. Đọc lại diff mỗi lần cập nhật.
  - Plugin có hook chạy lệnh shell hoặc gọi mạng phải được Minh duyệt riêng.
  - Supabase MCP chỉ cấu hình **read-only** và **chỉ staging**; tuyệt đối không trỏ vào prod.
  - Hook an toàn của dự án luôn kiểm tra **lệnh gốc** trước khi RTK viết lại.
  - Không cấp `.env*` cho bất kỳ agent nào (`permissions.deny`).
- **Quét secret:** gitleaks trong CI (mọi PR) và pre-commit (tùy chọn trên máy).

### C18 — Sao lưu và khôi phục
- **Supabase Free không đảm bảo bản sao lưu cho người dùng tải về.** Cần kiểm tra lại trang pricing; gói Pro có daily backup 7 ngày. Vì vậy:
  - GitHub Action `backup.yml` chạy hằng đêm (02:00 giờ VN):
    - `supabase db dump --linked` cho schema, data và roles của **prod**.
    - Mã hóa bằng `age` với public key của Minh (private key giữ ngoại tuyến).
    - Upload làm artifact với `retention-days: 7`.
    - Không lưu bản không mã hóa ở đâu cả.
  - Storage: `proofs` sao lưu hằng tuần bằng script (đã mã hóa). `kyc` **không** sao lưu, vì file sẽ bị xóa sau 30 ngày theo chính sách.
  - **Diễn tập khôi phục** một lần trong P5: restore bản dump vào Supabase local và chạy pgTAP.
  - Nếu nâng gói Pro trong tháng 11 thì giữ cả hai cơ chế.

### C19 — Môi trường tách biệt
- Local (Docker) / staging / prod là ba project tách hẳn. Dữ liệu thật **chỉ** nằm ở prod.
- Staging chỉ có dữ liệu seed hư cấu. Không copy dữ liệu prod xuống staging hay máy local.

### C20 — Dữ liệu demo
- Tổ chức demo có `is_demo=true`, tên hư cấu, không dùng thương hiệu thật.
- `demo_reset()` chỉ xóa và tạo lại dữ liệu gắn với tổ chức `is_demo`. pgTAP kiểm tra rằng sau reset dữ liệu thật không đổi.
- Role switcher chỉ hiện với tài khoản demo (`profiles.is_demo`) và chỉ chuyển giữa vai trò cửa hàng/tổ chức/TNV demo, **không** sang Admin.
- Giám khảo **không** được cấp tài khoản admin; mỗi vai trò có tài khoản demo riêng. Vai trò `admin_viewer` chỉ đọc chỉ tạo khi BTC yêu cầu, kèm ADR và review bảo mật.

---

## 4. Khung pháp lý

> ⚠️ Nhóm **không phải luật sư**. Phần này dùng để thiết kế hệ thống và chuẩn bị câu trả lời phản biện. Trước khi pilot thật (15/11), cần một người có chuyên môn pháp lý đọc lại Điều khoản, Chính sách bảo mật và mẫu đồng ý. Có thể nhờ cố vấn IEC hoặc Quỹ Khởi Sự Từ Tâm giới thiệu.

### 4.1 Văn bản áp dụng

| Văn bản | Hiệu lực | Liên quan tới FoodSave |
|---|---|---|
| **Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15** | 01/01/2026 | Khung chính: nguyên tắc xử lý, đồng ý, dữ liệu nhạy cảm, quyền chủ thể, dữ liệu trẻ em, đánh giá tác động, chuyển dữ liệu ra nước ngoài, thông báo vi phạm |
| **Nghị định 356/2025/NĐ-CP** quy định chi tiết Luật 91/2025 | Ban hành 31/12/2025, hiệu lực 01/01/2026, thay NĐ 13/2023 (đã kiểm chứng 09/10/2026, xem 4.5) | **Điều 3** danh mục dữ liệu cơ bản (có số điện thoại, số định danh cá nhân, hình ảnh của cá nhân). **Điều 4** danh mục dữ liệu nhạy cảm (có vị trí xác định qua dịch vụ định vị; hình ảnh thẻ căn cước/CCCD/CMND; sinh trắc học). Đồng ý phải kiểm chứng được, **cấm mặc định đồng ý**. Hồ sơ DPIA (Mẫu 09) và chuyển dữ liệu ra nước ngoài (Mẫu 10) được A05 xem xét trước (15 ngày). Miễn trừ cho doanh nghiệp nhỏ, khởi nghiệp đến 01/01/2031, **trừ khi trực tiếp xử lý dữ liệu nhạy cảm** hoặc từ 100.000 chủ thể |
| Nghị định 13/2023/NĐ-CP | 01/07/2023 – 31/12/2025 (được NĐ 356 thay thế) | **Tham chiếu lịch sử.** Tài liệu bàn giao bản cũ viện dẫn văn bản này cho lỗi B3/B4. NĐ 356 giữ vị trí định vị trong nhóm nhạy cảm, nên FoodSave tiếp tục coi vị trí tình nguyện viên là dữ liệu nhạy cảm |
| Luật An toàn thực phẩm 55/2010/QH12; Nghị định 15/2018/NĐ-CP | Đang hiệu lực (cần kiểm chứng sửa đổi) | Trách nhiệm cơ sở cung cấp thực phẩm; xem mục 8 |
| Luật An ninh mạng 2018 và văn bản hướng dẫn | Đang hiệu lực | Lưu trữ dữ liệu, phối hợp khi có sự cố; xem 4.4 |

### 4.2 Các yêu cầu chính và cách FoodSave đáp ứng

Mọi tham chiếu "Điều …" trong bảng đều **cần kiểm chứng điều khoản**. Nhóm chỉ ghi nội dung yêu cầu.

| Yêu cầu (theo tinh thần Luật 91/2025 và NĐ 356/2025) | Thiết kế FoodSave |
|---|---|
| Xử lý dữ liệu phải có căn cứ (đồng ý hoặc căn cứ khác luật cho phép), đúng mục đích, tối thiểu | Kiểm kê dữ liệu (mục 5) ghi mục đích và căn cứ cho từng loại; chỉ thu những trường cần |
| Đồng ý phải tự nguyện, rõ ràng, cụ thể theo **từng mục đích**, chứng minh được, rút lại được | Bảng `consents` theo mục đích, có `policy_version`; rút đồng ý có hiệu lực ngay (mục 6, 7) |
| Dữ liệu cá nhân nhạy cảm cần thông báo rõ và biện pháp bảo vệ tăng cường (NĐ 356 Điều 4) | Vị trí tình nguyện viên (nhạy cảm): consent riêng, chỉ khi app mở, chỉ giữ điểm mới nhất. Ảnh trẻ em: làm mờ và duyệt. **Không** thu sinh trắc (khuôn mặt) và **không thu ảnh CCCD** (nhạy cảm theo Điều 4); chỉ thu **số** CCCD người đại diện (dữ liệu cơ bản theo Điều 3) |
| Dữ liệu trẻ em: cần đồng ý của cha mẹ hoặc người giám hộ (độ tuổi và điều kiện: cần kiểm chứng điều khoản) | FoodSave **không** có tài khoản trẻ em (đăng ký phải từ 18 tuổi). Trẻ em chỉ có thể xuất hiện trong ảnh minh chứng. Tổ chức cam kết đã có đồng ý của người giám hộ hoặc cơ sở bảo trợ, và ảnh phải làm mờ mặt. Hướng dẫn: không chụp trẻ em nếu không cần |
| Quyền của chủ thể: biết, đồng ý, truy cập, chỉnh sửa, xóa, rút đồng ý, hạn chế, phản đối, khiếu nại | Luồng tự phục vụ tại `/settings/privacy` (mục 7) |
| Đánh giá tác động xử lý dữ liệu cá nhân (hồ sơ DPIA, Mẫu 09 NĐ 356; A05 xem xét trước) | **Chưa soạn** (`docs/legal/dpia.md` chưa có). Vì FoodSave xử lý vị trí tình nguyện viên (nhạy cảm), **không thuộc diện miễn trừ**. Trước pilot thật 15/11 phải chọn: soạn DPIA và hỏi cố vấn pháp lý, **hoặc** pilot tắt chia sẻ vị trí và check-in bằng mã tại cửa hàng (ROADMAP R17) |
| Chuyển dữ liệu cá nhân ra nước ngoài: hồ sơ đánh giá tác động (Mẫu 10 NĐ 356) | Dữ liệu lưu ở **Supabase Tokyo (ap-northeast-1)**, ứng dụng chạy Vercel vùng Tokyo; bên xử lý ở nước ngoài: Supabase, Vercel, Google (Gmail SMTP), OpenAI (ảnh thực phẩm để tự điền). Goong xử lý tại Việt Nam. Giảm thiểu: không gửi dữ liệu cá nhân cho AI (chỉ ảnh thực phẩm, đã mã hóa lại để xóa EXIF), không dùng Sentry ở giai đoạn thi. Hồ sơ là việc pháp lý trước pilot thật (mục 11) |
| Thông báo vi phạm dữ liệu cá nhân cho A05; với dữ liệu vị trí và sinh trắc, NĐ 356 yêu cầu **thông báo cả chủ thể dữ liệu trong 72 giờ** | Runbook mục 9 đặt mục tiêu nội bộ **72 giờ** kể từ khi phát hiện, gồm cả thông báo cho tình nguyện viên bị ảnh hưởng |
| Chế tài: phạt hành chính, có mức theo % doanh thu cho một số vi phạm (cần kiểm chứng điều khoản) | Không trích con số trong slide khi chưa kiểm chứng |

### 4.3 Vai trò pháp lý: **câu hỏi mở**

- **Bên kiểm soát dữ liệu là ai?** Hiện FoodSave là dự án của nhóm sinh viên, chưa có pháp nhân.
- **Đề xuất:** ghi "Ban vận hành dự án FoodSave" kèm thông tin liên hệ của Minh trong Chính sách bảo mật giai đoạn thi. Khi nhận vốn triển khai, xác định pháp nhân (đơn vị bảo trợ hoặc thành lập tổ chức) rồi cập nhật `policy_version`.
- Các nhà cung cấp hạ tầng (Supabase, Vercel, Google Gmail SMTP, Goong, OpenAI) là **bên xử lý dữ liệu**. Liệt kê họ trong Chính sách bảo mật kèm quốc gia xử lý.

### 4.4 Lưu trữ tại Việt Nam
- Luật An ninh mạng và văn bản hướng dẫn có quy định lưu trữ dữ liệu tại Việt Nam cho một số loại doanh nghiệp và dịch vụ, áp dụng khi có yêu cầu của cơ quan chức năng (cần kiểm chứng phạm vi áp dụng với dự án phi lợi nhuận quy mô nhỏ).
- Giai đoạn thi: project Supabase production đặt ở **Tokyo (ap-northeast-1)**, Vercel chạy vùng `hnd1` (Tokyo); xem ROADMAP §8 ngày 07/10.
- Kế hoạch sáu tháng ghi rủi ro này. Phương án dự phòng: chuyển DB sang hạ tầng đặt tại Việt Nam nếu được yêu cầu. Kiến trúc adapter cho phép đổi mà không viết lại ứng dụng.

### 4.5 Nguồn đã kiểm chứng (09/10/2026)

- Văn bản NĐ 356/2025 (Điều 3, Điều 4, miễn trừ): https://ketoananpha.vn/nghi-dinh-356-2025-nd-cp
- EY Việt Nam, *Tin nhanh Pháp lý tháng 3/2026* về NĐ 356 (danh mục nhạy cảm bổ sung "hình ảnh căn cước công dân/chứng minh nhân dân"; DPIA/CTIA tiền kiểm A05 15 ngày; miễn trừ và trường hợp không được miễn trừ, tr. 2–6): https://www.ey.com/content/dam/ey-unified-site/ey-com/vi-vn/technical/tax/documents/ey-vietnam-legal-alert-march-2026-decree-no356-2025-nd-cp-providing-detailed-guidance-for-implementation-of-personal-data-protection-law-viet.pdf
- Hệ quả thiết kế: **không thu ảnh CCCD** (Điều 4); số CCCD người đại diện chỉ Admin xem (Điều 3); đồng ý "Gọi trong chuyến" do tình nguyện viên tự bật (cấm mặc định đồng ý).

---

## 5. Kiểm kê dữ liệu

Căn cứ xử lý:
- **HĐ**: thực hiện thỏa thuận sử dụng dịch vụ (Điều khoản), tức đồng ý `terms`.
- **ĐY-x**: đồng ý riêng theo mục đích x.
- **NV**: nghĩa vụ hoặc lợi ích chính đáng gắn với an toàn thực phẩm và chống gian lận.

Mọi căn cứ cần kiểm chứng tên gọi chính xác theo Luật 91/2025.

| # | Dữ liệu | Bảng / nơi lưu | Mục đích | Căn cứ / mục đích đồng ý | Ai truy cập | Thời gian lưu | Cách xóa |
|---|---|---|---|---|---|---|---|
| 1 | Email, mật khẩu (hash do Supabase quản lý) | `auth.users` | Đăng nhập, thông báo | HĐ (`terms`) | Chính người dùng; admin xem email | Đến khi xóa tài khoản | `auth.admin.deleteUser`, cascade hoặc ẩn danh hóa (mục 7.3) |
| 2 | Họ tên, SĐT cá nhân | `profiles` | Liên hệ điều phối | HĐ | Bản thân; thành viên cùng tổ chức (tên); admin | Đến khi xóa tài khoản | Ẩn danh hóa: `full_name='Người dùng đã xóa'`, `phone=null` |
| 3 | Hồ sơ tổ chức công khai (tên, loại hình, mô tả, logo) | `organizations`, bucket `media` | Hiển thị, kết nối | HĐ | Mọi người (khi `approved`) | Đến khi tổ chức đóng | Xóa mềm (`status='closed'`), xóa logo |
| 4 | Mã số thuế / số đăng ký, người đại diện (tên, chức danh, SĐT, email) | `org_sensitive` | Xác minh pháp lý | HĐ + NV | Owner/manager, admin aal2 | Đến khi đóng tổ chức + 12 tháng (đối soát gian lận) | Job xóa cột, giữ `org_id` |
| 5 | `representative_id_last4`, `id_verified_at`, `id_verified_by`, `id_verification_method` (`cccd_qr`/`manual_document`/`video_call`) | `org_sensitive` | Đối chiếu người đại diện | HĐ + NV | Owner/manager (chỉ xem), admin | Như dòng 4 | Như dòng 4 |
| 5a | **Số CCCD đầy đủ** của người đại diện (12 số) + họ tên đọc từ QR (khi quét); **không có ảnh** | `private.org_representative_ids` | Xác minh người đại diện | HĐ + NV | Owner/manager chỉ thấy dạng che; số đầy đủ chỉ admin aal2 qua `reveal_representative_id` (audit `representative_id.reveal`) | Đến khi tổ chức đóng hoặc bị từ chối **+ 30 ngày** | `purge_retention()` xóa dòng; xóa ngay khi 4 số cuối đổi |
| 5b | Hotline tổ chức (SĐT, email công việc — không bắt buộc) | `org_contacts` | Liên hệ khi trao nhận | HĐ | Owner/manager (sửa); thành viên tổ chức `approved`, TNV đang chạy chuyến qua tổ chức, admin (qua `get_org_contact`) | Đến khi tổ chức xóa hotline hoặc tổ chức bị xóa | Xóa dòng (cả hai trường rỗng) |
| 6 | File giấy tờ (giấy phép, ATTP, quyết định thành lập) | bucket `kyc`, `org_documents` | Duyệt tổ chức | HĐ + NV | Owner, admin aal2 (signed URL 60 s) | **30 ngày sau quyết định** duyệt hoặc từ chối | Job pg_cron đánh dấu, rồi dispatch gọi Storage API xóa file; giữ metadata (loại giấy tờ, ngày duyệt, người duyệt) |
| 7 | Địa chỉ và tọa độ điểm (`sites`) | `sites` | Ghép theo bán kính, chỉ đường | HĐ | Theo `visibility`: public cho mọi người; approximate/hidden chỉ thành viên và bên có phân bổ đang chạy | Đến khi xóa điểm | Xóa dòng (nếu không còn phân bổ đang mở) hoặc ẩn danh tọa độ |
| 8 | Hồ sơ tình nguyện viên (phương tiện, sức chở, khu vực gần đúng) | `volunteer_profiles` | Phân công chuyến | HĐ | Bản thân, điều phối viên của tổ chức (kèm SĐT đã che, qua `list_org_volunteers`) | Đến khi rời tổ chức | Xóa dòng khi rời tổ chức |
| 8a | **SĐT đầy đủ của tình nguyện viên trong chuyến** (từ `profiles.phone`, không sao chép) | `profiles`; nhật ký `audit_logs` `contact.reveal` (không có số) | Cửa hàng/điều phối viên gọi khi cần trong chuyến | **ĐY-`trip_contact`** (TNV tự bật, mặc định tắt) | Cửa hàng ở điểm lấy và điều phối viên của đúng chuyến, chỉ khi chuyến đang sống | Không lưu thêm; quyền xem hết khi chuyến kết thúc hoặc TNV tắt | Rút đồng ý (`withdraw_consent('trip_contact')`) |
| 9 | **Vị trí tình nguyện viên** (điểm mới nhất, khoảng 11 m) | `pickups.last_location`, Realtime Broadcast (không lưu) | ETA, điều phối | **ĐY-`location_trip`** | Bản thân, điều phối viên của tổ chức; cửa hàng chỉ thấy ETA | **Đến khi kết thúc chuyến** | RPC đặt `null`; Broadcast không lưu |
| 10 | Vị trí check-in (tại điểm dừng) | `pickup_stops.arrived_at` (chỉ thời điểm và cờ "trong geofence") | Xác nhận đến nơi | ĐY-`location_trip` | Tổ chức, cửa hàng của điểm dừng đó | 12 tháng | Không lưu tọa độ, chỉ boolean |
| 11 | Ảnh minh chứng đã làm mờ, `face_count` | bucket `proofs`, `proof_media` | Minh bạch sử dụng thực phẩm | **ĐY-`proof_photo`** (của người đăng) + cam kết của tổ chức về đồng ý của người trong ảnh | Tổ chức đăng; admin; cửa hàng liên quan (sau khi approved) | **12 tháng** sau khi duyệt, sau đó xóa file, giữ metadata (số ảnh, đã duyệt) | Job xóa qua Storage API |
| 12 | Mô tả minh chứng, `people_served`, địa điểm phát (gần đúng), thời điểm | `proofs` | Minh bạch, ESG | HĐ | Như dòng 11 | 36 tháng (số liệu ESG nhiều năm) | Ẩn danh: xóa mô tả tự do, giữ số |
| 13 | Ảnh lô hàng | bucket `media` | Hiển thị lô | HĐ | Mọi tổ chức đã duyệt | 90 ngày sau khi lô đóng | Job xóa |
| 14 | Bản ghi đồng ý | `consents` | Chứng minh đồng ý | NV | Bản thân, admin; điều phối viên của tổ chức chỉ thấy **cờ** "đã đồng ý `location_trip`" (RPC `list_org_volunteers`, không đọc bảng) | Đến khi xóa tài khoản + 36 tháng (chứng minh khi có tranh chấp; cần kiểm chứng thời hạn hợp lý) | Ẩn danh `user_id` |
| 15 | Audit log | `audit_logs` | Truy vết, chống gian lận | NV | Admin aal2 | 24 tháng | Job xóa dòng quá hạn (ngoại lệ duy nhất của quy tắc append-only, chạy bằng `postgres` có ghi lại) |
| 16 | Sổ tác động | `impact_ledger` | ESG | NV / HĐ | Tổ chức liên quan, admin; tổng hợp công khai | Không giới hạn (dữ liệu cấp tổ chức, không chứa dữ liệu cá nhân) | — |
| 17 | Push subscription (endpoint, khóa) | `push_subscriptions` | Web Push | ĐY (quyền thông báo của trình duyệt) | Hệ thống | Đến khi hủy, hoặc endpoint trả 404/410 | Xóa dòng |
| 18 | Thông báo, outbox | `notifications`, `notification_outbox` | Thông báo | HĐ | Người nhận | 90 ngày | Job xóa |
| 19 | Email marketing / bản tin | `consents` (`marketing`) | Bản tin tác động | **ĐY-`marketing`** (mặc định tắt) | Hệ thống gửi | Đến khi rút | Rút đồng ý, ngừng gửi |
| 20 | Khóa rate limit (IP/email đã băm HMAC) | `rate_limits` | Chống lạm dụng | NV | Hệ thống | 24 giờ | Job xóa |
| 21 | Log lỗi (đã lọc dữ liệu cá nhân) | Sentry | Sửa lỗi | NV | Minh | Theo gói Sentry (khoảng 30–90 ngày, cần kiểm chứng) | Tự hết hạn |
| 22 | Log truy cập (có IP) | Vercel | Vận hành | NV | Minh | Theo gói Vercel (Hobby lưu runtime log rất ngắn, cần kiểm chứng) | Tự hết hạn |
| 23 | Ảnh thực phẩm gửi AI để tự điền | OpenAI API (ADR-010; sau này Bedrock) | Tự điền lô | HĐ (tính năng tùy chọn, có ghi chú trên UI) | Nhà cung cấp AI theo chính sách API của họ (cần kiểm chứng thời hạn lưu) | Không lưu thêm ở phía FoodSave ngoài ảnh lô (dòng 13) | — |
| 24a | Yêu cầu sửa trường pháp lý của tổ chức (giá trị cũ/mới: tên pháp lý, mã số thuế/số đăng ký, người đại diện) + giấy tờ kèm | `org_change_requests`, bucket `kyc` (`{org_id}/change/…`), `org_documents.change_request_id` | Xác minh thay đổi pháp lý mà tổ chức vẫn hoạt động | HĐ + NV | Owner/manager của tổ chức (xem yêu cầu của mình); admin aal2 (duyệt) | Giá trị `changes`/`previous` xóa 12 tháng sau quyết định (giữ khóa, người gửi/duyệt, thời điểm); file kèm **30 ngày** sau quyết định như dòng 6 | `purge_retention()` đặt `'{}'`; file qua job `kyc_purge` (Storage API) |
| 24b | Lời cảm ơn cửa hàng gửi tổ chức (văn bản tự do ≤ 500 ký tự, người gửi) | `thank_you_notes` | Ghi nhận, gắn kết hai bên | HĐ | Thành viên cửa hàng gửi, thành viên tổ chức nhận, admin | 24 tháng | `purge_retention()` xóa dòng; ẩn danh `created_by` khi xóa tài khoản |
| 24 | Tài khoản demo và giám khảo | các bảng trên, `is_demo` | Trình diễn | — (dữ liệu hư cấu) | Theo vai trò | Đến khi `demo_reset` | `demo_reset()` |

**Không thu ở v2:**
- Ảnh CCCD — dữ liệu cá nhân nhạy cảm theo NĐ 356/2025 Điều 4; ngày sinh, giới tính, địa chỉ in trên CCCD (QR chỉ được đọc trên máy để lấy số + họ tên).
- Ảnh khuôn mặt hoặc dữ liệu sinh trắc. Face Liveness để sau giải, phải có DPIA riêng.
- Lịch sử vị trí.
- Danh bạ.
- Thông tin người nhận cuối (người hưởng lợi) ở dạng định danh. Chỉ có **số lượng** người.

---

## 6. Thiết kế bản ghi đồng ý (`consents`)

```sql
create type consent_purpose as enum ('terms', 'location_trip', 'proof_photo', 'marketing', 'trip_contact');

create table public.consents (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  purpose         consent_purpose not null,
  policy_version  text not null,              -- ví dụ '2026-10-v1' (app_settings.privacy_policy_version)
  granted_at      timestamptz not null default now(),
  withdrawn_at    timestamptz,
  source          text not null check (source in ('web', 'pwa', 'invite')),
  text_hash       text not null,              -- sha256 của đoạn văn bản đồng ý đã hiển thị
  user_agent      text,
  ip_hash         text,                       -- HMAC, không lưu IP thô
  check (withdrawn_at is null or withdrawn_at >= granted_at)
);
create unique index consents_one_active
  on public.consents (user_id, purpose) where withdrawn_at is null;
```

**Quy tắc:**

| Mục đích | Bắt buộc? | Khi nào hỏi | Văn bản hiển thị (rút gọn) | Hệ quả khi không đồng ý hoặc rút |
|---|---|---|---|---|
| `terms` | Có (để dùng dịch vụ) | Đăng ký | Điều khoản sử dụng + Chính sách bảo mật (link, có version) | Không tạo được tài khoản. Rút đồng ý nghĩa là yêu cầu xóa tài khoản (mục 7.3) |
| `location_trip` | Không | Lần đầu tình nguyện viên bắt đầu chuyến | "Chia sẻ vị trí **chỉ khi app đang mở và trong chuyến** để tổ chức thấy ETA. Không lưu lịch sử. Tắt bất kỳ lúc nào." | Vẫn chạy chuyến được, bằng check-in thủ công tại điểm dừng |
| `proof_photo` | Có, với người **đăng** minh chứng | Lần đầu mở màn Minh chứng | Cam kết chỉ chụp khi người trong ảnh hoặc người giám hộ đồng ý, tránh mặt (nhất là trẻ em), hiểu rằng ảnh được admin duyệt trước khi cửa hàng xem | Không đăng ảnh được; vẫn đăng minh chứng dạng văn bản được (tỷ lệ "lô có minh chứng hợp lệ" có thể thấp hơn) |
| `marketing` | Không, **mặc định tắt** | Cài đặt, hoặc ô tick không tick sẵn khi đăng ký | Nhận bản tin tác động hằng tháng | Không gửi bản tin |
| `trip_contact` | Không, **mặc định tắt** (công tắc không bật sẵn) | Tài khoản TNV và bước nhận chuyến | “Cho phép cửa hàng và điều phối viên gọi tôi khi chuyến đang chạy” + ai xem, khi nào, có nhật ký | Mọi người chỉ thấy số đã che; liên hệ qua điều phối viên/hotline |

- **Ghi:** RPC `grant_consent(purpose, policy_version, text_hash, source)` và `withdraw_consent(purpose)`. Không cho INSERT/UPDATE trực tiếp.
- **Kiểm tra:** `has_consent(user_id, purpose)` được gọi trong:
  - RPC `start_pickup` (bật gửi vị trí);
  - authorization của kênh Realtime gửi vị trí;
  - `submit_proof` (người nộp phải có consent `proof_photo` còn hiệu lực).
- **Đổi chính sách:** tăng `policy_version` (hiện `2026-10-v2`: hotline, gọi trong chuyến, số CCCD, OpenAI) thì người đã đồng ý `terms` bản cũ thấy **banner đồng ý lại không chặn** trong app shell (không có ở trang chủ công khai); “Đồng ý” gọi `grant_consent('terms', …)` với `text_hash` = sha256 đúng chữ banner. Mục đích tùy chọn giữ nguyên trừ khi nội dung mục đích đó thay đổi.
- **Đồng ý của người trong ảnh** (người nhận, trẻ em): xin ngoại tuyến. FoodSave cung cấp mẫu "Phiếu đồng ý chụp ảnh" (`docs/legal/mau-dong-y-chup-anh.md`, soạn trong P4) để tổ chức dùng. FoodSave không lưu phiếu này.

---

## 7. Quyền của chủ thể dữ liệu

Trang `/settings/privacy` (mọi vai trò) có 4 khối. Thời hạn: mục tiêu nội bộ ở cột bên phải. Thời hạn luật định cần kiểm chứng theo NĐ 356/2025.

| Quyền | Luồng | Mục tiêu nội bộ |
|---|---|---|
| **Truy cập / nhận bản sao** | Nút "Tải dữ liệu của tôi" gọi RPC `export_my_data()` (rate limit 3/ngày), trả JSON gồm: profile, memberships, consents, volunteer_profile, các hoạt động mình là actor (audit rút gọn), minh chứng mình đăng (link signed URL 300 s) | Tức thì |
| **Chỉnh sửa** | Trường không pháp lý (tên hiển thị, SĐT, phương tiện, mô tả, logo, giờ mở cửa, liên hệ): tự sửa, không duyệt lại. Trường pháp lý/đã xác minh (tên pháp lý, mã số thuế/số đăng ký, người đại diện, giấy tờ): gửi `submit_org_change_request`; tổ chức **vẫn `approved` và hoạt động**, giá trị mới chỉ áp dụng khi admin duyệt (`review_org_change_request`) | Tự sửa: tức thì; yêu cầu thay đổi: ≤ 3 ngày làm việc |
| **Rút đồng ý** | Công tắc từng mục đích: `withdraw_consent()` | **Tức thì.** `location_trip`: ngừng gửi và xóa điểm. `marketing`: ngừng gửi. `proof_photo`: không đăng ảnh mới được; ảnh đã duyệt giữ theo dòng 11 mục 5, trừ khi người dùng yêu cầu xóa riêng |
| **Xóa** | Xem 7.3 | ≤ 15 ngày (cần kiểm chứng thời hạn luật định) |
| **Phản đối, hạn chế, khiếu nại** | Form "Gửi yêu cầu về dữ liệu" tạo `incidents(kind='privacy')`. Admin xử lý; email xác nhận | Phản hồi ≤ 72 giờ |

### 7.3 Xóa tài khoản
1. Người dùng bấm "Xóa tài khoản" và nhập lại mật khẩu (hoặc OTP).
2. RPC `request_account_deletion()` kiểm tra **nghĩa vụ đang mở**:
   - Là owner duy nhất của tổ chức còn hoạt động: phải chuyển quyền owner hoặc đóng tổ chức trước.
   - Đang có phân bổ hoặc chuyến chưa kết thúc: phải hoàn tất hoặc hủy theo ma trận hủy trước.
   - Minh chứng quá hạn chưa nộp (với owner tổ chức): cảnh báo, không chặn.
3. Đặt `profiles.deletion_requested_at`, đăng xuất mọi phiên, gửi email xác nhận kèm link hủy yêu cầu.
4. Sau **7 ngày** (thời gian cho phép đổi ý), job thực hiện:
   - Ẩn danh `profiles`: tên thành "Người dùng đã xóa", xóa SĐT, `email=null`.
   - Đặt `actor_id=null` trong các bản ghi vận hành; `audit_logs` giữ `actor_id` dạng băm.
   - Xóa `volunteer_profiles`, `push_subscriptions`, `notification_preferences`.
   - Ẩn danh `consents`.
   - Gọi `auth.admin.deleteUser(id)`.
5. **Không xóa:** `impact_ledger`, các handover đã xảy ra (dữ liệu cấp tổ chức, phục vụ ESG và đối soát). Các bản ghi này không còn trỏ tới cá nhân.
6. Tổ chức đóng cửa: `close_organization()` xóa `org_sensitive` sau 12 tháng, xóa file `kyc` còn sót; ledger giữ lại ở dạng tên tổ chức (thông tin của pháp nhân, không phải dữ liệu cá nhân).

---

## 8. An toàn thực phẩm & trách nhiệm pháp lý

**Rủi ro lớn nhất về uy tín** của một nền tảng chia sẻ thực phẩm là có người nhận bị ngộ độc. Thiết kế cố gắng (1) ngăn ngừa, (2) truy vết, (3) phân định trách nhiệm rõ.

### 8.1 Ngăn ngừa
- **Cam kết an toàn khi đăng lô** (bắt buộc, lưu `offers.safety_attested_at` và `safety_attested_by`). Cửa hàng tick vào câu:

  > "Tôi xác nhận thực phẩm còn hạn sử dụng, được bảo quản đúng điều kiện, chưa qua sử dụng, chưa mở bao bì (với hàng đóng gói), và phù hợp để ăn tại thời điểm bàn giao."

- **Thông tin bắt buộc theo nhóm hàng:**
  - Đồ nấu chín: giờ chế biến.
  - Tươi sống, sữa: điều kiện bảo quản (`storage_requirement`: thường/mát/đông).
  - Mọi lô: hạn sử dụng.
- **Danh sách cấm đăng:** đồ đã ăn dở, đồ đã trả lại từ khách, đồ hết hạn, rượu bia, thực phẩm chức năng, sữa công thức trẻ em (khuyến nghị cấm vì rủi ro cao; cần nhóm xác nhận).
- **Nhãn tươi và kiểm tra khả thi:** lô Đỏ chỉ gợi ý cho tổ chức đến kịp, tránh việc nhận được hàng nhưng ăn không kịp.
- **Tổ chức khai năng lực bảo quản** theo từng điểm (`sites.capacity`, có tủ mát hay không). Hệ thống không gợi ý hàng cần giữ mát cho điểm không có tủ mát.

### 8.2 Kiểm tra lúc bàn giao
- **Từ chối từng dòng vì chất lượng:** tại pickup và dropoff, bên nhận có thể giảm số lượng một dòng với lý do `quality_reject` (bắt buộc có ghi chú, ảnh tùy chọn).
  - Số lượng bị từ chối **không** trả về lô (hàng không đạt).
  - Cửa hàng nhận thông báo.
  - Trust score của cửa hàng bị ảnh hưởng nếu bị từ chối lặp lại.
- Hướng dẫn kiểm tra nhanh hiện ngay trên màn bàn giao: bao bì, mùi, nhiệt độ cảm quan, hạn in trên bao bì.

### 8.3 Truy vết
- Mỗi suất thực phẩm truy ngược được: `impact_ledger` → `handover_lines` → `allocations` → `offers` (cửa hàng, điểm, giờ đăng, cam kết, ảnh) → `pickups` (ai lấy, lúc nào).
- Sự cố ngộ độc nghi ngờ: tạo `incidents(kind='food_safety', severity='critical')`, chạy playbook ở mục 9.4.

### 8.4 Điều khoản (trích ý, cần luật sư rà)
- **Bên tặng:** cam kết như 8.1; chịu trách nhiệm về chất lượng **đến thời điểm bàn giao**, trong phạm vi pháp luật cho phép.
- **Bên nhận:** kiểm tra khi nhận, bảo quản và sử dụng đúng hạn; có quyền từ chối; chịu trách nhiệm việc chế biến và phân phát sau bàn giao.
- **FoodSave:** là nền tảng kết nối, **không** sở hữu, vận chuyển hay kiểm định thực phẩm. Trách nhiệm của FoodSave giới hạn trong phạm vi pháp luật cho phép.
- **Miễn trừ cho bên tặng (donor disclaimer):** trong quan hệ giữa các bên dùng nền tảng, bên nhận đồng ý không quy trách nhiệm cho bên tặng về các vấn đề phát sinh **sau** bàn giao, nếu bên tặng đã tuân thủ cam kết.
  - Việt Nam hiện **chưa có luật "Người Samaritan nhân hậu"** riêng cho tặng thực phẩm như Mỹ hay Ý (cần kiểm chứng; theo dõi các đề xuất chính sách).
  - Điều khoản này **không** loại trừ được trách nhiệm theo Luật ATTP hay trách nhiệm dân sự với bên thứ ba (người ăn). Phải nói thẳng điều này với giám khảo nếu được hỏi.
- **Lộ trình:** đề xuất hợp tác với cơ quan quản lý an toàn thực phẩm của TP.HCM (Sở Y tế / Ban quản lý An toàn thực phẩm) và UBND phường nơi pilot để có hướng dẫn chính thức.

---

## 9. Quy trình xử lý sự cố

### 9.1 Phân loại

| Mức | Ví dụ | Phản hồi đầu tiên | Ai |
|---|---|---|---|
| **SEV1** | Lộ dữ liệu cá nhân, lộ service role key, admin bị chiếm, nghi ngộ độc thực phẩm, prod sập trong ngày demo | ≤ 1 giờ | Minh (chỉ huy) + Khanh (liên lạc, xác minh) |
| **SEV2** | Một tính năng chính hỏng (bàn giao, đăng lô), email không gửi được, Supabase bị pause | ≤ 4 giờ | Minh |
| **SEV3** | Lỗi hiển thị, lỗi lẻ có cách đi vòng | Trong sprint | Minh / Claude Code |

### 9.2 Các bước chung
1. **Phát hiện:** Sentry alert, uptime monitor, báo cáo người dùng (`incidents`), hoặc pgTAP/E2E nightly fail.
2. **Mở hồ sơ:** GitHub Issue nhãn `incident` + `sev1|sev2|sev3`; ghi dòng thời gian (giờ VN). Nếu sự cố gây lộ dữ liệu: **dùng issue private** (repo private, hoặc GitHub Security Advisory), không ghi dữ liệu cá nhân vào issue.
3. **Khoanh vùng (containment)**, dùng công tắc có sẵn:
   - Công tắc trong `app_settings` (admin aal2, `set_app_setting`, có audit; DATA-MODEL §2.6): tắt `signups_enabled`, `ai_enabled`, `push_enabled`, `public_map_enabled`, `auto_accept_enabled`.
   - `MAINTENANCE_MODE=1` (env Vercel, redeploy khoảng 1 phút): mọi route trả trang bảo trì, trừ `/api/health`.
   - Supabase Auth: tắt "Allow new users to sign up".
   - Thu hồi phiên: `auth.admin.signOut(userId, 'global')`, hoặc rotate JWT secret (đăng xuất toàn bộ).
   - Vercel Firewall: Attack Challenge Mode; chặn IP hoặc ASN.
4. **Loại bỏ nguyên nhân:** sửa bằng migration hoặc commit mới, theo luồng hotfix (`DEPLOYMENT.md` §7).
5. **Khôi phục:** Vercel Instant Rollback; dữ liệu thì dùng migration bù hoặc khôi phục từ backup (C18).
6. **Thông báo:**
   - Lộ dữ liệu cá nhân: báo cơ quan chuyên trách (A05, Bộ Công an) theo mẫu và thời hạn luật định. Mục tiêu nội bộ **≤ 72 giờ** từ khi phát hiện (cần kiểm chứng điều khoản).
   - Báo chủ thể bị ảnh hưởng nếu có nguy cơ gây hại.
   - Ghi lại lý do nếu quyết định không thông báo.
7. **Hậu kiểm** (≤ 5 ngày): `docs/incidents/YYYY-MM-DD-<slug>.md` gồm dòng thời gian, nguyên nhân gốc, hành động. **Mỗi sự cố bảo mật phải sinh thêm một test hồi quy.**

### 9.3 Playbook nhanh

| Tình huống | Hành động cụ thể |
|---|---|
| **Lộ service role / secret key** | (1) Supabase → Settings → API: rotate hoặc tạo secret key mới, thu hồi key cũ. (2) Cập nhật Vercel env và GitHub Environments, redeploy. (3) Đọc log Supabase (API, Postgres) tìm truy cập bất thường trong khoảng thời gian bị lộ. (4) gitleaks toàn lịch sử; nếu key nằm trong Git thì coi như đã lộ vĩnh viễn, rotate là bắt buộc (rút kinh nghiệm B5). |
| **Admin bị chiếm** | (1) Dùng service role đặt `platform_role='user'` cho tài khoản bị chiếm (ghi audit). (2) Đăng xuất toàn cục. (3) Rà `audit_logs` theo `actor_id` trong 30 ngày: hồ sơ nào bị duyệt hoặc từ chối, minh chứng nào bị duyệt. (4) Đảo ngược các quyết định sai bằng RPC. (5) Enroll lại MFA. |
| **Lộ dữ liệu qua lỗi RLS** | (1) Tắt tính năng hoặc route liên quan qua flag. (2) Viết pgTAP tái hiện lỗi (phải fail). (3) Sửa policy bằng migration, test pass. (4) Ước lượng phạm vi bằng log PostgREST. (5) Thông báo theo bước 6. |
| **Ảnh minh chứng sót mặt trẻ em đã hiện cho cửa hàng** | (1) Admin chuyển minh chứng về `needs_changes` (cửa hàng mất quyền xem ngay). (2) Xóa file gốc trên Storage. (3) Liên hệ tổ chức để làm mờ lại. (4) Ghi `incidents(kind='privacy')`. (5) Nếu ảnh đã bị tải về: liên hệ cửa hàng yêu cầu xóa, ghi nhận. |
| **Prod Supabase bị pause** | Restore từ dashboard (vài phút). Kiểm tra workflow keepalive. Xem `DEPLOYMENT.md` §4.2. |
| **Sự cố ngày demo** | Theo checklist P6 (`docs/uat/P6-final-demo.md`): chuyển hotspot dự phòng, rồi `demo_reset()`, rồi video dự phòng. |

### 9.4 Playbook an toàn thực phẩm (nghi ngộ độc)
1. Tổ chức hoặc người dùng báo qua app hoặc hotline; tạo `incidents(kind='food_safety', severity='critical')`.
2. **Ưu tiên sức khỏe:** hướng dẫn liên hệ cơ sở y tế gần nhất hoặc gọi 115; FoodSave không tư vấn y tế.
3. Admin tạm dừng (`suspend`) các lô **chưa giao** của cùng cửa hàng và cùng danh mục; báo các tổ chức đang giữ hàng cùng lô ngừng phát.
4. Thu thập truy vết (mục 8.3), giữ nguyên dữ liệu (không demo reset, không xóa).
5. Liên hệ cửa hàng; nếu nghiêm trọng, phối hợp cơ quan y tế hoặc ATTP địa phương.
6. Đóng sự cố kèm kết luận; điều chỉnh trust score hoặc tạm khóa cửa hàng nếu có lỗi.

---

## 10. Bảng truy vết lỗi cũ L1–L16, B1–B8

Mô tả lỗi rút gọn từ tài liệu bàn giao bản cũ (25/09/2026), mục 7.2 và 7.4.1. Cột "Test bảo vệ" là test **phải tồn tại và pass** trước gate của phase ghi ở cột cuối. Tên file theo quy ước trong `TESTING.md`.

### 10.1 Lỗi chức năng (L)

| Mã | Lỗi ở bản cũ | Thiết kế phòng ngừa ở v2 | Test bảo vệ | Gate |
|---|---|---|---|---|
| L1 | Nút "Đăng nhập doanh nghiệp" trỏ `PARTNER_TINH.html` (đã đổi tên) nên 404 | Route định kiểu (Next.js `typedRoutes`), không link chuỗi tay tới file. Một route duy nhất cho mỗi cổng (`/store`, `/charity`…) | E2E `public-links.spec.ts`: crawl mọi link nội bộ trên landing, `/impact`, `/legal/*`, tất cả trả 200 | P1 |
| L2 | Trang Tổ chức nhận diện vai trò bằng tên file; mở `/charity` thì dùng màn đăng nhập mẫu, vào thẳng cổng | Không có "nhận diện trang". Xác thực ở server: `middleware.ts` + `requireMembership()` trong layout từng cổng, đọc membership từ DB. Không có màn đăng nhập giả | E2E `auth-guard.spec.ts`: chưa đăng nhập mà mở `/charity`, `/store`, `/volunteer`, `/admin` thì bị chuyển về `/login` | P1 |
| L3 | Nút "Mã QR" và OTP mẫu vào thẳng cổng không cần đăng nhập | Nguyên tắc "không có tính năng giả". Chỉ có phương thức đăng nhập thật (mật khẩu, OTP email, link mời). Mọi lối vào cổng đều qua guard server | E2E `auth-guard.spec.ts`. Lint rule tùy biến cấm hàm kiểu `enterPortal` phía client. Review checklist | P1 |
| L4 | Cửa hàng đăng nhập không kiểm tra trạng thái và vai trò; tài khoản chờ duyệt hoặc bị từ chối vẫn vào cổng | Guard yêu cầu `organizations.status='approved'` **và** đúng `kind`. RLS `is_active_org_member()` chặn ở DB, nên UI sai cũng không đọc hay ghi được | pgTAP `rls_org_status.test.sql`: thành viên tổ chức `submitted`/`needs_changes`/`rejected`/`suspended` không SELECT được `offers`, `needs` và không gọi được `publish_offer`. E2E: tài khoản `submitted` thấy màn "Hồ sơ đang chờ duyệt" | P1 |
| L5 | Đăng ký cửa hàng tạo 2 dòng `stores` (trigger tạo dòng rỗng, client insert thêm) | Trigger **chỉ** tạo `profiles`. Tổ chức tạo bằng RPC idempotent `create_organization(p_kind, p_name, p_subtype, p_client_op_id)` | pgTAP `rpc/create_organization.test.sql`: gọi 2 lần cùng `client_op_id` trả về cùng `org_id`, đếm được 1 dòng | P1 |
| L6 | Đăng sản phẩm dùng bảng `products` không có trong schema | Schema chỉ đến từ `supabase/migrations/`. CI chạy `supabase db reset` từ đầu. Kiểu TS sinh tự động; code dùng bảng không tồn tại thì không compile | CI job `db`: reset + `supabase gen types` rồi `git diff --exit-code src/types/database.types.ts`; `tsc --noEmit` | P0 |
| L7 | API select cột không tồn tại `stores(emoji,address)` nên Donation Inbox luôn trống | Như L6: query có kiểu. Truy vấn phức tạp đặt trong RPC SQL, được pgTAP kiểm tra | Typecheck CI; pgTAP gọi từng RPC đọc với dữ liệu seed | P0 |
| L8 | Backend select cột đã xóa (`avatar_url`, `metadata`) nên API admin lỗi | Như L6/L7. Không có backend Express riêng; đọc qua RSC + supabase-js có kiểu | Typecheck; E2E admin không có request lỗi | P1 |
| L9 | Admin không có nút đăng nhập riêng; hồ sơ chờ duyệt (`submitted`) không hiện khi chưa đăng nhập | `/admin` có màn đăng nhập riêng + MFA. Hàng đợi duyệt đọc qua RLS `is_admin()`, hiện đủ `submitted` / `needs_changes` và yêu cầu thay đổi `org_change_requests` `pending` | E2E `admin-review.spec.ts`: đăng nhập, MFA (TOTP sinh trong test), thấy hồ sơ seed `submitted`, duyệt được | P1 |
| L10 | Lỗi mã hóa ký tự ("Má»Ÿ tá»‡p") trong code cũ | Toàn bộ source UTF-8 (`.editorconfig`, Prettier); chuỗi giao diện tiếng Việt viết trực tiếp, không copy qua công cụ đổi bảng mã | CI script `check-mojibake.mjs`: quét `src/**` và `.next/server/**/*.html` tìm các mẫu mojibake `Ã.`, `á»`, `áº`. Screenshot test | P0 |
| L11 | Admin gọi bảng hoặc vai trò đã xóa (`orders`, `customer`), lỗi console, rơi về dữ liệu mẫu | Bỏ toàn bộ di sản B2C. Không có dữ liệu mẫu cứng trong UI; chỉ có seed `is_demo` | E2E fixture `noConsoleErrors`: mọi spec fail nếu có `console.error` hoặc `pageerror` | P1 |
| L12 | Link chính sách, điều khoản và ảnh `og` không tồn tại | Route `/terms`, `/privacy` (có `policy_version`); ảnh OG sinh bằng `opengraph-image.tsx` | E2E `public-links.spec.ts` (như L1) kiểm tra cả `og:image` trả 200 | P1 |
| L13 | Trang Tổ chức gọi API không còn tồn tại nên 404 mỗi lần tải | Không có client gọi endpoint ngoài kiểu. Route Handler nằm trong `src/app/api` có kiểu | E2E fixture `noFailedRequests`: fail nếu request same-origin hoặc tới Supabase trả 4xx/5xx ngoài danh sách cho phép | P2 |
| L14 | `PARTNER.html` thiếu `<meta charset>`, `<title>`, viewport | Root layout dùng Metadata API của Next.js; mỗi page có `title` riêng | E2E kiểm tra `document.title` khác rỗng và thẻ viewport tồn tại trên mọi route chính; Lighthouse SEO / Best Practices ≥ 90 | P1 |
| L15 | README lỗi thời, nhắc lệnh không tồn tại | README ngắn, trỏ tới `docs/`. Skill `phase-gate` cập nhật ROADMAP và README; DoD có mục cập nhật docs | CI script `check-readme-scripts.mjs`: mọi lệnh `pnpm <x>` trong README phải có trong `package.json` | P0 |
| L16 | Kết nối Postgres trực tiếp và Socket.io không chạy trên serverless | Không có kết nối Postgres dài hạn từ app; chỉ dùng supabase-js (HTTP) và Supabase Realtime. Biến môi trường kiểm bằng zod lúc build | Unit test `env.test.ts`: thiếu biến bắt buộc thì throw. CI build với `.env.ci` | P0 |

### 10.2 Lỗi bảo mật (B)

| Mã | Lỗi ở bản cũ | Thiết kế phòng ngừa ở v2 | Test bảo vệ | Gate |
|---|---|---|---|---|
| B1 | Ai cũng tự đăng ký được admin: `handle_new_user` nhận `role='admin'` từ metadata và đặt `active` | C2: trigger bỏ qua metadata, `platform_role='user'`. C3: `is_admin()` cần aal2 | **pgTAP `regression/b1_admin_via_metadata.test.sql`**: insert `auth.users` với `raw_user_meta_data = '{"role":"admin","platform_role":"admin"}'` thì profile có `platform_role='user'`; giả lập JWT user đó: `is_admin()` = false, SELECT `org_sensitive` trả 0 dòng | **P0** |
| B2 | Trigger chống tự đổi quyền bị tắt ở cuối file 014; user tự sửa role/status | C5: revoke UPDATE cả bảng + grant theo danh sách cột cho phép thay cho trigger; quyền không phụ thuộc trạng thái trigger | **pgTAP `regression/b2_self_promote.test.sql`**: `authenticated` UPDATE `profiles.platform_role` của chính mình thì `throws_ok` 42501; UPDATE `organizations.status` cũng 42501. Thêm: mọi trigger bảo vệ (`forbid_mutation`, …) có `tgenabled='O'` | P1 |
| B3 | Khách đọc toàn bộ cột hồ sơ đã duyệt: lộ CCCD, mã số thuế, SĐT, link ảnh CCCD | C6: `org_sensitive` tách riêng; view công khai chỉ có cột an toàn; **không thu ảnh CCCD** (ảnh thẻ căn cước là dữ liệu nhạy cảm — NĐ 356/2025 Điều 4); số CCCD (dữ liệu cơ bản, Điều 3) chỉ ở bảng `private`, admin aal2 xem có nhật ký; hotline ở `org_contacts`, không công khai | **pgTAP `regression/b3_public_columns.test.sql`** + **`regression/contacts_cccd_privacy.test.sql`** (không có loại giấy tờ/cột ảnh CCCD, bảng `private` không grant, RPC liên hệ/CCCD không cho anon, audit/outbox không chứa số): `anon` SELECT `org_sensitive`: 0 dòng / permission denied; `public_org_cards` không có cột nhạy cảm (`columns_are`); `anon` không SELECT được `sites.location`, `sites.address_line`; thành viên tổ chức A không đọc được `org_sensitive` của B | P1 |
| B4 | Bucket giấy tờ để public; ai có link đều xem | C7: `kyc`/`proofs` private, signed URL 60 s / 300 s | **pgTAP `regression/b4_private_buckets.test.sql`**: `storage.buckets` có `public=false` cho `kyc`, `proofs`; policy `storage.objects` từ chối anon và tổ chức khác. **Integration** `storage-signed-url.test.ts`: public URL của object `kyc` trả lỗi; signed URL hết hạn sau TTL | P1 |
| B5 | Key và mật khẩu nằm trong code và lịch sử Git (commit "remove leaked key") | C16 + C17: repo mới, gitleaks, env zod không có giá trị mặc định cho secret, quét bundle | CI job `secrets`: gitleaks (full history) + `scan-bundle.mjs` (không thấy mẫu secret trong `.next/static`) | **P0** |
| B6 | Chủ hồ sơ tự sửa cột uy tín (`is_verified`, `rating`…) | C5: column grant whitelist; `trust_score`, `verified_*` chỉ RPC được sửa | **pgTAP `regression/b6_trust_columns.test.sql`**: owner UPDATE `organizations.trust_score` / `org_sensitive.id_verified_at` thì 42501; `column_privs_are` khóa danh sách cột được sửa | P1 |
| B7 | Backend chạy chế độ development (CORS cho origin `null`); chuỗi tìm kiếm ghép thẳng vào `.or()` | Không có API Express riêng; Route Handler cùng origin, không bật CORS. Tìm kiếm qua RPC tham số hóa hoặc `textSearch` có escape; zod validate input. CSP (C14) | **Unit `search-input.test.ts`** (fast-check: chuỗi có `,()%*\` không làm đổi điều kiện lọc). **Integration** `search-injection.test.ts`: chuỗi `a),status.eq.draft` đưa vào ô tìm kiếm hoặc bộ lọc không làm lộ lô `draft` (bộ lọc dùng tham số có kiểu của `marketplace_offers`, không ghép chuỗi). E2E kiểm tra header CSP/HSTS | P2 |
| B8 | Tổ chức chưa duyệt vẫn xem được donation đang mở qua API | RLS `offers` SELECT cho tổ chức yêu cầu `is_active_org_member`; RPC `match_candidates` / `marketplace_offers` kiểm tra status | **pgTAP `regression/b8_pending_charity.test.sql`**: thành viên charity `submitted` gọi `select from offers` hoặc `marketplace_offers()` thì 0 dòng; sau khi `approved` thì thấy lô seed | P2 |

> **Quy tắc:** test hồi quy B1–B8 **không bao giờ được xóa hay `skip`**. Hook PreToolUse và review của agent `security-reviewer` chặn mọi thay đổi làm yếu chúng.

---

## 11. Việc pháp lý theo phase

| Phase | Việc | Đầu ra |
|---|---|---|
| P0 (07–11/10) | Chốt danh sách bên xử lý dữ liệu và quốc gia xử lý; bật các control C1–C5, C14, C16, C17 ở mức nền | Bảng nhà cung cấp trong `docs/legal/` |
| P1 (12–15/10) | Trang `/terms`, `/privacy` (v1); luồng consent `terms`; bản đầu DPIA; **kiểm chứng điều khoản** Luật 91/2025 và NĐ 356/2025 cho các dòng đánh dấu ở mục 4.2 | `privacy_policy_version = 2026-10-v1` |
| P3 (28/10–08/11) | Consent `location_trip`; hướng dẫn tình nguyện viên | Màn đồng ý vị trí |
| P4 (09–17/11) | Consent `proof_photo`; mẫu phiếu đồng ý chụp ảnh; trang "Dữ liệu của tôi" (export, xóa) | `docs/legal/mau-dong-y-chup-anh.md` |
| Trước pilot (≤ 15/11) | Nhờ người có chuyên môn pháp lý rà Điều khoản, Chính sách, mẫu đồng ý; quyết định về hồ sơ chuyển dữ liệu ra nước ngoài | Biên bản rà soát |
| P5 (18–22/11) | `/security-review`, agent `security-reviewer` rà toàn bộ; diễn tập khôi phục backup; securityheaders ≥ A | Báo cáo trong `docs/phase-reports/` |
