# FoodSave v2 — Chiến lược kiểm thử

> **Trạng thái:** bản thiết kế (07/10/2026), áp dụng từ P0.
> **Stack:** Vitest + fast-check · pgTAP · Playwright (+ @axe-core/playwright, screenshot) · Lighthouse CI · MSW.
> **Liên quan:** `SECURITY-PRIVACY.md` §10 (test bảo vệ lỗi cũ), `ESG-METHODOLOGY.md` §10 (fixture ESG), `docs/uat/` (checklist của Khanh), `DEPLOYMENT.md` (CI/CD).

---

## Mục lục

1. [Kim tự tháp kiểm thử](#1-kim-tự-tháp-kiểm-thử)
2. [Từng tầng kiểm thử những gì](#2-từng-tầng-kiểm-thử-những-gì)
3. [Property test bắt buộc](#3-property-test-bắt-buộc)
4. [pgTAP: ma trận RLS và hồi quy B1–B8](#4-pgtap-ma-trận-rls-và-hồi-quy-b1b8)
5. [E2E Playwright](#5-e2e-playwright)
6. [Accessibility, screenshot, Lighthouse](#6-accessibility-screenshot-lighthouse)
7. [Dữ liệu test và seed](#7-dữ-liệu-test-và-seed)
8. [Pipeline CI](#8-pipeline-ci)
9. [Chính sách test chập chờn (flaky)](#9-chính-sách-test-chập-chờn-flaky)
10. [UAT: Khanh chạy thế nào](#10-uat-khanh-chạy-thế-nào)
11. [Definition of Done về test](#11-definition-of-done-về-test)

---

## 1. Kim tự tháp kiểm thử

```
                 ┌────────────┐   UAT thủ công (Khanh) — mỗi phase, 3 thiết bị
                 │    UAT     │
               ┌─┴────────────┴─┐  E2E Playwright — ~25 kịch bản theo vai trò + a11y + screenshot
               │      E2E       │  Lighthouse CI — landing, PWA
             ┌─┴────────────────┴─┐  Integration (Vitest + Supabase local) — RPC thật, đồng thời, Storage
             │    Integration     │
           ┌─┴────────────────────┴─┐  pgTAP — RLS, quyền cột, RPC, invariant, hồi quy B1–B8
           │      pgTAP (DB)        │
         ┌─┴────────────────────────┴─┐  Unit + property (Vitest + fast-check) — src/core/*, schema zod
         │     Unit / Property         │  nhiều nhất, nhanh nhất (< 30 s)
         └─────────────────────────────┘
```

**Nguyên tắc:**
- Logic nghiệp vụ nằm ở `src/core/` (TS thuần) và SQL (RPC, RLS). Hai lớp này phải được test **dày** ở tầng thấp.
- E2E chỉ kiểm tra luồng xuyên suốt và tích hợp UI, không lặp lại từng nhánh logic.
- **Không mock Supabase** trong integration và E2E: chạy Supabase local thật (Docker). Chỉ mock **nhà cung cấp bên ngoài** (Goong, Anthropic, Resend, Web Push), bằng MSW hoặc provider `fake`.
- Mỗi lỗi bảo mật hoặc lỗi production phải sinh một test hồi quy trước khi sửa (viết test cho fail trước, rồi sửa).

| Tầng | Công cụ | Vị trí | Số lượng mục tiêu (M3) | Thời gian chạy |
|---|---|---|---|---|
| Unit / property | Vitest, fast-check | `src/**/*.test.ts`, `src/core/**/*.property.test.ts` | 300+ | < 30 s |
| pgTAP | `supabase test db` | `supabase/tests/{tables,rpc,regression,esg}/*.test.sql` (quy ước DATA-MODEL §18) | 400+ assertion | < 2 phút |
| Integration | Vitest (`vitest.integration.config.ts`) + supabase-js với JWT thật | `tests/integration/**/*.test.ts` | 40+ | < 3 phút |
| E2E | Playwright (Chromium, WebKit, Pixel 5, iPhone 13) | `tests/e2e/**/*.spec.ts` | ~25 kịch bản | < 12 phút (4 shard) |
| Lighthouse | `@lhci/cli` | `lighthouserc.json` | 2 URL × 3 lần chạy | < 3 phút |

---

## 2. Từng tầng kiểm thử những gì

### 2.1 Unit / property (Vitest + fast-check)
- **`src/core/labels`:**
  - `effectiveDeadline(expiresAt, siteHours, closures, tz)`: mốc đến trước giữa hạn và giờ đóng cửa.
    - Hạn chỉ có ngày thì tính đến 23:59 giờ VN.
    - Xử lý `closes_next_day` và ngày nghỉ.
  - `freshnessLabel(deadline, perishability, at)` theo `label_rules` có version.
- **`src/core/matching`:** chấm điểm (0,4·gấp + 0,3·gần + 0,2·khớp + 0,1·uy tín), duyệt tổ hợp ≤ 3 cửa hàng trong top 12, bổ sung tham lam tới 5, thứ tự xếp hạng, trả 3 phương án, công bằng thứ tự thông báo. Có property test (§3).
- **`src/core/routing`:** hoán vị ≤ 5 điểm cho ra tuyến ngắn nhất (so với brute-force tham chiếu); ước tính ETA (chim bay × 1,4, 18 km/h, + 10 phút).
- **`src/core/impact`:** xem `ESG-METHODOLOGY.md` §10.
- **Schema zod** (`features/*/schemas.ts`): biên hợp lệ và không hợp lệ (số lượng nguyên với đơn vị không phải kg, khung giờ lấy, cam kết an toàn bắt buộc).
- **Tiện ích:**
  - `reencodeImage`: EXIF/GPS bị loại bỏ (fixture JPEG có GPS).
  - Định dạng số, ngày giờ `vi-VN`.
  - `env.ts` throw khi thiếu biến.
  - Escape từ khóa tìm kiếm (B7).
- **Component (tùy chọn):** `@testing-library/react` cho component có logic như đếm ngược, form nhiều bước. Không snapshot DOM.

### 2.2 pgTAP (DB)
- Mọi bảng `public` bật RLS; ma trận vai trò × bảng × thao tác (§4.1).
- Quyền cột (`column_privs_are`): danh sách cột được UPDATE trực tiếp.
- Mỗi RPC chuyển trạng thái kiểm tra:
  - Đúng vai trò thì thành công, sai vai trò thì `42501`.
  - Invariant `qty_reserved ≥ qty_picked ≥ qty_delivered`; không cấp vượt lô.
  - `client_op_id` gọi lại trả cùng kết quả.
  - Có ghi `audit_logs`, ghi `notification_outbox`.
  - Ma trận hủy (`DATA-MODEL.md`).
- `freshness_label()` SQL so với fixture chung (§3.4).
- Ledger append-only; credit duy nhất mỗi `handover_line_id`; nhiều reversal từng phần được, Σ reversal ≤ credit (vượt thì từ chối); ESG theo fixture (gồm `first_submitted_at` cho G2 và tháng hiện tại tính trực tiếp).
- Token bàn giao: hợp lệ chỉ khi còn trong TTL 15 phút **và** (pickup) trong khung lấy ± 30 phút; dùng một lần (`consumed_at`). Test du hành thời gian: quá TTL ⇒ `token_expired`; trước `lower(pickup_window) − 30'` hoặc sau `upper(pickup_window) + 30'` ⇒ từ chối dù token còn TTL; dùng lại ⇒ `token_consumed`.
- `org_change_requests`: owner tổ chức `approved` gửi yêu cầu sửa trường pháp lý ⇒ tổ chức **vẫn `approved`**, vẫn `publish_offer` được; UPDATE trực tiếp cột pháp lý của `org_sensitive` ⇒ bị chặn; admin duyệt ⇒ giá trị mới được áp dụng; từ chối ⇒ giữ giá trị cũ; sửa cột không pháp lý (mô tả, liên hệ) không tạo yêu cầu.
- `mark_allocation_packed` (chỉ cửa hàng có quyền điểm, chỉ `confirmed/assigned`, outbox `allocation_packed`); `thank_you_notes` (chỉ thành viên cửa hàng có phân bổ `delivered`/minh chứng `approved` với tổ chức đó mới INSERT được; hai bên và admin đọc; không U/D); `grant_platform_admin` (từ chối `authenticated` aal1 và user thường; chấp nhận service role và admin aal2; luôn có audit).
- Hồi quy B1–B8 (§4.2).
- `demo_reset()` không chạm dữ liệu `is_demo=false`; `private.now()` không bị `fs.clock` ảnh hưởng khi gọi qua PostgREST.

### 2.3 Integration (Vitest + Supabase local)

Dành cho thứ pgTAP khó diễn đạt:

- **Đồng thời:** 20 tổ chức gọi `reserve_bundle` song song (`Promise.all`) trên cùng một lô 10 đơn vị. Kỳ vọng: Σ đặt ≤ 10, không deadlock, mỗi lời gọi trả thành công hoặc lỗi thiếu số lượng rõ ràng. Đây là lớp bổ sung cho pgTAP `rpc/reserve_bundle_concurrency.test.sql` (2 phiên song song, DATA-MODEL §19.2).
- **Storage:** policy upload theo tiền tố `org_id`; signed URL `kyc` hết hạn sau 60 s (kiểm bằng `expiresIn: 2`, chờ 3 s); public URL của bucket private trả lỗi.
- **Auth:** đăng ký thật với Supabase local, đọc OTP từ **Mailpit/Inbucket** (`http://127.0.0.1:54324`); MFA TOTP enroll và challenge (`otplib` sinh mã); JWT aal1 bị `is_admin()` từ chối.
- **Job dispatch:** `/api/jobs/dispatch` từ chối HMAC sai hoặc timestamp cũ; xử lý `notification_outbox` idempotent (chạy 2 lần thì gửi 1 lần).
- **Provider adapter:** Goong, Anthropic, Resend được mock bằng **MSW** (`tests/msw/handlers.ts`), kiểm tra mapping request/response, timeout và fallback (Goong lỗi thì chuyển sang ORS/Nominatim).

### 2.4 E2E (Playwright)
Xem §5. Chạy trên `next build && next start`, dùng Supabase local và biến `MAPS_PROVIDER=fake`, `AI_PROVIDER=fake`, `NOTIFY_PROVIDER=fake`. Provider fake trả dữ liệu tất định, ghi email vào bảng `dev_outbox_sink` hoặc Mailpit.

### 2.5 Smoke trên môi trường thật
- `tests/e2e/smoke/*.spec.ts` (tag `@smoke`) chạy với `BASE_URL` của Vercel Preview/staging sau mỗi deploy, và với prod sau mỗi release.
- Chỉ dùng tài khoản UAT và giám khảo, chỉ đọc hoặc thao tác trên tổ chức `is_demo`.

---

## 3. Property test bắt buộc

**Vị trí:** `src/core/matching/matching.property.test.ts`, `src/core/labels/labels.property.test.ts`.

**Cấu hình:**
- `fc.assert(..., { numRuns: 500 })` trên CI và `numRuns: 100` khi chạy local.
- Seed in ra khi fail. Để tái hiện: `FC_SEED=<seed> pnpm test`.

**Bộ sinh dữ liệu** (`src/core/matching/__arbitraries__.ts`):
- 1–20 cửa hàng, tọa độ ngẫu nhiên trong bbox TP.HCM.
- Lô với số lượng nguyên 0–200 hoặc kg thập phân 3 chữ số.
- Danh mục ngẫu nhiên.
- Hạn hiệu lực từ −2 giờ đến +7 ngày.
- Tổ chức với bán kính 1–15 km, danh mục nhận, khung giờ nhận.
- Nhu cầu 1–500 đơn vị.

| # | Tính chất (cho **mọi** input sinh ra) | Ý nghĩa |
|---|---|---|
| P1 | **Không cấp vượt lô:** với mỗi phương án và mỗi lô, Σ `qty` phân bổ ≤ `available(offer)` | Không hứa hàng không có |
| P2 | **Không vượt nhu cầu:** Σ `qty` của phương án ≤ `need.remaining` | Không ép tổ chức nhận quá cần, tránh lãng phí thứ cấp |
| P3 | **Tôn trọng bán kính:** mọi cửa hàng trong phương án có `haversine(site, store) ≤ radius_km` | Đúng phạm vi tổ chức đã chọn |
| P4 | **Khả thi về thời gian:** `now + ETA(chim bay × 1,4 @ 18 km/h + 10′) ≤ effective_deadline`, và nằm trong giờ nhận của điểm | Không gợi ý lô Đỏ cho tổ chức đến không kịp |
| P5 | **Đúng danh mục:** mọi lô thuộc `accepted_categories` của điểm | Không gợi ý hàng tổ chức không nhận |
| P6 | **Đơn vị nguyên:** đơn vị khác `kg` thì `qty` là số nguyên | Không chia nửa cái bánh |
| P7 | **Số phương án và số cửa hàng:** ≤ 3 phương án; mỗi phương án ≤ 5 cửa hàng; không trùng cửa hàng trong cùng phương án | Đúng thiết kế |
| P8 | **Thứ tự xếp hạng:** các phương án sắp đúng thứ tự từ điển (phủ đủ ↓, số điểm dừng ↑, độ dài tuyến ↑, điểm ↓) | Ổn định, giải thích được |
| P9 | **Tối ưu trong không gian ≤ 3 cửa hàng:** nếu tồn tại tổ hợp ≤ 3 cửa hàng phủ đủ nhu cầu, phương án #1 phủ đủ và có số điểm dừng nhỏ nhất (so với brute-force tham chiếu trên input nhỏ) | Thể hiện "chính xác, không chỉ tham lam" |
| P10 | **Tất định:** cùng input (kể cả `now`) thì cùng output | Test và debug được |
| P11 | **Routing:** tuyến trả về là hoán vị của các điểm; độ dài ≤ mọi hoán vị khác (n ≤ 5) | Đúng tối ưu |
| P12 | **Nhãn tươi đơn điệu:** khi `at` tăng thì nhãn chỉ đi Xanh → Vàng → Đỏ (hoặc hết hạn), không quay lại | Không nhảy nhãn ngược |

### 3.4 Nhãn tươi: SQL và TS dùng chung fixture
- **Nguồn sự thật:** `tests/fixtures/freshness-labels.json`. Mỗi ca gồm `{ name, perishability, deadline, at, expected }`. Có các ca biên:
  - đúng 12h, 4h, 72h, 24h, 7 ngày, 3 ngày (bao gồm hay loại trừ: theo `label_rules`);
  - deadline trong quá khứ;
  - mốc 23:59 giờ VN;
  - qua nửa đêm UTC.
- **TS:** `labels.fixture.test.ts` đọc JSON và gọi `freshnessLabel`.
- **SQL:** `pnpm gen:fixtures` (`scripts/gen-sql-fixtures.mjs`) sinh `supabase/tests/fixtures/freshness_labels.sql`. `labels_fixture.test.sql` gọi `freshness_label()` cho từng ca rồi `is()`.
- **CI** chạy `pnpm gen:fixtures && git diff --exit-code`, để file SQL sinh ra luôn khớp JSON.
- Cùng cơ chế áp dụng cho `effective_deadline` (`tests/fixtures/effective-deadline.json`) và ESG (`tests/fixtures/esg-cases.json`).

---

## 4. pgTAP: ma trận RLS và hồi quy B1–B8

### 4.1 Ma trận RLS
- **Helper test** (`supabase/tests/00_helpers.sql`):
  - `tests.create_user(email, platform_role)`;
  - `tests.authenticate_as(user_id, aal default 'aal1')`: đặt `request.jwt.claims` và `role authenticated`;
  - `tests.as_anon()`;
  - `tests.clear_auth()`.
  - Có thể dùng gói `basejump-supabase_test_helpers` nếu tương thích phiên bản; nếu không thì tự viết.
- **Vai trò được kiểm tra:**
  - `anon`;
  - `user` chưa có tổ chức;
  - thành viên store `approved` (owner, manager, staff);
  - store `submitted`/`rejected`;
  - thành viên charity `approved` (owner, manager);
  - charity chưa duyệt;
  - volunteer;
  - admin aal1;
  - admin aal2.
- **Bảng × thao tác (SELECT/INSERT/UPDATE/DELETE):** mọi bảng trong `DATA-MODEL.md`. Ô nào trong ma trận RLS (DATA-MODEL §9.2) cũng có ít nhất một assertion, nằm trong `supabase/tests/tables/<bảng>.test.sql`. Mỗi RPC có `supabase/tests/rpc/<rpc>.test.sql` (DATA-MODEL §18).
- **Thêm:** `rls_enabled_everywhere.test.sql` (mọi bảng `public` có RLS), `views_security_invoker.test.sql`, `mv_not_exposed.test.sql` (`esg_monthly` không SELECT được từ anon/authenticated).

### 4.2 Hồi quy lỗi bảo mật cũ (không bao giờ xóa hay skip)

| File | Lỗi | Assertion chính |
|---|---|---|
| `supabase/tests/regression/b1_admin_via_metadata.test.sql` | B1 | Insert `auth.users` với `raw_user_meta_data` chứa `role/platform_role = 'admin'` thì `profiles.platform_role = 'user'`; `is_admin()` = false (kể cả aal2); SELECT `org_sensitive` trả 0 dòng |
| `…/b2_self_promote.test.sql` | B2 | UPDATE `profiles.platform_role` / `organizations.status` của chính mình thì `throws_ok('42501')`; các trigger bảo vệ đang bật |
| `…/b3_public_columns.test.sql` | B3 | anon và tổ chức khác không đọc được `org_sensitive`; `columns_are('public_org_cards', …)` không có cột nhạy cảm; anon không SELECT được `sites.location`, `sites.address_line` |
| `…/b4_private_buckets.test.sql` | B4 | `kyc`, `proofs` có `public=false`; policy `storage.objects` từ chối anon và tổ chức khác; cửa hàng không đọc được object `proofs` khi minh chứng chưa approved |
| `…/b5_no_default_secrets` | B5 | (không phải pgTAP) CI job `secrets`: gitleaks + `scan-bundle.mjs` |
| `…/b6_trust_columns.test.sql` | B6 | Owner UPDATE `trust_score`, `id_verified_at`, `verified_by` thì `42501` |
| `tests/integration/search-injection.test.ts` | B7 | (integration) chuỗi `a),status.eq.draft` đưa vào ô tìm kiếm hoặc bộ lọc không làm lộ lô `draft` (bộ lọc dùng tham số có kiểu của `marketplace_offers`); unit fast-check escape |
| `…/b8_pending_charity.test.sql` | B8 | Thành viên charity `submitted` thấy 0 dòng `offers`, `marketplace_offers()` trả rỗng; sau `approved` thì thấy lô seed |

Truy vết đầy đủ L1–L16: `SECURITY-PRIVACY.md` §10.

---

## 5. E2E Playwright

### 5.1 Cấu hình
- `playwright.config.ts` có các project:
  - `chromium-desktop` (1440×900);
  - `android-lowend`: Pixel 5 emulation + `CPU throttling 4×` qua CDP + mạng "Fast 3G" cho các spec `@mobile`;
  - `iphone-webkit` (iPhone 13, WebKit);
  - `setup` (đăng nhập sẵn và lưu `storageState` cho từng vai trò).
- `retries: process.env.CI ? 1 : 0`; `trace: 'on-first-retry'`; `video: 'retain-on-failure'`; `screenshot: 'only-on-failure'`.
- **Fixture chung** (`tests/e2e/fixtures.ts`):
  - `noConsoleErrors`: fail khi có `console.error` hoặc `pageerror` (chống L11).
  - `noFailedRequests`: fail khi request same-origin hoặc tới Supabase trả 4xx/5xx ngoài whitelist (chống L13).
  - `freezeClock`: `page.clock.setFixedTime(...)` cho đếm ngược và nhãn.
  - `resetDb`: gọi `demo_reset()` + seed E2E trước mỗi file.
  - `loginAs(role)`.
- **Selector:** ưu tiên `getByRole` / `getByLabel` (đồng thời kiểm a11y). `data-testid` chỉ dùng cho bản đồ và canvas. **Cấm** `waitForTimeout`.

### 5.2 Danh sách kịch bản

| # | File | Vai trò | Kịch bản | Phase |
|---|---|---|---|---|
| 1 | `public-links.spec.ts` | Khách | Crawl link nội bộ từ landing, `/impact`, `/legal/*`: tất cả 200; `og:image` tồn tại (L1, L12) | P1 |
| 2 | `auth-guard.spec.ts` | Khách | Mở `/store`, `/charity`, `/volunteer`, `/admin` khi chưa đăng nhập thì chuyển `/login` (L2, L3) | P1 |
| 3 | `register-store.spec.ts` | Cửa hàng | Đăng ký email tại `/register`, OTP (Mailpit), wizard tự lưu nháp (reload giữa chừng vẫn còn), ghim bản đồ (fake provider), upload giấy tờ, consent `terms`, nộp hồ sơ; màn "Đang chờ duyệt"; không vào được `/store/offers` (L4, L5) | P1 |
| 4 | `register-charity.spec.ts` | Tổ chức | Như #3 cùng cài đặt điểm nhận (bán kính, danh mục, giờ nhận, `visibility=hidden`) | P1 |
| 5 | `admin-review.spec.ts` | Admin | Đăng nhập, enroll và challenge TOTP (`otplib`), hàng đợi có hồ sơ `submitted`, mở giấy tờ (signed URL), yêu cầu sửa có lý do, duyệt; audit log ghi người duyệt (L9) | P1 |
| 6 | `admin-mfa-required.spec.ts` | Admin | Phiên aal1 vào `/admin` thì bị buộc challenge; gọi RPC admin bằng aal1 thì lỗi | P1 |
| 7 | `offer-create.spec.ts` | Cửa hàng | Đăng lô: danh mục, số lượng + đơn vị, khối lượng/đơn vị, hạn, khung giờ, ảnh (EXIF bị loại bỏ), cam kết an toàn bắt buộc; nhãn hiện đúng; bấm 2 lần nhanh thì chỉ tạo 1 lô (`client_op_id`) | P2 |
| 8 | `offer-ai-autofill.spec.ts` | Cửa hàng | Chụp hoặc chọn ảnh, `AI_PROVIDER=fake` điền form, người dùng sửa được; tắt flag AI thì nút biến mất | P2 |
| 9 | `labels-countdown.spec.ts` | Tổ chức | Đóng băng đồng hồ, lô chuyển Xanh → Vàng → Đỏ khi tua giờ; đếm ngược đúng; lô hết hạn không gửi yêu cầu được | P2 |
| 10 | `marketplace.spec.ts` | Tổ chức | Kho tặng split view bản đồ + danh sách; lọc nhãn, khoảng cách, thời gian tới; lô ngoài bán kính không hiện; tổ chức chưa duyệt không thấy (B8) | P2 |
| 11 | `core-loop.spec.ts` ★M1 | Cửa hàng + Tổ chức | Đăng, yêu cầu, xác nhận (hoặc tự động chấp nhận), QR pickup (tự đến lấy), giao, ledger; dashboard tác động tăng đúng số; thông báo realtime đến bên kia | P2 |
| 12 | `handover-6digit.spec.ts` | Cửa hàng + TNV | Bàn giao bằng mã 6 số; sai 5 lần thì khóa; token quá `handover_token_ttl_minutes` (tua đồng hồ 16 phút) thì từ chối; ngoài khung lấy ± 30 phút thì từ chối dù token còn hạn; dùng lại mã đã dùng thì từ chối | P2 |
| 13 | `handover-quality-reject.spec.ts` | Tổ chức | Dropoff: từ chối 3/20 vì chất lượng (bắt buộc ghi chú); ledger chỉ ghi 17; lô không nhận lại 3 | P2 |
| 14 | `two-device-qr.spec.ts` ★ | TNV (iPhone WebKit) + Cửa hàng (Chromium desktop) | **Hai browser context song song.** Context A (TNV) mở chuyến, hiện QR; test chụp vùng QR, sinh file `.y4m` bằng `ffmpeg` và khởi chạy context B (Chromium, `--use-fake-device-for-media-stream --use-file-for-fake-video-capture=qr.y4m --use-fake-ui-for-media-stream`). B (cửa hàng) mở máy quét, quét, đối soát dòng, xác nhận. A nhận realtime "Đã lấy hàng". Ca dự phòng: nếu runner không có `ffmpeg` thì chạy nhánh mã 6 số | P2 |
| 15 | `need-bundle-50-banh.spec.ts` ★ | Tổ chức + 3 cửa hàng + 2 TNV | **"50 bánh từ 3 cửa hàng":** seed cửa hàng A (20), B (18), C (12) trong bán kính, D (40) ngoài bán kính. Tổ chức đăng nhu cầu 50 bánh, thấy 3 phương án, phương án #1 = A + B + C (3 điểm dừng, có km và phút), chọn. 3 cửa hàng nhận thông báo và xác nhận. Phân công TNV1 lấy A + B, TNV2 lấy C. Pickup ở 3 điểm, dropoff. Nhu cầu `fulfilled`, ledger 50 × kg/đơn vị | P3 |
| 16 | `need-shortfall-rematch.spec.ts` | Tổ chức | Cửa hàng B hủy sau xác nhận (bắt buộc lý do, trừ uy tín); hệ thống ghép lại **chỉ phần thiếu** 18; nhu cầu không vượt 50 | P3 |
| 17 | `notifications-radius.spec.ts` | Cửa hàng + Tổ chức + Admin | Lô mới: tổ chức trong bán kính và đúng danh mục nhận thông báo, tổ chức ngoài bán kính thì không; admin nhận; lô Đỏ có nhãn GẤP. Nhu cầu mới: cửa hàng gần và admin nhận | P3 |
| 18 | `volunteer-trip.spec.ts` | TNV (mobile) | Nhận lời mời qua email, hồ sơ (phương tiện, sức chở), consent vị trí (từ chối vẫn chạy được), chuyến hôm nay, link "Mở Google Maps" đúng waypoint, check-in geofence (giả lập `context.setGeolocation`) | P3 |
| 19 | `cancellation-matrix.spec.ts` | Nhiều vai | 4 nhánh của ma trận hủy (`DATA-MODEL.md`) | P3 |
| 20 | `proof-flow.spec.ts` | Tổ chức + Admin + Cửa hàng | Upload ảnh fixture có mặt; client làm mờ (màn so sánh trước/sau); ảnh lưu không còn EXIF; cửa hàng **chưa** thấy; admin duyệt; cửa hàng thấy; quá hạn thì có nhắc (tua đồng hồ chạy job) | P4 |
| 21 | `esg-dashboards.spec.ts` | 3 cổng + Admin | Số E/S/G khớp fixture seed; báo cáo tháng render; in (`page.pdf()` trên Chromium) không lỗi | P4 |
| 22 | `public-impact.spec.ts` | Khách | `/impact`: bộ đếm khớp view `public_impact_stats`; bản đồ chỉ có ô lưới 500 m, không có tọa độ điểm `hidden` trong network response | P4 |
| 23 | `pwa-install.spec.ts` | TNV | Manifest hợp lệ; service worker đăng ký; offline thì hiện trang offline; push subscription (Chromium) lưu được | P5 |
| 24 | `privacy-rights.spec.ts` | Mọi vai | Export JSON; rút consent `location_trip` thì ngừng gửi vị trí; yêu cầu xóa tài khoản bị chặn khi còn phân bổ mở | P4–P5 |
| 25 | `demo-reset-judge.spec.ts` | Admin + Giám khảo | `demo_reset()` xong, tài khoản giám khảo (cửa hàng, tổ chức, TNV) đăng nhập được, có lô Xanh/Vàng/Đỏ "tươi" theo giờ hiện tại; role switcher chỉ hiện với tài khoản demo và không có lựa chọn Admin; tài khoản giám khảo vào `/admin` bị chặn | P2, P6 |
| 26 | `security-headers.spec.ts` | Khách | CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` có mặt | P5 |

---

## 6. Accessibility, screenshot, Lighthouse

### 6.1 axe (WCAG 2.2 AA)
- Mỗi spec gọi `await expectNoA11yViolations(page)` (bọc `AxeBuilder` với tag `wcag2a`, `wcag2aa`, `wcag21aa`, `wcag22aa`) ở mỗi màn chính.
- **0 vi phạm mức `serious`/`critical`.** Ngoại lệ phải ghi trong `tests/e2e/a11y-allowlist.ts`, có lý do và issue. Ví dụ: canvas bản đồ MapLibre đã có danh sách thay thế.
- Kiểm tra thủ công trong UAT P5: dùng bàn phím đi hết luồng đăng lô; VoiceOver/TalkBack đọc được nhãn Xanh/Vàng/Đỏ (luôn có icon và chữ, không chỉ màu).

### 6.2 Screenshot (visual regression)
- `expect(page).toHaveScreenshot()` cho khoảng 20 màn chủ lực:
  - landing;
  - kho tặng;
  - phương án ghép;
  - QR toàn màn hình;
  - minh chứng trước/sau;
  - dashboard ESG;
  - báo cáo in;
  - màn trống, lỗi, skeleton của 3 màn.
- Chạy ở 3 viewport (360×800, 768×1024, 1440×900).
- Ổn định ảnh:
  - đóng băng đồng hồ;
  - `animations: 'disabled'`;
  - mask vùng bản đồ (style tile fake trong CI) và avatar;
  - font tự host (Be Vietnam Pro).
- **Baseline** sinh trên runner Linux trong CI. Cập nhật bằng cách gắn nhãn PR `update-snapshots`, để workflow chạy `--update-snapshots` và commit lên nhánh PR. Không commit baseline sinh trên Windows.
- Agent `ux-reviewer` đọc ảnh diff và chất lượng văn bản tiếng Việt.

### 6.3 Lighthouse CI (ngân sách)

| URL | Preset | Performance | Accessibility | Best Practices | SEO | Ngân sách thêm |
|---|---|---|---|---|---|---|
| `/` (landing) | mobile (throttling mặc định) | **≥ 90** | **≥ 90** (mục tiêu 95) | **≥ 90** | **≥ 90** | LCP ≤ 2,5 s; CLS ≤ 0,1; TBT ≤ 200 ms; JS khởi tạo ≤ 170 KB gzip (MapLibre lazy-load, không nằm trong bundle đầu) |
| `/volunteer` (vỏ PWA, màn đăng nhập TNV) | mobile | **≥ 90** | **≥ 90** | **≥ 90** | — | Installable (kiểm bằng E2E #23) |
| `/charity/marketplace` (sau đăng nhập) | desktop | ≥ 75 | ≥ 90 | ≥ 90 | — | Ngưỡng "hợp lý" cho trang trong app |

- `lhci autorun`, mỗi URL chạy 3 lần lấy median. Fail CI khi dưới ngưỡng (assert `error`) từ P5. Trong P0–P4 chỉ `warn`.
- **Lưu ý:** Lighthouse 12+ đã **bỏ nhóm điểm "PWA"**. Vì vậy "PWA ≥ 90" trong kế hoạch hiểu là: 4 nhóm điểm trên route PWA ≥ 90, **cộng thêm** kiểm tra installability bằng E2E (manifest, service worker, icon, `start_url`).

---

## 7. Dữ liệu test và seed

| Bộ dữ liệu | Vị trí | Dùng cho | Đặc điểm |
|---|---|---|---|
| **Nền** (danh mục, `label_rules`, `impact_factors`, `app_settings`) | migration + `supabase/seed/00_base.sql` | Mọi môi trường | Tất định, có version |
| **Fixture test** | `tests/fixtures/*.json` → sinh SQL | Unit, pgTAP | Thời gian tuyệt đối (để kiểm biên) |
| **Seed E2E** | `supabase/seed/10_e2e.sql` + `tests/e2e/seed.ts` | E2E, integration | Thời gian **tương đối** (`now() + interval '3 hours'`); tài khoản `e2e.*@example.test` |
| **Seed demo** | `scripts/seed-demo.ts` (gọi RPC thật) | staging, prod (tổ chức demo) | `is_demo=true`, tên hư cấu, lịch sử 90 ngày sinh bằng RPC thật; lô hiện tại theo `now() + interval` nên **không bao giờ hết hạn vào ngày demo** |

**Quy tắc seed demo:**
- **Tên hư cấu**, không dùng thương hiệu thật: ví dụ "Tiệm bánh Mây Hồng", "Siêu thị Lá Xanh Bàn Cờ", "Bếp ăn Ấm Áp", "Mái ấm Hoa Sen" (điểm `hidden`).
- Tọa độ thật ở TP.HCM nhưng là địa điểm công cộng hoặc ngẫu nhiên, không trùng nhà dân hay mái ấm thật.
- Luôn có sẵn:
  - 3 lô Xanh, 3 lô Vàng, 2 lô Đỏ quanh tổ chức demo;
  - 1 nhu cầu "50 bánh" mở;
  - 2 minh chứng đã duyệt;
  - 1 minh chứng chờ duyệt;
  - 1 hồ sơ cửa hàng chờ duyệt.
- **Lịch sử 90 ngày:** `scripts/seed-demo.ts` kết nối Postgres trực tiếp (`SUPABASE_DB_URL`, chỉ dùng cho seed), đặt `fs.clock` (thời điểm giả) trong từng giao dịch rồi gọi đúng các RPC nghiệp vụ. `private.now()` chỉ đọc `fs.clock` khi `session_user = 'postgres'`, nên PostgREST không bao giờ du hành thời gian được (pgTAP kiểm tra). Chi tiết: DATA-MODEL §17.
- **`demo_reset()`:** chỉ service role gọi được (nút trong `/admin/demo` đi qua server action có kiểm admin aal2), và chỉ khi `app_settings.demo_reset_enabled`. Xóa dữ liệu giao dịch của tổ chức `is_demo` phát sinh sau mốc lịch sử, rồi tạo lại kịch bản "hôm nay". Lịch sử 90 ngày giữ nguyên. Mục tiêu ≤ 10 s.

**Tài khoản** (giá trị thật trong trình quản lý mật khẩu hoặc tin nhắn riêng, **không** ghi vào repo):

| Nhóm | Email mẫu | Dùng ở |
|---|---|---|
| E2E | `e2e.store.a@example.test`, `e2e.charity@example.test`, `e2e.volunteer.1@example.test`, `e2e.admin@example.test` (TOTP secret trong `.env.test`) | Local, CI |
| UAT (Khanh) | `uat.store.a@<DOMAIN>`, `uat.store.b@<DOMAIN>`, `uat.store.c@<DOMAIN>`, `uat.charity@<DOMAIN>`, `uat.volunteer.1@<DOMAIN>`, `uat.volunteer.2@<DOMAIN>`; admin = tài khoản cá nhân của Khanh (MFA trên điện thoại Khanh) | staging |
| Giám khảo | `giamkhao.cuahang@<DOMAIN>`, `giamkhao.tochuc@<DOMAIN>`, `giamkhao.tnv@<DOMAIN>` (thuộc tổ chức `is_demo`) | prod |

> **Đã chốt (07/10/2026):** **không** cấp tài khoản admin cho giám khảo (admin bắt buộc MFA aal2); giám khảo dùng tài khoản demo theo từng vai trò ở bảng trên; màn admin do thành viên nhóm thao tác khi trình diễn. Chỉ khi BTC yêu cầu mới tạo vai trò `admin_viewer` chỉ đọc (cần ADR riêng + review bảo mật).

---

## 8. Pipeline CI

**Workflow:** `.github/workflows/ci.yml` (PR + push `main`), `e2e.yml` (PR + nightly), `release.yml` (tag `v*`), `keepalive.yml`, `backup.yml`. Chi tiết deploy: `DEPLOYMENT.md` §6–7.

```
PR mở/cập nhật
 ├─ 1. setup         pnpm i --frozen-lockfile (cache store) · Node 24
 ├─ 2. static  ┐     lint (eslint) · typecheck (tsc --noEmit) · prettier --check
 │             │     check-mojibake · check-readme-scripts · pnpm audit --prod --audit-level high
 │             │     secrets: gitleaks (full history)
 ├─ 3. unit    ┘     vitest run --coverage   (core/* ≥ 90% lines, toàn bộ ≥ 70%)
 ├─ 4. db            supabase start (Docker) → supabase db reset → supabase db lint
 │                   → supabase test db (pgTAP) → gen types + git diff --exit-code
 │                   → pnpm gen:fixtures + git diff --exit-code → vitest integration
 ├─ 5. build         next build (env .env.ci) → scan-bundle (không có secret trong .next/static)
 ├─ 6. e2e           (e2e.yml) supabase start → next start → playwright (4 shard) + axe + screenshot
 │                   → upload report/trace/diff làm artifact
 ├─ 7. lighthouse    lhci autorun trên next start (landing, /volunteer)
 └─ 8. preview       Vercel tự tạo Preview (dùng Supabase staging) → smoke @smoke trên Preview URL
Merge vào main  → (tất cả bước trên) → migrate staging (supabase db push) → smoke staging
Tag v*          → release.yml: migrate prod (Environment "production", Minh duyệt) → deploy prod → smoke prod
Nightly (02:00 VN) → E2E đầy đủ + Lighthouse trên staging · pnpm audit · backup prod
```

- **Branch protection `main`:**
  - Bắt buộc pass: `static`, `unit`, `db`, `build`, `e2e`.
  - `lighthouse` chỉ là check bắt buộc từ P5.
  - Cấm push thẳng; PR cần ≥ 1 review. Review của Khanh hoặc của agent `pr-review-toolkit` được ghi trong PR (Minh tự merge khi Khanh vắng).
- **Thời gian mục tiêu:** PR ≤ 15 phút cho toàn bộ pipeline.
- Job `db` và `e2e` dùng `supabase start` trên runner Ubuntu (Docker có sẵn). Cache Docker image bằng `actions/cache` nếu cần.

---

## 9. Chính sách test chập chờn (flaky)

1. **Định nghĩa:** test fail rồi pass khi chạy lại mà code không đổi. Playwright đánh dấu `flaky` khi pass ở lần retry.
2. CI cho **1 lần retry** cho E2E, không retry cho unit và pgTAP. Unit hoặc pgTAP mà flaky là lỗi thật: thường do thời gian hoặc thứ tự. Sửa ngay.
3. Khi test bị đánh dấu flaky:
   - **Trong 24 giờ:** mở issue nhãn `flaky`, kèm trace.
   - Nếu chưa sửa được: gắn tag `@quarantine` (chạy riêng ở nightly, không chặn PR), tối đa **7 ngày**.
   - **Tối đa 3 test** trong quarantine cùng lúc. Vượt số này thì dừng làm tính năng và sửa test.
4. **Không được quarantine:**
   - test hồi quy B1–B8;
   - `core-loop.spec.ts`;
   - `need-bundle-50-banh.spec.ts`;
   - `two-device-qr.spec.ts`. Riêng test này nếu nhánh camera flaky thì nhánh mã 6 số vẫn phải chạy.
5. **Nguyên nhân thường gặp và cách phòng:**

| Nguyên nhân | Cách phòng |
|---|---|
| Thời gian thực | `page.clock`, thời gian tương đối trong seed |
| Realtime chậm | `expect.poll` / `toHaveText` với timeout, không dùng `waitForTimeout` |
| Dữ liệu dùng chung giữa các test | `resetDb` mỗi file; mỗi worker dùng tài khoản riêng (`e2e.store.a.w{n}`) |
| Bản đồ | Provider fake + style tile tĩnh |
| Animation | `reducedMotion: 'reduce'` |

6. Mỗi tuần (thứ Hai) Minh xem báo cáo flaky của nightly trong 5 phút.

---

## 10. UAT: Khanh chạy thế nào

**Chi tiết từng bước:** `docs/uat/README.md` và các checklist `P1…P6`.

1. **Khi nào:** khi Minh báo "sẵn sàng UAT Pn", tức là gate tự động của phase đã xanh và staging đã có bản mới.
2. **Ở đâu:** **staging** (`https://staging.<DOMAIN>`) cho P1–P5. Riêng P6 và các mốc ★ thì chạy thêm smoke trên **prod** bằng tài khoản giám khảo.
3. **Thiết bị:** desktop Chrome; Android Chrome máy cấu hình thấp; iPhone Safari. Mỗi checklist ghi rõ mục nào cần thiết bị nào.
4. **Cách làm:**
   - Mở GitHub Issue mới từ template **"UAT run"**, dán nội dung checklist của phase.
   - Tick từng ô trên issue.
   - Lỗi thì tạo issue riêng từ template **"Bug (UAT)"**, rồi dán link vào dòng tương ứng.
5. **Ký UAT:** comment "Đồng ý ký UAT Pn" trên issue UAT khi **không còn lỗi Blocker/High** đang mở. Lỗi Medium/Low được phép chuyển sang phase sau nếu có issue. Skill `phase-gate` đọc trạng thái này khi xuất báo cáo phase.
6. **Thời lượng mục tiêu:** P1 khoảng 1,5 giờ; P2 khoảng 2 giờ; P3 khoảng 2,5 giờ; P4 khoảng 2 giờ; P5 khoảng 2 giờ; P6 gồm 3 lần tập dượt.

---

## 11. Definition of Done về test

Một PR tính năng được merge khi:
- [ ] Logic mới trong `src/core` có unit test. Thay đổi matching hoặc labels thì property test vẫn pass.
- [ ] Migration mới có RLS + pgTAP cho mọi ô ma trận liên quan (skill `new-migration`).
- [ ] RPC chuyển trạng thái mới có pgTAP cho: đúng vai trò, sai vai trò, invariant, `client_op_id`, audit (skill `state-transition`).
- [ ] Màn hình mới có ≥ 1 bước E2E đi qua (có thể nằm trong spec có sẵn), axe sạch, đủ 3 trạng thái (loading/empty/error) và screenshot nếu là màn chủ lực (skill `ui-screen`).
- [ ] Không thêm `test.skip`/`test.only` (lint rule `playwright/no-skipped-test`, `vitest/no-focused-tests`).
- [ ] CI xanh; mục UAT liên quan được bổ sung vào checklist của phase nếu là hành vi người dùng thấy.
