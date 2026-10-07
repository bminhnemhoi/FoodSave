# FoodSave v2 — Hướng dẫn cho Claude Code

@AGENTS.md

> **Next.js 16:** API có thay đổi lớn so với dữ liệu huấn luyện. Trước khi viết code Next.js, đọc hướng dẫn tương ứng trong `node_modules/next/dist/docs/` (xem AGENTS.md).
> Điểm khác đã gặp: `middleware.ts` → **`proxy.ts`** (hàm `proxy`, runtime nodejs); `params`/`searchParams`/`cookies()`/`headers()` **bắt buộc async**; `revalidateTag(tag, 'max')` cần tham số thứ 2; trong Server Action dùng **`updateTag()`** khi người dùng cần thấy ngay thay đổi; `next lint` đã bị bỏ (dùng `eslint` trực tiếp); dùng helper type `PageProps<'/route'>`.

FoodSave là nền tảng điều phối thực phẩm dư thừa **minh bạch đến từng suất ăn**:

- **Cửa hàng** đăng lô thực phẩm.
- **Tổ chức từ thiện** đăng nhu cầu. Hệ thống ghép từ nhiều cửa hàng.
- **Tình nguyện viên** lấy hàng theo tuyến tối ưu và bàn giao bằng QR.
- Tổ chức nộp **minh chứng** (ảnh đã làm mờ khuôn mặt).
- **ESG** tự tính.
- **Admin** duyệt hồ sơ và giám sát.

Dự án dự thi **TISPA 2026**; chung kết đầu tháng 12/2026. Người code chính là Minh, làm cùng Claude Code. Khanh kiểm thử và UAT.

> Trước khi làm bất cứ việc gì, đọc `docs/ROADMAP.md`. Khối `STATUS` cho biết phase hiện tại và việc kế tiếp. Không làm việc của phase sau khi gate của phase trước chưa qua, trừ khi Minh yêu cầu.

## Tài liệu là nguồn sự thật

| Cần biết | Đọc |
|---|---|
| Tính năng, user story, acceptance criteria | `docs/PRD.md` |
| Kiến trúc, provider adapter, luồng request | `docs/ARCHITECTURE.md`, `docs/adr/` |
| Bảng, enum, state machine, RPC, ma trận RLS | `docs/DATA-MODEL.md` |
| Token, component, pattern UI, văn phong tiếng Việt | `docs/DESIGN-SYSTEM.md` |
| Bảo mật, dữ liệu cá nhân (Luật 91/2025/QH15) | `docs/SECURITY-PRIVACY.md` |
| Công thức ESG và nguồn hệ số | `docs/ESG-METHODOLOGY.md` |
| Chiến lược test, UAT | `docs/TESTING.md`, `docs/uat/` |
| Môi trường, biến môi trường, deploy | `docs/DEPLOYMENT.md`, `docs/AWS-MIGRATION.md` |
| Thuyết trình, tiêu chí chấm | `docs/pitch/` |

Khi code và docs mâu thuẫn, **dừng lại và hỏi**. Nếu quyết định thay đổi thì cập nhật docs (và ADR mới nếu là quyết định kiến trúc) **trong cùng thay đổi**.

**Thứ tự ưu tiên:** `CLAUDE.md` và `docs/` > skill dự án (`.claude/skills/`) > skill/plugin cộng đồng (ponytail, frontend-design, UI UX Pro Max…).

## Stack

- **Ứng dụng:** Next.js (App Router, React 19, Turbopack) · TypeScript strict · pnpm.
- **UI:** Tailwind CSS v4 · shadcn/ui · lucide-react · Motion · TanStack Query/Table · react-hook-form + zod · MapLibre (`react-map-gl/maplibre`).
- **Supabase:** Postgres + PostGIS + pg_cron + pg_net · RLS · Auth (MFA cho admin) · Storage · Realtime.
- **Provider** (chọn bằng env, luôn đi qua adapter trong `src/server/providers/`):
  - maps: `goong | ors | aws`
  - ai: `openai | anthropic | bedrock` (mặc định `openai`: gpt-5.4-mini / gpt-5.4-nano, ADR-010)
  - notify: `smtp (Gmail) + webpush | resend | ses` (chưa có domain, ADR-011)
- **Deploy:** Vercel, dùng URL `*.vercel.app`, chưa có domain (ADR-011) → AWS Amplify (sau giải). Xem ADR-001.

## Lệnh (có từ P0)

```bash
pnpm dev                 # Next.js dev server
pnpm build && pnpm start
pnpm lint                # ESLint toàn repo
pnpm typecheck           # tsc --noEmit
pnpm test                # Vitest (unit + property test)
pnpm test:e2e            # Playwright (cần Supabase local + seed)
pnpm db:start            # supabase start (Docker)
pnpm db:reset            # áp lại migration + seed trên DB LOCAL
pnpm db:test             # pgTAP: supabase test db
pnpm db:types            # sinh src/types/database.types.ts
pnpm demo:reset          # reset dữ liệu demo (chỉ tổ chức is_demo)
```

- **Chạy lệnh CLI bằng tool Bash**, không dùng PowerShell. Lý do: RTK chỉ nén output của Bash.
- Cần output đầy đủ để debug thì dùng `rtk run <lệnh>`, hoặc `rtk recall <hash>` cho lần chạy trước.

## Cấu trúc thư mục

```
src/app/            (marketing) (auth) onboarding/ store/ charity/ volunteer/ admin/ impact/ api/
src/features/<domain>/   components/ actions.ts queries.ts schemas.ts
src/core/           labels/ matching/ routing/ impact/      ← TypeScript thuần, KHÔNG IO, test 100%
src/server/         db/ providers/ jobs/ auth/               ← 'server-only'
src/components/     ui/ (shadcn) layout/ map/ labels/ charts/ qr/ forms/
src/lib/            env.ts (zod), utils
supabase/           migrations/ seed/ tests/ (pgTAP)
tests/e2e/          Playwright theo vai trò
```

## Luật bắt buộc

### Bảo mật & dữ liệu

1. **RLS-first.** Mọi bảng mới phải bật RLS, có policy và pgTAP test trong cùng migration. Dùng skill `new-migration`.
2. **Vai trò không bao giờ lấy từ `raw_user_meta_data`** hay bất kỳ input nào phía client. Admin chỉ được tạo bằng script hoặc migration seed. Đây là bài học B1 của bản cũ.
3. **Chuyển trạng thái chỉ qua RPC `security definer`.**
   - Bảng có cột trạng thái dùng mẫu "revoke UPDATE cả bảng, rồi grant UPDATE cho danh sách cột được phép" (DATA-MODEL §9.4). `revoke update (cột)` đơn lẻ **không có tác dụng** trên Supabase.
   - Mỗi RPC kiểm tra state machine trong `docs/DATA-MODEL.md`, nhận `p_client_op_id`, và ghi `audit_logs`.
   - Dùng skill `state-transition`.
4. **`SUPABASE_SERVICE_ROLE_KEY` chỉ dùng trong `src/server/**`.**
   - Mọi file ở đó có `import 'server-only'`.
   - Không bao giờ dùng trong file `"use client"`.
5. **Dữ liệu nhạy cảm:**
   - Giấy tờ KYC ở bucket `kyc` (private, signed URL 60 s); minh chứng ở bucket `proofs` (private, 300 s).
   - CCCD chỉ lưu 4 số cuối.
   - Ảnh phải được mã hóa lại qua canvas trước khi upload để xóa EXIF/GPS.
6. **Public chỉ đọc qua view `security_invoker=true`** (`public_org_cards`, `public_impact_stats`). Materialized view chỉ truy cập qua RPC.
7. **Vị trí:**
   - Điểm `hidden`/`approximate` không bao giờ lộ tọa độ thật.
   - Vị trí tình nguyện viên chỉ giữ điểm mới nhất, chỉ trong chuyến, có consent.
8. **Không đọc hay sửa `.env*`** (trừ `.env.example`). Không commit secret.
9. **Không tạo `.env.production.local` trên máy dev.** `next start` tự nạp file này nên E2E/local sẽ gọi nhầm Supabase cloud. Giá trị cloud để ở `.env.cloud.local`, chỉ script nạp tường minh.

### Miền nghiệp vụ

- **Thuật ngữ:** offer = lô tặng · need = nhu cầu · bundle (`need_bundles`) = phương án ghép · allocation = phân bổ · pickup = chuyến lấy hàng · handover (`pickup | dropoff`) = bàn giao · proof = minh chứng · site = điểm/chi nhánh · impact_ledger = sổ tác động.
- **Nhãn tươi:**
  - Chỉ gọi là **Xanh / Vàng / Đỏ** (code: `green | yellow | red | expired`).
  - **Tính lúc đọc** bằng `freshness_label()` (SQL) và `src/core/labels` (TS), hai bên dùng chung fixture test. Không lưu nhãn vào DB.
- **Thời gian:**
  - Lưu `timestamptz`.
  - Mọi tính toán giờ mở cửa và hạn dùng theo `Asia/Ho_Chi_Minh`.
  - Hạn dùng chỉ có ngày thì tính đến 23:59 giờ Việt Nam.
- **Số lượng:**
  - `qty_reserved ≥ qty_picked ≥ qty_delivered`. Đơn vị khác `kg`/`liter` phải là số nguyên.
  - Ghép đơn khác đơn vị chỉ được quy đổi qua kg.
- **Không có tính năng giả.** Số liệu phải là thật, hoặc gắn nhãn "Dữ liệu demo". Không còn di sản B2C (giá bán, hoa hồng, ví, đơn mua).
- **Dữ liệu demo dùng tên hư cấu**, không dùng thương hiệu thật. Mốc thời gian trong seed phải viết dạng `now() + interval`.

### Code

- Code, tên biến, route và commit: **tiếng Anh**. Toàn bộ chữ hiển thị cho người dùng: **tiếng Việt**, theo văn phong trong DESIGN-SYSTEM.
- Schema zod dùng chung client/server, đặt trong `features/<domain>/schemas.ts`.
- `src/core/**` không import gì từ `server/`, `app/` hay Supabase.
- Thay đổi DB **chỉ bằng migration mới**. Không sửa migration đã có trên `origin/main` (hook sẽ chặn).
- **Ưu tiên ít code** (tinh thần ponytail): dùng lại component/thư viện đã có, dùng tính năng native.
- **Nhưng không bao giờ cắt:** validation, xử lý lỗi, bảo mật, a11y, trạng thái loading/empty/error.

### UI

- Dùng token và component trong `docs/DESIGN-SYSTEM.md`. Không hardcode màu.
- **Mỗi màn hình phải có:**
  - đủ trạng thái loading (skeleton), empty (có CTA) và error
  - responsive 360 px → desktop
  - đạt WCAG 2.2 AA
  - nhãn luôn có icon + chữ
- Bản đồ luôn lazy-load (`dynamic(..., { ssr: false })`).
- Làm màn hình mới thì dùng skill `ui-screen`. Xác minh bằng screenshot Playwright, không chỉ đọc code.

## Definition of Done (mỗi task trong ROADMAP)

- [ ] Đúng acceptance criteria trong PRD (ghi ID user story trong PR/commit).
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` xanh. Có pgTAP nếu đụng DB; có E2E nếu là luồng người dùng.
- [ ] UI: screenshot desktop + mobile đã xem; không có lỗi axe nghiêm trọng.
- [ ] Docs liên quan đã cập nhật (DATA-MODEL, PRD, ADR…). Đánh dấu task trong ROADMAP.
- [ ] Không có secret, `console.log` thừa hay TODO không có ID.

## Quy trình làm việc

1. **Mở phiên:** hook SessionStart in phase và việc kế tiếp. Đọc task đó trong `docs/ROADMAP.md`.
2. **Làm theo skill:**
   - `feature-slice` (tính năng), `new-migration` (DB), `state-transition` (RPC)
   - `ui-screen` (màn hình), `rls-audit` (quyền)
   - `seed-demo` / `demo-reset` (dữ liệu)
3. **Trước khi mở PR:** chạy `/ponytail-review`, rồi agent `security-reviewer` nếu đụng auth/RLS/storage. Dùng `ux-reviewer` cho UI.
4. **Cuối phase:** skill `phase-gate` → báo cáo `docs/phase-reports/Gx.md` → Khanh chạy UAT theo `docs/uat/` → gắn tag `v0.x`.
5. **Git:**
   - Làm trên nhánh `feat/<task-id>-<slug>`, mở PR vào `main`. Không push thẳng `main`, không force push.
   - Commit theo Conventional Commits.
   - **Chỉ commit hoặc push khi Minh yêu cầu.**
6. **Báo cáo cho Minh:** tiếng Việt đầy đủ, rõ ràng. Không dùng chế độ caveman khi báo cáo.

## Kiểm soát phạm vi

- **Gate trễ quá 2 ngày:** cắt mục kế tiếp trong "Danh sách cắt" của ROADMAP, không kéo dài phase.
- **Freeze 22/11/2026:** sau ngày này chỉ sửa lỗi.
- **Code AI:** provider mặc định OpenAI (ADR-010), dùng Responses API + structured output, validate bằng zod. Nếu viết provider Claude/Bedrock thì đọc skill `claude-api` trước. Mọi tính năng AI nằm sau feature flag và có đường dự phòng không cần AI.
