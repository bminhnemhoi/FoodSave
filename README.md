# FoodSave — Cứu thực phẩm, minh bạch đến từng suất ăn

Nền tảng điều phối thực phẩm dư thừa từ **cửa hàng** đến **tổ chức từ thiện**:

- **Nhãn tươi Xanh/Vàng/Đỏ** tự động.
- **Ghép đơn từ nhiều cửa hàng.**
- **Bản đồ & tuyến** cho tình nguyện viên.
- **Bàn giao bằng QR.**
- **Minh chứng** đã làm mờ khuôn mặt.
- **ESG** tự tính có trích nguồn.

Dự án dự thi **TISPA 2026**, Giải thưởng Đổi mới sáng tạo công nghệ trong thiện nguyện bền vững (IEC – ĐHQG TP.HCM và Quỹ Khởi Sự Từ Tâm).

> **Trạng thái:** đã xong thiết kế và harness, đang chuẩn bị **Phase 0 — Nền móng**. Tiến độ xem tại [docs/ROADMAP.md](docs/ROADMAP.md).

## Tài liệu

| Tài liệu | Nội dung |
|---|---|
| [docs/PRD.md](docs/PRD.md) | Yêu cầu sản phẩm, user story, acceptance criteria, bảng truy vết |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/adr/](docs/adr/) | Kiến trúc, luồng xử lý, các quyết định kiến trúc |
| [docs/DATA-MODEL.md](docs/DATA-MODEL.md) | Schema, state machine, RPC, ma trận phân quyền |
| [docs/DESIGN-SYSTEM.md](docs/DESIGN-SYSTEM.md) | Ngôn ngữ thiết kế, token, component, văn phong |
| [docs/SECURITY-PRIVACY.md](docs/SECURITY-PRIVACY.md) | Bảo mật, dữ liệu cá nhân, truy vết lỗi bản cũ |
| [docs/ESG-METHODOLOGY.md](docs/ESG-METHODOLOGY.md) | Công thức và nguồn hệ số ESG |
| [docs/TESTING.md](docs/TESTING.md) · [docs/uat/](docs/uat/) | Chiến lược kiểm thử, checklist UAT |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) · [docs/AWS-MIGRATION.md](docs/AWS-MIGRATION.md) | Môi trường, deploy, lộ trình AWS |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Kế hoạch theo phase, gate, danh sách cắt |
| [docs/pitch/](docs/pitch/) | Hồ sơ thuyết trình theo tiêu chí chấm |

## Công nghệ

- **Ứng dụng:** Next.js (App Router) · TypeScript · Tailwind CSS v4 · shadcn/ui · MapLibre + Goong.
- **Dữ liệu:** Supabase (Postgres + PostGIS, Auth, Storage, Realtime).
- **Hạ tầng:** Vercel (hiện tại) → AWS Amplify, Location Service, Bedrock, Rekognition (lộ trình sau giải).

## Bắt đầu (sau Phase 0)

Yêu cầu: Node 24, pnpm (`corepack enable`), Docker Desktop, Supabase CLI.

```bash
pnpm install
cp .env.example .env.local      # điền giá trị theo docs/DEPLOYMENT.md
pnpm db:start && pnpm db:reset  # Supabase local + seed demo
pnpm dev                        # http://localhost:3000
```

## Làm việc với Claude Code

Repo đi kèm bộ harness:
- [CLAUDE.md](CLAUDE.md): luật dự án.
- [.claude/skills/](.claude/skills/): 9 skill quy trình.
- [.claude/agents/](.claude/agents/): 5 agent review.
- [.claude/hooks/](.claude/hooks/): chặn lệnh nguy hiểm, format, kiểm tra trước khi kết thúc.
- [.mcp.json](.mcp.json): Supabase read-only, Playwright, Context7.

Cài bộ skill cộng đồng và RTK một lần trên mỗi máy (Git Bash):

```bash
bash scripts/setup-claude-tools.sh
```

- Supabase MCP đọc biến môi trường shell `SUPABASE_STAGING_PROJECT_REF`. Đặt biến này trong hệ thống, không đặt trong `.env.local`.
- Lần đầu dùng, Claude Code sẽ hỏi xác nhận các MCP server của project.

## Nhóm

- **Minh:** phát triển chính.
- **Khanh:** kiểm thử, UAT, vận hành pilot.
