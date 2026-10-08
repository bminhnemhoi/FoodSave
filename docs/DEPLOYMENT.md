# FoodSave v2 — Triển khai, môi trường & vận hành

> **Trạng thái:** bản thiết kế (07/10/2026). Phần 2–5 là **việc Minh làm tay** trong P0 (07–11/10). Mọi giá trị bí mật **không** ghi vào repo.
> **Liên quan:** `SECURITY-PRIVACY.md` (C16 secrets, C18 backup), `TESTING.md` §8 (CI), `AWS-MIGRATION.md`.
> **Quy ước:**
> - `<DOMAIN>` là tên miền mua trong P0.
> - `<STG_REF>` / `<PROD_REF>` là project ref của Supabase.
> - "(cần kiểm tra)" nghĩa là giới hạn hoặc giá của nhà cung cấp có thể đã đổi; xem lại trang chính thức trước khi dựa vào.

---

## Mục lục

1. [Môi trường](#1-môi-trường)
2. [Checklist việc của Minh trước và trong P0](#2-checklist-việc-của-minh-trước-và-trong-p0)
3. [Cài đặt máy dev (Windows 11)](#3-cài-đặt-máy-dev-windows-11)
4. [Supabase](#4-supabase)
5. [Vercel, tên miền, email, bản đồ, dịch vụ khác](#5-vercel-tên-miền-email-bản-đồ-dịch-vụ-khác)
6. [Luồng migration](#6-luồng-migration)
7. [Phát hành, tag, rollback, hotfix](#7-phát-hành-tag-rollback-hotfix)
8. [Bảng biến môi trường](#8-bảng-biến-môi-trường)
9. [Giám sát và vận hành](#9-giám-sát-và-vận-hành)
10. [Dữ liệu demo: seed và reset](#10-dữ-liệu-demo-seed-và-reset)

---

## 1. Môi trường

| Môi trường | Ứng dụng | Database | Dữ liệu | Ai dùng | Cập nhật khi |
|---|---|---|---|---|---|
| **local** | `pnpm dev` (http://localhost:3000) | Supabase local (Docker) | Seed + fixture | Minh, Claude Code | Liên tục |
| **CI** | `next start` trên runner GitHub | Supabase local trong Actions | Seed E2E | GitHub Actions | Mỗi PR |
| **preview** | Vercel Preview (mỗi PR một URL) | **Supabase staging** | Seed demo hư cấu | Minh, Khanh (xem PR) | Mỗi push lên nhánh PR |
| **staging** | Vercel, nhánh `main`, gắn domain `staging.<DOMAIN>` | **Supabase staging** (`foodsave-staging`) | Seed demo hư cấu + tài khoản UAT | Khanh (UAT) | Merge vào `main` |
| **prod** | Vercel Production, nhánh `release`, domain `<DOMAIN>` | **Supabase prod** (`foodsave-prod`) | Dữ liệu **thật** + tổ chức demo (`is_demo`) + tài khoản giám khảo theo vai trò (cửa hàng, tổ chức, TNV — không có tài khoản admin cho giám khảo) | Người dùng, giám khảo | Tag `v*` |

**Nguyên tắc:**
- Dữ liệu thật **chỉ** nằm ở prod. Không copy dữ liệu prod về staging hay local.
- Preview và staging dùng chung DB staging. Một PR có migration thì migration đó **chưa** chạy trên staging cho tới khi merge. Vì vậy preview của PR có migration có thể lỗi ở phần liên quan. Đó là điều bình thường; CI (Supabase local) mới là nơi kiểm tra.
- Prod migrate **trước**, rồi mới deploy app. Vì thế migration phải tương thích ngược với app đang chạy (§6.3).

```
feature/* ──PR──► CI (local Supabase) + Vercel Preview (staging DB)
    │
    ▼ merge
  main ──► migrate staging ──► Vercel deploy staging.<DOMAIN> ──► smoke ──► UAT (Khanh)
    │
    ▼ tag vX.Y.Z (sau gate + UAT ký)
release.yml ──► migrate PROD (Minh duyệt) ──► fast-forward nhánh `release` ──► Vercel Production ──► smoke prod
```

---

## 2. Checklist việc của Minh trước và trong P0

Thứ tự đề xuất. Mỗi dòng có thời gian ước tính.

- [ ] **Tài khoản và công cụ** (§3): `gh`, Supabase CLI, Scoop, RTK, Docker Desktop chạy được. *(30 phút)*
- [ ] **Supabase:** tạo org mới + 2 project `foodsave-staging`, `foodsave-prod` (Singapore). Bật extension. Đặt cấu hình Auth (§4). *(45 phút)*
- [ ] **Project cũ** `idhpydhlgnxjjtyrgfkj`: thống nhất với cả nhóm rồi **rotate key**. Nếu cần chỗ trong hạn mức free thì **tạm dừng** project đó (web Netlify cũ sẽ ngừng chạy). *(10 phút)*
- [ ] **Tên miền:** mua (§5.2). *(20 phút, chờ DNS tối đa 24 giờ)*
- [ ] **Resend:** tạo tài khoản, xác minh domain, tạo API key, cấu hình SMTP cho **cả 2** project Supabase (§5.3). *(30 phút)*
- [ ] **Vercel:** tài khoản, import repo `bminhnemhoi/FoodSave`, đặt nhánh production = `release`, gắn domain, nhập env (§5.1). *(30 phút)*
- [ ] **Goong:** tạo 2 key (§5.4). *(15 phút)*
- [ ] **GitHub:** tạo Environments `staging`/`production`, nhập secrets (§8.2), bật branch protection cho `main` và `release`. *(20 phút)*
- [ ] **Tùy chọn:** Anthropic API key + giới hạn chi tiêu; Sentry; VAPID (§5.5). *(20 phút)*
- [ ] **Admin đầu tiên:** cấp quyền admin cho Minh và Khanh trên prod và staging (§5.6). *(10 phút)*
- [ ] **Uptime monitor** (§9.1). *(10 phút)*

---

## 3. Cài đặt máy dev (Windows 11)

Máy hiện có: Windows 11 Pro, Node 24, Docker 29.5. Chạy các lệnh trong **PowerShell**; lệnh nào cần quyền Admin thì có ghi chú.

| # | Bước | Lệnh / thao tác | Kiểm tra |
|---|---|---|---|
| 1 | Node 24 | Đã có | `node -v` cho ra `v24.x` |
| 2 | pnpm qua Corepack | PowerShell **Admin**: `corepack enable`. Repo khai `"packageManager": "pnpm@10.x"` trong `package.json`, nên Corepack tự tải đúng bản | `pnpm -v` |
| 3 | Docker Desktop | Đã có. Bật backend **WSL 2**; cấp ≥ 4 GB RAM (Settings → Resources) | `docker info` không lỗi |
| 4 | Git | `winget install --id Git.Git -e` (nếu chưa có). Repo có `.gitattributes` `* text=auto eol=lf` để tránh lỗi CRLF | `git --version` |
| 5 | GitHub CLI | `winget install --id GitHub.cli -e`, rồi `gh auth login` (chọn GitHub.com → HTTPS → đăng nhập trình duyệt) | `gh auth status` |
| 6 | Scoop (để cài Supabase CLI) | PowerShell **thường** (không Admin): `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`, rồi `irm get.scoop.sh \| iex` | `scoop --version` |
| 7 | Supabase CLI | `scoop bucket add supabase https://github.com/supabase/scoop-bucket.git` rồi `scoop install supabase`. **Ngoài ra** repo có `supabase` trong `devDependencies` (CI và mọi máy dùng cùng phiên bản): `pnpm supabase <lệnh>` | `supabase --version` |
| 8 | RTK (nén output cho Claude Code) | `winget install rtk-ai.rtk`, rồi `rtk init` | `rtk --version`. Chỉ áp dụng cho tool **Bash** của Claude Code (xem CLAUDE.md) |
| 9 | Clone repo | `gh repo clone bminhnemhoi/FoodSave D:\FoodSave` | `cd D:\FoodSave; git status` |
| 10 | Cài thư viện | `pnpm install` | Không lỗi. pnpm chỉ chạy build script của gói trong `onlyBuiltDependencies` |
| 11 | Supabase local | `pnpm supabase start` (lần đầu tải image vài phút) | In ra API URL `http://127.0.0.1:54321`, Studio `http://127.0.0.1:54323`, Mailpit `http://127.0.0.1:54324` |
| 12 | Env local | `Copy-Item .env.example .env.local`, điền theo `pnpm supabase status -o env` (URL, publishable key, service role key local) | `pnpm dev` khởi động không báo thiếu biến |
| 13 | DB + seed | `pnpm supabase db reset` (chạy toàn bộ migration + seed) | Studio có bảng và dữ liệu seed |
| 14 | Chạy app | `pnpm dev` → http://localhost:3000 | Trang chủ hiện |
| 15 | Trình duyệt test | `pnpm exec playwright install chromium webkit` | `pnpm test:e2e --project=chromium-desktop` chạy |

**Lệnh thường dùng** (dự kiến; nguồn sự thật là `package.json` và CLAUDE.md):

| Lệnh | Việc |
|---|---|
| `pnpm dev` | Chạy app local |
| `pnpm lint` / `pnpm typecheck` / `pnpm format` | Kiểm tra code |
| `pnpm test` | Unit + property (Vitest) |
| `pnpm test:db` | pgTAP (`supabase test db`) |
| `pnpm test:int` | Integration (Vitest + Supabase local) |
| `pnpm test:e2e` | Playwright |
| `pnpm db:types` | Sinh `src/types/database.types.ts` từ DB local |
| `pnpm gen:fixtures` | Sinh fixture SQL từ JSON |
| `pnpm seed:demo --local` | Seed dữ liệu demo vào Supabase local (cloud: §10) |
| `pnpm demo:reset --local` | Xóa toàn bộ dữ liệu `is_demo` rồi seed lại (cloud: §10) |

> **Lưu ý email local:** Supabase local không gửi email thật. Mọi email (OTP, mời) nằm trong **Mailpit** tại http://127.0.0.1:54324.
> **Lưu ý pg_net local:** job gọi về app qua `http://host.docker.internal:3000` (container gọi ra máy host).

---

## 4. Supabase

### 4.1 Tạo project
1. https://supabase.com/dashboard, chọn **New organization** tên "FoodSave v2", gói **Free**, chủ sở hữu là tài khoản của Minh.
2. **New project** ×2:

| | staging | prod |
|---|---|---|
| Tên | `foodsave-staging` | `foodsave-prod` |
| Region | **Northeast Asia (Tokyo) — ap-northeast-1** (project hiện có của nhóm; đề xuất ban đầu là Singapore) | như prod |
| DB password | Sinh ngẫu nhiên ≥ 24 ký tự, lưu vào trình quản lý mật khẩu | Như staging, **khác** password |

3. Ghi lại cho mỗi project:
   - **Project ref**;
   - **Project URL**;
   - **Publishable key** (`sb_publishable_…`), đặt vào biến `NEXT_PUBLIC_SUPABASE_ANON_KEY`;
   - **Secret key** (`sb_secret_…`) hoặc service_role (legacy), đặt vào biến `SUPABASE_SERVICE_ROLE_KEY`.
   
   Lấy ở Settings → API Keys. Nhập vào Vercel và GitHub (§8). **Không** dán vào chat, issue hay file trong repo.
4. Mời Khanh vào org (Settings → Team) với quyền thấp nhất mà gói Free cho phép (cần kiểm tra các vai trò hiện có). Khanh cần xem staging; không cần SQL Editor của prod.

### 4.2 Giới hạn gói Free (cần kiểm tra trang pricing hiện hành)

| Giới hạn | Giá trị tham khảo | Ảnh hưởng và cách xử lý |
|---|---|---|
| Số project free đang hoạt động | **2** (tính trên các org mà bạn là owner/admin) | Đúng bằng staging + prod. Project cũ `idhpydhlgnxjjtyrgfkj` có thể chiếm chỗ: **tạm dừng** nó (sau khi đã thông báo nhóm), hoặc nâng **Pro** cho prod (khoảng 25 USD/tháng) trong tháng 11 |
| Tự tạm dừng khi không hoạt động | Sau **7 ngày** không có request | Workflow **keepalive** gọi cả 2 project mỗi ngày (§9.2). Nếu bị dừng: Dashboard → **Restore project** (vài phút) |
| DB | 500 MB | Đủ cho thi và pilot. Theo dõi trong Reports |
| Storage | 1 GB | Ảnh đã nén về WebP ≤ 2048 px; xóa KYC sau 30 ngày; xóa ảnh lô sau 90 ngày |
| Egress | 5 GB/tháng | Ảnh qua signed URL có cache; tile bản đồ đi từ Goong, không qua Supabase |
| MAU | 50.000 | Thoải mái |
| Realtime | Khoảng 200 kết nối đồng thời | Đủ cho demo và pilot |
| Email mặc định của Supabase | **Khoảng 2 email/giờ** | **Bắt buộc** dùng SMTP riêng (Resend, §5.3) trước khi test đăng ký |
| Backup | Không đảm bảo bản tải về ở gói Free | Workflow `backup.yml` tự dump và mã hóa hằng đêm (SECURITY-PRIVACY C18) |

### 4.3 Extension
Bật bằng **migration đầu tiên** `extensions_schemas` (DATA-MODEL §18) để local, staging và prod giống nhau:
```sql
create extension if not exists postgis  with schema extensions;
create extension if not exists pg_cron;              -- schema "cron"
create extension if not exists pg_net   with schema extensions;
create extension if not exists pgcrypto with schema extensions;  -- HMAC cho kick_dispatch
create extension if not exists pgtap    with schema extensions;  -- test (local/CI)
```
Nếu migration báo không đủ quyền với `pg_cron` trên cloud: bật bằng tay ở Dashboard → Database → Extensions → `pg_cron`, rồi chạy lại `supabase db push`.

### 4.4 Secret cho job (Vault) — dispatcher thông báo (P2-14). Chạy **một lần cho mỗi project** trong SQL Editor

Migration `20261008120400_notifications` tạo `private.kick_dispatch()`, trigger trên `notification_outbox` và
job pg_cron `fs_dispatch_tick` (mỗi phút, chỉ khi có việc). **Không có URL hay secret nào ghi cứng trong
migration**: hàm đọc hai secret Vault dưới đây; thiếu một trong hai thì hàm im lặng bỏ qua (local/CI) — thông báo
vẫn nằm `pending` trong outbox cho tới khi có secret.

1. Sinh secret (Git Bash, mỗi môi trường một giá trị **khác nhau**, không dán vào chat/issue):
   ```bash
   openssl rand -hex 32
   ```
2. Vercel → Settings → Environment Variables: `JOBS_HMAC_SECRET` = giá trị vừa sinh (scope đúng môi trường,
   đánh dấu **Sensitive**), rồi **Redeploy** để biến có hiệu lực.
3. Supabase → SQL Editor của **đúng project** (staging hoặc prod), thay placeholder rồi chạy:
   ```sql
   select vault.create_secret('<APP_URL>/api/jobs/dispatch', 'jobs_dispatch_url',
                              'URL dispatcher thông báo (pg_net)');
   select vault.create_secret('<JOBS_HMAC_SECRET của môi trường này>', 'jobs_hmac_secret',
                              'HMAC-SHA256 ký request pg_net → /api/jobs/dispatch');
   ```
   `<APP_URL>`: URL Vercel của môi trường (ADR-011, ví dụ `https://<project>.vercel.app` cho prod; staging dùng
   URL cố định của nhánh `main`, **không** dùng URL preview của từng PR). URL phải mở được không cần đăng nhập
   Vercel (Deployment Protection tắt cho môi trường đó, §5.1 bước 6).
4. Đổi secret/URL sau này (xoay vòng): đổi Vercel trước, redeploy, rồi
   ```sql
   select vault.update_secret((select id from vault.secrets where name = 'jobs_hmac_secret'), '<secret mới>');
   select vault.update_secret((select id from vault.secrets where name = 'jobs_dispatch_url'), '<APP_URL mới>/api/jobs/dispatch');
   ```
   Trong vài giây giữa hai bước, request ký bằng secret cũ bị 401 — vô hại: tick kế tiếp (≤ 1 phút) gửi lại.
5. Kiểm tra (không lộ secret):
   ```sql
   select name, created_at, updated_at from vault.secrets where name in ('jobs_dispatch_url', 'jobs_hmac_secret');
   select private.kick_dispatch('manual');                  -- true = đã xếp hàng request
   select id, status_code, left(content, 200) from net._http_response order by id desc limit 5;  -- mong đợi 200
   select jobname, schedule, active from cron.job order by jobname;
   ```
   `401` ⇒ secret Vault khác `JOBS_HMAC_SECRET` trên Vercel (hoặc chưa redeploy); `503 not_configured` ⇒ Vercel
   thiếu biến; lỗi kết nối ⇒ sai `jobs_dispatch_url`.

Cách ký (ARCHITECTURE §8.3): `x-fs-timestamp` = giây Unix, `x-fs-signature` = hex(HMAC-SHA256(secret,
`timestamp + "." + body`)), với body là văn bản jsonb chuẩn đúng như pg_net gửi. Route từ chối khi lệch quá 300
giây hoặc sai chữ ký (so sánh `timingSafeEqual`).

- **Local:** không tạo secret Vault (dispatcher không được gọi tự động). Muốn thử tay: đặt `JOBS_HMAC_SECRET` trong
  `.env.local`, chạy app ở cổng 3000, rồi tạo hai secret với URL `http://host.docker.internal:3000/api/jobs/dispatch`
  bằng SQL ở bước 3 trên DB local. E2E (`tests/e2e/notifications`) tự ký request bằng secret dành riêng cho test
  (`playwright.config.ts` truyền cho máy chủ test).
- Lịch các job: §9.4.

### 4.5 Auth: URL Configuration

| Mục | staging | prod |
|---|---|---|
| Site URL | `https://staging.<DOMAIN>` | `https://<DOMAIN>` |
| Redirect URLs | `https://staging.<DOMAIN>/**`, `https://foodsave-*-<vercel-scope>.vercel.app/**` (Preview), `http://localhost:3000/**` | `https://<DOMAIN>/**`, `https://www.<DOMAIN>/**` |

### 4.6 Auth: thiết lập khác (Dashboard → Authentication)
- **Providers:**
  - Email bật.
  - **Confirm email** bật.
  - **Secure email change** bật.
  - Mật khẩu tối thiểu **10 ký tự**, yêu cầu có chữ và số.
  - Bật "Leaked password protection" nếu gói hỗ trợ (cần kiểm tra; có thể chỉ ở Pro).
- **Allow new users to sign up:** bật. Đây cũng là công tắc khẩn cấp khi có sự cố (SECURITY-PRIVACY §9).
- **Multi-Factor:** **TOTP bật**; Phone MFA tắt. Thiết lập này cho phép dùng MFA, còn việc *bắt buộc* MFA với admin do app và DB (`is_admin()` aal2) đảm nhận.
- **Email OTP expiry:** 900 giây (15 phút).
- **Rate limits:** sau khi bật SMTP riêng, đặt giới hạn email khoảng 100/giờ (mặc định thấp hơn).
- **Email templates:** dùng bản tiếng Việt trong `supabase/templates/*.html`.
  - Local đọc qua `config.toml`.
  - **Cloud phải dán tay** vào Dashboard → Authentication → Email Templates (Confirm signup, Magic Link/OTP, Invite, Reset password, Change email) cho cả 2 project.
  - Mỗi lần sửa template thì dán lại. Checklist release có mục này.

### 4.7 Storage
- Bucket `kyc` (private), `proofs` (private), `media` (public) **được tạo bằng migration**, kèm giới hạn kích thước, MIME và policy (SECURITY-PRIVACY C7).
- **Không** tạo hay sửa bucket bằng tay trên dashboard. Sau lần migrate đầu, mở Storage để xác nhận 3 bucket có cờ public/private đúng.

### 4.8 Cài đặt bảo mật khác
- Settings → Database → **Enforce SSL** bật.
- Settings → API → chỉ expose schema `public` (và `graphql_public` nếu không dùng thì bỏ).
- Đặt **Spend cap** (nếu sau này nâng Pro) để không phát sinh chi phí ngoài dự kiến.

---

## 5. Vercel, tên miền, email, bản đồ, dịch vụ khác

### 5.1 Vercel
1. Đăng ký https://vercel.com bằng GitHub `bminhnemhoi`, gói **Hobby**.
   - Điều khoản Hobby chỉ cho **sử dụng phi thương mại**. FoodSave giai đoạn thi là phi lợi nhuận nên phù hợp.
   - Khi có doanh thu (gói báo cáo ESG) thì chuyển Pro hoặc sang AWS (cần kiểm tra điều khoản).
2. **Add New → Project**, import `bminhnemhoi/FoodSave`. Framework Next.js được nhận tự động; Root `./`; Install `pnpm install --frozen-lockfile`; Build `pnpm build`.
3. Settings → Git → **Production Branch = `release`**. Tạo nhánh `release` từ `main` trong P0.
4. Settings → Domains:
   - `<DOMAIN>` và `www.<DOMAIN>` (redirect về apex) → Production.
   - `staging.<DOMAIN>` → gắn vào **Git branch `main`**.
5. Settings → Environment Variables: nhập theo §8.1.
   - Scope **Production** dùng giá trị prod.
   - Scope **Preview** dùng giá trị staging (áp cho cả nhánh `main` và mọi PR).
   - Đánh dấu **Sensitive** cho biến server-only.
6. Settings → **Deployment Protection**:
   - Hobby không có thành viên nhóm, nên Khanh sẽ **không** mở được Preview/staging nếu bật "Vercel Authentication".
   - Vì vậy **tắt** Vercel Authentication cho preview. Bù lại: staging chỉ có dữ liệu hư cấu, app vẫn bắt đăng nhập, và header `X-Robots-Tag: noindex` cho mọi môi trường không phải prod.
7. **Analytics:** bật Vercel Web Analytics (bản miễn phí) cho prod.
8. **Firewall:** biết vị trí nút **Attack Challenge Mode** (dùng khi bị tấn công).

### 5.2 Tên miền
- Mua trong P0. Ngân sách khoảng 250–500 nghìn đồng/năm cho `.com`.
- `.vn` thường đắt hơn và phải khai báo định danh với nhà đăng ký (cần kiểm tra giá).
- Ưu tiên tên ngắn, dễ đọc khi thuyết trình.
- **DNS:** đổi nameserver sang **Vercel DNS** (đơn giản nhất), hoặc giữ DNS của nhà đăng ký rồi thêm bản ghi:

| Bản ghi | Tên | Giá trị | Dùng cho |
|---|---|---|---|
| A | `@` | Theo Vercel hiển thị (thường `76.76.21.21`) | Prod |
| CNAME | `www` | `cname.vercel-dns.com` | Prod |
| CNAME | `staging` | `cname.vercel-dns.com` | Staging |
| MX + TXT (SPF) | `send.mail` *(theo Resend)* | Theo Resend → Domains | Email (bounce, SPF) |
| TXT (DKIM) | `resend._domainkey.mail` *(theo Resend)* | Khóa DKIM do Resend cấp | Email (chữ ký) |
| TXT (DMARC) | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@<DOMAIN>` (sau 2 tuần ổn định đổi `p=quarantine`) | Email (chính sách) |

### 5.3 Resend (SMTP cho Supabase Auth và email ứng dụng)
1. Đăng ký https://resend.com. Gói free khoảng 3.000 email/tháng, 100 email/ngày (cần kiểm tra).
2. **Domains → Add domain** `mail.<DOMAIN>` (dùng subdomain gửi để giữ uy tín domain chính). Chọn region gần nhất. Thêm các bản ghi DNS Resend hiển thị (bảng 5.2), chờ **Verified**.
3. **API Keys:** tạo 2 key, `foodsave-staging` và `foodsave-prod`, quyền **Sending access** giới hạn theo domain.
4. Supabase (mỗi project) → Authentication → **SMTP Settings → Enable custom SMTP**:

| Trường | Giá trị |
|---|---|
| Sender email | `no-reply@mail.<DOMAIN>` |
| Sender name | `FoodSave` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | API key Resend của môi trường đó |

5. **Kiểm tra:** đăng ký một tài khoản thử trên staging. Email đến Hộp thư đến (không vào Spam) trong ≤ 1 phút. Trên Gmail, mở "Show original": SPF/DKIM/DMARC đều **PASS**.

### 5.4 Goong
1. Đăng ký https://account.goong.io, tạo **2 key**:

| Key | Dùng cho | Lộ ra trình duyệt? | Biến |
|---|---|---|---|
| **Maptiles key** | Style và tile bản đồ (MapLibre) | **Có** (bắt buộc) | `NEXT_PUBLIC_GOONG_MAPTILES_KEY` |
| **API key** (REST) | Autocomplete, Geocode, Directions, Distance Matrix | **Không.** Chỉ dùng phía server qua `/api/maps/*` (có rate limit và cache) | `GOONG_API_KEY` |

2. Nếu Goong console cho giới hạn theo **domain/referrer**: giới hạn Maptiles key vào `<DOMAIN>`, `staging.<DOMAIN>`, `*.vercel.app`, `localhost`. Nếu không có tính năng này: theo dõi lượng dùng hằng tuần, và rotate key nếu bị lạm dụng.
3. Theo dõi hạn mức miễn phí (cần kiểm tra). Có cache geocode trong DB. Tuyến chỉ gọi Directions cho phương án được chọn.
4. **Dự phòng:**
   - `MAPS_PROVIDER=ors` dùng OpenRouteService (`ORS_API_KEY`) + Nominatim (cache, không autocomplete).
   - Tile OpenFreeMap (không cần key, biến `NEXT_PUBLIC_MAP_STYLE_FALLBACK`).

### 5.5 Dịch vụ tùy chọn

| Dịch vụ | Làm gì | Biến | Ghi chú |
|---|---|---|---|
| **Anthropic API** | https://console.anthropic.com → API Keys, tạo key `foodsave-prod`. **Đặt giới hạn chi tiêu tháng** cho workspace (ví dụ 20 USD) | `ANTHROPIC_API_KEY`, `AI_MODEL`, `AI_PROVIDER=anthropic`, `FEATURE_AI=true` | Không có key thì `FEATURE_AI=false`, nút AI ẩn. Đọc skill `claude-api` trước khi code AI |
| **Sentry** | https://sentry.io, tạo project **Next.js**, lấy DSN; tạo Auth Token (scope `project:releases`) để upload source map | `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | Bật trong P5. `sendDefaultPii: false` |
| **VAPID** (Web Push) | Git Bash: `pnpm dlx web-push generate-vapid-keys`. Staging và prod mỗi bên **một cặp riêng** | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT=mailto:<email liên hệ>`, `FEATURE_WEB_PUSH=true` | Đổi cặp khóa thì mọi subscription cũ mất hiệu lực |

### 5.6 Cấp quyền admin (chạy một lần cho mỗi project)
Admin **không** tự đăng ký được (SECURITY-PRIVACY C2). Quyền admin chỉ cấp/thu hồi qua RPC `grant_platform_admin(p_user_id uuid, p_reason text)` / `revoke_platform_admin(p_user_id uuid, p_reason text)` (DATA-MODEL §8.2): hàm chỉ chấp nhận service role (script bootstrap, hoặc role `postgres` trong SQL Editor) hoặc admin đã đạt aal2, và luôn ghi `audit_logs` (`admin.grant`/`admin.revoke`). Cách cấp:
1. Người cần quyền (Minh, Khanh) tự đăng ký tài khoản thường trên môi trường đó.
2. Minh cấp quyền bằng **script bootstrap** `scripts/grant-admin.mjs` (P1-10) — script tìm người dùng theo email qua Admin API của Supabase Auth rồi gọi `grant_platform_admin` bằng service role (audit `admin.grant`, `actor_kind = 'service'`):
   ```bash
   # Local (biến môi trường hoặc file .env.local truyền TƯỜNG MINH)
   node scripts/grant-admin.mjs --env-file .env.local --email minh@example.com --reason "Cấp admin ban đầu P1"
   # Cloud: giá trị cloud ở .env.cloud.local (CLAUDE.md luật 9); project không phải local bắt buộc thêm --yes
   node scripts/grant-admin.mjs --env-file .env.cloud.local --email minh@example.com --reason "Cấp admin ban đầu P1" --yes
   ```
   - Đọc `NEXT_PUBLIC_SUPABASE_URL` (hoặc `SUPABASE_URL`) và `SUPABASE_SERVICE_ROLE_KEY`; **không** tự nạp `.env*` nếu không có `--env-file`. Không in key ra màn hình.
   - Thiếu `--reason` (≥ 5 ký tự) ⇒ từ chối. Email chưa có tài khoản ⇒ báo lỗi (người đó phải tự đăng ký trước). Đã là admin ⇒ không làm gì, không ghi audit.
   - Cách thay thế khi không chạy được script: SQL Editor (role `postgres`):
     ```sql
     select public.grant_platform_admin(
       (select id from auth.users where email = lower('<email>')),
       'Cấp admin ban đầu P1');
     ```
   Hàm có trong migration `identity_orgs` (DATA-MODEL §18, P0). **Không** `update profiles set platform_role` bằng tay. Các admin sau này do một admin aal2 cấp (cùng RPC).
3. Người đó đăng nhập `/admin` → bị chuyển tới `/admin/mfa` → bấm "Tạo mã QR", quét bằng ứng dụng xác thực (Google/Microsoft Authenticator…), nhập mã 6 số. Từ lần sau, mỗi phiên đăng nhập phải nhập mã (aal2). Supabase TOTP **không có mã khôi phục riêng**: khóa bí mật hiện ở bước đăng ký chính là "mã khôi phục" — cất ngoại tuyến (giấy hoặc trình quản lý mật khẩu, SECURITY-PRIVACY §3 C16) để thêm lại vào điện thoại mới; mỗi admin dùng thiết bị riêng (luôn có ≥ 2 admin). Mất thiết bị ⇒ admin còn lại/Minh xóa yếu tố TOTP của người đó bằng Admin API (`auth.admin.mfa.deleteFactor`, service role), ghi lý do vào nhật ký sự cố, rồi người đó đăng ký lại (SECURITY-PRIVACY §2.5).
4. **Gỡ quyền:** `select public.revoke_platform_admin((select id from auth.users where email = lower('<email>')), '<lý do>');` (hàm từ chối thu hồi admin cuối cùng).

---

## 6. Luồng migration

### 6.1 Quy tắc
- Mọi thay đổi DB nằm trong `supabase/migrations/<timestamp>_<tên>.sql`, tạo bằng `pnpm supabase migration new <tên>` (skill `new-migration`).
- **Không sửa** migration đã có trên `origin/main`. Hook PreToolUse chặn việc này; muốn sửa thì viết migration mới.
- **Không** sửa schema bằng tay trên dashboard staging hay prod. Nếu lỡ sửa: `supabase db diff` để đưa thay đổi về thành migration ngay.
- Mỗi migration đi kèm: RLS + pgTAP + `pnpm db:types` + cập nhật `docs/DATA-MODEL.md`.

### 6.2 Các bước

| Bước | Ở đâu | Lệnh / tự động |
|---|---|---|
| 1. Viết và thử | local | `pnpm supabase migration new x`, rồi sửa SQL, rồi `pnpm supabase db reset`, `pnpm test:db`, `pnpm db:types` |
| 2. Kiểm tra | CI (PR) | Job `db`: `supabase start`, `db reset`, `db lint`, `test db`, type diff |
| 3. Staging | GitHub Actions khi merge `main` (Environment `staging`) | `supabase link --project-ref $SUPABASE_STAGING_PROJECT_REF`, rồi `supabase db push` |
| 4. Prod | `release.yml` khi push tag `v*` (Environment `production`, **Minh bấm duyệt**) | `supabase link --project-ref $SUPABASE_PROD_PROJECT_REF`, rồi `supabase db push`, rồi mới promote app |

`supabase db push` chỉ chạy migration chưa áp dụng (theo bảng `supabase_migrations.schema_migrations`). Lệnh `supabase db reset --linked` bị **cấm** trong `permissions.deny` vì xóa sạch DB cloud.

### 6.3 Tương thích ngược (expand → contract)
- Vì prod migrate **trước** khi app mới lên, migration phải chạy được với **app phiên bản hiện tại**:
  - Thêm cột: được, miễn có `default` hoặc cho phép null.
  - Đổi tên hoặc xóa cột/bảng: làm qua **2 bản phát hành**. Bản 1 thêm cột mới và app ghi cả hai. Bản 2 bỏ cột cũ sau khi app không còn dùng.
  - Đổi chữ ký RPC: tạo hàm mới (`_v2`), giữ hàm cũ tới bản sau.
- Migration nặng (backfill nhiều dòng): chạy theo lô, tránh khóa bảng lâu.

---

## 7. Phát hành, tag, rollback, hotfix

### 7.1 Version theo phase (theo `ROADMAP.md`)

| Mốc | Tag | Điều kiện |
|---|---|---|
| G0 (P0 xong, 11/10) | `v0.0` | Gate P0 (preview + prod chạy, CI xanh, đăng ký nhận email thật) |
| G1 (15/10) | `v0.1` | Gate P1 + UAT P1 ký |
| **M1** (27/10) | `v0.2` | Gate P2 + UAT P2 ký; video #1 |
| G3 (08/11) | `v0.3` | Gate P3 + UAT P3 ký |
| **M2** (17/11) | `v0.4` | Gate P4 + UAT P4 ký; video #2 |
| **M3 / freeze** (22/11) | `v1.0-rc` | Gate P5 + UAT P5 ký; video #3 |
| G6 (ngày trước chung kết) | `v1.0` | UAT P6 lần 3 ký |
| Hotfix | `v0.2.1`, `v1.0-rc.1`, `v1.0.1` … | Sửa lỗi, không thêm tính năng |

`release.yml` chạy với mọi tag khớp `v*`. ROADMAP là nguồn sự thật cho tên tag.

### 7.2 Quy trình phát hành
1. `main` xanh, staging đã chạy bản cần phát hành, UAT phase đã ký, `phase-gate` đã xuất báo cáo.
2. Cập nhật `CHANGELOG.md` (skill `phase-gate` gợi ý nội dung).
3. Tạo tag có chú thích: `git tag -a v0.2 -m "M1: vòng lõi"` rồi `git push origin v0.2`. Hoặc tạo bằng `gh release create v0.2 --generate-notes`.
4. `release.yml` tự chạy:
   - kiểm tra tag trỏ tới commit có trên `main`;
   - **chờ Minh duyệt** Environment `production`;
   - migrate prod;
   - `git push origin <sha>:refs/heads/release` (fast-forward);
   - Vercel build Production;
   - poll `https://<DOMAIN>/api/health` tới khi `version == v0.2` (tối đa 10 phút);
   - Playwright `@smoke` trên prod.
5. **Sau phát hành:**
   - Nếu template email có đổi thì dán lại (§4.6).
   - Chạy `demo_reset()` nếu seed demo có đổi.
   - Thông báo nhóm.

### 7.3 Rollback

| Thành phần | Cách rollback | Thời gian |
|---|---|---|
| **App** | Vercel → Deployments → chọn bản Production trước → **Instant Rollback** (Hobby: rollback được về bản production ngay trước; cần kiểm tra giới hạn). Sau đó sửa và phát hành bản patch | ≤ 2 phút |
| **DB: migration lỗi nhưng chưa làm hỏng dữ liệu** | Viết migration **bù** (forward-fix), phát hành patch. **Không** xóa dòng trong `schema_migrations` bằng tay | 15–60 phút |
| **DB: dữ liệu hỏng** | Bật `MAINTENANCE_MODE=1`. Khôi phục bản dump gần nhất (C18) vào project mới hoặc vào chính prod theo hướng dẫn `docs/runbooks/restore.md` (viết và diễn tập trong P5) | 1–3 giờ |
| **Tính năng lỗi** | Tắt bằng feature flag trong `app_settings` (Admin → Cấu hình, admin aal2, RPC `set_app_setting`, có audit): `ai_enabled` (và từng tính năng `ai_offer_autofill_enabled`, `ai_doc_extract_enabled`, `ai_proof_check_enabled`, `ai_esg_summary_enabled`), `push_enabled`, `public_map_enabled`, `signups_enabled`, `auto_accept_enabled` — danh sách, kiểu, mặc định ở DATA-MODEL §2.6 `app_settings` | Tức thì |

### 7.4 Hotfix
1. Tạo nhánh `hotfix/<mô-tả>` từ `main`, viết test tái hiện, sửa, mở PR (CI đầy đủ).
2. Merge vào `main`, staging tự cập nhật, Khanh kiểm tra nhanh mục bị ảnh hưởng.
3. Tag patch (ví dụ `v1.0-rc.1`), `release.yml` chạy như §7.2.
4. Sau freeze (22/11) **chỉ** cho phép hotfix; mỗi hotfix phải có issue mức High trở lên.

---

## 8. Bảng biến môi trường

### 8.1 Biến của ứng dụng (Vercel và `.env.local`)

- **Phạm vi:**
  - **public**: lộ ra trình duyệt (`NEXT_PUBLIC_*`), không bao giờ chứa bí mật.
  - **server**: chỉ server; đánh dấu Sensitive trên Vercel.
  - **build**: chỉ dùng lúc build.
- **Cột môi trường:**
  - **L** = local (`.env.local`).
  - **S** = Vercel Preview (staging, gồm cả nhánh `main` và PR).
  - **P** = Vercel Production.
  - **C** = CI (`.env.ci`, không bí mật).
- `src/lib/env.ts` kiểm tra mọi biến bằng zod; **thiếu biến bắt buộc thì build fail**.

| Biến | Dùng ở | Phạm vi | Định dạng ví dụ | L | S | P | C |
|---|---|---|---|---|---|---|---|
| `NEXT_PUBLIC_APP_ENV` | Nhãn môi trường, `noindex`, Sentry environment | public | `local` \| `staging` \| `production` | ✓ | ✓ | ✓ | ✓ |
| `NEXT_PUBLIC_APP_URL` | Link tuyệt đối trong email, QR (`/h/<token>`), OG | public | `https://<DOMAIN>` | ✓ | ✓ | ✓ | ✓ |
| `FEATURE_AI` | Bật tính năng AI (tự điền lô, kiểm minh chứng, nhận xét ESG) cho cả môi trường | server | `true` \| `false` | tùy | ✓ | ✓ | `true` (provider `fake`) |
| `FEATURE_WEB_PUSH` | Bật Web Push cho cả môi trường | server | `true` \| `false` | tùy | ✓ | ✓ | `true` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase client (browser + server) | public | `https://<ref>.supabase.co` / `http://127.0.0.1:54321` | ✓ | ✓ | ✓ | ✓ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase client. Giá trị là **publishable key** mới (`sb_publishable_…`) hoặc anon JWT cũ | public | `sb_publishable_…` | ✓ | ✓ | ✓ | ✓ |
| `SUPABASE_SERVICE_ROLE_KEY` | `src/server` (dispatch, xóa Storage, demo reset, mời thành viên). **Chỉ** `src/server` | server | `sb_secret_…` (hoặc service_role JWT cũ) | ✓ | ✓ | ✓ | ✓ (key local) |
| `SUPABASE_DB_URL` | Chỉ script/CI cần kết nối Postgres trực tiếp (seed demo hiện **không** cần, §10). **Không** đặt trên Vercel | server (script) | `postgresql://postgres:…@…:5432/postgres` | ✓ | — | — | ✓ |
| `SUPABASE_STAGING_PROJECT_REF` | Supabase MCP read-only (`.mcp.json`) | dev | `<STG_REF>` | ✓ | — | — | — |
| `JOBS_HMAC_SECRET` | `/api/jobs/dispatch` kiểm chữ ký từ pg_net; trùng Vault `jobs_hmac_secret` | server | 64 ký tự hex | ✓ | ✓ | ✓ | ✓ |
| `IP_HASH_SECRET` | Băm IP, email cho `rate_limits`, `audit_logs` (chưa có trong `.env.example`, cần bổ sung) | server | 64 ký tự hex | ✓ | ✓ | ✓ | ✓ |
| `MAPS_PROVIDER` | Chọn adapter bản đồ | server | `goong` \| `ors` \| `aws` \| `fake` | ✓ | ✓ | ✓ | `fake` |
| `NEXT_PUBLIC_GOONG_MAPTILES_KEY` | Style và tile MapLibre | public | chuỗi key Goong | ✓ | ✓ | ✓ | — |
| `GOONG_API_KEY` | Autocomplete, Geocode, Directions, Distance Matrix (server proxy) | server | chuỗi key Goong | ✓ | ✓ | ✓ | — |
| `ORS_API_KEY` | Dự phòng OpenRouteService | server | chuỗi key | tùy chọn | tùy chọn | tùy chọn | — |
| `NOMINATIM_BASE_URL`, `NOMINATIM_USER_AGENT` | Dự phòng geocode (có cache) | server | `https://nominatim.openstreetmap.org`, `FoodSave/1.0 (<email>)` | tùy chọn | tùy chọn | tùy chọn | — |
| `NEXT_PUBLIC_MAP_STYLE_FALLBACK` | Tile dự phòng (OpenFreeMap) | public | `https://tiles.openfreemap.org/styles/liberty` | ✓ | ✓ | ✓ | ✓ |
| `AI_PROVIDER` | Chọn adapter AI | server | `anthropic` \| `bedrock` \| `fake` | ✓ | ✓ | ✓ | `fake` |
| `AI_MODEL` | Model ID cho adapter | server | Theo skill `claude-api` (không ghi cứng trong code) | ✓ | ✓ | ✓ | — |
| `ANTHROPIC_API_KEY` | AI khi `AI_PROVIDER=anthropic` | server | `sk-ant-…` | tùy chọn | ✓ | ✓ | — |
| `AWS_REGION` | Khi `AI_PROVIDER=bedrock` hoặc dịch vụ AWS sau này | server | `ap-southeast-1` | tùy | — | — | — |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Chỉ máy local khi thử Bedrock. Trên Amplify dùng IAM role (AWS-MIGRATION §5) | server | — | tùy | — | — | — |
| `NOTIFY_PROVIDER` | Chọn adapter email | server | `resend` \| `ses` \| `fake` | `fake` | ✓ | ✓ | `fake` |
| `RESEND_API_KEY` | Email ứng dụng (thông báo, báo cáo). Auth email đi qua SMTP cấu hình trong Supabase | server | `re_…` | — | ✓ | ✓ | — |
| `EMAIL_FROM` | Người gửi email ứng dụng | server | `FoodSave <no-reply@mail.<DOMAIN>>` | ✓ | ✓ | ✓ | ✓ |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Đăng ký Web Push (browser) | public | base64url khoảng 87 ký tự | ✓ | ✓ | ✓ | ✓ (cặp test) |
| `VAPID_PRIVATE_KEY` | Gửi Web Push | server | base64url khoảng 43 ký tự | ✓ | ✓ | ✓ | ✓ (cặp test) |
| `VAPID_SUBJECT` | Liên hệ trong VAPID | server | `mailto:<email liên hệ>` | ✓ | ✓ | ✓ | ✓ |
| `NEXT_PUBLIC_SENTRY_DSN` | Gửi lỗi | public | `https://<key>@o<id>.ingest.sentry.io/<id>` | — | ✓ | ✓ | — |
| `SENTRY_AUTH_TOKEN` | Upload source map khi build | build | `sntrys_…` | — | ✓ | ✓ | — |
| `SENTRY_ORG`, `SENTRY_PROJECT` | Như trên | build | `foodsave`, `foodsave-web` | — | ✓ | ✓ | — |
| `MAINTENANCE_MODE` | Bật trang bảo trì khẩn cấp (đề xuất, chưa có trong `.env.example`) | server | `0` \| `1` | — | tùy | tùy | — |
| `NEXT_PUBLIC_APP_VERSION` | Hiện version ở chân trang và `/api/health` (đề xuất; build lấy từ tag hoặc `VERCEL_GIT_COMMIT_SHA`) | public | `v0.2` | auto | auto | auto | auto |

`FEATURE_*` là công tắc **theo môi trường** (cần redeploy). Công tắc vận hành lúc chạy (`ai_enabled`, `signups_enabled`, `public_map_enabled`, `push_enabled`, `auto_accept_enabled`…; DATA-MODEL §2.6) nằm trong bảng `app_settings`; hiệu lực thật = `FEATURE_*` của môi trường **và** key tương ứng; admin aal2 đổi được không cần redeploy. Cấu hình nghiệp vụ (TTL, hệ số ghép đơn, ngưỡng tự chấp nhận) cũng ở `app_settings`. **Ngưỡng nhãn** (`label_rules`, ADR-005) và **hệ số tác động** (`impact_factors`, ADR-009) **không** cấu hình lúc chạy: admin chỉ xem, đổi qua migration có version.

### 8.2 Secrets của GitHub Actions

| Secret / Variable | Environment | Dùng cho |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | `staging`, `production` | `supabase link` / `db push` (Personal access token của Minh, tạo ở Supabase → Account → Access Tokens) |
| `SUPABASE_STAGING_PROJECT_REF`, `SUPABASE_PROD_PROJECT_REF` (variables) | `staging`, `production` | Như trên (tên theo ARCHITECTURE §13) |
| `SUPABASE_DB_PASSWORD` | `staging`, `production` (giá trị khác nhau) | `db push`, `db dump` |
| `KEEPALIVE_TARGETS` | repo | JSON `[{url, anonKey}]` của staging và prod (publishable key không phải bí mật nhưng vẫn để trong secret cho gọn) |
| `BACKUP_AGE_PUBLIC_KEY` | `production` | Mã hóa bản dump (`age`) |
| `SMOKE_JUDGE_EMAIL`, `SMOKE_JUDGE_PASSWORD` | `staging`, `production` | Smoke test bằng tài khoản giám khảo |
| `E2E_ADMIN_TOTP_SECRET` | repo (CI) | Chỉ dành cho Supabase local; không phải tài khoản thật |

- **Environment `production`:** Required reviewers = **Minh**; Deployment branches = chỉ tag `v*`.
- **Branch protection:**
  - `main`: bắt buộc PR, check xanh, cấm force push.
  - `release`: chỉ GitHub Actions (`release.yml`) và Minh được push; cấm force push.

---

## 9. Giám sát và vận hành

### 9.1 Uptime monitor
- Dùng **UptimeRobot** (free, kiểm tra mỗi 5 phút) hoặc **Better Stack** (free tier).
- **Monitor:**
  - `https://<DOMAIN>/api/health`: kỳ vọng HTTP 200 và chuỗi `"db":"ok"`.
  - `https://staging.<DOMAIN>/api/health`.
- **Cảnh báo:** email Minh + Khanh (thêm Telegram nếu tiện).
- Trang trạng thái công khai: tùy chọn, có thể đưa vào slide để thể hiện vận hành chuyên nghiệp.
- `/api/health` trả `{ status, version, env, db, outbox_oldest_pending_s, outbox_dead, time }`, với `db` kiểm bằng `select 1` qua RPC `health()` (ARCHITECTURE §11). **Không** trả thông tin nhạy cảm.

### 9.2 Keepalive (chống tạm dừng gói Free)
- `.github/workflows/keepalive.yml` chạy **hằng ngày** lúc 01:00 UTC (08:00 giờ VN), kèm `workflow_dispatch`.
- `scripts/keepalive` gửi một truy vấn nhẹ tới mỗi mục trong `KEEPALIVE_TARGETS`, ví dụ `curl -fsS "$url/rest/v1/public_impact_stats?select=updated_at&limit=1" -H "apikey: $key"` (view công khai, anon đọc được).
- Gọi thẳng Supabase REST, không qua Vercel, để keepalive vẫn chạy khi app lỗi.
- Workflow fail thì GitHub gửi email cho Minh.
- **Lưu ý:** GitHub tự tắt workflow theo lịch nếu repo không có hoạt động 60 ngày. Trong giai đoạn dự án không xảy ra; sau chung kết cần chú ý.
- **Lớp dự phòng (08/10, khi GitHub Actions bị khóa billing):** Vercel Cron trong `vercel.json` gọi `GET /api/health` mỗi ngày lúc 01:17 UTC. Route đọc một dòng `food_categories` bằng khóa anon và trả `{ok, db, ms}` (503 khi DB lỗi), không cần đăng nhập, không trả dữ liệu. Xem lịch sử chạy trong Vercel → Settings → Cron Jobs. Cũng dùng được làm URL cho uptime monitor (§9.1).

### 9.3 Sentry, log, cảnh báo
- **Sentry (P5):**
  - Cảnh báo khi có issue mới ở prod.
  - Cảnh báo khi > 10 lỗi/giờ.
  - Release gắn theo tag.
  - `environment` lấy từ `NEXT_PUBLIC_APP_ENV`.
- **Supabase → Logs:** xem log API/Postgres/Auth khi điều tra; log cũng được lưu ngắn hạn theo gói.
- **Báo cáo tuần** (Minh, thứ Hai, 10 phút):
  - Dung lượng DB/Storage/egress (Supabase Reports).
  - Lượt dùng Goong, Resend, Anthropic.
  - Báo cáo flaky test.
  - Kết quả backup đêm.

### 9.4 Lịch job

Lịch pg_cron chính xác (giờ UTC) ở ARCHITECTURE §8.2. Tóm tắt:

| Job | Chạy bởi | Tần suất | Việc |
|---|---|---|---|
| `fs_dispatch_tick` | pg_cron → `private.kick_dispatch()` → pg_net → `/api/jobs/dispatch` | 1 phút, chỉ khi `private.dispatch_due()` | Tạo `notifications` từ `notification_outbox` (in-app), gửi email đến hạn (đợt công bằng sau, thử lại), xóa file `kyc_purge`; thu hồi lease hết hạn. Ngoài ra trigger trên outbox gọi `kick_dispatch` ngay khi có bản ghi mới. Cần 2 secret Vault (§4.4); thiếu thì bỏ qua |
| `fs_turned_red` | pg_cron | 1 phút (đặt từ migration `offers_allocations`; migration thông báo chỉ tạo `*/5` nếu job chưa có) | `notify_turned_red()`: báo lô vừa chuyển Đỏ |
| `fs_close_offers` | pg_cron | 1 phút (như trên) | `close_expired_offers()`: đóng lô quá hạn hiệu lực, ghi `qty_unclaimed` |
| `fs_expire_requests` | pg_cron | 1 phút (như trên) | `expire_stale_requests()`: yêu cầu quá `reserved_until`, nhu cầu quá `needed_by` |
| `fs_proof_reminders` | pg_cron | 1 giờ | `proof_reminders()`: nhắc minh chứng sắp hoặc đã quá hạn |
| `fs_refresh_esg` | pg_cron | hằng ngày 01:00 giờ VN | `refresh_esg_monthly()` |
| `fs_purge` | pg_cron | hằng ngày 02:30 giờ VN | `purge_retention()`: xóa dữ liệu hết hạn; enqueue `kyc_purge` để dispatcher xóa file KYC qua Storage API |
| `fs_purge_notifications` | pg_cron | hằng ngày 02:40 giờ VN | `purge_notifications()`: xóa `notifications` (kèm `notification_deliveries`) quá 90 ngày |
| `keepalive` | GitHub Actions | hằng ngày | §9.2 |
| `backup` | GitHub Actions | hằng đêm | Dump prod, mã hóa, lưu artifact 7 ngày |
| `nightly-e2e` | GitHub Actions | hằng đêm | E2E đầy đủ + Lighthouse trên staging |

---

## 10. Dữ liệu demo: seed và reset

ROADMAP P2-16/P2-17, DATA-MODEL §17, skill `seed-demo` / `demo-reset`. Hướng dẫn cho BTC/giám khảo: [`docs/pitch/tai-khoan-demo.md`](pitch/tai-khoan-demo.md).

| Lệnh | Việc |
|---|---|
| `node scripts/seed-demo.mjs --local` (`pnpm seed:demo --local`) | Seed/bổ sung demo vào Supabase local. Đọc `npx supabase status -o env`, không cần file `.env` |
| `node scripts/demo-reset.mjs --local` (`pnpm demo:reset --local`) | `demo_reset()` rồi seed lại. `--no-seed`: chỉ xóa |
| `… --env-file .env.cloud.local --yes [--allow-prod]` | Chạy trên project cloud (xem các bước dưới) |

**Script làm gì.** Tạo 11 tài khoản demo bằng Auth Admin API (`email_confirm`, đuôi `@foodsave.test` — TLD dành riêng, không gửi được thư; `profiles.is_demo = true`). Mọi thao tác nghiệp vụ chạy dưới JWT của chính người dùng demo, qua đúng RPC của ứng dụng: `create_organization` → sửa hồ sơ/pháp lý (grant cột) → `upsert_site` → `set_site_hours` → tải giấy tờ giả lên bucket `kyc` → `grant_consent` → `submit_organization` → `invite_member`/`accept_invite` → `create_offer`/`publish_offer` → `request_offer` → `confirm_allocation` → `assign_pickup` → `issue_handover_token` → `consume_handover_token` (dropoff tự động ghi ledger). Mốc thời gian luôn là `now() + khoảng`. Chạy lại = chỉ bổ sung phần thiếu (lô còn sống, yêu cầu chờ duyệt, ngày lịch sử trống). Local: seed ≈ 15 s, reset ≈ 1 s + seed.

**Ba helper chỉ dành cho service role** (migration `demo_ops`, pgTAP `supabase/tests/rpc/demo_ops.test.sql`):

| Hàm | Vì sao cần | Giới hạn |
|---|---|---|
| `demo_approve_organization(p_org_id, p_reviewer_id)` | `review_organization` cần admin aal2 (TOTP); script không có và không được có admin | Chỉ tổ chức `is_demo` do hồ sơ demo tạo, đang `submitted`; người duyệt là hồ sơ demo thường (không phải admin, không là thành viên); audit `org.review` (`actor_kind = service`) |
| `demo_seed_history(p_items)` | PostgREST đăng nhập bằng `authenticator` nên `private.now()` không bao giờ lùi giờ được (§17) ⇒ không phát lại RPC trong quá khứ qua API | Chỉ điểm của tổ chức demo đã duyệt; mốc trong [now − 120 ngày, now − 1 giờ]; ghi đúng các dòng mà vòng tự-lấy thật để lại, ledger vẫn do `private.credit_impact` ghi; không cộng điểm uy tín; audit `demo.seed_history` |
| `demo_reset()` | Xóa mọi tổ chức `is_demo` và mọi thứ gắn với chúng | Cần `app_settings.demo_reset_enabled = true`; từ chối nếu có dòng nối demo với tổ chức thật; ledger demo xóa qua ngoại lệ `fs.demo_reset` (§13); giữ tài khoản và `audit_logs` (+ dòng `demo.reset`); file Storage do script xóa qua Storage API |

**Chạy trên production (Vercel + Supabase cloud).**
1. Chỉ trong cửa sổ đã thống nhất (≤ 2 giờ trước buổi chấm/tập dượt). Migration `demo_ops` phải đã áp lên project (luồng §6).
2. Biến môi trường lấy từ file nạp tường minh: `--env-file .env.cloud.local` cần `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (không cần `SUPABASE_DB_URL`). Không bao giờ tạo `.env.production.local`.
3. Mật khẩu chung qua biến môi trường (không qua tham số để không lưu vào lịch sử shell): `DEMO_JUDGE_PASSWORD` (giám khảo), `DEMO_TEAM_PASSWORD` (tài khoản trình diễn của nhóm); 12–72 ký tự, có chữ và số. Không truyền mà nhóm có tài khoản mới ⇒ script sinh một mật khẩu, đặt cho cả nhóm và **in đúng một lần**; tài khoản đã có thì giữ mật khẩu cũ.
4. Chạy thử không `--yes` để xem kế hoạch (đích, số tổ chức demo/thật, số dòng ledger). Script dừng nếu đích không phải localhost mà thiếu `--yes`, và dừng nếu đích có tổ chức thật đã duyệt (dấu hiệu dữ liệu pilot) mà thiếu `--allow-prod`.
5. `node scripts/demo-reset.mjs --env-file .env.cloud.local --yes --allow-prod`. Script tự kiểm sau khi xóa: số tổ chức thật, ledger thật, thống kê công khai thật phải giữ nguyên, nếu không thì báo lỗi và dừng trước khi seed lại.
6. Đăng nhập thử một tài khoản giám khảo; kiểm kho tặng có đủ 3 nhãn.

**Giới hạn đã biết.**
- Yêu cầu chờ duyệt hết hạn sau `request_ttl_minutes` (120 phút), lô Đỏ hết hạn sau vài giờ ⇒ reset gần giờ chấm.
- Cửa hàng có giờ mở cửa: nếu seed lúc cửa hàng đóng, lô của nó có khung lấy từ giờ mở cửa kế tiếp (nhãn theo hạn hiệu lực). Hai cửa hàng 24/7 (gồm cửa hàng giám khảo) luôn có đủ Xanh/Vàng/Đỏ.
- Lịch sử 90 ngày không đi qua RPC (lý do ở bảng trên); muốn phát lại bằng RPC thật với `fs.clock` thì cần kết nối Postgres trực tiếp (`SUPABASE_DB_URL`), chưa làm.
- Tài khoản demo không nhận email (TLD `.test`); dispatcher không gửi email cho hồ sơ/tổ chức demo. Nếu Supabase cloud từ chối địa chỉ `.test` khi tạo tài khoản, dùng `--email-domain <tên miền dành riêng khác>` (vd. `example.com`) và cập nhật `docs/pitch/tai-khoan-demo.md`.
- Seed lỗi giữa chừng (mạng, rate limit Auth): chạy lại `seed-demo.mjs` với cùng tham số — script tìm lại tài khoản/tổ chức và chỉ làm phần còn thiếu. Một người chạy tại một thời điểm.
