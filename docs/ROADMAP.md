<!-- STATUS -->
Phase hiện tại: P3 — Ghép đơn & Điều phối (đang làm, ~85%; P2 xong trừ gate M1)
Mốc kế tiếp: M1 — 27/10/2026 · G3 — 08/11/2026
Việc kế tiếp: P3-14 (gate G3) + sửa lỗi UAT
<!-- /STATUS -->

# FoodSave v2 — Lộ trình & tiến độ (ROADMAP)

> **Đây là nguồn sự thật duy nhất về tiến độ.** Hook `SessionStart` đọc khối `STATUS` ở đầu file; skill `phase-gate` cập nhật khối này, đánh dấu task và ghi nhật ký thay đổi. Khi sửa tay, giữ nguyên đúng 3 dòng trong khối `STATUS` (định dạng `Khóa: giá trị`).

| Thông tin | Giá trị |
|---|---|
| Cuộc thi | TISPA 2026 — Giải thưởng Đổi mới sáng tạo công nghệ trong thiện nguyện bền vững (IEC – ĐHQG TP.HCM và Quỹ Khởi Sự Từ Tâm) |
| Vị trí hiện tại | Top 25 |
| Chung kết | Đầu tháng 12/2026 (dự kiến khoảng **01/12/2026**, chờ BTC xác nhận ngày, giờ, thể thức → việc **B-02**) |
| Giải thưởng | 100 triệu đồng mỗi dự án thắng giải: 25 triệu trao tại chung kết + 75 triệu để triển khai trong 6 tháng |
| Nhân sự | **Minh**: trưởng nhóm, xây toàn bộ sản phẩm cùng Claude Code. **Khanh**: QA/UAT, ký gate, liên hệ đối tác ở Track B |
| Repo | `D:\FoodSave` (`github.com/bminhnemhoi/FoodSave`) |
| Ngày lập | 07/10/2026 |

Tài liệu liên quan: [PRD](PRD.md) · [ARCHITECTURE](ARCHITECTURE.md) · [DATA-MODEL](DATA-MODEL.md) · [DESIGN-SYSTEM](DESIGN-SYSTEM.md) · [SECURITY-PRIVACY](SECURITY-PRIVACY.md) · [ESG-METHODOLOGY](ESG-METHODOLOGY.md) · [TESTING](TESTING.md) · [uat/](uat/) · [DEPLOYMENT](DEPLOYMENT.md) · [AWS-MIGRATION](AWS-MIGRATION.md) · [adr/](adr/) · [pitch/](pitch/README.md) · báo cáo gate tại `docs/phase-reports/Gx.md`.

---

## 1. Tổng quan hai track

```
Tháng 10                                  Tháng 11                                       Tháng 12
07   11 12  15 16              27 28                08 09        17 18   22 23            ~01
|P0--|  |P1-|  |P2 Vòng lõi MVP ★M1|  |P3 Ghép đơn & Điều phối|  |P4 ESG ★M2|  |P5★M3|  |P6 Sẵn sàng|  CHUNG KẾT
 G0      G1                      G2                          G3            G4      G5=FREEZE    G6
Track B:      18/10 số liệu      ...           08/11 deck v1 + LOI  15/11 KH 6 tháng
                                                            15/11 ─────── pilot thật ≥10 bàn giao ─────── 28/11
                                                                          22/11 deck v2 + demo + Q&A
```

| Phase | Thời gian | Gate | Ngày gate | Mốc ★ (video dự phòng) | Tag |
|---|---|---|---|---|---|
| P0 Nền móng | 07–11/10 | G0 | 11/10 | — | `v0.0` |
| P1 Onboarding & Tin cậy | 12–15/10 | G1 | 15/10 | — | `v0.1` |
| P2 Vòng lõi MVP | 16–27/10 | G2 = **M1** | 27/10 | ★ video #1 | `v0.2` |
| P3 Ghép đơn & Điều phối | 28/10–08/11 | G3 | 08/11 | — | `v0.3` |
| P4 Minh bạch & ESG | 09–17/11 | G4 = **M2** | 17/11 | ★ video #2 | `v0.4` |
| P5 Xuất sắc | 18–22/11 | G5 = **M3 = FREEZE** | 22/11 | ★ video #3 | `v1.0-rc` |
| P6 Sẵn sàng chung kết | 23/11–chung kết | G6 | Ngày trước chung kết | Video chung kết | `v1.0` |

**Năng lực ước tính:** Minh khoảng 8–10 giờ/ngày cho Track A (giám sát và review Claude Code) và khoảng 3 giờ/tuần cho Track B; Khanh test và UAT theo từng gate, cùng liên hệ đối tác. Ước lượng trong bảng là **giờ công của Minh**, đã tính phần review code do Claude Code viết.

---

## 2. Quy tắc kiểm soát phase

1. **Mỗi phase có một gate đo được** (mục 5). Gate chỉ "qua" khi:
   - skill `phase-gate` chạy hết checklist và xuất `docs/phase-reports/Gx.md`;
   - **Khanh ký UAT** theo checklist `docs/uat/` của phase;
   - CI trên `main` xanh;
   - gắn tag `v0.x`.
2. **Trễ gate quá 2 ngày thì cắt mục kế tiếp trong danh sách cắt (mục 3). Không kéo dài phase.** Phase sau vẫn bắt đầu đúng ngày. Phần dở của phase trước được chuyển sang phase sau nếu nó nằm trên đường găng, hoặc vào danh sách cắt nếu không.
3. **Mỗi mốc ★ (M1, M2, M3) phải quay video demo dự phòng** trên prod: một bản liền mạch, cộng các đoạn ngắn theo từng beat của [kịch bản demo](pitch/demo-script.md). Video lưu ở 3 nơi: Drive, máy laptop demo (offline) và điện thoại.
4. **Freeze 22/11 (M3).** Từ 23/11 chỉ sửa lỗi, tập dượt và chuẩn bị hồ sơ. Không thêm tính năng, không migration mới, trừ migration sửa lỗi bảo mật mức High trở lên (phải có pgTAP kèm theo).
5. **Definition of Done cho mỗi task** (chi tiết trong `CLAUDE.md`):
   - code đã merge qua PR, Vercel Preview chạy được;
   - có test phù hợp (unit, pgTAP hoặc E2E);
   - màn hình đủ 3 trạng thái loading/empty/error, có screenshot;
   - đã cập nhật doc liên quan (DATA-MODEL, PRD) khi đổi hành vi;
   - đã chạy `/ponytail-review` trước khi mở PR.
6. **Mọi số liệu trên UI là thật hoặc gắn nhãn "Dữ liệu demo".** Không làm tính năng giả.
7. **Không push thẳng `main`.** Mỗi task là một nhánh `p<phase>/<id>-<slug>`, ví dụ `p0/p0-02-scaffold`.
   - Luồng triển khai (một luồng duy nhất, khớp DEPLOYMENT §1 và ARCHITECTURE §12): PR ⇒ CI + Vercel Preview (DB staging); merge `main` ⇒ CI áp migration lên staging, Vercel deploy `staging.<DOMAIN>`; tag `vX` ⇒ `release.yml` áp migration lên prod (Minh duyệt) rồi fast-forward nhánh `release` ⇒ Vercel Production deploy từ `release`.
8. Trạng thái task: `[ ]` chưa làm · `[~]` đang làm · `[x]` xong · `[-]` đã cắt (ghi lý do vào nhật ký).

---

## 3. Danh sách cắt (CUT LIST), cắt theo đúng thứ tự

Khi một gate trễ quá 2 ngày, cắt **mục đầu tiên còn lại** trong danh sách. Nếu vẫn trễ thêm 2 ngày, cắt mục tiếp theo.

| Thứ tự | Hạng mục bị cắt | Thay thế khi cắt | Task liên quan | Ảnh hưởng tới demo/chấm điểm |
|---|---|---|---|---|
| C1 | Hàng đợi thao tác offline (offline action queue) | Thông báo "mất mạng, thử lại"; mã 6 số vẫn dùng được | P5-04 | Thấp |
| C2 | Vị trí trực tiếp của tình nguyện viên | Check-in theo geofence 100 m (vẫn giữ) | P5-03 | Thấp, beat 3 vẫn có check-in |
| C3 | Dark mode, ⌘K, trang `/dev/ui` | Không có | P5-10 | Không ảnh hưởng |
| C4 | react-pdf | In báo cáo bằng print CSS (vẫn giữ) | P5-11 | Không ảnh hưởng |
| C5 | Bảng xếp hạng Xanh | Không có | P5-12 | Thấp |
| C6 | Quét QR trên CCCD gắn chip | Admin duyệt giấy tờ thủ công | P5-13 | Thấp |
| C7 | AI kiểm minh chứng và AI viết nhận xét ESG | Admin duyệt thủ công; báo cáo không có đoạn nhận xét AI | P5-05 | Trung bình (mất 1 điểm nhấn AI phụ) |

**Không bao giờ cắt:** AI "ảnh → tự điền" (P2-05, tốn khoảng 1 ngày nhưng là khoảnh khắc ấn tượng nhất của demo); bàn giao QR; ghép đơn nhiều cửa hàng; làm mờ khuôn mặt trên máy; báo cáo ESG; bảo mật (RLS, MFA admin, bucket private); seed và demo reset.

---

## 4. Kế hoạch chi tiết theo phase

Cột **Skill/Agent**: skill dự án (`new-migration`, `state-transition`, `feature-slice`, `ui-screen`, `rls-audit`, `seed-demo`, `demo-reset`, `phase-gate`, `pitch-sync`), agent (`security-reviewer`, `qa-e2e`, `ux-reviewer`, `db-architect`, `judge`) và skill cộng đồng (`ponytail`, UI UX Pro Max, `frontend-design`, bộ skill Vercel/Supabase, `claude-api`, `dataviz`, `run`).

### P0 — Nền móng (07–11/10) · Gate G0 ngày 11/10

**Mục tiêu:** có khung dự án chạy thật trên Preview và Prod, CI xanh, đăng ký/đăng nhập nhận email thật, nền DB an toàn (vá B1 ngay từ migration đầu tiên), design token chuẩn, và các spike rủi ro (bản đồ, PWA, hệ số ESG) có kết luận.

**Tiêu chí chấm phục vụ:**
- **Đội ngũ (6đ):** quy trình kỹ thuật chuyên nghiệp (CI, gate, test, AI-assisted engineering).
- **Giải pháp & công nghệ (8đ):** kiến trúc lai sẵn sàng chuyển AWS; bản đồ Goong thể hiện đúng chủ quyền.
- **Sản phẩm mẫu (4đ):** có prod chạy thật ngay từ ngày đầu.

| ID | Việc (mô tả) | Đầu ra | Skill/Agent | Giờ | Phụ thuộc | TT |
|---|---|---|---|---|---|---|
| P0-01 | Kiểm tra tiền điều kiện: tài khoản Vercel; 2 project Supabase cloud (tạm dừng project cũ nếu vượt giới hạn free); domain; tài khoản Resend; key Goong; (tùy chọn) key Anthropic, Sentry; cài `gh` CLI và Supabase CLI | Checklist tick đủ trong `docs/DEPLOYMENT.md` §Tiền điều kiện; `gh auth status` và `supabase --version` chạy được | — | 2 | — | [ ] |
| P0-02 | Tạo scaffold Next.js bản stable mới nhất (App Router, React 19, Turbopack, TS strict, pnpm, `src/`); dựng cây thư mục theo ARCHITECTURE §cấu trúc; `src/lib/env.ts` kiểm tra biến môi trường bằng zod; `.env.example` | `pnpm dev` chạy được; `pnpm build` pass; PR đầu tiên | `ponytail` (lite), `react-best-practices` | 3 | P0-01 | [x] 07/10 |
| P0-03 | Cài Tailwind v4, shadcn/ui (init + các component nền: button, input, form, dialog, sheet, sonner, table, tabs, badge, skeleton), lucide-react, Motion; font Be Vietnam Pro qua `next/font` | Trang `/` render component shadcn với font tiếng Việt chuẩn | `frontend-design` | 2 | P0-02 | [x] 07/10 |
| P0-04 | Lint và format: ESLint flat config (next, typescript-eslint strict, jsx-a11y, import order), Prettier + plugin Tailwind; script `lint`, `typecheck`, `format` | `pnpm lint && pnpm typecheck` = 0 lỗi; hook PostToolUse chạy Prettier đúng file | — | 2 | P0-02 | [x] 07/10 |
| P0-05 | Thiết lập test: Vitest + fast-check + MSW (unit); Playwright + `@axe-core/playwright` (E2E, project mobile + desktop); mỗi loại 1 smoke test | `pnpm test` và `pnpm e2e` chạy xanh ở local | `webapp-testing`, agent `qa-e2e` | 3 | P0-02 | [x] 07/10 |
| P0-06 | Supabase local qua Docker + CLI: `supabase init/start`; bật extension PostGIS, pg_cron, pg_net, pgTAP; `config.toml` (auth email, site URL, redirect URL, SMTP local qua Inbucket); script `db:reset`, `db:types` | `supabase start` chạy; `supabase test db` chạy được (0 test) | skill `supabase` | 3 | P0-01 | [x] 07/10 |
| P0-07 | Tạo và link 2 project cloud **staging** + **prod** (region Singapore); lưu secret vào trình quản lý mật khẩu; ghi project ref vào DEPLOYMENT (không ghi key) | `supabase link` cho cả 2 project; `supabase db push` lên staging thành công | skill `supabase` | 2 | P0-06 | [x] 07/10 — 1 project cloud (Tokyo), migration + seed + pgTAP 298/298 trên cloud; staging để sau |
| P0-08 | Link Vercel: import repo; **Production Branch = `release`**; `staging.<DOMAIN>` gắn nhánh `main`; env theo môi trường (Preview/`main` → staging, Production → prod); gắn domain; bật Vercel Analytics | URL Preview mỗi PR; `staging.<DOMAIN>` deploy khi merge `main`; prod tại domain chính (từ nhánh `release`) trả 200 | skill `vercel` | 2 | P0-02, P0-07 | [x] 08/10 — https://foodsave-psi.vercel.app (main → production, vùng hnd1 cạnh Supabase Tokyo) |
| P0-09 | Domain + Resend: xác minh DNS (SPF, DKIM, DMARC); cấu hình **Resend làm SMTP** cho Supabase staging và prod (email mặc định của Supabase chỉ khoảng 2 thư/giờ); template email tiếng Việt (xác nhận, OTP, đặt lại mật khẩu, mời) | Email đăng ký thật tới hộp thư Gmail, không vào spam (test mail-tester ≥ 8/10) | — | 3 | P0-07, P0-08 | [ ] |
| P0-10 | Workflow `ci.yml`: lint, typecheck, unit, build, `supabase db lint`, pgTAP trên **Supabase local trong Actions**; `e2e.yml` (khung, chạy khi có nhãn `e2e` hoặc khi merge); cache pnpm; branch protection `main` yêu cầu CI xanh | PR mẫu hiện đủ check xanh; `main` bị chặn push thẳng | — | 4 | P0-04, P0-05, P0-06 | [ ] |
| P0-11 | Workflow `keepalive.yml` (cron hằng ngày) + `scripts/keepalive`: truy vấn nhẹ tới staging và prod để tránh Supabase free tạm dừng sau 7 ngày | Lần chạy thủ công `workflow_dispatch` thành công cho cả 2 project | — | 1 | P0-07 | [ ] |
| P0-12 | Migration nền: extensions, enum; `profiles` (platform_role mặc định `user`), `organizations`, `org_sensitive`, `org_documents`, `org_members`, `sites` (geography + GIST, visibility), `site_hours`, `site_closures`, `consents`, `audit_logs`; helper `is_admin()` (kiểm tra `aal2`), `is_org_member()`; trigger `handle_new_user` **không đọc vai trò từ metadata**; revoke UPDATE cả bảng rồi grant UPDATE cho danh sách cột được phép (DATA-MODEL §9.4) — cột trạng thái và vai trò không có trong danh sách; RPC `grant_platform_admin`/`revoke_platform_admin` (service role hoặc admin aal2, có audit) | Migration áp được trên local và staging; `database.types.ts` được sinh; DATA-MODEL cập nhật | `new-migration`, agent `db-architect`, `postgres-best-practices` | 6 | P0-06 | [x] 07/10 local |
| P0-13 | pgTAP nền + **hồi quy B1** (đăng ký với metadata `role=admin` vẫn ra `user`), B2 (người dùng tự sửa role/status bị chặn), B3 (anon/người lạ không đọc được `org_sensitive`), RLS bật trên 100% bảng | `supabase test db` xanh, tối thiểu 15 assertion; chạy trong CI | `rls-audit` | 4 | P0-12, P0-10 | [x] 07/10 local, 298 assertion |
| P0-14 | Khung auth: `@supabase/ssr`, middleware làm mới phiên; trang đăng ký, đăng nhập, OTP email, quên/đặt lại mật khẩu; route callback; guard vai trò phía server (đọc từ DB, không từ metadata); trang `/onboarding` rỗng | Đăng ký → nhận email → xác nhận → đăng nhập → vào `/onboarding` trên **prod** | `feature-slice`, skill `supabase` | 6 | P0-09, P0-12 | [x] 07/10 local; chờ prod |
| P0-15 | Sinh design system bằng UI UX Pro Max (`--design-system --persist -p "FoodSave"`, mô tả "nền tảng phi lợi nhuận điều phối thực phẩm dư thừa, tươi – tin cậy – minh bạch") | `design-system/foodsave/MASTER.md` + `pages/*.md` | UI UX Pro Max | 2 | P0-03 | [ ] |
| P0-16 | Biên tập thành `docs/DESIGN-SYSTEM.md` (nguồn sự thật) và đưa token vào Tailwind `@theme`: nền giấy ấm, chữ mực xanh đậm, primary xanh lá, accent theo vai trò (Cửa hàng emerald, Tổ chức coral, TNV amber, Admin slate), **token nhãn Xanh/Vàng/Đỏ** (tương phản AA, luôn có icon + chữ), số tabular; app shell khung (sidebar thu gọn, bottom tab mobile) | Trang `/dev/tokens` (tạm) hiển thị token; báo cáo tương phản AA đạt 100% cặp màu chữ/nền | `ui-screen`, `frontend-design`, agent `ux-reviewer` | 5 | P0-15 | [ ] |
| P0-17 | **Spike bản đồ A (geocode):** 20 địa chỉ thật ở TP.HCM (gồm hẻm, chung cư, chợ, địa chỉ theo tên phường mới sau 01/7/2025); so tọa độ Goong với ghim chuẩn đo tay; mục tiêu **sai lệch < 50 m** cho ≥ 18/20 địa chỉ; thử Places Autocomplete | `docs/spikes/map-goong.md` có bảng 20 dòng (địa chỉ, sai lệch m); kết luận Goong hay dự phòng Nominatim | `run` | 4 | P0-02 | [x] 07/10 — xem docs/spikes/map-goong.md |
| P0-18 | **Spike bản đồ B (tuyến + tile):** Directions `vehicle=bike` cho 3 tuyến thật (so với Google Maps, chênh thời gian < 20%), Distance Matrix 1×5; MapLibre (`react-map-gl/maplibre`) + tile Goong, dự phòng OpenFreeMap; kiểm tra hiển thị Hoàng Sa – Trường Sa; phác interface `MapsProvider` | Trang `/dev/map-spike` (tạm) vẽ tuyến xe máy; mục kết luận trong `docs/spikes/map-goong.md`; số lượt gọi API ước tính/tháng so với hạn mức free | — | 4 | P0-17 | [x] 07/10 — /dev/map-spike |
| P0-19 | **Spike Serwist:** thử Serwist với phiên bản Next.js/Turbopack đang dùng (build, đăng ký SW, precache); nếu không tương thích thì chọn `public/sw.js` tự viết | ADR "PWA service worker" (Accepted); demo cài PWA trên Android | — | 3 | P0-08 | [x] 08/10 — ADR-013 (SW tự viết), E2E pwa.spec |
| P0-20 | **Chốt hệ số ESG có nguồn** ([ADR-009](adr/ADR-009-esg-factors.md), Accepted): CO₂e 2,0 kg/kg (FAO 2013: 3,3 Gt ÷ 1,6 Gt, thay 2,5); nước 150 L/kg nước xanh lam (FAO 2013: 250 km³ ÷ 1,6 Gt), loại 890 L/kg không nguồn, hiển thị chỉ số nước; suất ăn 0,42 kg (WRAP) thay 0,35 kg; kiểm chứng số trang (FAO tr. 6, tr. 11); ghi version + URL nguồn | ADR-009 chuyển Accepted; `docs/ESG-METHODOLOGY.md` §3 khớp; seed `impact_factors` v1 (mỗi dòng một version × metric) | agent `db-architect` | 3 | — | [x] 08/10 — ADR-009 Accepted |
| P0-21 | **Review ADR 001–006** (stack Next.js + Supabase; RLS-first + RPC chuyển trạng thái; kiến trúc lai Vercel → AWS qua adapter; bản đồ Goong + MapLibre; jobs pg_cron + outbox; AI Claude → Bedrock); cập nhật theo kết quả spike | 6 ADR ở trạng thái Accepted trong `docs/adr/` | agent `security-reviewer` (đọc ADR 002) | 2 | P0-17, P0-18, P0-19 | [ ] |
| P0-22 | **Cài plugin cộng đồng và RTK:** đọc nội dung từng plugin trước khi bật (ponytail, UI UX Pro Max, frontend-design, skill Vercel/Supabase, webapp-testing, skill-creator, security-guidance, pr-review-toolkit, caveman **tắt mặc định**); `winget install rtk-ai.rtk` → `rtk init`; kiểm tra hook dự án chạy trên Git Bash và PowerShell; đồng bộ sang máy Khanh | `.claude/settings.json` có `extraKnownMarketplaces`/`enabledPlugins`; ghi chú kiểm tra plugin trong `docs/phase-reports/G0.md`; Khanh mở session thấy cùng bộ skill | skill `skill-creator` (kiểm skill dự án) | 3 | P0-02 | [ ] |
| P0-23 | **Gate G0:** chạy `phase-gate`; Khanh UAT nhanh (đăng ký/đăng nhập thật trên prod bằng 2 email khác nhau, thử đăng ký với metadata admin); tag `v0.0`; cập nhật STATUS | `docs/phase-reports/G0.md` có chữ ký Khanh | `phase-gate` | 2 | Tất cả P0 | [ ] |

**Tổng P0:** khoảng 71 giờ trong 5 ngày, **rất căng**. Phần đệm: P0-19 (Serwist) và P0-18 phần Distance Matrix được phép trượt sang 12–13/10 vì không chặn G0. Nếu trượt, ghi vào nhật ký.

---

### P1 — Onboarding & Tin cậy (12–15/10) · Gate G1 ngày 15/10

**Mục tiêu:** cửa hàng và tổ chức tự onboarding đầy đủ (tự lưu nháp, ghim bản đồ, giấy tờ private, consent); Admin duyệt có dấu vết và bắt buộc MFA; đóng toàn bộ lỗi cũ L1–L5 và B1–B8.

**Tiêu chí chấm phục vụ:**
- **Khả thi & tác động (5đ):** quy trình xác minh tổ chức là câu trả lời cho câu hỏi "chống gian lận thế nào".
- **Giải pháp (8đ):** eKYC trung thực, quyền riêng tư theo thiết kế.
- **Trình bày (5đ):** câu chuyện "bản cũ lộ CCCD → bản mới private + signed URL + pgTAP".

| ID | Việc (mô tả) | Đầu ra | Skill/Agent | Giờ | Phụ thuộc | TT |
|---|---|---|---|---|---|---|
| P1-01 | Migration Storage: bucket `kyc` private (signed URL 60 s), `media` public; policy theo thư mục org; cột onboarding (`status` theo `org_status`: draft/submitted/needs_changes/approved/rejected/suspended/closed, `submitted_at`, `reviewed_by/at`, `rejection_reason`, `trust_score`, `is_demo`); bảng `org_change_requests` (sửa trường pháp lý sau khi duyệt, tổ chức vẫn `approved`) | Migration + pgTAP: người ngoài không đọc được file KYC; URL public của `kyc` trả 400/403 | `new-migration`, `rls-audit` | 4 | P0-12 | [x] 08/10 — kyc/media + 730 pgTAP |
| P1-02 | Khung wizard onboarding (cửa hàng/tổ chức chung khung): các bước, thanh tiến độ, **tự lưu nháp** (server action + debounce), khôi phục khi quay lại | Tạo nháp, đóng tab, mở lại vẫn còn dữ liệu (E2E) | `feature-slice`, `ui-screen` | 5 | P0-14, P0-16 | [x] 08/10 — wizard `/onboarding/<store/charity>/<bước>` 5 bước, tự lưu 800 ms + "Đã lưu nháp lúc", mở lại đúng bước, E2E `onboarding/*` |
| P1-03 | Bước địa chỉ + bản đồ: Goong Autocomplete, kéo ghim, "Dùng vị trí hiện tại", tự điền phường (đơn vị hành chính mới); ghim là nguồn sự thật; cache geocode; `MapsProvider` bản đầu | Ghim lưu thành `geography(Point,4326)`; E2E chọn địa chỉ → ghim đúng | `ui-screen` | 5 | P1-02, P0-18 | [x] 08/10 — LocationPicker (bản đầu; còn geocode_cache) |
| P1-04 | Bước giấy tờ: tải lên `kyc` qua signed upload; ảnh được mã hóa lại qua canvas (xóa EXIF/GPS); PDF giới hạn dung lượng; cửa hàng: GPKD, giấy ATTP; tổ chức: quyết định thành lập/giấy phép | Upload thành công, file trong bucket private; ảnh tải về không còn EXIF | `feature-slice` | 4 | P1-01, P1-02 | [x] 08/10 — tải thẳng vào `kyc` bằng client người dùng (policy Storage), ảnh mã hóa lại WebP ≤ 2000 px (E2E kiểm không còn EXIF), PDF ≤ 10 MB; logo `media` |
| P1-05 | Cài đặt theo điểm nhận của tổ chức: thanh kéo **bán kính phục vụ** có vòng tròn trên bản đồ + đếm số cửa hàng trong vùng (PostGIS `ST_DWithin`); loại thực phẩm nhận; giờ nhận theo ngày; sức chứa; visibility public/approximate/hidden | Kéo bán kính → số cửa hàng cập nhật < 500 ms; điểm hidden không lộ tọa độ cho vai trò khác (pgTAP) | `ui-screen`, `new-migration` | 6 | P1-03 | [x] 08/10 — bán kính 0,5–30 km (thanh kéo + ô số), vòng tròn, `count_stores_within` gọi từ trình duyệt; loại thực phẩm, giờ nhận, sức nhận, hiển thị public/approximate/hidden |
| P1-06 | Giờ mở cửa và ngày nghỉ của cửa hàng (`site_hours`, `site_closures`, hỗ trợ đóng qua nửa đêm, múi giờ `Asia/Ho_Chi_Minh`); nhân viên/chi nhánh (`org_members.site_ids`) | Form lưu được; hàm SQL `site_close_at(site, ts)` có unit test | `feature-slice` | 4 | P1-02 | [ ] |
| P1-07 | Consent + trang pháp lý: Điều khoản sử dụng, Chính sách bảo mật (theo Luật BVDLCN 91/2025/QH15 và NĐ 356/2025, xem SECURITY-PRIVACY), cam kết an toàn thực phẩm + điều khoản miễn trừ cho bên tặng; `consents` có `policy_version` | Trang `/dieu-khoan`, `/bao-mat` chạy; tick consent bắt buộc trước khi gửi duyệt | `ui-screen` | 3 | P1-02 | [x] 08/10 — `/terms`, `/privacy` bản 2026-10-v1; 3 cam kết bắt buộc ⇒ `grant_consent(terms)` với `text_hash` = sha256 văn bản hiển thị |
| P1-08 | RPC `submit_organization` (draft → submitted) và `review_organization` (approve/reject + lý do, ghi `reviewed_by/at`, `audit_logs`), có `client_op_id` | pgTAP: chủ hồ sơ không tự duyệt; chỉ admin aal2 duyệt được | `state-transition` | 4 | P1-01 | [x] 08/10 — RPC submit/review có aal2 |
| P1-09 | Hàng đợi duyệt của Admin: danh sách theo trạng thái, chi tiết hồ sơ, xem giấy tờ bằng signed URL 60 s, duyệt/từ chối có lý do, lịch sử ai duyệt; email kết quả | E2E admin duyệt → chủ hồ sơ nhận email và vào được cổng | `feature-slice`, `ui-screen` | 6 | P1-08 | [x] 08/10 — hàng đợi duyệt, signed URL 60 s, nhật ký mở giấy tờ (`log_document_view`), email kết quả |
| P1-10 | Admin MFA TOTP: đăng ký, thử thách, bắt buộc với route `/admin`; `is_admin()` yêu cầu `aal2` ở DB | Admin chỉ có `aal1` gọi RPC duyệt → bị từ chối (pgTAP + E2E) | `feature-slice`, agent `security-reviewer` | 4 | P1-09 | [x] 08/10 — `/admin/mfa` đăng ký + thử thách TOTP, E2E `admin/admin-mfa.spec.ts`, script `grant-admin.mjs` |
| P1-11 | Guard cổng: trang chờ duyệt/bị từ chối/tạm khóa; điều hướng theo vai trò lấy từ DB; job xóa file KYC 30 ngày sau quyết định (pg_cron) | Tài khoản tổ chức `submitted`/`needs_changes`/`rejected`/`suspended` không vào được `/store`, `/charity` (E2E) | `feature-slice` | 3 | P1-08 | [x] 08/10 — guard cổng + trang trạng thái; job purge KYC (xóa file ở P2) |
| P1-12 | **Ma trận test L1–L5, B1–B8:** pgTAP + Playwright cho mỗi lỗi cũ (truy vết theo SECURITY-PRIVACY) | `docs/TESTING.md` §Ma trận hồi quy có đủ 13 dòng xanh | `rls-audit`, agent `qa-e2e` | 6 | P1-01 → P1-11 | [ ] |
| P1-13 | **Gate G1:** review bảo mật; Khanh UAT theo [`docs/uat/P1-onboarding.md`](uat/P1-onboarding.md); tag `v0.1` | `docs/phase-reports/G1.md` | agent `security-reviewer`, `phase-gate` | 3 | P1-12 | [ ] |

**Tổng P1:** khoảng 57 giờ trong 4 ngày.

---

### P2 — Vòng lõi MVP (16–27/10) · Gate G2 = ★M1 ngày 27/10

**Mục tiêu:** luồng **đăng lô → tổ chức yêu cầu → cửa hàng xác nhận → QR lấy hàng → QR giao hàng → ghi tác động** chạy E2E trên prod, có thông báo realtime, có seed tương đối, demo reset và tài khoản giám khảo.

**Tiêu chí chấm phục vụ:**
- **Sản phẩm mẫu (4đ):** vòng lõi chạy thật.
- **Giải pháp & công nghệ (8đ):** nhãn tươi thông minh, AI ảnh → tự điền, chuỗi bàn giao QR, outbox idempotent.
- **Khả thi (5đ):** sẵn sàng cho pilot thật từ 15/11.

| ID | Việc (mô tả) | Đầu ra | Skill/Agent | Giờ | Phụ thuộc | TT |
|---|---|---|---|---|---|---|
| P2-01 | Migration danh mục: `food_categories` (perishability cooked/fresh/packaged, đơn vị mặc định, khối lượng/đơn vị mặc định), bảng đơn vị, `label_rules` v1 (ngưỡng theo nhóm hàng) | Seed danh mục tiếng Việt (bánh mì, cơm hộp, rau củ, sữa, thịt & hải sản, bánh ngọt, đồ uống, đồ khô…) | `new-migration` | 3 | P1-13 | [ ] |
| P2-02 | Nhãn tươi: hàm SQL immutable `freshness_label(deadline, perishability, at)` + hàm TS `core/labels` dùng **chung 1 file fixture**; `effective_deadline` = min(hạn dùng, giờ đóng cửa) theo giờ VN (chỉ có ngày → 23:59) | Unit + pgTAP chạy cùng fixture; property test ranh giới ngưỡng | `feature-slice`, `fast-check` | 5 | P2-01, P1-06 | [ ] |
| P2-03 | Migration `offers` + RPC `create_offer`/`publish_offer`/`cancel_offer` (cam kết an toàn bắt buộc, `unit_weight_kg NOT NULL` + `weight_source`, trạng thái draft → open) + RLS | pgTAP: tổ chức chưa duyệt không thấy lô (B8); cửa hàng không sửa trạng thái trực tiếp | `new-migration`, `state-transition` | 5 | P2-02 | [ ] |
| P2-04 | Màn đăng lô (react-hook-form + zod dùng chung): danh mục, số lượng + đơn vị, khối lượng/đơn vị, hạn dùng, khung giờ lấy, ảnh (mã hóa lại), tick cam kết an toàn; xem trước nhãn | Đăng lô trên mobile < 60 giây (đo bằng Khanh) | `ui-screen`, `feature-slice` | 6 | P2-03 | [x] 08/10 — `/store/inventory/new`, `/[id]/edit`; quy tắc + zod dùng chung client/server, lỗi PT422 về đúng trường; xem trước hạn hiệu lực (`site_close_at`) + nhãn; E2E desktop/mobile. Còn: Khanh đo < 60 s trên mobile |
| P2-05 | **AI ảnh → tự điền** (không bao giờ cắt): `AiProvider` adapter (anthropic, sau này bedrock); Claude vision trả JSON (danh mục, số lượng ước tính, đơn vị, gợi ý hạn) qua schema zod; feature flag; người dùng luôn xác nhận lại; giới hạn tốc độ | Chụp 10 ảnh mẫu → ≥ 8/10 điền đúng danh mục; tắt flag thì form vẫn chạy | **`claude-api` (bắt buộc đọc trước)**, `feature-slice` | 6 | P2-04 | [ ] (backend AiProvider openai/fake xong 08/10; UI "Chụp ảnh để điền nhanh" + đánh dấu "AI gợi ý — kiểm tra lại" + rate limit 20/giờ/cửa hàng (`ai_offer_draft:org:<id>`) xong 08/10, E2E với provider fake; còn: nạp credit để kiểm chứng LIVE ≥ 8/10 ảnh) |
| P2-06 | Kho lô của cửa hàng: danh sách theo nhãn, **đếm ngược**, sửa/hủy, trạng thái phân bổ; auto-accept (tùy chọn) | Màn có 3 trạng thái, screenshot desktop + mobile | `ui-screen` | 5 | P2-03 | [x] 08/10 — `/store/inventory` (Đang mở/Nháp/Đã kết thúc, lọc chi nhánh, Đỏ trước, đếm ngược, đăng/giữ/lấy/còn), chi tiết lô, cập nhật số lượng (lý do), hủy lô (giải thích hệ quả), xóa nháp; auto-accept: RPC hỗ trợ theo điểm; UI 09/10 (UAT M2): Cài đặt › Chi nhánh & giờ › “Duyệt yêu cầu nhận lô” (thủ công / mọi tổ chức đã duyệt / uy tín ≥ ngưỡng) qua `upsert_site` |
| P2-07 | Kho tặng của tổ chức — **bản đồ**: MapLibre lazy-load, marker cửa hàng tô màu theo nhãn, cluster, vòng bán kính, bấm marker → thẻ lô (khoảng cách, ETA xe máy ước tính, đếm ngược) | Bản đồ hiển thị đúng lô trong bán kính; LCP trang < 3 s trên 4G giả lập | `ui-screen`, `react-best-practices` | 6 | P2-03, P1-05 | [x] 08/10 — `/charity/donations`: bản đồ lazy (danh sách hiện trước), marker theo nhãn gấp nhất có icon + `aria-label`, cluster bằng source MapLibre vẽ thành nút DOM (Tab được), vòng bán kính + vòng lọc, cửa hàng `approximate` là vùng mờ, chọn marker ↔ thẻ lô; mobile chuyển "Danh sách \| Bản đồ"; E2E desktop/mobile + axe. Còn: đo LCP 4G giả lập |
| P2-08 | Kho tặng — **danh sách + lọc** (nhãn, khoảng cách, thời gian tới); **kiểm tra khả thi**: chỉ gợi ý lô Đỏ cho tổ chức đến kịp (chim bay × 1,4 ở 18 km/h + 10 phút) | Unit test hàm khả thi; lô Đỏ xa không xuất hiện trong gợi ý | `feature-slice` | 5 | P2-07 | [x] 08/10 — danh sách + lọc nhãn/khoảng cách/thời gian tới/danh mục, đồng bộ URL (`site`, `labels`, `maxKm`, `maxMin`, `cats`, `view`), Đỏ trước rồi gần trước; khả thi kiểm trong RPC `marketplace_offers` (pgTAP có ca lô Đỏ không kịp); unit test parse/serialize bộ lọc. Còn: tùy chọn "Hiện cả lô không kịp" (US-CHA-07 AC2) cần RPC trả cả lô không khả thi kèm lý do |
| P2-09 | Migration `allocations` + RPC `request_allocation` (đặt chỗ nguyên tử, khóa `ORDER BY id`, `reserved_until`, `client_op_id`), `confirm_allocation`/`reject_allocation`; tự hết hạn yêu cầu cũ trên lô đang khóa | pgTAP + test đồng thời (2 tổ chức cùng đặt lô cuối) không cấp vượt | `state-transition`, agent `db-architect` | 6 | P2-03 | [ ] |
| P2-10 | UI yêu cầu → xác nhận: tổ chức gửi yêu cầu từ thẻ lô; hộp "Yêu cầu nhận" của cửa hàng; trạng thái hai phía cập nhật | E2E 2 vai trò | `feature-slice`, `ui-screen` | 5 | P2-09 | [x] 08/10 — hai phía xong: tổ chức xin nhận/hủy, cửa hàng xác nhận/từ chối/đóng gói; E2E cả hai vai trò |
| P2-11 | Migration `pickups` (tự đến lấy là mặc định ở P2), `handovers` (kind pickup/dropoff, `token_hash`, `consumed_at`, `scanned_by`, `client_op_id`), `handover_lines`; RPC `issue_handover_token` (chỉ lưu hash), `consume_handover` (đối soát từng dòng: đặt ≥ lấy ≥ giao, lý do thiếu) | pgTAP: token dùng lại → lỗi; số lượng vượt → lỗi | `state-transition`, `new-migration` | 6 | P2-09 | [ ] |
| P2-12 | UI bàn giao: QR toàn màn hình + mã 6 số (điện thoại tổ chức/TNV); máy quét `@zxing/browser` (webcam laptop/camera điện thoại cửa hàng); đối soát từng dòng; từ chối dòng vì chất lượng | Quét QR thật giữa laptop và điện thoại thành công < 5 s; nhập mã 6 số là phương án dự phòng | `ui-screen`, `feature-slice` | 6 | P2-11 | [x] 08/10 — `/charity/pickups/[id]/stops/[stopId]/handover` (QR + mã 6 số toàn màn hình, Wake Lock, tạo mã mới, tự chuyển "Đã bàn giao") · `/store/handover` (quét ZXing tải động, nhập mã 6 số, đối soát từng dòng + lý do thiếu) · E2E `handover/qr-handover` 2 thiết bị (camera giả phát đúng QR trên điện thoại, mã 6 số) xanh desktop + mobile; còn đo < 5 s bằng laptop + điện thoại thật khi UAT G2; màn TNV ở P3-10 |
| P2-13 | Ledger tác động: `impact_factors` (version + nguồn), `impact_ledger` append-only (credit/reversal, unique theo handover line), ghi lúc dropoff; `core/impact`; bộ đếm trên dashboard | Unit test công thức; pgTAP: không UPDATE/DELETE ledger | `new-migration`, `feature-slice` | 4 | P2-11, P0-20 | [x] 08/10 — `src/core/impact` (cùng phép tính `credit_impact`, fixture + property test, 100% dòng) · `getOrgImpact`/`getPublicImpact` + `ImpactCounters` · bộ đếm thật trên landing (Data Cache thẻ `public-impact`, `updateTag` sau bàn giao); dashboard cửa hàng/tổ chức gắn `ImpactCounters` khi làm trang Tổng quan |
| P2-14 | `notification_outbox` idempotent + dispatcher `/api/jobs/dispatch` (HMAC) gọi qua pg_net; pg_cron: báo "chuyển Đỏ", đóng lô hết hạn; lô mới → tổ chức trong bán kính + Admin (lô Đỏ = GẤP) | Gửi trùng 2 lần chỉ ra 1 thông báo (test) | `state-transition`, `feature-slice` | 5 | P2-03 | [x] (08/10: migration `20261008120400_notifications` — fan-out SQL idempotent, backoff/dead letter, `/api/jobs/dispatch` ký HMAC, trigger outbox + pg_cron `fs_dispatch_tick`; pgTAP + E2E xanh. Môi trường cloud cần 2 secret Vault + `JOBS_HMAC_SECRET` trên Vercel — DEPLOYMENT §4.4) |
| P2-15 | Trung tâm thông báo trong app (Supabase Realtime) + email Resend (React Email); `notification_preferences` | Đăng lô ở laptop → điện thoại tổ chức nhận thông báo < 3 s | `ui-screen` | 5 | P2-14 | [x] 08/10 — đo trên production: yêu cầu nhận lô → chuông cửa hàng sau **2,7 s** (pg_net → dispatcher → Realtime); còn lại màn tùy chọn thông báo (chuyển P5) — 08/10: chuông + popover/sheet + Realtime + toast GẤP + email N-05/N-07/N-08/N-09 qua SMTP + bảng `notification_preferences` xong, E2E desktop/mobile xanh; còn màn cài đặt thông báo và đo < 3 s trên staging sau khi đặt secret Vault |
| P2-16 | **Seed tương đối** (tên hư cấu, `is_demo`): 8 cửa hàng, 4 tổ chức, lô theo `now() + interval` (không bao giờ hết hạn vào ngày demo); lịch sử 90 ngày sinh bằng **RPC thật** | `pnpm seed:demo` trên staging; dashboard có số liệu, gắn nhãn "Dữ liệu demo" | `seed-demo` | 5 | P2-13 | [x] 08/10 — seed demo lên production 34,5 s: 12 tổ chức `is_demo`, 23 lô đủ 3 nhãn, 157 lần bàn giao lịch sử (752 kg) |
| P2-17 | `demo:reset` (chỉ xóa/tái tạo tổ chức `is_demo`), tài khoản giám khảo **theo vai trò** (cửa hàng, tổ chức, TNV; chỉ thao tác trên dữ liệu demo; **không** cấp tài khoản admin cho giám khảo — `admin_viewer` chỉ đọc chỉ làm khi BTC yêu cầu, kèm ADR), tài liệu đăng nhập cho BTC | Reset prod demo < 60 s, không đụng dữ liệu pilot thật (pgTAP + chạy thử) | `demo-reset`, agent `security-reviewer` | 3 | P2-16 | [ ] 08/10 — chạy thật trên production: chỉ xóa `is_demo`, 3 tổ chức thật giữ nguyên, mật khẩu giám khảo không đổi; lần 2 **75,8 s** (đo từng mục: tạo 12 tổ chức qua luồng thật 31,8 s là nút thắt; luồng đã chạy song song) — chấp nhận vì reset chạy trước buổi demo, không trong lúc chấm; tối ưu tiếp nếu cần |
| P2-18 | E2E vòng lõi trên staging rồi prod (đăng → yêu cầu → xác nhận → QR lấy → QR giao → ledger) | `e2e.yml` xanh; video trace Playwright | agent `qa-e2e` | 5 | P2-10 → P2-17 | [x] 08/10 — `tests/e2e/prod/core-loop.prod.spec.ts` xanh trên **production** (desktop 1,1 phút, mobile 40 s) bằng tài khoản demo; vòng local trong `tests/e2e/handover` |
| P2-19 | **Gate M1:** Khanh UAT [`docs/uat/P2-core-loop.md`](uat/P2-core-loop.md); **quay video dự phòng #1**; tag `v0.2` | `docs/phase-reports/G2.md` + link video | `phase-gate`, `pitch-sync` | 3 | P2-18 | [ ] |

**Tổng P2:** khoảng 95 giờ trong 12 ngày (có đệm khoảng 15%).

---

### P3 — Ghép đơn & Điều phối (28/10–08/11) · Gate G3 ngày 08/11

**Mục tiêu:** hướng 1 (kết nối hai chiều + tự ghép nhiều cửa hàng) và hướng 3 (định vị, phân công, chỉ đường) chạy thật. Kịch bản **"cần 50 bánh, lấy 20 + 18 + 12 từ 3 cửa hàng, 2 tình nguyện viên chia tuyến"** chạy E2E.

**Tiêu chí chấm phục vụ:**
- **Giải pháp & công nghệ (8đ):** đây là điểm khác biệt lớn nhất (tối ưu chính xác, công bằng).
- **Sản phẩm mẫu (4đ):** khoảnh khắc "50 bánh trên bản đồ".
- **Khả thi (5đ):** điều phối tình nguyện viên thực tế.

| ID | Việc (mô tả) | Đầu ra | Skill/Agent | Giờ | Phụ thuộc | TT |
|---|---|---|---|---|---|---|
| P3-01 | Migration `needs` (trạng thái tính từ tổng: open → partially_matched → matched → fulfilled; `closed_partial`/`expired` khi tới `needed_by`) + `need_bundles` (proposed → partially_confirmed → confirmed/cancelled) + RLS | pgTAP chuyển trạng thái | `new-migration`, `state-transition` | 5 | P2-19 | [x] 08/10 — DB: `publish_need` (≥ 1 h, ≤ 7 ngày, danh mục điểm nhận nhận được, 30/giờ, `need_published` GẤP khi ≤ 4 h), `cancel_need` (C12), đóng tại `needed_by` bằng `expire_stale_requests` có sẵn; `need_bundles` chỉ tổ chức đọc (route lộ điểm nhận); pgTAP `rpc/publish_need`, `rpc/cancel_need`, `tables/needs` |
| P3-02 | SQL `match_candidates`: `ST_DWithin`, danh mục, available > 0, khả thi (chim bay × 1,4 ở 18 km/h + 10 phút, trước hạn hiệu lực, trong giờ nhận), tối đa 15 ứng viên | pgTAP với fixture 20 lô; EXPLAIN dùng index GIST | `new-migration`, `postgres-best-practices` | 5 | P3-01 | [x] 08/10 — `match_candidates` + `private.pre_score` (khóa chung `src/core/matching/fixtures.json`, pgTAP `rpc/pre_score`); pgTAP `rpc/match_candidates` với 20+ lô (bán kính, danh mục, đơn vị, demo, tạm ngưng, tự cấp, khả thi, giới hạn 15), EXPLAIN dùng `sites_location_gix`; điểm cửa hàng không public: tọa độ lưới/null, km nguyên, 5 phút |
| P3-03 | `core/matching` (TS thuần): điểm = 0,4·độ gấp + 0,3·gần + 0,2·khớp số lượng + 0,1·uy tín; thử mọi tổ hợp ≤ 3 cửa hàng trong top 12 (298 tổ hợp); xếp: phủ đủ → ít điểm dừng → tuyến ngắn → điểm cao; thiếu thì tham lam tới 5 cửa hàng; trả 3 phương án | **Property test** (fast-check): không cấp vượt lô, không vượt nhu cầu, tôn trọng bán kính; chạy < 50 ms | `feature-slice` | 8 | P3-02 | [x] 08/10 — `src/core/matching` (`proposePlans`, `rematch`, `toReserveBundlePayload` dựng đúng `p_lines`/`p_meta` của `reserve_bundle`) + fixture `pre_score` dùng chung cho P3-02; 7 property test (P1–P10, tối ưu ≤ 3 điểm so với vét cạn, đơn điệu) + 43 ví dụ + ví dụ "50 bánh", thiếu 12 → ghép lại đúng 12; trung vị ≈ 6 ms/15 ứng viên; phủ dòng 100 % (ARCHITECTURE §4.1) |
| P3-04 | RPC `reserve_bundle` (đặt chỗ nhiều lô nguyên tử, khóa `ORDER BY id`), xác nhận từng phần, **ghép lại phần còn thiếu** | Test đồng thời; thiếu 12 bánh → đề xuất bổ sung đúng 12 | `state-transition`, agent `db-architect` | 6 | P3-03 | [x] 08/10 — `reserve_bundle` đúng 8 bước (khóa nhu cầu + nhu cầu bị lazy expiry chạm trong một câu `ORDER BY id`, lô `ORDER BY id`), nguyên tử, tự chấp nhận theo điểm, chặn vượt phần thiếu, ghép lại phần thiếu qua `rematch_of` (thiếu 18 → chỉ giữ được 18); pgTAP `rpc/reserve_bundle` (71) + `rpc/reserve_bundle_concurrency` |
| P3-05 | UI đăng nhu cầu + **3 phương án trên bản đồ** (điểm dừng đánh số, polyline, tổng km + thời gian, so sánh 3 cột) | Screenshot đạt `ux-reviewer`; E2E chọn phương án | `ui-screen`, `frontend-design` | 8 | P3-04 | [~] 08/10 — `/charity/needs` (đăng nhu cầu: điểm nhận, 1–3 danh mục, số lượng + đơn vị nguyên/lẻ, cần trước ngày + giờ 24h trong 1 giờ…7 ngày, số người, ghi chú; lỗi PT422 về đúng trường; tiến độ ba lớp; hủy kèm lý do) · `/charity/needs/[id]` (≤ 3 phương án: desktop bản đồ chung + 3 cột, mobile chọn phương án; phủ "Đáp ứng 50/50"/"— thiếu 12", điểm dừng, km, phút, lô Đỏ, cảnh báo về muộn, từng cửa hàng + nhãn + đếm ngược; điểm dừng đánh số, tuyến ước tính nét đứt, vùng gần đúng, điểm ẩn không vẽ; chọn ⇒ server tính lại, tuyến xe máy thật chỉ cho phương án được chọn khi mọi điểm công khai, `reserve_bundle`; trạng thái từng cửa hàng tự làm mới 15 s; "Còn thiếu N — tìm phương án bổ sung" ghép lại với `rematch_of`) · unit 41 test · E2E `needs/needs.spec.ts` "50 bánh" (20 + 18 + 12 → C từ chối → bổ sung 12 từ D → hủy) xanh desktop + mobile; **còn chờ `ux-reviewer` duyệt screenshot** (tiêu chí của task) |
| P3-06 | Thông báo hai chiều theo bán kính: lô mới → tổ chức (thứ tự **công bằng**: kg đã nhận 30 ngày ÷ số người phục vụ); nhu cầu mới → cửa hàng gần + Admin | Unit test thứ tự công bằng; tổ chức nhận ít được báo trước | `feature-slice` | 5 | P3-01, P2-14 | [ ] |
| P3-07 | Cửa hàng — "Nhu cầu gần bạn": bản đồ + danh sách; điểm `hidden`/`approximate` chỉ hiện vùng gần đúng | pgTAP: không lộ tọa độ chính xác của điểm hidden | `ui-screen` | 4 | P3-01 | [x] 08/10 — RPC `needs_nearby` (migration `20261008170000_needs_nearby`; bán kính điểm nhận phủ điểm cửa hàng, danh mục, cùng `is_demo`, toạ độ `public_location`, km nguyên với điểm gần đúng, không toạ độ/khoảng cách với điểm ẩn, không ghi chú/địa chỉ) + pgTAP `rpc/needs_nearby` (54, gồm NULL-logic và riêng tư) · `/store/connect` bản đồ + danh sách + lọc danh mục theo URL, CTA "Đăng lô phù hợp" (form đăng lô chưa nhận tham số điền sẵn danh mục) · E2E không lộ toạ độ chính xác |
| P3-08 | Tình nguyện viên: mời qua email (link mời), `volunteer_profiles` (phương tiện, sức chở kg, khu vực gần đúng), consent `location_trip` | TNV nhận email → tạo tài khoản → thuộc tổ chức | `feature-slice` | 5 | P0-14 | [x] 08/10: phần DB xong — `volunteer_profiles` (RLS, quyền cột, `base_area` làm tròn 0,01° bằng trigger) + `upsert_volunteer_profile`; lời mời dùng `invite_member` (role `volunteer`) có sẵn; consent `location_trip` bắt buộc ở `update_pickup_progress` — còn UI hồ sơ/mời và email · 08/10 phía TNV xong: `/volunteer/profile` (tên, SĐT, phương tiện, sức chở, khu vực chọn trên bản đồ làm tròn 0,01° ngay trên máy, lịch rảnh; trạng thái + bật/rút đồng ý `location_trip`; tổ chức đang tham gia), màn giải thích vị trí khi bắt đầu chuyến lần đầu (US-VOL-02), "Hôm nay" nhắc hoàn thiện hồ sơ sau khi nhận lời mời · 08/10 phía điều phối xong: `/charity/volunteers` (danh sách: phương tiện, sức chở, khu vực gần đúng, đồng ý vị trí, chuyến tháng này; ngăn chi tiết; mời qua email = `invite_member` role `volunteer` có sẵn; lời mời đang chờ: gửi lại / **thu hồi** `revoke_invitation`; **tạm ngưng** TNV `set_volunteer_paused` + trigger chặn giao chuyến — US-CHA-15 AC2), RPC `list_org_volunteers` (SĐT che, cờ đồng ý) — migration `20261008170200_coordinator` + pgTAP `rpc/coordinator` (36) · E2E `coordinator/volunteers` |
| P3-09 | Chuyến lấy hàng: phân công TNV cho từng điểm dừng (1 phương án chia cho 2 TNV); `core/routing` thử mọi hoán vị khi ≤ 5 điểm; chỉ gọi Goong Directions thật cho phương án được chọn; lưu geometry tuyến | Kịch bản 3 cửa hàng → 2 chuyến có tuyến hợp lý | `state-transition`, `feature-slice` | 6 | P3-04, P3-08 | [x] 08/10: phần `src/core/routing` xong (`bestOrder` vét cạn ≤ 5 điểm theo khung lấy/hạn, 2-opt khi > 5; `splitBetweenTwo` cho 2 TNV; deep link Google/Apple Maps chuyển từ `features/pickups/geo.ts`, giữ re-export) — còn RPC phân công, gọi Goong Directions, lưu tuyến, UI · 08/10 phần còn lại xong: `/charity/pickups` thêm chế độ "Tình nguyện viên" (gợi ý TNV theo sức chở/rảnh/gần cửa hàng đầu; 1 TNV ⇒ `bestOrder`, 2 TNV ⇒ `splitBetweenTwo` xuất phát từ khu vực từng người; xem trước 2 tuyến khác màu + khác hình điểm dừng, km/phút/kg từng tuyến, cảnh báo vượt sức chở), server tính lại thứ tự + ETA từng điểm, gọi Goong Directions **một lần mỗi chuyến được giao và chỉ khi mọi cửa hàng công khai vị trí**, lưu `route` qua `assign_pickup` (2 lần gọi cho 2 TNV); đổi người/chuyển tự lấy khi TNV từ chối (lên lại kế hoạch `p_plan.pickup_id`) · Vitest `pickups/volunteer-plan` · E2E `coordinator/split` (3 cửa hàng ⇒ 2 chuyến đúng thứ tự), `coordinator/cancel-reassign` |
| P3-10 | Màn chuyến của TNV (mobile web, sẽ thành PWA ở P5): chuyến hôm nay, bản đồ tới điểm kế tiếp, nút **Mở Google Maps/Apple Maps** (deep link kèm waypoint), hiện QR/mã 6 số, check-in geofence 100 m (dự phòng: check-in thủ công kèm lý do khi GPS yếu, đánh dấu khác màu cho điều phối viên) | Thử thật trên điện thoại ngoài đường: check-in thành công | `ui-screen` | 6 | P3-09, P2-12 | [x] 08/10 — `/volunteer` (Hôm nay: nhận/từ chối có lý do, bắt đầu chuyến), `/volunteer/trips` (đang chạy/sắp tới/đã xong), `/volunteer/trips/[id]` (thẻ điểm kế tiếp: hàng cần lấy, liên hệ đã che, Google/Apple Maps kèm waypoint — Google tối đa 3 điểm trung gian trên điện thoại; "Tôi đã tới" geofence 100 m, ngoài vùng/không có vị trí ⇒ check-in thủ công bắt buộc lý do, cờ `manual`/`no_location`; QR/mã 6 số cho cửa hàng và mã giao hàng cho tổ chức dùng lại `CarrierHandover` (nay không gắn route); bỏ qua điểm, báo sự cố; bản đồ nhỏ lazy + lộ trình có ETA; chia sẻ vị trí chỉ khi đồng ý `location_trip`, chuyến đang chạy và trang đang mở, ≤ 1 điểm/30 giây, tôn trọng PT429, làm tròn 4 chữ số trước khi gửi, banner "Dừng") · E2E `volunteer/trip` + `volunteer/profile` (geolocation giả lập) xanh mobile + desktop, `handover/qr-handover` vẫn xanh; **còn thử thật ngoài đường bằng điện thoại khi UAT G3**; số điện thoại chỉ hiện dạng che (`get_pickup_contacts`) nên chưa bấm gọi được |
| P3-11 | Bản đồ điều phối của tổ chức: tuyến, trạng thái từng điểm dừng, ETA | Trạng thái cập nhật realtime khi TNV check-in | `ui-screen` | 4 | P3-10 | [x] 08/10 — `/charity/pickups/[id]` cho chuyến TNV: Realtime `postgres_changes` trên `pickup_stops` (trạng thái, ETA, cờ check-in thủ công/không vị trí) đổi ngay không tải lại, vị trí TNV đọc `pickups.last_location` qua RLS mỗi 20 giây **chỉ khi TNV đồng ý và đang gửi** (không thì "Tình nguyện viên chưa chia sẻ vị trí"), cảnh báo trễ ETA 15 phút, liên hệ đã che (`get_pickup_contacts`), bỏ qua điểm (`skip_stop`), báo sự cố (`report_incident`), hủy chuyến có lý do (`cancel_pickup`, C5), đổi người; màn **Nhận hàng** `/charity/receive` (quét QR giao về hoặc mã 6 số ⇒ đối soát từng dòng, chỉ từ chối vì chất lượng kèm mô tả ⇒ `record_dropoff`, hiện kg/suất ăn/CO₂e vừa ghi), lối tắt từ trang chuyến, danh sách chuyến và khối "Chờ nhận hàng" ở Tổng quan · Vitest `pickups/live` · E2E `coordinator/dispatch-realtime`, `coordinator/receive`; còn: bấm gọi TNV cần số không che (US-CHA-18 AC3) |
| P3-12 | **Ma trận hủy** (DATA-MODEL): tổ chức hủy trước khi lấy → trả lô; cửa hàng hủy sau xác nhận → bắt buộc lý do, trừ uy tín, tự ghép lại; TNV không đến → hủy chuyến, phân bổ về `confirmed`; sau khi đã lấy → chỉ tạo `incident` | pgTAP cho từng ô của ma trận | `state-transition` | 6 | P3-09 | [x] 08/10 — DB: `cancel_pickup` (C5), `skip_stop` (C6), `cancel_need` (C12), `report_incident`/`resolve_incident` (C10, xác nhận ⇒ −5); pgTAP từng ô C1–C14 `rpc/cancellation_matrix` (+ `rpc/cancel_pickup`, `rpc/skip_stop`, `rpc/report_incident`, `rpc/resolve_incident`) |
| P3-13 | E2E **"50 bánh từ 3 cửa hàng"** (đăng nhu cầu → chọn phương án → 3 cửa hàng xác nhận → 2 TNV → 4 lần quét QR → ledger) | Playwright xanh trên staging và prod | agent `qa-e2e` | 5 | P3-01 → P3-12 | [x] 09/10 — `tests/e2e/uat/uat-p3.spec.ts` (P3-05…P3-27): 50 bánh = 20 + 18 + 12 từ 3 cửa hàng → 2 TNV → 3 lần nhập mã lấy + 2 lần giao về → ledger +5,0 kg, xanh desktop + mobile trên build production local; vòng lõi chạy thật trên prod bằng `tests/e2e/prod` |
| P3-14 | **Gate G3:** Khanh UAT [`docs/uat/P3-matching-logistics.md`](uat/P3-matching-logistics.md); tag `v0.3` | `docs/phase-reports/G3.md` | `phase-gate` | 2 | P3-13 | [ ] |

**Tổng P3:** khoảng 75 giờ trong 12 ngày; Minh dành thêm khoảng 6 giờ cho deck v1 (B-05).

---

### P4 — Minh bạch & ESG (09–17/11) · Gate G4 = ★M2 ngày 17/11

**Mục tiêu:** hướng 2 (minh chứng tôn trọng quyền riêng tư) và hướng 4 (ESG tự động) xong, nghĩa là **đủ 4 hướng định hướng**. Có trang tác động công khai cho giám khảo và đối tác.

**Tiêu chí chấm phục vụ:**
- **Mô hình bền vững (5đ):** báo cáo ESG/CSR là nền của nguồn thu.
- **Khả thi & tác động (5đ):** KPI tự đo, công khai.
- **Giải pháp (8đ):** làm mờ mặt trên máy, ledger append-only.

| ID | Việc (mô tả) | Đầu ra | Skill/Agent | Giờ | Phụ thuộc | TT |
|---|---|---|---|---|---|---|
| P4-01 | Migration `proofs` (description, people_served, location gần đúng, occurred_at, due_at, status), `proof_allocations`, `proof_media` (face_count, ai_checks); bucket `proofs` private (signed 300 s) | pgTAP: cửa hàng chỉ xem minh chứng **đã duyệt** và liên quan tới lô của mình | `new-migration`, `rls-audit` | 4 | P3-14 | [ ] |
| P4-02 | **Làm mờ mặt trên máy**: `@mediapipe/tasks-vision` BlazeFace full-range, chia ô để bắt mặt nhỏ, cọ làm mờ thủ công; mã hóa lại qua canvas (xóa EXIF/GPS); so sánh trước/sau | Bộ 10 ảnh thử (đám đông, trẻ em, ngược sáng): ≥ 90% khuôn mặt bị làm mờ tự động, phần còn lại sửa được bằng cọ; ảnh gửi đi không còn EXIF | `ui-screen`, `feature-slice` | 8 | P4-01 | [ ] |
| P4-03 | Form minh chứng: mô tả, số người được hỗ trợ, mini-map nơi phát (lấy từ máy, sửa tay, lưu gần đúng), thời gian; gắn các phân bổ đã giao | E2E gửi minh chứng từ điện thoại | `feature-slice` | 5 | P4-02 | [ ] |
| P4-04 | Admin duyệt minh chứng (approved/needs_changes/rejected); thông báo cửa hàng liên quan sau khi duyệt; **nhắc khi quá hạn** (cron + outbox) | E2E: chưa duyệt → cửa hàng không thấy; duyệt → thấy | `state-transition` | 5 | P4-03 | [ ] |
| P4-05 | `core/impact` đủ chỉ số **E/S/G** theo bảng định hướng (kg cứu, CO₂e, nước tưới theo hệ số v1 ADR-009, tỷ lệ hết hạn chưa nhận, suất ăn, người hỗ trợ, tỷ lệ nhu cầu đáp ứng đủ, bên hoạt động, chuyến TNV, tỷ lệ lô có minh chứng hợp lệ, thời gian đăng minh chứng, thời gian duyệt hồ sơ, tỷ lệ phản ánh đã xử lý) | Unit test mỗi công thức khớp ESG-METHODOLOGY (1 test/chỉ số) | `feature-slice` | 6 | P2-13 | [ ] |
| P4-06 | `esg_monthly` materialized view (chỉ tổng + số đếm, các tháng đã kết thúc) + RPC `get_esg_monthly`/`get_esg_system` kiểm tra quyền, ghép `UNION ALL` tháng hiện tại tính trực tiếp từ ledger (DATA-MODEL 2.5); revoke anon/authenticated trên MV; cron refresh hằng đêm | pgTAP quyền; RPC < 300 ms | `new-migration`, agent `db-architect` | 4 | P4-05 | [ ] |
| P4-07 | Dashboard ESG cho cửa hàng, tổ chức, Admin (Recharts; số tabular; trích nguồn hệ số ngay trên biểu đồ) | Screenshot đạt `ux-reviewer`; dữ liệu khớp RPC | `dataviz`, `ui-screen` | 6 | P4-06 | [ ] |
| P4-08 | **Báo cáo tháng in được** (print CSS, A4): giá trị CSR cho doanh nghiệp, bảng hệ số + version + URL nguồn, phụ lục phương pháp | In ra PDF từ trình duyệt đúng 2–3 trang A4, không vỡ bố cục | `ui-screen`, `dataviz` | 5 | P4-07 | [ ] |
| P4-09 | Bản đồ hệ thống của Admin: mọi điểm theo trạng thái duyệt, heatmap kg cứu được theo phường, lô đang mở theo nhãn | Bản đồ tải < 3 s với 500 điểm | `ui-screen` | 5 | P4-06 | [ ] |
| P4-10 | Trang tác động/KPI công khai + landing kể chuyện: bộ đếm tác động thật, bản đồ hoạt động ẩn danh (lưới 500 m), giải thích nhãn | Không lộ vị trí chính xác (kiểm tra bằng `rls-audit`); Lighthouse landing ≥ 85 (đạt 90 ở P5) | `ui-screen`, `frontend-design` | 6 | P4-06 | [ ] |
| P4-11 | Phản ánh/vi phạm (`incidents`) + nhật ký kiểm toán xem được ở Admin | Admin xử lý được 1 phản ánh; chỉ số "phản ánh đã xử lý %" chạy | `feature-slice` | 4 | P4-04 | [ ] |
| P4-12 | **Gate M2:** Khanh UAT [`docs/uat/P4-proof-esg.md`](uat/P4-proof-esg.md); **quay video dự phòng #2**; tag `v0.4`; xác nhận đủ 4 hướng định hướng (bảng truy vết PRD) | `docs/phase-reports/G4.md` + link video | `phase-gate`, `pitch-sync` | 3 | P4-01 → P4-11 | [ ] |

**Tổng P4:** khoảng 61 giờ trong 9 ngày (có chồng lấn với chuẩn bị pilot B-07 từ 15/11).

---

### P5 — Xuất sắc (18–22/11) · Gate G5 = ★M3 = FREEZE ngày 22/11

**Mục tiêu:** PWA cài được, Web Push, chất lượng production (E2E đủ vai trò, a11y, hiệu năng, bảo mật, giám sát). Các mục trong danh sách cắt nằm ở đây và chỉ làm khi còn thời gian.

**Tiêu chí chấm phục vụ:**
- **Sản phẩm mẫu (4đ):** PWA trên điện thoại khi demo.
- **Giải pháp (8đ):** độ hoàn thiện kỹ thuật.
- **Đội ngũ (6đ):** bằng chứng quy trình chất lượng (E2E, Lighthouse, security review).

| ID | Việc (mô tả) | Đầu ra | Skill/Agent | Giờ | Phụ thuộc | TT |
|---|---|---|---|---|---|---|
| P5-01 | PWA: manifest, icon, service worker (Serwist hoặc `sw.js` theo ADR), màn cài đặt, trang offline | Cài được trên Android (Chrome) và iOS (Safari → Thêm vào MH chính) | `ui-screen` | 4 | P4-12 | [ ] |
| P5-02 | Web Push (VAPID, `push_subscriptions`), dự phòng in-app/email cho iOS chưa cài PWA | Push tới Android < 5 s; iOS 16.4+ đã cài PWA nhận push | `feature-slice` | 5 | P5-01 | [ ] |
| P5-03 | **(C2)** Vị trí TNV trực tiếp khi app đang mở: Realtime Broadcast kênh private, làm tròn khoảng 11 m, chỉ giữ điểm mới nhất, xóa khi kết thúc chuyến; cửa hàng chỉ thấy ETA | pgTAP/test quyền kênh; dữ liệu bị xóa sau chuyến | `feature-slice`, agent `security-reviewer` | 5 | P3-11 | [ ] |
| P5-04 | **(C1)** Hàng đợi thao tác offline (check-in, xác nhận) có `client_op_id` | Tắt mạng → thao tác → bật mạng → đồng bộ đúng 1 lần | `feature-slice` | 5 | P5-01 | [ ] |
| P5-05 | **(C7)** AI kiểm minh chứng (mô tả khớp ảnh, phát hiện ảnh trùng) + AI nhận xét ESG trong báo cáo tháng; feature flag | Bật/tắt bằng flag; prompt có test snapshot | `claude-api` | 5 | P4-08 | [ ] |
| P5-06 | Hiệu năng + a11y: Lighthouse CI cho landing và `/volunteer`, WCAG 2.2 AA (axe 0 lỗi serious), lazy-load map, ảnh tối ưu | Lighthouse landing và `/volunteer` ≥ 90 ở cả 4 nhóm Performance/Accessibility/Best Practices/SEO (Lighthouse 12 đã bỏ nhóm PWA) + E2E installability (manifest, service worker, `beforeinstallprompt`) | `web-design-guidelines`, agent `ux-reviewer` | 5 | P5-01 | [ ] 09/10 landing v2 trên production (Lighthouse 12): **mobile 91–92**, desktop 97, A11y/BP/SEO 100 (trước: mobile 87–88). Landing tĩnh qua CDN, số tác động qua `/api/public-impact`, font tự host rút gọn, proxy bỏ qua trang công khai. Còn: Lighthouse CI tự động + `/volunteer` |
| P5-07 | Full E2E theo vai trò (khách, cửa hàng, tổ chức, TNV, Admin) + axe + screenshot | `e2e.yml` xanh với ≥ 25 kịch bản | agent `qa-e2e` | 6 | P5-02 | [ ] |
| P5-08 | Security review toàn hệ thống: `/security-review`, agent `security-reviewer`, `rls-audit` toàn bộ ma trận; sửa mọi lỗi High | Báo cáo trong `docs/phase-reports/G5.md`; 0 lỗi High còn mở | agent `security-reviewer`, `rls-audit` | 5 | P5-07 | [ ] |
| P5-09 | Giám sát: Sentry (client + server), uptime monitor (Better Stack/UptimeRobot) cho prod, cảnh báo email | Lỗi thử xuất hiện trong Sentry; uptime check 1 phút | — | 2 | P4-12 | [ ] |
| P5-10 | **(C3)** Dark mode, ⌘K, `/dev/ui` | Có hoặc đã cắt | `ui-screen` | 4 | P5-06 | [ ] |
| P5-11 | **(C4)** Xuất báo cáo bằng react-pdf | Có hoặc đã cắt | — | 3 | P4-08 | [ ] |
| P5-12 | **(C5)** Bảng xếp hạng Xanh (cửa hàng chọn tham gia) | Có hoặc đã cắt | `ui-screen` | 3 | P4-07 | [ ] |
| P5-13 | **(C6)** Quét QR trên CCCD gắn chip (chỉ lưu `id_last4`, `id_verified_at`, `verified_by`) | Có hoặc đã cắt | `feature-slice`, agent `security-reviewer` | 4 | P1-04 | [ ] |
| P5-14 | **Gate M3 = FREEZE:** Khanh UAT [`docs/uat/P5-pwa-ai.md`](uat/P5-pwa-ai.md) và chạy lại toàn bộ `docs/uat/`; **quay video dự phòng #3** (liền mạch + từng beat); tag `v1.0-rc`; khóa nhánh, chỉ nhận PR sửa lỗi | `docs/phase-reports/G5.md` + link video | `phase-gate`, `pitch-sync` | 4 | P5-01, P5-02, P5-06 → P5-09 | [ ] |

**Tổng P5:** bắt buộc khoảng 31 giờ (P5-01, 02, 06, 07, 08, 09, 14); tùy chọn khoảng 29 giờ, làm theo thứ tự **ngược** của danh sách cắt (C7 → C1) nếu còn thời gian.

---

### P6 — Sẵn sàng chung kết (23/11 → chung kết) · Gate G6 ngày trước chung kết

**Mục tiêu:** demo 2 thiết bị không có rủi ro bất ngờ; dữ liệu pilot thật được trình bày; cả đội trả lời được phản biện.

**Tiêu chí chấm phục vụ:**
- **Trình bày & phản biện (5đ):** tập dượt, bộ Q&A, mọi thành viên trả lời.
- **Sản phẩm mẫu (4đ):** demo trơn tru.
- **Đội ngũ (6đ):** thành viên có mặt và phân vai rõ.

| ID | Việc (mô tả) | Đầu ra | Skill/Agent | Giờ | Phụ thuộc | TT |
|---|---|---|---|---|---|---|
| P6-01 | Phân loại và sửa lỗi theo mức độ (chỉ sửa lỗi; mọi PR phải có test tái hiện) | Danh sách lỗi: 0 High, 0 Medium trên luồng demo | agent `qa-e2e` | 8 | P5-14 | [ ] |
| P6-02 | Role switcher **chỉ cho tài khoản demo** (chuyển nhanh cửa hàng/tổ chức/TNV trên laptop; **không** chuyển sang Admin — màn Admin dùng tài khoản admin của nhóm đã qua MFA) | pgTAP/E2E: tài khoản thật không thấy switcher | `feature-slice`, agent `security-reviewer` | 3 | P5-14 | [ ] |
| P6-03 | Dữ liệu demo cuối: seed cảnh "50 bánh", ảnh mẫu minh chứng (người đóng thế/ảnh có quyền dùng), chạy thử `demo:reset` trên prod 3 lần | Reset → trạng thái đầu kịch bản < 60 s | `seed-demo`, `demo-reset` | 3 | P6-02 | [ ] |
| P6-04 | Đồng bộ deck + kịch bản demo với tính năng thực tế và số liệu pilot | Deck v3 + `docs/pitch/demo-script.md` cập nhật timestamp video #3 | `pitch-sync` | 3 | B-07 | [ ] |
| P6-05 | Tập dượt #1 (25/11), #2 (27/11), #3 (29/11) trên prod, bấm giờ, có người đóng giám khảo hỏi; agent `judge` chấm sau mỗi lần | Biên bản tập dượt + điểm `judge` tăng dần, lần 3 ≥ 30/37 | agent `judge` | 9 | P6-04 | [ ] |
| P6-06 | Checklist rủi ro demo: 2 nguồn mạng (hotspot 2 nhà mạng), sạc/pin dự phòng, video offline trên 2 máy, QR in sẵn, tài khoản đã đăng nhập, cáp HDMI/USB-C, chế độ không làm phiền | Checklist ký trong `docs/phase-reports/G6.md` | `phase-gate` | 2 | P6-05 | [ ] |
| P6-07 | **Gate G6** (ngày trước chung kết): Khanh chạy [`docs/uat/P6-final-demo.md`](uat/P6-final-demo.md); chạy toàn bộ kịch bản trên prod lúc 20:00, `demo:reset`, tag `v1.0` | `docs/phase-reports/G6.md` | `phase-gate` | 2 | P6-06 | [ ] |

---

## 5. Checklist gate (điều kiện thoát đo được)

Mỗi gate: skill `phase-gate` sinh `docs/phase-reports/Gx.md` gồm kết quả từng mục, link CI run, screenshot/video, danh sách task trượt và quyết định cắt. **Người ký: Khanh (UAT) + Minh (kỹ thuật).** Thiếu một mục bắt buộc thì gate chưa qua; tính từ ngày gate, trễ quá 2 ngày thì áp quy tắc cắt.

### G0 — Nền móng (11/10)
- [ ] Vercel Preview tự tạo cho mỗi PR; `staging.<DOMAIN>` deploy từ `main`; prod (nhánh `release`, sau tag `v0.0`) tại domain chính trả HTTP 200.
- [ ] CI xanh trên `main`: lint, typecheck, unit, build, `supabase db lint`, pgTAP.
- [ ] Đăng ký và đăng nhập **thật trên prod**: email từ domain qua Resend tới Gmail trong < 1 phút, không vào spam.
- [ ] pgTAP hồi quy B1, B2, B3 xanh; RLS bật trên 100% bảng `public`.
- [ ] Keepalive chạy thành công cho staging và prod.
- [ ] Spike bản đồ: ≥ 18/20 địa chỉ sai lệch < 50 m; tuyến xe máy hợp lý; tile hiển thị đúng chủ quyền Hoàng Sa – Trường Sa.
- [ ] Hệ số ESG v1 chốt, có URL nguồn ([ADR-009](adr/ADR-009-esg-factors.md) Accepted).
- [ ] ADR 001–006 ở trạng thái Accepted.
- [ ] Plugin cộng đồng + RTK đã cài và ghi chú kiểm tra; hook chạy trên cả Git Bash và PowerShell.

### G1 — Onboarding & Tin cậy (15/10)
- [ ] Ma trận test: tổ chức `submitted`/`needs_changes`/`rejected`/`suspended` không vào cổng; sửa trường pháp lý tạo `org_change_requests` mà tổ chức vẫn `approved`; chủ hồ sơ không tự duyệt; không lộ PII; đúng vai trò. **L1–L5 và B1–B8 có test xanh.**
- [ ] File KYC chỉ mở được bằng signed URL 60 s; URL public trả lỗi.
- [ ] Admin bắt buộc MFA; RPC duyệt từ chối phiên `aal1`.
- [ ] Mọi quyết định duyệt ghi `reviewed_by`, `reviewed_at` và `audit_logs`.
- [ ] Wizard tự lưu nháp; bán kính phục vụ hiển thị số cửa hàng trong vùng.
- [ ] Không còn lỗi High từ `security-reviewer`.

### G2 = ★M1 (27/10)
- [ ] **Luồng đăng → yêu cầu → xác nhận → QR lấy → QR giao → ledger chạy E2E trên prod.**
- [ ] Nhãn Xanh/Vàng/Đỏ khớp giữa SQL và TS (cùng fixture); đếm ngược hiển thị đúng giờ VN.
- [ ] AI ảnh → tự điền: ≥ 8/10 ảnh mẫu đúng danh mục; tắt flag vẫn đăng lô được.
- [ ] Đặt chỗ đồng thời không cấp vượt (test).
- [ ] Thông báo realtime < 3 s; outbox không gửi trùng.
- [ ] Seed tương đối + `demo:reset` + tài khoản giám khảo chạy trên prod.
- [ ] **Video dự phòng #1** đã lưu ở 3 nơi.

### G3 — Ghép đơn & Điều phối (08/11)
- [ ] Kịch bản **"50 bánh từ 3 cửa hàng"** E2E xanh trên prod.
- [ ] Property test matching xanh (≥ 1.000 case ngẫu nhiên): không cấp vượt, không vượt nhu cầu, tôn trọng bán kính.
- [ ] Tuyến hiển thị trên bản đồ thật (Goong), deep link Google/Apple Maps mở đúng waypoint.
- [ ] Check-in geofence 100 m thử thật ngoài đường thành công.
- [ ] Mỗi ô của ma trận hủy có pgTAP.
- [ ] Track B: deck v1 + LOI (B-04, B-05) đã có hoặc ghi rõ lý do trễ.

### G4 = ★M2 (17/11)
- [ ] **Đủ 4 hướng định hướng**: bảng truy vết PRD → tính năng → test đều xanh.
- [ ] ESG: mỗi chỉ số trong bảng định hướng có unit test khớp công thức ở ESG-METHODOLOGY.
- [ ] Làm mờ khuôn mặt tự động ≥ 90% trên bộ 10 ảnh thử; ảnh gửi đi không còn EXIF/GPS.
- [ ] Cửa hàng chỉ xem được minh chứng đã duyệt và liên quan (pgTAP).
- [ ] Báo cáo tháng in ra A4 đẹp, có bảng nguồn hệ số.
- [ ] Trang tác động công khai không lộ vị trí chính xác.
- [ ] **Video dự phòng #2** đã lưu ở 3 nơi.

### G5 = ★M3 = FREEZE (22/11)
- [ ] E2E đủ vai trò xanh (≥ 25 kịch bản).
- [ ] **0 lỗi High** (security review + QA).
- [ ] Lighthouse landing và `/volunteer` ≥ 90 (Performance, Accessibility, Best Practices, SEO); "PWA ≥ 90" nghĩa là 4 nhóm này + E2E installability, vì Lighthouse 12 đã bỏ nhóm PWA.
- [ ] PWA cài được trên Android và iOS; Web Push chạy trên Android.
- [ ] Sentry + uptime monitor hoạt động.
- [ ] **Video dự phòng #3** (liền mạch + từng beat) lưu ở 3 nơi; timestamp ghi vào `docs/pitch/demo-script.md`.
- [ ] Deck v2 + kịch bản demo + bộ Q&A (B-08) xong.

### G6 — Sẵn sàng chung kết (ngày trước chung kết)
- [ ] Đã tập dượt 3 lần trên prod; lần 3 đúng 5:00 ± 15 s cho phần demo; `judge` chấm ≥ 30/37.
- [ ] Mỗi thành viên trả lời trơn tru ≥ 10 câu trong bộ Q&A thuộc mảng của mình.
- [ ] Checklist rủi ro demo (mục P6-06) tick đủ.
- [ ] Số liệu pilot thật (B-07) đã vào deck, có nguồn là trang KPI công khai.
- [ ] `demo:reset` chạy lúc tối trước ngày thi; tài khoản đã đăng nhập sẵn trên 2 thiết bị.

---

## 6. Track B — Hồ sơ & thuyết trình (song song)

Minh khoảng 3 giờ/tuần cùng Claude; Khanh phụ trách liên hệ cửa hàng/tổ chức. Tài liệu ở [`docs/pitch/`](pitch/README.md).

| ID | Hạn | Việc | Đầu ra | Người | Skill/Agent | TT |
|---|---|---|---|---|---|---|
| B-01 | 18/10 | Số liệu cấp thiết có nguồn (UNEP Food Waste Index 2024, FAO, số liệu Việt Nam); đối chiếu bản PDF gốc cho các số đang ghi "cần đối chiếu" | `pitch/so-lieu-cap-thiet.md` hoàn chỉnh, mọi số có URL + ngày truy cập | Minh | — | [ ] |
| B-02 | 18/10 | **Hỏi BTC:** có phải nộp deck/video/hồ sơ trước chung kết không; ngày, giờ, địa điểm chung kết; thời lượng thuyết trình và demo; số người được lên sân khấu; có màn chiếu, internet, ổ cắm không; được mang thiết bị riêng không; tiêu chí "đủ thành viên có mặt" | Email/tin nhắn xác nhận lưu vào `pitch/README.md` §Thông tin từ BTC; cập nhật hạn trong roadmap nếu cần | Khanh | — | [ ] |
| B-03 | 25/10 | Khảo sát sơ cấp: 20 cửa hàng (tiệm bánh, cửa hàng tiện lợi, quán cơm) + 5–10 tổ chức tại khu vực pilot: lượng dư mỗi ngày, cách xử lý hiện tại, rào cản (ATTP, thời gian); chọn khu vực pilot (3–5 phường liền kề) | Bảng khảo sát + tóm tắt đưa vào `so-lieu-cap-thiet.md` §Số liệu sơ cấp | Khanh (Minh soạn bảng hỏi) | — | [ ] |
| B-04 | 08/11 | **Thư bày tỏ ý định hợp tác (LOI)** từ **2 cửa hàng + 1 tổ chức thật** (mẫu LOI 1 trang, không ràng buộc pháp lý) | 3 LOI có chữ ký, bản scan trong thư mục riêng (không commit thông tin cá nhân) | Khanh | — | [ ] |
| B-05 | 08/11 | **Deck v1** (khung 13–14 slide theo `pitch/rubric-mapping.md`) | Deck v1 + `judge` chấm lần 1 | Minh | agent `judge`, `pitch-sync` | [ ] |
| B-06 | 15/11 | Kế hoạch 6 tháng + bảng ngân sách 75 triệu + mô hình bền vững hoàn chỉnh | `pitch/ke-hoach-6-thang.md`, `pitch/mo-hinh-ben-vung.md` bản chốt | Minh | agent `judge` | [ ] |
| B-07 | 15–28/11 | **Pilot nhỏ thật trên prod: ≥ 10 lần bàn giao** với cửa hàng/tổ chức đã ký LOI; thu ảnh minh chứng (đã làm mờ), 2 câu trích lời đối tác, KPI từ trang công khai | Báo cáo pilot 1 trang + số liệu thật trong deck | Khanh + Minh | `seed-demo` (không dùng cho dữ liệu thật) | [ ] |
| B-08 | 22/11 | **Deck v2** + **kịch bản demo 5 phút** + **bộ câu hỏi phản biện**; agent `judge` chấm thử | `pitch/demo-script.md`, `pitch/qa-phan-bien.md` bản chốt; điểm `judge` ≥ 28/37 | Minh + Khanh | agent `judge`, `pitch-sync` | [ ] |
| B-09 | 23–30/11 | Tập dượt (gắn P6-05); phân vai trả lời câu hỏi theo tiêu chí | Biên bản tập dượt | Cả đội | agent `judge` | [ ] |

**Mốc kiểm tra Track B ở các gate:** G2 (B-01, B-02, B-03 xong) · G3 (B-04, B-05) · G4 (B-06, pilot đã có ≥ 3 bàn giao) · G5 (B-08) · G6 (B-07 xong ≥ 10 bàn giao, B-09).

---

## 7. Sổ rủi ro

Khả năng/Tác động: C = Cao, TB = Trung bình, T = Thấp.

| # | Rủi ro | Khả năng | Tác động | Giảm thiểu | Chủ |
|---|---|---|---|---|---|
| R1 | P0 quá tải (khoảng 71 giờ/5 ngày), trễ dây chuyền | C | C | Đệm: P0-19 và một phần P0-18 được phép trượt; áp quy tắc 2 ngày → cắt; ưu tiên đường găng (scaffold → auth → migration) | Minh |
| R2 | Chỉ có 1 người code; ốm/thi cử làm đứng tiến độ | TB | C | Gate và danh sách cắt rõ ràng; harness + docs đủ để Claude Code tiếp tục với phiên ngắn; Khanh có thể chạy E2E và `demo:reset` độc lập | Minh |
| R3 | Supabase free tạm dừng project hoặc vượt giới hạn 2 project | TB | C | Keepalive hằng ngày; tạm dừng project cũ; nâng Pro khoảng 25 USD/tháng vào tháng 11 nếu cần | Minh |
| R4 | Goong sai lệch geocode hoặc hết hạn mức | TB | TB | Spike P0; ghim bản đồ là nguồn sự thật; cache geocode; dự phòng Nominatim + OpenRouteService qua `MapsProvider` | Minh |
| R5 | Email vào spam hoặc bị giới hạn | TB | C | Domain riêng + SPF/DKIM/DMARC qua Resend; test mail-tester ở G0 | Minh |
| R6 | AI tự điền sai hoặc API lỗi trong lúc demo | TB | TB | Feature flag; người dùng luôn xác nhận lại; ảnh demo đã thử trước; fallback điền tay; video beat 1 | Minh |
| R7 | Mạng hội trường yếu, demo hỏng | C | C | 2 hotspot khác nhà mạng; mã 6 số thay QR; video dự phòng offline; trạng thái seed sẵn từng beat | Khanh |
| R8 | Không có LOI hoặc pilot thật trước 28/11 | TB | C | Bắt đầu khảo sát từ 18/10 (B-03); nhắm 10 cửa hàng để chắc có 2; dự phòng: tổ chức quen của đội, bếp ăn sinh viên; ghi trung thực số đạt được | Khanh |
| R9 | Rủi ro an toàn thực phẩm trong pilot (ngộ độc) | T | C | Cam kết an toàn khi đăng; nhãn + kiểm tra khả thi; bên nhận được từ chối từng dòng; pilot chỉ nhận đồ đóng gói/bánh, không nhận đồ tươi sống dễ hỏng; điều khoản miễn trừ | Khanh |
| R10 | Lộ dữ liệu cá nhân (KYC, ảnh trẻ em, vị trí) | T | C | RLS 100%, bucket private, làm mờ trên máy, vị trí làm tròn và xóa sau chuyến, pgTAP, security review ở G1 và G5 | Minh |
| R11 | Bàn giao bằng QR lỗi camera (laptop webcam kém) | TB | TB | Mã 6 số; điện thoại thứ 2 làm máy quét; test ánh sáng hội trường | Khanh |
| R12 | Thể thức chung kết khác giả định (không cho demo trực tiếp, thời lượng ngắn) | TB | TB | B-02 hỏi sớm; có 3 bản kịch bản: 5 phút, 3 phút, chỉ video | Khanh |
| R13 | Số liệu cấp thiết không kiểm chứng được, bị giám khảo bắt bẻ | TB | TB | Chỉ dùng số có URL + ngày truy cập; số khác ghi "chưa kiểm chứng"; ưu tiên số UNEP/FAO và khảo sát sơ cấp | Minh |
| R14 | Plugin cộng đồng gây rủi ro chuỗi cung ứng hoặc xung đột hook | T | TB | Đọc nội dung trước khi bật; thứ tự ưu tiên CLAUDE.md > skill dự án > cộng đồng; tắt caveman mặc định | Minh |
| R15 | Đội ngũ chỉ 2 người, bị đánh giá thấp ở tiêu chí Đội ngũ | TB | TB | Trình bày quy trình AI-assisted engineering có kiểm soát; mời cố vấn (ATTP, pháp lý, CSR); xác nhận với BTC về số thành viên đã đăng ký | Minh |
| R16 | Thay đổi đơn vị hành chính (bỏ cấp quận từ 01/7/2025) làm lệch dữ liệu địa chỉ và mô tả pilot | C | T | Dùng phường/xã mới trong UI và seed; pilot mô tả theo "cụm phường"; heatmap theo phường | Minh |

---

## 8. Nhật ký thay đổi roadmap

- **08/10/2026 (đêm khuya):** P3-07 xong; P3-05 xong phần code + E2E, chờ `ux-reviewer` (UI nhu cầu + phương án ghép, "Nhu cầu gần bạn").
  - Phương án hiển thị là đúng phương án được giữ: server tính lại lúc bấm chọn và chỉ gọi `reserve_bundle` khi chữ ký dòng (lô, số lượng) khớp; lệch ⇒ trả phương án mới để xem lại. Chỉ đường thật chỉ gọi cho phương án được chọn và chỉ khi mọi điểm công khai vị trí.
  - Ghép lại phần thiếu loại mọi điểm đã có phân bổ của nhu cầu, trừ điểm mà chính tổ chức đã hủy (điểm đã từ chối/hết hạn/tự hủy không được đề xuất lại).
  - `needs_nearby` trả `distance_km = null` cho điểm nhận ẩn (như `need_recipients`), không phải km nguyên — chống dò vị trí nơi tạm lánh bằng nhiều chi nhánh.
  - pgTAP 105 file / 2.399 assertion xanh trên DB vừa reset.

- **08/10/2026 (khuya, P3-08/09/11 phía điều phối):** Tổ chức giao chuyến cho 1–2 tình nguyện viên, theo dõi trực tiếp và nhận hàng.
  - Migration `20261008170200_coordinator` (pgTAP `rpc/coordinator`): `org_members.paused_at/paused_reason` + trigger chặn giao chuyến cho TNV tạm ngưng (US-CHA-15 AC2), `list_org_volunteers` (SĐT che, cờ đồng ý vị trí — bản ghi `consents` vẫn riêng tư), `set_volunteer_paused`, `revoke_invitation`. DATA-MODEL §2.1, §8.2, §8.8, §18 và SECURITY-PRIVACY §5 (dòng 8, 14) cập nhật.
  - Không publish `pickups` lên Realtime (SECURITY-PRIVACY C9): vị trí TNV đọc định kỳ qua RLS; Broadcast private vẫn để P5-03.
  - Mở: bấm gọi TNV/cửa hàng (US-CHA-18 AC3) cần quyết định cho điều phối viên xem số không che; gợi ý "không trùng giờ" (US-CHA-16 AC2) hiện dựa trên số chuyến đang mở, chưa so khung giờ.

- **08/10/2026 (khuya, P3-10):** PWA tình nguyện viên chạy trọn vòng trên mobile web: giao chuyến → nhận → bắt đầu → check-in → QR cửa hàng → mã giao hàng → hoàn tất.
  - `CarrierHandover` thêm `kind` (`pickup`/`dropoff`) và `variant` (`page`/`embedded`), giữ nguyên props cũ cho màn tổ chức tự lấy; `QrHandover` thêm `audience` (cửa hàng/tổ chức quét).
  - Không đổi DB. Mở: bấm gọi cần số không che (DATA-MODEL hiện chỉ trả số che), thử thật ngoài đường ở UAT G3.

- **08/10/2026 (tối):** Làm sớm phần TS thuần của P3: P3-03 (`src/core/matching`) xong, P3-09 xong phần `src/core/routing`.
  - Thuật toán đúng ADR-007; bổ sung hạt giống "tập rỗng" khi mở rộng tham lam (phủ đơn điệu khi thêm ứng viên) và loại tổ hợp không có thứ tự đi khả thi — ghi ở ADR-007 §4, ARCHITECTURE §4.1.
  - `src/core/matching/fixtures.json`: fixture `pre_score` để P3-02 (SQL `match_candidates`) dùng chung.
  - TESTING.md P2 ghi rõ dung sai < 1 đơn vị khi quy đổi kg (khớp DATA-MODEL §4.6).

- **08/10/2026 (khuya):** Wizard onboarding P1-02, P1-04, P1-05, P1-07 (nhánh `feat/P1-onboarding`).
  - Wizard 5 bước (tách "Người đại diện & giấy tờ" của PRD thành 2 bước "Pháp lý" và "Giấy tờ"); PRD F-03/F-04, US-CHA-01 cập nhật theo.
  - **P1-06 chưa đánh dấu xong:** giờ mở cửa (kể cả qua nửa đêm) đã lưu được trong wizard, nhưng ngày nghỉ (`site_closures` — RLS chỉ cho tổ chức `approved`) và nhân viên/chi nhánh (`org_members.site_ids`) để sang trang cài đặt P2.
  - Wizard không thu 4 số cuối CCCD: theo thiết kế DB (không grant, trigger chặn), chỉ Admin ghi qua `verify_representative_id` khi xác minh.

- **08/10/2026 (đêm):** Làm sớm một phần P1 song song với phần còn lại của P0.
  - **ADR-012:** email xác thực do ứng dụng tự gửi (`generateLink` + SMTP), có giới hạn tần suất.
  - **ADR-013:** PWA dùng service worker tự viết.
  - **ADR-009 Accepted:** hệ số ESG v1 là 2,0 / 150 / 0,42.
  - **Kiểm thử:** 730 assertion pgTAP; 54 E2E; 70 unit test.
  - **Vùng phục vụ (bbox):** lng 106,33–107,60, lat 10,30–11,55.

- **08/10/2026:** Xong P0-20, ADR-009 chuyển **Accepted** sau khi đối chiếu PDF FAO 2013 (tr. 6, tr. 11) và WRAP 2020.
  - Hệ số ESG v1: CO₂e **2,0 kg/kg** (thay 2,5, vì FAO tính dấu chân trên 1,6 Gt chứ không phải 1,3 Gt); nước **150 L/kg** nước xanh lam, **được hiển thị** với nhãn "Nước tưới tránh lãng phí (ước tính)"; suất ăn **0,42 kg**.
  - Đã đồng bộ ESG-METHODOLOGY, DATA-MODEL, PRD (đóng Q-1, Q-2), DESIGN-SYSTEM, TESTING, UAT và bộ pitch (KPI CO₂e 6 tháng còn ≥ 10 tấn, mức vươn 16 tấn).

- **08/10/2026:** Production chạy tại https://foodsave-psi.vercel.app.
  - **Vercel:** `vercel.json` ép framework `nextjs` (project import khi `main` chỉ có tài liệu nên Vercel nhận diện là "Other"), pnpm 12.4.2, vùng `hnd1`. URL ứng dụng tự suy từ biến hệ thống Vercel.
  - **GitHub Actions bị khóa** do vấn đề thanh toán của tài khoản GitHub, CI chưa chạy được. Tạm thời chạy kiểm tra local trước mỗi lần push (lint, typecheck, unit, pgTAP, E2E). Chủ repo cần xử lý Billing để bật lại CI (P0-10).
  - Tạm thời `main` = production. Merge PR đầu tiên bằng fast-forward theo yêu cầu chủ dự án.

- **07/10/2026 (khuya):** Hạ tầng cloud.
  - Project Supabase của nhóm đặt ở **Tokyo (ap-northeast-1)**, không phải Singapore; độ trễ vẫn chấp nhận được.
  - Kết nối DB qua session pooler `aws-0-ap-northeast-1.pooler.supabase.com` (host direct chỉ có IPv6).
  - Tạm thời dùng **1 project cloud làm production**. Preview của Vercel cũng trỏ vào project này cho tới khi tạo staging; không seed dữ liệu demo lên đây trước P2.
  - Push: `main` = commit tài liệu nền; code ở nhánh `feat/P0-02-scaffold` chờ PR.

- **07/10/2026 (tối):** Xong local P0-02→06, P0-12→14:
  - Next.js 16.3.8; 23 unit test; 298 assertion pgTAP; 14 E2E gồm luồng đăng ký thật qua Mailpit.
  - Xác nhận email dùng `token_hash` + `/auth/confirm`, mở được trên mọi thiết bị (không phụ thuộc PKCE cookie).
  - Template email tiếng Việt nằm trong `supabase/templates/`.
  - Còn mở cho P1: hiện đồng nghiệp xem được email/SĐT của nhau qua `profiles`; cần thu hẹp cột theo ma trận §9.2.
  - Đang chờ: Supabase cloud (P0-07), Vercel (P0-08), Gmail SMTP (P0-09), key Goong (P0-17).

- **07/10/2026:** Chủ dự án quyết định chưa mua domain và dùng OpenAI. Theo ADR-010 và ADR-011:
  - **P0-08:** dùng URL `*.vercel.app` (prod = nhánh `release`, staging = nhánh `main`), không gắn domain.
  - **P0-09:** thay "Domain + Resend" bằng "Gmail SMTP (App Password) cho Supabase Auth và outbox".
  - **AI:** provider mặc định là OpenAI `gpt-5.4-mini` / `gpt-5.4-nano`, `ai_enabled=false` cho tới khi nạp credit.

| Ngày | Thay đổi | Lý do | Người |
|---|---|---|---|
| 07/10/2026 | Tạo ROADMAP v1 từ plan đã duyệt (mục 8): 7 phase, gate G0–G6, danh sách cắt C1–C7, Track B B-01 → B-09, sổ rủi ro R1–R16 | Khởi tạo dự án FoodSave v2 | Minh (cùng Claude Code) |
| 07/10/2026 | Đồng bộ liên tài liệu: link UAT đúng tên file; trạng thái tổ chức theo `org_status`; luồng deploy PR → Preview, `main` → staging, tag → prod qua nhánh `release`; định nghĩa lại "Lighthouse PWA ≥ 90"; ADR-009 cho P0-20; giám khảo không có tài khoản admin | Bốn tài liệu viết song song bị lệch | Claude Code |
| 07/10/2026 | Bổ sung B-03 (khảo sát sơ cấp 20 cửa hàng) và R16 (bỏ cấp quận); mô tả pilot theo "cụm 3–5 phường" thay vì "1 quận" | TP.HCM áp dụng chính quyền 2 cấp từ 01/7/2025; cần bằng chứng sơ cấp cho tiêu chí Cấp thiết | Minh |
