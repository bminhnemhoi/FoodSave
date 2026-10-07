# ADR-001: Next.js + Vercel (Amplify sau)

- **Trạng thái:** Accepted
- **Ngày:** 2026-10-07
- **Người quyết định:** Minh (kỹ thuật), Khanh (kiểm thử)
- **Liên quan:** [ARCHITECTURE.md §3, §8.4, §15](../ARCHITECTURE.md), ADR-002, ADR-003

## Bối cảnh

- Bản cũ là 4 file HTML hơn 4.000 dòng trên Netlify cộng một backend Express riêng. Hệ quả: link hỏng (L1, L12), đăng nhập giả (L2, L3), backend gọi cột không tồn tại (L7, L8), Socket.io không chạy trên Netlify Functions (L16), chế độ development lọt lên prod (B7).
- Đội có một lập trình viên (Minh) làm cùng Claude Code trong 6 tuần, Khanh kiểm thử. Cần một khung có quy ước mạnh, TypeScript đầu-cuối, ít hạ tầng phải tự vận hành.
- Chưa có tài khoản AWS. Ban tổ chức TISPA đánh giá "kiến trúc sẵn sàng mở rộng"; sau giải có 6 tháng triển khai, hướng tới AWS (Amplify, Location, Bedrock).
- Sản phẩm cần SSR/SEO cho landing và trang tác động công khai, PWA cho tình nguyện viên, form phức tạp có validate dùng chung client/server.

## Quyết định

1. Dùng **Next.js bản stable mới nhất, App Router, React 19, TypeScript strict, pnpm, Turbopack**. Một repo, một ứng dụng chứa cả 4 cổng (`/store`, `/charity`, `/volunteer`, `/admin`), onboarding và trang công khai.
2. Mutation từ UI đi qua **Server Actions**; **Route Handlers** chỉ cho job (HMAC), proxy bản đồ, health, auth callback (ARCHITECTURE §5). Không có backend Express riêng.
3. Deploy **Vercel** ngay từ P0: Preview cho mỗi PR (nối Supabase staging), Production từ `main` (nối Supabase prod).
4. Giữ ứng dụng **không phụ thuộc tính năng riêng của Vercel** để chuyển sang **AWS Amplify Hosting** sau giải: không dùng Vercel KV/Blob/Edge Config/Cron cho nghiệp vụ; job chạy bằng pg_cron (ADR-002); secret đọc qua `src/lib/env.ts`.
5. Hàm serverless chạy Node runtime (không Edge) cho mọi thứ chạm DB hoặc provider, để có thư viện Node đầy đủ (`web-push`, SDK Anthropic/Bedrock).

## Hệ quả

**Tích cực**
- Một ngôn ngữ, một codebase, type sinh từ DB dùng xuyên suốt; schema zod dùng chung client/server.
- RSC giảm JS phía client cho landing (mục tiêu Lighthouse ≥ 90); PWA làm được bằng Serwist.
- Preview mỗi PR giúp Khanh UAT trên link thật; rollback một click.
- Đường sang Amplify rõ ràng (Amplify hỗ trợ SSR Next.js), là luận điểm cho tiêu chí "Giải pháp & công nghệ".

**Tiêu cực**
- Vercel Hobby: Cron tối đa 1 lần/ngày, giới hạn thời gian chạy hàm và body request (~4,5 MB), điều khoản phi thương mại. Biện pháp: lịch ở pg_cron, upload thẳng Storage, dispatcher chia batch ≤ 8 s; nâng Pro hoặc sang Amplify khi pilot có đối tác doanh nghiệp.
- Server Actions và cache của App Router có nhiều thay đổi giữa các phiên bản; phải khóa phiên bản và đọc tài liệu đúng bản (Context7 MCP) trước khi dùng API cache.
- Cold start hàm serverless ảnh hưởng thao tác đầu tiên; chấp nhận được với quy mô pilot.

## Phương án đã cân nhắc

| Phương án | Lý do không chọn |
|---|---|
| Giữ HTML tĩnh + Express trên Netlify (bản cũ) | Nguồn của phần lớn lỗi L1–L16; không có type chung; Socket.io không chạy trên Functions |
| Vite SPA + Express/Fastify riêng | Hai deploy, hai lớp auth, không SSR cho landing; nhiều việc vận hành hơn |
| Remix / React Router framework | Tốt về kỹ thuật, nhưng hệ sinh thái mẫu Supabase + shadcn + tài liệu cho Claude Code mỏng hơn; Amplify hỗ trợ Next.js tốt hơn |
| Deploy AWS Amplify ngay | Chưa có tài khoản AWS; thêm rủi ro cấu hình trong 6 tuần |
| Cloudflare Pages/Workers | Runtime không phải Node đầy đủ (thư viện push, SDK AI), khác xa đích AWS |
