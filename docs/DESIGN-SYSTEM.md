# FoodSave v2 — Design System

| Mục | Nội dung |
|---|---|
| Phiên bản | 1.0 — 07/10/2026 (đề xuất trước P0) |
| Trạng thái | **Nguồn sự thật cho giao diện.** Giá trị trong tài liệu này là đề xuất đã kiểm tra tương phản; ở P0, UI UX Pro Max sinh design system gốc và Minh biên tập lại vào chính file này (mục 20). Sau P0, mọi thay đổi token phải qua file này. |
| Phạm vi | Mọi màn của 5 vai trò: Khách, Cửa hàng, Tổ chức, Tình nguyện viên (PWA), Admin |
| Công nghệ | Tailwind CSS v4 (`@theme`) · shadcn/ui · lucide-react · Motion · sonner · TanStack Table · Recharts · MapLibre GL JS qua `react-map-gl/maplibre` |
| Liên quan | `PRD.md` (F-xx, US-xx) · `ARCHITECTURE.md` (`src/components/*`) · ADR-005 (nhãn tính lúc đọc), ADR-006 (Goong), ADR-008 (làm mờ mặt phía client) |

> **Thứ tự ưu tiên khi mâu thuẫn:** CLAUDE.md và docs dự án > skill dự án (`ui-screen`) > skill cộng đồng (frontend-design, ponytail, web-design-guidelines…). Ví dụ: ponytail không được bỏ trạng thái loading/empty/error mà tài liệu này bắt buộc; frontend-design không được thêm bảng màu thứ hai.

## Mục lục

1. Nguyên tắc thiết kế
2. Thương hiệu
3. Màu sắc
4. Chữ
5. Khoảng cách & lưới
6. Bo góc
7. Độ nổi (elevation)
8. Chuyển động
9. Biểu tượng
10. Bố cục & app shell
11. Danh mục component
12. Mẫu tương tác (patterns)
13. Bản đồ
14. Biểu đồ & trực quan hóa ESG
15. Khả năng tiếp cận — checklist
16. Hướng dẫn viết tiếng Việt
17. Responsive
18. In ấn báo cáo
19. Chế độ tối
20. Quy trình thiết kế
21. Những gì bỏ khỏi giao diện cũ
22. Nhật ký thay đổi

---

## 1. Nguyên tắc thiết kế — "Tươi – Tin cậy – Minh bạch"

| Nguyên tắc | Nghĩa là | Áp dụng cụ thể | Không làm |
|---|---|---|---|
| **Tươi** | Nhanh, nhẹ, có sức sống; thời gian là thứ quan trọng nhất của thực phẩm | Nhãn tươi và đếm ngược luôn nổi bật; hành động chính một chạm; màn nhẹ trên Android rẻ; chuyển động ngắn, có mục đích | Hiệu ứng trang trí nặng, gradient lòe loẹt, hero video, animation lặp vô tận |
| **Tin cậy** | Người dùng tin rằng hệ thống đúng và an toàn | Một bộ token duy nhất; trạng thái rõ ràng bằng chữ; xác nhận cho thao tác phá hủy; thông báo lỗi nói rõ phải làm gì; dữ liệu nhạy cảm che theo mặc định | Ba bảng màu chồng nhau; nút giả; số liệu giả; vị trí mái ấm hiển thị chính xác cho người ngoài |
| **Minh bạch** | Mọi con số có nguồn, mọi thay đổi có dấu vết | Tooltip "Cách tính" cạnh chỉ số; nhãn "Dữ liệu demo"; dòng thời gian trạng thái; ghi "AI gợi ý" khi AI điền | AI insight không nguồn; ẩn cách tính; biểu đồ không đơn vị |

**Năm luật rút ra (kiểm tra ở mọi màn):**

1. **Màu không bao giờ là tín hiệu duy nhất** — nhãn tươi, trạng thái, marker luôn kèm icon + chữ.
2. **Mỗi màn có đủ 3 trạng thái**: đang tải (skeleton đúng hình), rỗng (giải thích + CTA), lỗi (nguyên nhân + "Thử lại").
3. **Một hành động chính mỗi vùng** (nút primary duy nhất trong page header hoặc mỗi thẻ).
4. **Số đi kèm đơn vị và nguồn** (kg, suất, kg CO₂e; tooltip công thức).
5. **Riêng tư theo mặc định** — mặc định che, người dùng chủ động mở.

---

## 2. Thương hiệu

> Chốt 08/10/2026 (Minh duyệt phương án **A · Bát lá**). Thay cho wordmark chữ FOOD/SAVE của bản 1.0. Tệp gốc: `public/brand/`; component: `src/components/brand/logo.tsx` (`<Logo>`), `wordmark.tsx` (giữ tên cũ, nay vẽ logo ngang).

### 2.1 Logo "Bát lá"

**Ý nghĩa.** Chiếc bát là bữa ăn được trao; hai chiếc lá là thực phẩm được cứu và sự bền vững; chấm vàng là nắng — kế thừa chấm vàng của wordmark cũ. Chữ **Food** màu mực + **Save** màu xanh thương hiệu.

**Dựng hình** (lưới 64 × 64, tệp `foodsave-mark.svg`):

| Phần | Hình | Màu (light) |
|---|---|---|
| Nắng | Tròn r = 4,8, tâm (15,4; 8,6) — luôn cách đầu lá nhỏ ≥ 4 đơn vị (1 px ở 16 px) | `--brand-yellow` |
| Lá nhỏ | Thấu kính hai cung đối xứng, gốc (31,4; 33) → ngọn (15,2; 17,6) | `--brand-mint` |
| Lá lớn | Cùng công thức lá nhỏ, dài hơn 1,45 lần, gốc (32,6; 33) → ngọn (53,2; 9); gân `--surface` 70% | `--brand-leaf` |
| Bát | Miệng phẳng y = 34, rộng 48, lòng bát nửa elip sâu 23; vành bo tròn nhô 1,6 mỗi bên, dày 4,4 | `--primary` |

Gốc hai lá nằm sau vành bát (lá "mọc" từ bát). Trọng tâm thị giác ≈ (32; 30,4) — dùng điểm này, không phải tâm hộp 64 × 64, khi canh giữa trong icon.

**Biến thể và tệp** (`public/brand/`):

| Biến thể | Tệp | Dùng khi |
|---|---|---|
| Ký hiệu màu | `foodsave-mark.svg` | Icon ≥ 24 px, thanh bên thu gọn (`<Logo variant="mark">`) |
| Ký hiệu rút gọn | `foodsave-mark-small.svg` | 16–32 px (`src/app/icon.svg`, `favicon.ico`): lá đầy hơn, bỏ gân, vành bám lưới pixel (`simplified`) |
| Ngang | `foodsave-logo-horizontal.svg` (+ `-white`, `-mono`) | Header, thanh bên, trang xác thực, chân trang (`<Logo>` mặc định) |
| Đứng | `foodsave-logo-stacked.svg` (+ `-white`, `-mono`) | Ô vuông, màn chờ, ấn phẩm (`variant="stacked"`) |
| Trắng | `*-white.svg` | Trên nền tối `--brand-deep` hoặc ảnh đã phủ lớp màu (`tone="white"`) |
| Một màu | `*-mono.svg` | In một màu, khắc, dấu (`tone="mono"`, theo `currentColor`) |
| PNG | `public/icons/icon-192.png`, `icon-512.png` (ô xanh bo 22%), `maskable-512.png` (tràn viền, hình trong vòng an toàn 80%), `apple-touch-icon.png` + `src/app/apple-icon.png` (180, tràn viền), `badge-96.png` (bóng trắng, chỉ kênh alpha), `public/brand/email-logo.png` (344 × 88 = 2× của 172 × 44) | PWA, iOS, thông báo đẩy, email (Gmail không hiện SVG) |
| Ảnh chia sẻ | `src/app/opengraph-image.jpg` (1200 × 630) + `opengraph-image.alt.txt` | Open Graph / Twitter card |

Chữ "FoodSave" trong logo là **đường viền** của Bricolage Grotesque ExtraBold (opsz 24, kerning thật, tracking −0,012 em) — không phụ thuộc font lúc chạy. `src/components/brand/logo-paths.ts` được sinh cùng lúc với các SVG gốc (công cụ dựng: Python fontTools + Playwright, chưa đưa vào repo); đổi hình thì sinh lại cả SVG, PNG và `logo-paths.ts`, không sửa tay. Unit test `logo.test.tsx` kiểm hai bên khớp nhau.

**Khoảng trống & cỡ tối thiểu**

- Khoảng trống quanh logo ≥ **chiều cao chữ F** (≈ 0,43 chiều cao logo ngang); quanh ký hiệu ≥ ¼ cạnh.
- Logo ngang tối thiểu **88 px** rộng (màn hình) / **24 mm** (in); nhỏ hơn thì dùng ký hiệu. Ký hiệu đầy đủ ≥ 24 px; 16–23 px dùng bản rút gọn.
- Trong app: cỡ theo `font-size` của phần tử cha — `text-xl` ⇒ logo ngang cao 32 px (header, thanh bên), `text-2xl` ở trang xác thực.
- Tên truy cập luôn là **"FoodSave"** (`role="img"`); khi nằm trong link đã có `aria-label` thì dùng `decorative`.

**Không:** kéo méo, xoay, đổi màu từng phần (ngoài các biến thể trên), thêm bóng/viền/hiệu ứng, đặt bản màu lên ảnh nhiều chi tiết (dùng bản trắng trên lớp phủ `--brand-deep` ≥ 60%), đặt chữ khác trong vùng khoảng trống, dựng lại chữ bằng font chạy runtime.

**Tagline** (tùy chọn): "Cứu thực phẩm, minh bạch đến từng suất ăn." — tiêu đề landing và ảnh chia sẻ.

### 2.2 Màu thương hiệu

Màu logo và trang công khai — cố định, không đổi theo vai trò (khai báo cuối `globals.css`):

| Token | Hex | Dùng cho |
|---|---|---|
| `--primary` | `#1B6B47` | Bát, chữ "Save" |
| `--brand-leaf` | `#3FA36B` | Lá lớn, quầng sáng nền tối |
| `--brand-mint` | `#8CC9A0` | Lá nhỏ; chữ "Save", icon và điểm nhấn trên nền tối (6,6:1 trên `--brand-deep`; ở tâm quầng sáng chỉ còn 4,1:1 nên không dùng cho chữ thường đặt ở đó) |
| `--brand-yellow` | `#F5C400` | Nắng; nút chính trên nền tối (chữ `--ink`, 9,7:1); từ khóa nhấn trong tiêu đề hero (7,7:1 trên `--brand-deep`) |
| `--brand-deep` | `#0D3A26` | Mảng tối landing (hero, khối tác động, CTA cuối), lớp phủ ảnh |
| `--on-deep` / `--on-deep-muted` | `#FAF7F0` / 80% | Chữ trên mảng tối (11,9:1 / 8,2:1; tại tâm quầng sáng 7,4:1 / 5,4:1) |

Vàng thương hiệu **không** dùng trong các cổng làm việc (tránh lẫn nhãn Vàng). Trên nền tối, focus ring đổi sang `--on-deep` (`focus-visible:outline-on-deep`) vì `--focus-ring` chỉ đạt 2,1:1 trên `--brand-deep`. Quầng sáng lá giữ ở 32% để chữ phụ trên mảng tối luôn ≥ 4,5:1.

### 2.3 Giọng thương hiệu (tóm tắt — chi tiết ở mục 16)

Ấm áp, thực tế, tôn trọng. Nói về **thực phẩm và con người**, không nói về "giao dịch". Không cường điệu, không dùng giọng cứu thế.

### 2.4 Ảnh

- **Nguồn:** chỉ ảnh có giấy phép tự do rõ ràng (giấy phép Pexels/Unsplash) hoặc ảnh tự chụp của đối tác **có đồng ý bằng văn bản**. Mỗi ảnh ghi tác giả, URL gốc, giấy phép trong `public/images/credits.json`; trang `/credits` ("Nguồn ảnh", có link ở chân trang landing và trang xác thực) đọc từ tệp này. Ảnh stock ghi rõ "người trong ảnh không phải đối tác FoodSave".
- **Chọn ảnh:** bối cảnh Việt Nam/Đông Nam Á (bánh mì, cơm phần, tiệm bánh, rau chợ, trái cây, trao nhận thực phẩm); ưu tiên tay và món ăn hơn khuôn mặt; **không** trẻ vị thành niên nhận diện được, **không** logo/thương hiệu, không cảnh gây thương hại ("ban ơn").
- **Kỹ thuật:** JPEG gốc ≤ 250 KB (tổng ≤ 2,5 MB) trong `public/images`, phục vụ qua `next/image` (AVIF → WebP, cấu hình ở `next.config.ts`), `sizes` đúng bố cục. Chỉ ảnh LCP được `preload` + `fetchPriority="high"` — ở landing là **ảnh nền hero** (`trao-hop-thuc-pham`); `placeholder="blur"` chỉ cho ảnh đó (dữ liệu blur nằm trong HTML). Ảnh dưới màn đầu để mặc định `loading="lazy"`. Ảnh trang trí `alt=""`; ảnh mang nội dung có `alt` tiếng Việt mô tả (lấy từ `credits.json`). Ảnh không còn dùng thì xóa cùng mục của nó trong `credits.json` (09/10: bỏ `cho-rau-sai-gon`, `com-tam`, `trao-thanh-long`).
- **Ảnh chụp màn hình sản phẩm** (`public/images/product/`, `src/components/brand/product-shots.ts`): giao diện THẬT của FoodSave chụp từ bản chạy **local** với tài khoản/tổ chức demo (tên hư cấu, không dữ liệu người thật; mã QR/6 số là token local, vô nghĩa trên production), Playwright `deviceScaleFactor: 2` (desktop 1440 × 900, điện thoại 390 × 844), cắt + nén JPEG ≤ 180 KB (ảnh có bản đồ 4:2:0, ảnh giao diện 4:4:4). Đặt trong `LaptopFrame`/`PhoneFrame` (CSS thuần; thanh trạng thái cùng màu dòng đầu ảnh để "đảo" camera không che chữ) hoặc ô bento; `alt` mở đầu "Ảnh chụp màn hình …, dữ liệu demo" và có nhãn `ScreenshotTag` "Ảnh chụp màn hình · dữ liệu demo" — **không** dùng nhãn "Minh họa" (đây là giao diện thật). Là sản phẩm của dự án nên không vào `credits.json`; trang `/credits` có một dòng giải thích. Giao diện đổi ⇒ chụp lại: seed demo local (`node scripts/seed-demo.mjs --local --yes`), đăng nhập `giamkhao.*@foodsave.test`, đăng nhu cầu 36 ổ bánh mì để có 3 phương án.
- **Xử lý:** bo 22 px với ảnh lớn, bóng `--shadow-photo` một hướng (sáng từ trên-trái, đổ xuống-phải), nghiêng 2–5° khi xếp lớp. Chữ đặt trên ảnh phải nằm trên lớp phủ `.fs-photo-scrim` (≥ 85% `--brand-deep` ở vùng có chữ ⇒ chữ `--on-deep` ≥ 9:1).
- Ảnh minh chứng luôn qua làm mờ mặt (ADR-008), khung `aspect-[4/3]` bo `--radius-lg`. Ảnh lô tặng: `aspect-square` 64/96 px, `object-cover`, placeholder icon danh mục khi không có ảnh.

### 2.5 Trang công khai — dựng 4 lớp

Áp dụng cho landing, trang xác thực và chọn vai trò onboarding (khối dựng ở `src/components/brand/marketing.tsx`):

1. **L1 · Nền** — `.fs-stage` (lưới 40 px mờ + hai quầng sáng lá/nắng) và `.fs-grain` (hạt nhiễu 7%), thuần CSS.
2. **L2 · Ảnh** — hero: một ảnh **nền tràn viền** (`next/image fill`; desktop chiếm 70% bên phải, mobile nửa trên) dưới lớp phủ `.fs-hero-scrim` / `.fs-hero-scrim-m` — chữ chỉ nằm trên vùng ≥ 90% `--brand-deep`, tương phản đo bằng điểm ảnh thật trong `tests/e2e/public/home.spec.ts` (≥ 4,5:1) — và trôi chậm khi cuộn (`.fs-drift`). Khối khác: ảnh xếp lớp `CollagePhoto` (nghiêng, cùng hướng bóng) hoặc ảnh chụp màn hình trong `LaptopFrame`/`PhoneFrame`; parallax `.fs-parallax` trong `@supports (animation-timeline: view())`, trình duyệt khác đứng yên.
3. **L3 · Thẻ nổi** — `FloatingCard`. Thẻ **giao diện minh họa** (lô Đỏ, mã bàn giao…) **bắt buộc** có nhãn `IllustrativeTag` "Minh họa" và prop `illustrative` (`data-illustrative`; test kiểm mọi thẻ đang hiện đều có nhãn). Thẻ **số liệu** chỉ lấy từ sổ tác động thật (`/api/public-impact` ⇐ `getPublicImpact()`, loại demo), có skeleton cùng kích thước khi đang tải và trạng thái trống trung thực — không bao giờ là số tự đặt.
4. **L4 · Chuyển động** — xem §8.1.

### 2.6 Minh họa nét

`src/components/illustrations`: kho trống, chưa có yêu cầu, chưa có chuyến, không có thông báo, bản đồ trống, thành công. Nét 2,5 theo `currentColor` (mặc định `--role-accent`), mảng `--role-accent-soft`, chấm nắng `--brand-yellow`, mầm hai lá của logo; luôn `aria-hidden` (ý nghĩa nằm ở tiêu đề). Dùng qua prop `illustration` của `EmptyState` cho trạng thái rỗng lần đầu của các màn chính; trạng thái rỗng do lọc vẫn dùng icon.

---

## 3. Màu sắc

### 3.1 Kiến trúc token

Ba tầng, **chỉ tầng 2 và 3 được dùng trong component**:

1. **Primitive** — giá trị thô (hex/OKLCH) ở bảng dưới. Không dùng trực tiếp trong JSX.
2. **Semantic** — `--bg`, `--surface`, `--ink`, `--primary`, `--danger`… ánh xạ sang biến shadcn (`--background`, `--foreground`, `--primary`, `--muted`…).
3. **Component/domain** — `--label-red-bg`, `--role-accent`, `--map-route`… cho component chuyên biệt.

Tailwind v4: khai báo trong `src/app/globals.css` bằng `@theme inline` để sinh utility (`bg-surface`, `text-ink-muted`, `bg-label-red-bg`…). Cấm dùng màu Tailwind mặc định (`bg-green-500`, `text-red-600`…) trong code ứng dụng — lint rule hoặc review sẽ chặn.

### 3.2 Nền giấy ấm & mực (light)

| Token | Hex | OKLCH | Dùng cho | Tương phản |
|---|---|---|---|---|
| `--bg` (paper) | `#FAF7F0` | `oklch(97.7% 0.010 87.5)` | Nền trang | — |
| `--bg-sunken` | `#F3EEE3` | `oklch(95.0% 0.016 86.4)` | Vùng lõm: sidebar, thanh lọc, nền bảng xen kẽ | — |
| `--surface` | `#FFFDF8` | `oklch(99.4% 0.007 88.6)` | Thẻ, dialog, popover, ô nhập | — |
| `--border` | `#E6DFD0` | `oklch(90.5% 0.022 85.9)` | Đường chia, viền thẻ (trang trí) | 1,4:1 — chỉ trang trí |
| `--border-strong` | `#8E8676` | `oklch(62.2% 0.025 84.6)` | Viền ô nhập, checkbox, radio, toggle tắt | 3,55:1 trên surface ✓ (≥ 3:1) |
| `--ink` | `#13261E` | `oklch(24.9% 0.030 165.4)` | Chữ chính, tiêu đề | 15,6:1 trên surface ✓ |
| `--ink-muted` | `#4A5B53` | `oklch(45.4% 0.025 165.1)` | Chữ phụ, mô tả | 6,7:1 trên bg ✓ |
| `--ink-subtle` | `#5F7068` | `oklch(52.9% 0.024 165.4)` | Chú thích, placeholder, metadata | 4,9:1 trên bg, 4,5:1 trên sunken ✓ |
| `--ink-disabled` | `#9AA59F` | `oklch(71.1% 0.015 162.3)` | Chữ của control bị vô hiệu (được miễn AA) | — |

### 3.3 Primary (xanh lá rừng) & thương hiệu

| Token | Hex | OKLCH | Dùng cho | Tương phản |
|---|---|---|---|---|
| `--primary` | `#1B6B47` | `oklch(47.1% 0.096 159.2)` | Nút chính, link, tab đang chọn, focus vùng chọn | Chữ trắng trên primary 6,5:1 ✓ · primary trên surface 6,4:1 ✓ |
| `--primary-hover` | `#155838` | `oklch(41.0% 0.085 157.8)` | Hover nút chính | 8,5:1 ✓ |
| `--primary-active` | `#0F4A2E` | `oklch(36.4% 0.077 157.7)` | Nhấn | — |
| `--primary-soft` | `#E2F0E7` | `oklch(94.2% 0.019 157.9)` | Nền nút phụ dạng tint, hàng được chọn | primary trên soft 5,5:1 ✓ |
| `--primary-foreground` | `#FFFFFF` | — | Chữ trên primary | — |
| `--brand-yellow` | `#F5C400` | `oklch(84.0% 0.172 90.4)` | **Chỉ** chấm wordmark, điểm nhấn trang trí trên landing | Không dùng làm chữ; ink trên vàng 9,7:1 nếu cần chữ |
| `--brand-yellow-soft` | `#FFF3C4` | `oklch(96.2% 0.062 95.4)` | Nền highlight landing (không dùng trong app để tránh lẫn nhãn Vàng) | — |
| `--focus-ring` | `#1F5FBF` | `oklch(50.2% 0.164 259.0)` | Vòng focus 2 px + offset 2 px màu `--bg` | 4,8:1 trên bg ✓ |

**Vì sao focus màu xanh dương:** khác hẳn mọi màu nhãn và màu vai trò, nhìn thấy trên cả nền xanh lá, vàng, đỏ.

### 3.4 Accent theo vai trò

Accent vai trò **chỉ** dùng cho phần "khung" để người dùng biết mình đang ở cổng nào: vạch chỉ báo mục nav đang chọn, `RoleBadge`, viền avatar, minh họa trạng thái rỗng, màu marker "điểm của tôi" trên bản đồ. **Không** dùng accent vai trò cho trạng thái dữ liệu, nút chính, hay bất kỳ thứ gì đặt cạnh nhãn tươi.

| Vai trò | Token chữ/icon | Hex | Fill trang trí | Soft (nền) | Ghi chú tương phản |
|---|---|---|---|---|---|
| Cửa hàng | `--role-store` | `#047857` (emerald) `oklch(50.8% 0.105 165.6)` | `#047857` | `#E3F4EC` | Trắng trên 5,5:1 ✓ · trên soft 4,8:1 ✓ |
| Tổ chức | `--role-charity` | `#A63F29` (coral đậm) `oklch(50.6% 0.141 33.7)` | `#E0694F` (coral) | `#FCE9E3` | Chữ trên soft 5,3:1 ✓ · fill coral chỉ trang trí (3,3:1 non-text ✓); ink trên coral 4,8:1 |
| Tình nguyện viên | `--role-volunteer` | `#A15C07` (amber đậm) `oklch(54.3% 0.123 61.8)` | `#F2A93B` (amber) | `#FDF0DC` | Chữ trên soft 4,6:1 ✓ · fill amber chỉ đi với chữ `--ink` (7,9:1) |
| Admin | `--role-admin` | `#334155` (slate) `oklch(37.2% 0.039 257.3)` | `#334155` | `#E8ECF1` | Trắng trên 10,4:1 ✓ |

Trong code: layout của mỗi cổng đặt `data-role="store|charity|volunteer|admin"` trên `<body>`; CSS ánh xạ `--role-accent`, `--role-accent-fill`, `--role-accent-soft` theo `data-role`. Component chỉ dùng `--role-accent*`, không dùng thẳng `--role-charity`.

### 3.5 Màu ngữ nghĩa

| Token | Hex | Soft (nền) | Dùng cho | Tương phản |
|---|---|---|---|---|
| `--success` | `#177245` | `#E3F3EA` | Hoàn tất, đã duyệt, đã giao | 6,0:1 trên trắng · 5,2:1 trên soft ✓ |
| `--warning` | `#9A5B00` | `#FFF4DB` | Cảnh báo không khẩn (sắp hết hạn minh chứng, giờ không hợp lệ) | 5,4:1 · 5,0:1 trên soft ✓ |
| `--danger` | `#B42318` | `#FDE8E6` | Lỗi, thao tác phá hủy, từ chối | 6,6:1 · 5,6:1 trên soft ✓ · trắng trên danger 6,6:1 ✓ |
| `--info` | `#1F5FBF` | `#E6EEFB` | Thông tin, tuyến đường, liên kết phụ | 6,1:1 · 5,2:1 trên soft ✓ |

**Phân biệt với nhãn tươi:** nhãn tươi có bộ token riêng (mục 3.6) và hình dạng riêng (pill có icon nhãn). `--success` không bao giờ được dùng để vẽ nhãn Xanh; `--danger` không bao giờ được dùng để vẽ nhãn Đỏ — kể cả khi màu gần nhau — để có thể chỉnh độc lập.

### 3.6 Token nhãn tươi (Xanh / Vàng / Đỏ / Hết hạn)

Mỗi nhãn có 4 token: `solid` (marker, chấm, thanh), `bg` (nền pill), `fg` (chữ + icon trong pill), `border` (viền pill, trang trí).

| Nhãn | `--label-*-solid` | `--label-*-bg` | `--label-*-fg` | `--label-*-border` | Icon (lucide) | Kiểm tra AA |
|---|---|---|---|---|---|---|
| Xanh `green` | `#2E7D32` `oklch(52.3% 0.135 144.2)` | `#DDF3E4` | `#0F5130` | `#8CCBA3` | `Leaf` | fg/bg 8,0:1 ✓ · trắng trên solid 5,1:1 ✓ · solid trên bản đồ 4,5:1 ✓ |
| Vàng `yellow` | `#F2B90F` `oklch(81.5% 0.165 85.8)` | `#FFF0BF` | `#6B4500` | `#E2BE4A` | `Clock` | fg/bg 7,5:1 ✓ · **chữ trên solid phải là `--ink`** (8,9:1) · solid trên nền sáng chỉ 1,6:1 → marker **bắt buộc** viền `--label-yellow-fg` 2 px (4,7:1 ✓) |
| Đỏ `red` | `#C42B21` `oklch(53.7% 0.191 29.0)` | `#FDE1DC` | `#8E1B14` | `#EFA49B` | `AlarmClock` | fg/bg 7,3:1 ✓ · trắng trên solid 5,7:1 ✓ · solid trên bản đồ 4,9:1 ✓ |
| Hết hạn `expired` | `#6A6A62` `oklch(52.2% 0.012 106.8)` | `#E9E7E1` | `#45453F` | `#C4C1B8` | `CircleSlash` | fg/bg 7,8:1 ✓ · trắng trên solid 5,5:1 ✓ |

**Quy tắc bắt buộc:**

- Luôn hiển thị **icon + chữ** ("Xanh", "Vàng", "Đỏ", "Hết hạn"). Ở chỗ chật (marker, ô bảng hẹp) tối thiểu icon + `aria-label`/tooltip, và có danh sách/bảng tương đương bên cạnh.
- Thứ tự ưu tiên hiển thị luôn là Đỏ → Vàng → Xanh → Hết hạn.
- Nhãn Đỏ được phép có hiệu ứng nhấn mạnh **một lần** khi vừa chuyển Đỏ (pulse 2 nhịp, 600 ms), không lặp; tắt khi `prefers-reduced-motion`.
- Không dùng các tên "Còn hạn / Cận hạn / Sắp hết hạn" ở bất kỳ đâu.
- Primary (`#1B6B47`, hue 159°) và nhãn Xanh (`#2E7D32`, hue 144°) cố ý khác hue và độ bão hòa; ngoài ra nhãn luôn là pill có icon lá, còn primary là nút/link — không được làm nút hình pill màu nhãn.

### 3.7 Màu biểu đồ (ESG)

| Token | Light | Dark | Dùng cho |
|---|---|---|---|
| `--chart-e` | `#0F766E` (teal) | `#4FC1B5` | Nhóm **E – Môi trường** |
| `--chart-s` | `#4F46B8` (indigo) | `#9C95F0` | Nhóm **S – Xã hội** |
| `--chart-g` | `#2F5D8A` (xanh thép) | `#7FA9D6` | Nhóm **G – Quản trị** |
| `--chart-neutral` | `#8E8676` | `#5E7268` | "Khác", kỳ so sánh, đường lưới đậm |
| `--chart-seq-1…6` | `#E3F1F0` `#A9D8D3` `#6DBDB4` `#2F9C91` `#0F766E` `#0B4F4A` | đảo thứ tự trên nền tối | Thang tuần tự (heatmap kg, choropleth theo phường) |

Ba màu E/S/G đều ≥ 5:1 trên `--surface`, khác hue rõ với cả ba nhãn tươi. Chi tiết dùng ở mục 14.

### 3.8 Màu bản đồ

| Token | Giá trị | Dùng cho |
|---|---|---|
| `--map-route` | `#1F5FBF` (= info), casing trắng | Polyline tuyến được chọn (5,3:1 trên nền đất bản đồ) |
| `--map-route-alt` | `#8E8676` nét đứt | Tuyến phương án chưa chọn |
| `--map-radius-fill` | `--primary` @ 10% | Vòng bán kính phục vụ |
| `--map-radius-stroke` | `--primary` nét đứt 2 px | Viền vòng bán kính |
| `--map-approx-fill` | `--ink-subtle` @ 12% + hatch | Vùng gần đúng (`approximate`) |
| `--map-home` | `--ink` + vòng `--role-accent-fill` | Điểm của chính tổ chức/cửa hàng đang xem |
| `--map-volunteer` | `#F2A93B` + viền `--ink` | Vị trí tình nguyện viên |
| `--map-halo` | `#FFFFFF` | Viền ngoài 2 px cho mọi marker |

### 3.9 Khai báo CSS (khung, P0 hoàn thiện)

```css
/* src/app/globals.css (trích) */
@import "tailwindcss";

:root {
  --bg: #FAF7F0;            --bg-sunken: #F3EEE3;      --surface: #FFFDF8;
  --border: #E6DFD0;        --border-strong: #8E8676;
  --ink: #13261E;           --ink-muted: #4A5B53;      --ink-subtle: #5F7068;  --ink-disabled: #9AA59F;
  --primary: #1B6B47;       --primary-hover: #155838;  --primary-active: #0F4A2E;
  --primary-soft: #E2F0E7;  --primary-foreground: #FFFFFF;
  --brand-yellow: #F5C400;  --focus-ring: #1F5FBF;
  --success: #177245; --success-soft: #E3F3EA;  --warning: #9A5B00; --warning-soft: #FFF4DB;
  --danger: #B42318;  --danger-soft: #FDE8E6;   --info: #1F5FBF;    --info-soft: #E6EEFB;
  --label-green-solid: #2E7D32;  --label-green-bg: #DDF3E4;  --label-green-fg: #0F5130;  --label-green-border: #8CCBA3;
  --label-yellow-solid: #F2B90F; --label-yellow-bg: #FFF0BF; --label-yellow-fg: #6B4500; --label-yellow-border: #E2BE4A;
  --label-red-solid: #C42B21;    --label-red-bg: #FDE1DC;    --label-red-fg: #8E1B14;    --label-red-border: #EFA49B;
  --label-expired-solid: #6A6A62; --label-expired-bg: #E9E7E1; --label-expired-fg: #45453F; --label-expired-border: #C4C1B8;
  --chart-e: #0F766E; --chart-s: #4F46B8; --chart-g: #2F5D8A; --chart-neutral: #8E8676;

  /* ánh xạ sang biến shadcn/ui */
  --background: var(--bg);       --foreground: var(--ink);
  --card: var(--surface);        --card-foreground: var(--ink);
  --popover: var(--surface);     --popover-foreground: var(--ink);
  --muted: var(--bg-sunken);     --muted-foreground: var(--ink-muted);
  --accent: var(--primary-soft); --accent-foreground: var(--primary-active);
  --destructive: var(--danger);
  --input: var(--border-strong); --ring: var(--focus-ring);
  --radius: 0.625rem;
}
[data-role="store"]     { --role-accent: #047857; --role-accent-fill: #047857; --role-accent-soft: #E3F4EC; }
[data-role="charity"]   { --role-accent: #A63F29; --role-accent-fill: #E0694F; --role-accent-soft: #FCE9E3; }
[data-role="volunteer"] { --role-accent: #A15C07; --role-accent-fill: #F2A93B; --role-accent-soft: #FDF0DC; }
[data-role="admin"]     { --role-accent: #334155; --role-accent-fill: #334155; --role-accent-soft: #E8ECF1; }

@theme inline {
  --color-bg: var(--bg); --color-bg-sunken: var(--bg-sunken); --color-surface: var(--surface);
  --color-ink: var(--ink); --color-ink-muted: var(--ink-muted); --color-ink-subtle: var(--ink-subtle);
  --color-primary: var(--primary); --color-primary-soft: var(--primary-soft);
  --color-label-green: var(--label-green-solid); --color-label-green-bg: var(--label-green-bg); /* … */
  --color-role-accent: var(--role-accent); --color-role-accent-soft: var(--role-accent-soft);
  --font-sans: var(--font-be-vietnam-pro), ui-sans-serif, system-ui, sans-serif;
}
```

Mọi giá trị tương phản trong mục 3 được kiểm bằng script (`scripts/check-contrast.mjs`, P0) chạy trong CI trên các cặp token khai báo trong `design-tokens.contrast.json`. Đổi token mà làm tụt dưới ngưỡng → CI đỏ.

---

## 4. Chữ

### 4.1 Font

- **Be Vietnam Pro** (giấy phép OFL, `src/app/fonts/OFL.txt`) tự host qua `next/font/local`: **một tệp woff2 mỗi trọng lượng** 400, 500, 600, 700 (≈ 16–17 KB/tệp), gộp đúng dải unicode `latin` + `vietnamese` của Google Fonts, bỏ hinting, `display: swap` — chữ giao diện và nội dung ở mọi nơi. (Trước 09/10 dùng `next/font/google`: 8 tệp preload + 3 tệp `latin-ext` tải muộn ≈ 98 KB.) Dựng lại bằng fontTools `subset` từ `BeVietnamPro-*.ttf` của google/fonts.
- **Bricolage Grotesque** (OFL, `src/components/brand/fonts/OFL.txt`) — **chỉ** cho tiêu đề marketing: h1/h2 landing, số lớn khối tác động, h1 trang xác thực và chọn vai trò, ảnh chia sẻ; class `font-display` (token `--font-display`), luôn `font-extrabold`. Từ 09/10 là **một tệp tĩnh 17 KB** (`fonts/bricolage-grotesque-800-opsz56.woff2`: wght 800, opsz 56, wdth 100; Latin cơ bản + toàn bộ chữ tiếng Việt + dấu câu dùng trên trang; giữ kerning) thay cho bản biến thiên ≈ 120 KB (latin + latin-ext + vietnamese); đổi bộ ký tự thì dựng lại bằng fontTools `instancer` + `subset`. Khai báo ở `src/components/brand/fonts.ts` và gắn `displayFont.variable` lên phần tử gốc của các trang đó — font chỉ tải/preload ở landing, xác thực, onboarding; các cổng làm việc không tải. Logo không dùng font chạy (chữ đã chuyển thành đường viền).
- Không dùng font thứ ba. Không dùng font mono riêng; mã (mã 6 số, mã tham chiếu) dùng Be Vietnam Pro + `tabular-nums` + `letter-spacing: 0.08em`.
- **Số tabular** (`font-variant-numeric: tabular-nums`, utility `tabular-nums`) bắt buộc cho: KPI, đếm ngược, bảng số, số lượng, kg, mã 6 số, giờ.

### 4.2 Thang chữ

| Token | Cỡ / dòng (px) | Trọng lượng | Dùng cho |
|---|---|---|---|
| `display` | clamp(36, 5vw, 56) / 1,15 | 700 | Tiêu đề hero landing, số lớn bộ đếm tác động |
| `h1` | 30 / 38 (mobile 26 / 34) | 700 | Tiêu đề trang (PageHeader) |
| `h2` | 22 / 30 | 600 | Tiêu đề vùng/section |
| `h3` | 18 / 26 | 600 | Tiêu đề thẻ, dialog |
| `body-lg` | 17 / 26 | 400 | Đoạn dẫn landing, PWA tình nguyện viên |
| `body` | 15 / 24 | 400 | Văn bản mặc định trong app |
| `body-sm` | 14 / 21 | 400/500 | Bảng, metadata, nhãn form |
| `caption` | 12 / 17 | 500 | Chú thích, timestamp, chú giải biểu đồ |
| `kpi` | 32 / 38 | 700 + tabular | Số trên `KpiTile` |
| `code` | 28 / 32 | 700 + tabular, tracking 0,08em | Mã 6 số trên màn bàn giao |

- Dòng tối thiểu **1,4** cho chữ tiếng Việt (dấu chồng: "Ước", "Hướng", "Nhượng"); không giảm `line-height` dưới 1,15 kể cả tiêu đề lớn.
- Không viết hoa toàn bộ câu tiếng Việt dài; IN HOA chỉ cho nhãn ngắn ≤ 3 từ (ví dụ "GẤP") với `letter-spacing: 0.04em`.
- Độ dài dòng văn bản 60–75 ký tự (`max-w-prose`).
- Cỡ chữ tối thiểu trên mobile 14 px cho nội dung, 12 px chỉ cho caption; ô nhập trên iOS ≥ 16 px để không tự phóng to.

---

## 5. Khoảng cách & lưới

- Thang 4 px (mặc định Tailwind): `1 = 4px`. Dùng chủ yếu: 1, 2, 3, 4, 6, 8, 12, 16.
- Khoảng trong thẻ: 16 px (mobile) / 20–24 px (desktop). Khoảng giữa các thẻ: 12 px (mobile) / 16 px (desktop). Khoảng giữa section: 32 px / 48 px.
- Gutter trang: 16 px (mobile), 24 px (tablet), 32 px (desktop). Nội dung app tối đa 1280 px; trang đọc (pháp lý, phương pháp) tối đa 720 px.
- Vùng chạm tối thiểu 44 × 44 px trên mobile (nút icon dùng `size-11`), tối thiểu 24 × 24 px theo WCAG 2.5.8 ở desktop dày đặc (bảng Admin).
- Lưới dashboard: 12 cột desktop, 6 cột tablet, 1 cột mobile; KpiTile chiếm 3/12 (4 tile/hàng) desktop, 2 tile/hàng mobile.

## 6. Bo góc

| Token | Giá trị | Dùng cho |
|---|---|---|
| `--radius-sm` | 6 px | Checkbox, tag nhỏ, ô bảng có nền |
| `--radius-md` | 10 px (`--radius`) | Nút, ô nhập, select, toast |
| `--radius-lg` | 14 px | Thẻ, dialog, sheet, ảnh |
| `--radius-xl` | 20 px | Khối hero, QR panel, bottom sheet mobile (góc trên) |
| `--radius-full` | 9999 px | Pill nhãn tươi, badge trạng thái, avatar, marker |

Nút **không** dùng `radius-full` (tránh lẫn với pill nhãn và bỏ kiểu nút tròn của bản cũ).

## 7. Độ nổi (elevation)

Bóng tông ấm (đổ màu ink, không phải đen thuần), nhẹ; ưu tiên viền hơn bóng.

| Mức | Token | Giá trị (light) | Dùng cho |
|---|---|---|---|
| 0 | `--shadow-0` | none + viền `--border` | Thẻ trong trang, bảng |
| 1 | `--shadow-1` | `0 1px 2px rgb(19 38 30 / 0.06), 0 1px 1px rgb(19 38 30 / 0.04)` | Thẻ có thể bấm, thanh dính |
| 2 | `--shadow-2` | `0 4px 12px rgb(19 38 30 / 0.08), 0 2px 4px rgb(19 38 30 / 0.05)` | Popover, dropdown, thẻ lô trên bản đồ |
| 3 | `--shadow-3` | `0 12px 32px rgb(19 38 30 / 0.12), 0 4px 8px rgb(19 38 30 / 0.06)` | Dialog, sheet, trung tâm thông báo |
| 4 | `--shadow-4` | `0 20px 48px rgb(19 38 30 / 0.16)` | Toast, màn bàn giao toàn màn hình (nền tối mờ) |

Chế độ tối: bỏ bóng, thể hiện độ nổi bằng bậc nền `--surface` → `--surface-raised` + viền.

## 8. Chuyển động

| Token | Thời lượng | Easing | Dùng cho |
|---|---|---|---|
| `--dur-instant` | 100 ms | `ease-out` | Hover, đổi màu nút, checkbox |
| `--dur-fast` | 150 ms | `cubic-bezier(0.2, 0, 0, 1)` (standard) | Popover, tooltip, dropdown |
| `--dur-base` | 220 ms | standard | Dialog, sheet, accordion, tab |
| `--dur-slow` | 320 ms | `cubic-bezier(0.05, 0.7, 0.1, 1)` (emphasized-decelerate) | Bottom sheet mobile, chuyển bước wizard |
| `--dur-map` | 800 ms | MapLibre `flyTo` mặc định | Bay tới marker/điểm |

- Thư viện: Motion (`motion/react`) cho layout/presence; CSS transition cho hover/focus.
- **`prefers-reduced-motion: reduce`:** tắt mọi chuyển động không thiết yếu, thay `flyTo` bằng `jumpTo`, tắt pulse nhãn Đỏ, tắt animation đếm số (KPI hiện ngay giá trị cuối), giữ fade ≤ 100 ms.
- Đếm ngược: chữ số đổi tức thì (không lật/trượt) để không gây nhiễu.
- Không có chuyển động lặp vô hạn ngoài spinner đang tải (và spinner chỉ hiện sau 400 ms; dưới 400 ms không hiện gì để tránh nháy).
- Bộ đếm tác động trên landing: đếm lên một lần khi vào viewport (≤ 1,2 s), không lặp.

### 8.1 Chuyển động thương hiệu (trang công khai)

- **Một màn mở đầu có dàn dựng** khi tải: tiêu đề hero và ảnh nền (ứng viên LCP) **hiện ngay, không có hiệu ứng vào**; nhãn đầu, CTA, dấu tin cậy và thẻ nổi hiện dần lần lượt (`.fs-enter`, `.fs-pop`; trễ theo `--fs-delay` 0–500 ms, dài 640–700 ms, easing emphasized). CSS thuần nên chạy cả khi chưa có JS; trạng thái nghỉ luôn hiển thị đầy đủ. (`.fs-rise` vẫn còn trong CSS cho trang khác.)
- **Parallax** ảnh/thẻ theo cuộn: `.fs-parallax` (±8–28 px, theo `view()`); ảnh nền hero trôi xuống chậm `.fs-drift` (biến `--fs-drift`, theo `scroll(root)` trong 100vh đầu) còn lớp thẻ nổi trôi ngược chiều — chiều sâu 3 lớp. Chỉ `translate`, chỉ khi trình duyệt hỗ trợ scroll-driven animation.
- **Đường nối 5 bước** "Cách hoạt động" vẽ ra khi cuộn tới: `.fs-draw-x` (desktop) / `.fs-draw-y` (mobile), `scale` từ 0, `animation-range: entry 20% cover 50%`.
- **Đếm lên** số tác động: `CountUp` (IntersectionObserver + requestAnimationFrame, ghi thẳng vào DOM, không thư viện), một lần khi số vào ≥ 60% khung nhìn, ≤ 1,1 s; số thật luôn nằm trong DOM (`data-value`) cho trình đọc màn hình; số đang hiện sẵn lúc tải thì không đếm.
- Chỉ `transform`/`opacity`; **không** lặp vô hạn, không dải chữ chạy, không thẻ "trôi" liên tục. `prefers-reduced-motion: reduce` tắt toàn bộ (các lớp `.fs-*` chỉ có hiệu ứng trong `@media (prefers-reduced-motion: no-preference)`).

## 9. Biểu tượng

- **lucide-react** duy nhất. Nét 2 px (mặc định), 1,75 px cho icon ≥ 24 px. Kích thước: 16 (trong chữ/bảng), 20 (nút, nav), 24 (tiêu đề, trạng thái rỗng nhỏ), 40–48 (trạng thái rỗng).
- Icon đi kèm chữ có `aria-hidden="true"`; icon đứng một mình phải có `aria-label` hoặc `sr-only`.
- Ánh xạ miền (dùng thống nhất):

| Khái niệm | Icon |
|---|---|
| Lô tặng / Kho hàng | `Package` |
| Thêm sản phẩm | `PackagePlus` |
| Chuyển từ thiện | `HeartHandshake` |
| Nhu cầu | `HandHeart` |
| Phương án ghép | `Combine` |
| Phân bổ / Đơn hàng cần xử lý | `ClipboardList` |
| Chuyến lấy hàng | `Route` |
| Tình nguyện viên | `Bike` (xe máy/xe đạp) · `Users` (danh sách) |
| Điểm dừng / check-in | `MapPin` · `MapPinCheck` |
| Bàn giao QR | `QrCode` · quét `ScanLine` |
| Minh chứng | `Camera` · gallery `Images` |
| Làm mờ mặt | `ScanFace` · cọ `Brush` |
| ESG / tác động | `Sprout` (E) · `Users` (S) · `ShieldCheck` (G) · báo cáo `FileText` |
| Thông báo | `Bell` · GẤP `BellRing` |
| Nhãn | `Leaf` Xanh · `Clock` Vàng · `AlarmClock` Đỏ · `CircleSlash` Hết hạn |
| Đếm ngược | `Timer` |
| Khoảng cách / ETA | `Navigation` · `Clock3` |
| AI gợi ý | `Sparkles` (luôn kèm chữ "AI gợi ý") |
| Riêng tư / vị trí gần đúng | `EyeOff` · `LocateOff` |
| Cửa hàng / Tổ chức / Admin | `Store` · `Home` (tổ chức) · `ShieldHalf` |

---

## 10. Bố cục & app shell

### 10.1 Cấu trúc chung (cổng Cửa hàng, Tổ chức, Admin)

```
Desktop ≥ 1024 px                                   Mobile < 768 px
┌──────────┬───────────────────────────────────┐    ┌───────────────────────────┐
│ Sidebar  │ Topbar: tổ chức ▾ · tìm · 🔔 · avatar│    │ Topbar: logo · 🔔 · avatar │
│ (264 px, │───────────────────────────────────│    │───────────────────────────│
│ thu gọn  │ PageHeader                         │    │ PageHeader (thu gọn)      │
│ 72 px)   │  breadcrumb · H1 · mô tả · [CTA]   │    │                           │
│          │  tabs                              │    │ Nội dung                  │
│ nav theo │───────────────────────────────────│    │                           │
│ vai trò  │ Nội dung (max 1280 px)             │    │───────────────────────────│
│          │                                    │    │ Bottom tab (≤ 5 mục)      │
└──────────┴───────────────────────────────────┘    └───────────────────────────┘
```

- **Sidebar** (desktop): logo, `RoleBadge`, nhóm mục nav với icon + chữ, mục đang chọn có vạch trái 3 px `--role-accent` và nền `--role-accent-soft`; nút thu gọn (lưu lựa chọn vào `localStorage`, bọc try/catch); badge đếm (ví dụ yêu cầu chờ duyệt) dùng `--danger` cho số GẤP, `--ink` cho số thường. Tablet 768–1023 px: sidebar mặc định thu gọn 72 px.
- **Topbar:** bộ chuyển tổ chức (`OrgSwitcher`, chỉ hiện khi thuộc ≥ 2 tổ chức), chuông thông báo, menu tài khoản (Hồ sơ, Cài đặt, Đăng xuất). Tài khoản demo có thêm `DemoBanner` dính trên cùng (nền `--brand-yellow-soft`, chữ ink: "Bạn đang xem dữ liệu demo") và role switcher.
- **Bottom tab** (mobile): tối đa 5 mục; mục thứ 5 là "Thêm" mở sheet các mục còn lại. Cao 64 px + `env(safe-area-inset-bottom)`.
- **PageHeader:** breadcrumb (desktop), H1, mô tả một dòng (`--ink-muted`), vùng hành động phải (một nút primary + tối đa 2 nút phụ / menu "…"), tabs bên dưới nếu có. Mobile: CTA chính chuyển thành nút nổi cố định đáy (trên bottom tab) khi là hành động thường xuyên (ví dụ "Thêm sản phẩm").
- **Trung tâm thông báo:** desktop = popover 400 px từ chuông; mobile = sheet toàn màn hình. Nhóm "GẤP" lên đầu (nền `--danger-soft`, icon `BellRing`), sau đó theo ngày ("Hôm nay", "Hôm qua", "Trước đó"). Mỗi mục: icon loại, tiêu đề, mô tả 1 dòng, thời gian tương đối, chấm chưa đọc. Nút "Đánh dấu đã đọc tất cả", link "Cài đặt thông báo".

### 10.2 Điều hướng theo vai trò

| Cổng | Sidebar (desktop) | Bottom tab (mobile) |
|---|---|---|
| Cửa hàng | Tổng quan · Kho hàng · Tặng thực phẩm – Kết nối · Đơn hàng cần xử lý · Bàn giao · Minh chứng · ESG & báo cáo · Cài đặt hệ thống | Kho hàng · Kết nối · Đơn hàng · **Bàn giao** · Thêm |
| Tổ chức | Tổng quan · Kho tặng · Nhu cầu · Chuyến & điều phối · Bản đồ & tuyến · Tình nguyện viên · Nhận hàng · Minh chứng · ESG & báo cáo · Cài đặt tổ chức | Kho tặng · Nhu cầu · Chuyến · Minh chứng · Thêm |
| Admin | Tổng quan & KPI · Hàng đợi duyệt · Lô hàng tồn kho · Đơn hàng → Phân bổ · Chuyến · Minh chứng · Phản ánh · Bản đồ hệ thống · ESG hệ thống · Tổ chức & cửa hàng · Nhật ký hoạt động · Cấu hình · Demo | (Admin tối ưu desktop; mobile dùng sidebar dạng sheet) |

### 10.3 Shell PWA Tình nguyện viên

- Không sidebar. Topbar tối giản (tên tổ chức + trạng thái mạng). Bottom tab: **Hôm nay** · **Chuyến** · **Thông báo** · **Hồ sơ**.
- Chữ `body-lg` (17 px), nút chính cao 52 px toàn chiều rộng, hành động chính đặt trong vùng ngón cái (nửa dưới màn hình).
- `OfflineBanner` dính dưới topbar khi mất mạng. Banner "Đang chia sẻ vị trí — Dừng" (nền `--role-accent-soft`) khi F-38 hoạt động.
- Theme color PWA = `--primary`; splash nền `--bg` + logo.

### 10.4 Landing & trang công khai

**Trang tĩnh.** `/` prerender lúc build, phục vụ từ CDN (`Cache-Control: s-maxage=…`), không chờ DB. Số tác động thật lấy phía trình duyệt từ `GET /api/public-impact` (route handler động qua `connection()`; số liệu từ Data Cache thẻ `public-impact` ≤ 10 phút, bàn giao ghi sổ gọi `updateTag` ⇒ request kế tiếp có số mới; phản hồi `no-store`). Thẻ hero và khối tác động dùng chung một request (`usePublicImpact`); trạng thái ở `data-impact-state` (`loading → ready | empty | unavailable`), có skeleton cùng hình và câu `<noscript>`. Link trên landing `prefetch={false}` (không tải trước payload trang khác trong lúc tải trang).

**Nhịp khối** (xen kẽ tối/sáng có chủ đích; mã ở `src/components/brand/landing/`):

| # | Khối | Nền | Nội dung |
|---|---|---|---|
| 1 | Hero `hero.tsx` | tối, ảnh nền | Ảnh trao hộp thực phẩm làm lớp nền tràn viền + lớp phủ; trái: nhãn "Nền tảng phi lợi nhuận", h1 `font-display` "Cứu thực phẩm, **minh bạch** đến từng suất ăn." (từ nhấn vàng), một câu giá trị, CTA "Đăng ký cửa hàng" (vàng) + "Đăng ký tổ chức" (viền sáng), 3 dấu tin cậy. Thẻ nổi: mã bàn giao (minh họa, ẩn < 640 px), lô Đỏ (minh họa), sổ tác động (số thật). Dải đáy: **9 nhóm thực phẩm thật** (`food_categories`, icon lucide) — tĩnh, không chạy chữ |
| 2 | Cách hoạt động `how-it-works.tsx` | `--bg` + lưới nhạt | Dòng thời gian 5 nút số nối bằng một đường; mỗi bước cùng giải phẫu: icon · tiêu đề · mô tả · dấu vết để lại · ai làm (chip accent vai trò). Desktop vừa một khung 900 px; mobile là dòng thời gian dọc |
| 3 | Xem sản phẩm `product-showcase.tsx` | mực `--ink` + quầng lá | Ảnh chụp màn hình thật: "Phương án ghép" (laptop) + "Điểm kế tiếp" của tình nguyện viên (điện thoại) + 3 điểm tính năng |
| 4 | Nhãn tươi `labels.tsx` | `--surface` | Ảnh món ăn + thẻ minh họa + 3 quy tắc nhãn |
| 5 | Tác động `public-impact-section.tsx` | tối (`.fs-stage`) | Chữ tĩnh + `ImpactBoard` (4 số lớn, nguồn hệ số, ghi chú dữ liệu demo tách riêng) |
| 6 | Minh bạch `trust.tsx` | `--bg` | Bento ảnh chụp màn hình thật: mã bàn giao QR + 6 số (điện thoại tràn khỏi ô), chuyến có điểm dừng đánh số + bản đồ, thẻ sổ tác động; dải "Duyệt hồ sơ" + "Riêng tư theo mặc định". Không dùng ảnh chân dung |
| 7 | Dành cho ai `audiences.tsx` | `--surface` | 3 thẻ ảnh + chip vai trò, link "Tạo tài khoản cửa hàng/tổ chức" |
| 8 | CTA cuối `closing-cta.tsx` | tối, tràn viền | Tiêu đề 2 câu, hai "cửa" theo vai trò ("Tôi là cửa hàng" vàng, "Tôi là tổ chức từ thiện" viền), "Đã có tài khoản? Vào tài khoản của bạn"; ảnh bánh mì nghiêng + điện thoại (lô tặng) tràn qua mép dưới, nối thẳng chân trang — không khoảng trắng trên/dưới |

- Header (`site-chrome.tsx`) nằm trên mảng tối hero: logo trắng, mục lục "Cách hoạt động · Sản phẩm · Nhãn tươi · Tác động · Minh bạch" (≥ 1024 px), "Đăng nhập" (ghost sáng) + "Đăng ký" (viền sáng); có link "Bỏ qua tới nội dung chính".
- Tên mỗi link/CTA là **duy nhất** trên trang (E2E và trình đọc màn hình dựa vào tên): "Đăng ký cửa hàng", "Đăng ký tổ chức", "Đăng nhập" chỉ xuất hiện một lần ở hero/header — CTA cuối dùng tên khác.
- Footer: logo, Điều khoản, Chính sách bảo mật, Nguồn ảnh, ghi chú ảnh minh họa + ảnh chụp màn hình dữ liệu demo.
- Hiệu năng: chỉ ảnh nền hero preload; font hiển thị 1 tệp 17 KB; mục tiêu Lighthouse mobile ≥ 90.

---

## 11. Danh mục component

### 11.1 Nền tảng shadcn/ui (cài theo nhu cầu, tùy biến bằng token)

| Nhóm | Component | Ghi chú tùy biến |
|---|---|---|
| Hành động | `Button`, `Toggle`, `ToggleGroup`, `DropdownMenu` | Variant: `primary`, `secondary` (viền `--border-strong`), `soft` (`--primary-soft`), `ghost`, `destructive`, `link`; size `sm` 32 px, `md` 40 px, `lg` 48 px, `icon` 40/44 px; trạng thái `loading` (spinner thay icon, giữ chiều rộng, `aria-busy`) |
| Form | `Form` (react-hook-form + zod), `Input`, `Textarea`, `Select`, `Combobox` (Command), `Checkbox`, `RadioGroup`, `Switch`, `Slider`, `Calendar`/`DatePicker`, `InputOTP` | Viền `--border-strong`; lỗi viền `--danger` + icon `CircleAlert` + chữ; mô tả trường `--ink-subtle` |
| Hiển thị | `Card`, `Badge`, `Avatar`, `Separator`, `Tooltip`, `HoverCard`, `Progress`, `Skeleton`, `Table`, `Tabs`, `Accordion`, `Breadcrumb`, `ScrollArea`, `AspectRatio` | `Badge` không dùng cho nhãn tươi (dùng `FreshnessBadge`) |
| Lớp phủ | `Dialog`, `AlertDialog`, `Sheet`, `Drawer` (vaul, mobile), `Popover` | `AlertDialog` cho mọi thao tác phá hủy |
| Phản hồi | `sonner` (Toast), `Alert` | Mục 12.6 |
| Điều hướng | `Sidebar` (shadcn sidebar block), `NavigationMenu`, `Pagination`, `Command` (⌘K — tùy chọn, cắt #3) | |

### 11.2 Component miền (custom)

Vị trí: `src/components/{labels,map,qr,charts,forms,layout}` và `src/features/<domain>/components`. Mỗi component có story trên `/dev/ui` (nếu không bị cắt) hoặc test screenshot Playwright.

| Component | Mục đích | Props chính | Biến thể | Trạng thái bắt buộc | F |
|---|---|---|---|---|---|
| **`FreshnessBadge`** | Hiển thị nhãn Xanh/Vàng/Đỏ/Hết hạn | `label`, `size`, `showIcon=true`, `deadline?` | `pill` (mặc định: icon + chữ), `solid` (nền solid), `dot` (chỉ chấm + sr-only — chỉ trong bảng có cột chữ bên cạnh), `compact` | Luôn có `aria-label="Nhãn Đỏ, còn 2 giờ 14 phút"`; nhãn tính từ `freshnessLabel(deadline, perishability, now)` — **không** nhận màu từ props | F-16 |
| **`CountdownTimer`** | Đếm ngược tới `effective_deadline` | `deadline`, `format` (`long` "Còn 2 giờ 14 phút" / `short` "2:14"), `onThreshold` | `inline`, `prominent` (thẻ lô Đỏ) | Cập nhật mỗi 60 s, mỗi 1 s khi < 10 phút; `aria-live="off"` + văn bản tĩnh "Hạn hiệu lực 21:00"; khi hết → "Đã hết hạn" | F-16, F-18 |
| **`OfferCard`** | Thẻ lô tặng (kho hàng, kho tặng, bản đồ) | `offer`, `viewer` (`store`/`charity`/`admin`), `distance?`, `eta?`, `feasible?` | `list`, `map-popup`, `compact`, `selectable` | Lô không khả thi: mờ 60% + nhãn "Không kịp tới" + nút vô hiệu; hết hàng: "Đã được giữ hết"; skeleton cùng kích thước | F-18, F-21 |
| **`NeedCard`** | Thẻ nhu cầu | `need`, `progress` (giao/giữ/thiếu) | `list`, `map-popup` | Thanh tiến độ 3 lớp có chú giải chữ | F-24, F-27 |
| **`QuantityInput`** | Nhập số lượng theo đơn vị | `unit`, `max`, `step` | `stepper` (mobile), `plain` | Đơn vị không phải kg/lít → chỉ số nguyên; hiển thị "tối đa 30 ổ"; quy đổi kg ước tính ngay bên dưới | F-15, F-22 |
| **`MapView`** | Khung bản đồ chung (lazy) | `bounds`, `layers`, `onMarkerClick`, `fallback` | `split` (kèm danh sách), `full`, `mini` | Skeleton bản đồ (nền `--bg-sunken` + icon) khi tải; lỗi tile → tự chuyển OpenFreeMap + banner nhỏ; luôn có danh sách thay thế | F-31 |
| **`SiteMarker`** | Marker điểm cửa hàng/tổ chức | `kind`, `label?`, `selected`, `visibility` | `store-by-label`, `home`, `charity`, `admin-status` | Kích thước 32 px (40 px khi chọn), halo trắng, icon trong marker; focus bàn phím được; `aria-label` đầy đủ | F-21, F-67 |
| **`ClusterMarker`** | Gom marker | `count`, `maxLabel` | — | Màu theo nhãn gấp nhất trong cụm, hiển thị số | F-21 |
| **`RadiusCircle`** | Vòng bán kính phục vụ | `center`, `radiusKm` | `editable` (đi kèm `Slider` + ô số) | Ô số thay thế kéo (WCAG 2.5.7) | F-04 |
| **`LocationPicker`** | Tìm địa chỉ + ghim | `value`, `onChange`, `useCurrentLocation` | `onboarding`, `proof` (mini) | Từ chối định vị → hướng dẫn; provider lỗi → nhập tay; hiển thị phường/xã tự điền | F-05, F-44 |
| **`RouteMap`** | Tuyến + điểm dừng đánh số | `route`, `stops`, `activeStopId` | `plan` (ước tính, nét đứt), `live` (điều phối), `volunteer` (điểm kế tiếp) | Điểm dừng có trạng thái (chưa tới/đã đến/đã lấy/bỏ qua) bằng icon + chữ trong danh sách | F-33–F-35, F-72 |
| **`StopList`** | Danh sách điểm dừng song song với `RouteMap` | `stops`, `onReorder?` | `readonly`, `reorderable` (kéo thả + nút lên/xuống) | Cảnh báo trễ hạn từng điểm | F-33 |
| **`BundleCompare`** | So sánh tối đa 3 phương án ghép | `bundles`, `onSelect` | `columns` (desktop), `carousel` (mobile) | Mỗi cột: số cửa hàng, tổng/cần, km, phút, số lô Đỏ, mini `RouteMap`; phương án đề xuất có nhãn "Đề xuất"; thiếu hàng ghi "Thiếu 12" bằng `--warning` | F-25, F-34 |
| **`StatusTimeline`** | Dòng thời gian trạng thái (phân bổ, chuyến, minh chứng) | `events` | `vertical`, `compact` | Bước hiện tại nhấn mạnh; bước lỗi/hủy dùng icon + chữ, không chỉ màu | F-42, F-65 |
| **`QrHandover`** | Hiển thị QR toàn màn hình (TNV/tổ chức) | `token`, `code6`, `expiresAt` | `pickup`, `dropoff` | Nền trắng thuần, QR ≥ 260 px, viền yên tĩnh 4 module; mã 6 số cỡ `code`; Wake Lock; hết hạn → "Tạo mã mới" | F-39, F-73 |
| **`QrScanner`** | Quét QR (cửa hàng/tổ chức) | `onResult`, `onFallback` | — | Khung ngắm, bật đèn flash nếu có; từ chối camera → chuyển ngay sang `InputOTP` 6 số | F-40, F-41 |
| **`HandoverLineReconcile`** | Đối soát từng dòng | `lines`, `mode` (`pickup`/`dropoff`) | — | Mỗi dòng: tên lô, số đặt, ô số thực giao, lý do thiếu (select bắt buộc khi thiếu), từ chối vì chất lượng; tổng kg; nút xác nhận chỉ bật khi hợp lệ | F-40, F-41 |
| **`ProofUploader`** | Chọn ảnh → làm mờ → tải lên | `maxFiles=6`, `onUploaded` | — | Các bước: chọn ảnh → phát hiện mặt (tiến trình) → `BlurPreview` → tải lên; mô hình không tải được → chế độ thủ công + cảnh báo | F-44, F-45 |
| ↳ `BlurPreview` / `BeforeAfterSlider` | So sánh trước/sau | `original` (chỉ trong bộ nhớ), `blurred`, `faceCount` | — | Thanh kéo có điều khiển bàn phím; hiển thị "Đã làm mờ 5 khuôn mặt" | F-45 |
| ↳ `BlurBrush` | Cọ làm mờ thủ công | `size` | — | Hoàn tác/làm lại; cỡ cọ 3 mức | F-45 |
| **`SignedImage`** | Ảnh private qua signed URL | `bucket`, `path`, `ttl` | — | Tự xin URL mới khi hết hạn; lỗi → placeholder + "Tải lại" | F-06, F-47 |
| **`KpiTile`** | Chỉ số đơn | `label`, `value`, `unit`, `delta?`, `sparkline?`, `method?` (công thức + nguồn), `isDemo?` | `default`, `hero` (landing), `compact` | Số tabular; delta có mũi tên + chữ ("tăng 12% so với tháng trước"); `isDemo` → nhãn "Dữ liệu demo"; không dữ liệu → "—" + giải thích | F-50, F-51, F-76 |
| **`EsgReport`** | Báo cáo tháng (màn + in) | `scope` (`store`/`charity`/`system`), `month` | `screen`, `print` | Mục 18 | F-52 |
| **`EsgChart`** | Bọc Recharts theo token | `type`, `data`, `group` (`E`/`S`/`G`) | `bar`, `line`, `stacked-bar`, `donut` (giới hạn) | Có bảng dữ liệu thay thế (`<details>`) cho trình đọc màn hình | F-50–F-52 |
| **`Wizard` / `Stepper`** | Onboarding nhiều bước | `steps`, `autosave` | `vertical` (desktop), `horizontal-compact` (mobile) | `AutosaveIndicator` ("Đang lưu…", "Đã lưu nháp lúc 14:32", "Lưu thất bại — thử lại"); bước lỗi có icon; quay lại không mất dữ liệu; chặn rời trang khi đang lưu | F-03, F-04 |
| **`EmptyState`** | Trạng thái rỗng | `icon`, `title`, `description`, `action` | `page`, `section`, `inline` | Luôn có CTA hoặc hướng dẫn bước tiếp theo | F-85 |
| **`ErrorState`** | Trạng thái lỗi | `error`, `onRetry` | `page`, `section` | Thông điệp tiếng Việt + mã tham chiếu Sentry ngắn | F-85 |
| **`PageHeader`** | Đầu trang | `title`, `description`, `actions`, `tabs`, `breadcrumb` | — | — | F-85 |
| **`NotificationCenter`** / `NotificationItem` | Trung tâm thông báo | `items`, `onRead` | `popover`, `sheet` | Rỗng: "Bạn đã xem hết thông báo"; GẤP ưu tiên | F-55 |
| **`RoleBadge`** | Nhận diện cổng | `role` | — | Màu `--role-accent`, icon vai trò + chữ | F-85 |
| **`OrgSwitcher`** | Chuyển tổ chức | `orgs` | — | Chỉ hiện khi ≥ 2 | F-02 |
| **`DemoBanner`** + `RoleSwitcher` | Báo dữ liệu demo, chuyển vai trò demo | — | — | Chỉ render cho tài khoản demo (kiểm tra phía server) | F-70 |
| **`ConsentDialog`** | Xin đồng ý theo mục đích | `purpose`, `policyVersion` | `location_trip`, `proof_photo`, `terms` | Hai nút ngang hàng ("Đồng ý" / "Không đồng ý") — không dùng mẫu thiết kế ép buộc | F-07, F-32 |
| **`ConfirmDialog`** | Xác nhận phá hủy | `title`, `consequence`, `requireText?`, `requireReason?` | — | Mục 12.5 | — |
| **`DataTable`** | Bảng (TanStack Table) | `columns`, `data`, `filters` | `admin-dense`, `default` | Header dính, sắp xếp có `aria-sort`, chọn hàng, phân trang/virtualize > 200 hàng, rỗng/lỗi/skeleton | F-64, F-65 |
| **`FilterBar`** | Bộ lọc | `filters`, `syncWithUrl` | `chips` (mobile), `inline` (desktop) | Hiển thị số kết quả; "Xóa lọc" | F-21 |
| **`StatusBadge`** | Trạng thái state machine (khác nhãn tươi) | `entity`, `status` | — | Bảng ánh xạ 12.7 | — |
| **`TrustScore`** | Điểm uy tín | `score`, `history?` | `inline`, `detail` | Có giải thích cách tính | F-12 |
| **`DistanceEta`** | "3,2 km · ~14 phút xe máy" | `meters`, `seconds`, `source` (`estimate`/`directions`) | — | Ước tính ghi "~" | F-21, F-36 |
| **`AiSuggestionField`** | Trường do AI điền | `value`, `confidence?` | — | Viền trái `--info`, icon `Sparkles` + "AI gợi ý — kiểm tra lại"; biến mất khi người dùng sửa | F-81, F-82 |
| **`InstallPrompt`** / **`OfflineBanner`** | PWA | — | `android`, `ios-instructions` | Đóng được, nhớ 7 ngày | F-74 |
| **`DocumentUploader`** | Tải giấy tờ KYC | `accept`, `maxSizeMb=10` | — | Tiến trình, xem trước, xóa, ghi chú "Chỉ Admin xem được" + icon `Lock` | F-06 |

---

## 12. Mẫu tương tác (patterns)

### 12.1 Form & kiểm tra dữ liệu

- Một schema zod dùng chung client/server; lỗi server ánh xạ về đúng trường.
- Kiểm tra khi rời trường (`onBlur`) và khi gửi; không báo lỗi khi người dùng chưa gõ xong.
- Nhãn trường luôn hiển thị (không chỉ dùng placeholder). Trường bắt buộc đánh dấu "*" kèm chú thích "* là bắt buộc" đầu form; trường tùy chọn ghi "(không bắt buộc)" khi form chủ yếu là bắt buộc.
- Gửi form: nút chuyển `loading`, vô hiệu bấm lại; thành công → toast + điều hướng; thất bại → giữ dữ liệu, focus lỗi đầu tiên, `Alert` tóm tắt ở đầu form nếu ≥ 2 lỗi.

**Thông điệp kiểm tra chuẩn (dùng đúng câu chữ):**

| Tình huống | Thông điệp |
|---|---|
| Bỏ trống trường bắt buộc | "Vui lòng nhập {tên trường}." / "Vui lòng chọn {tên trường}." |
| Email sai | "Email chưa đúng định dạng, ví dụ: ten@tochuc.vn." |
| Mật khẩu ngắn | "Mật khẩu cần ít nhất 8 ký tự." |
| SĐT sai | "Số điện thoại cần 10 chữ số, bắt đầu bằng 0." |
| Số không nguyên với đơn vị đếm | "Số lượng phải là số nguyên với đơn vị {đơn vị}." |
| Vượt tối đa | "Chỉ còn {n} {đơn vị} — vui lòng nhập tối đa {n}." |
| Thời gian không hợp lệ | "Giờ kết thúc phải sau giờ bắt đầu." / "Khung giờ lấy phải kết thúc trước {giờ} (giờ đóng cửa)." |
| Ngày quá khứ | "Vui lòng chọn thời điểm trong tương lai." |
| File quá lớn / sai định dạng | "Tệp lớn hơn 10 MB. Vui lòng chọn tệp nhỏ hơn." / "Chỉ nhận ảnh JPG, PNG, WebP hoặc PDF." |
| Chưa tick cam kết | "Vui lòng xác nhận cam kết an toàn thực phẩm trước khi đăng." |
| OTP sai | "Mã chưa đúng. Bạn còn {n} lần thử." |
| Mất mạng khi gửi | "Không có kết nối mạng. Dữ liệu của bạn vẫn còn — hãy thử lại khi có mạng." |
| Lỗi máy chủ | "Đã có lỗi phía FoodSave. Vui lòng thử lại; nếu vẫn lỗi, gửi mã {ref} cho chúng tôi." |
| Xung đột đồng thời | "Lô này vừa được tổ chức khác giữ. Còn {n} {đơn vị} — bạn có muốn nhận {n}?" |

### 12.2 Bảng

- Desktop: `DataTable`, header dính, cột số canh phải + `tabular-nums`, cột nhãn dùng `FreshnessBadge` `compact`. Mobile: chuyển thành danh sách thẻ (không cuộn ngang bảng rộng, trừ bảng Admin có cột cố định đầu).
- Mặc định sắp xếp có ý nghĩa nghiệp vụ (Đỏ trước, chờ lâu trước); trạng thái sắp xếp thể hiện bằng icon + `aria-sort`.
- Hành động hàng: tối đa 1 nút hiện + menu "…".
- Tự làm mới (Admin): chỉ báo "Cập nhật lúc hh:mm:ss" + nút làm mới thủ công; hàng mới chèn có highlight `--primary-soft` mờ dần 2 s (tắt khi reduced-motion).

### 12.3 Bộ lọc

- Đồng bộ với URL (`?label=red,yellow&maxKm=3`) để chia sẻ và giữ khi quay lại.
- Hiển thị bộ lọc đang áp dạng chip có nút xóa; "Xóa tất cả lọc".
- Bộ lọc nhãn dùng chính `FreshnessBadge` làm chip chọn (icon + chữ).

### 12.4 Rỗng / Đang tải / Lỗi

| Trạng thái | Quy tắc | Ví dụ |
|---|---|---|
| Đang tải | Skeleton đúng hình bố cục cuối; không spinner toàn trang; spinner trong nút chỉ sau 400 ms | Kho tặng: 4 skeleton thẻ + khung bản đồ |
| Rỗng lần đầu | Minh họa nhỏ (icon 48 px màu `--role-accent`), tiêu đề, một câu hướng dẫn, CTA | "Chưa có lô nào. Đăng lô đầu tiên để các tổ chức gần bạn nhận được." [Thêm sản phẩm] |
| Rỗng do lọc | Giải thích + "Xóa lọc" | "Không có lô Đỏ trong 3 km. Thử mở rộng khoảng cách." |
| Lỗi | Nguyên nhân dễ hiểu + "Thử lại" + mã tham chiếu | "Không tải được bản đồ. Danh sách vẫn dùng được bình thường." |
| Không có quyền | Giải thích + liên hệ | "Tài khoản nhân viên không xem được mục này. Liên hệ chủ cửa hàng." |
| Ngoại tuyến | Banner + dữ liệu cũ đánh dấu thời gian | "Đang ngoại tuyến — dữ liệu cập nhật lúc 07:42." |

### 12.5 Xác nhận thao tác phá hủy / không hoàn tác

- Dùng `AlertDialog`; tiêu đề là câu hỏi cụ thể; thân mô tả **hệ quả** ("3 tổ chức đang giữ hàng sẽ được thông báo. Điểm uy tín của cửa hàng sẽ bị trừ."); nút xác nhận dùng variant `destructive` với động từ cụ thể ("Hủy lô", không phải "OK"); nút hủy "Quay lại" là focus mặc định.
- Bắt buộc lý do (select + ô "Khác") cho: hủy sau xác nhận, từ chối yêu cầu, từ chối hồ sơ, tạm khóa tổ chức, minh chứng cần sửa/từ chối.
- Bắt buộc gõ xác nhận cho: Reset demo (gõ "RESET"), tạm khóa tổ chức (gõ tên tổ chức).
- Thao tác có thể hoàn tác ngắn hạn (đánh dấu "Đã đóng gói", đánh dấu đã đọc) dùng toast có nút "Hoàn tác" (5 s) thay cho dialog.

### 12.6 Toast (sonner)

- Vị trí: dưới giữa (mobile, phía trên bottom tab), dưới phải (desktop). Tối đa 3 toast cùng lúc.
- Loại: `success` (3 s), `info` (4 s), `warning` (6 s), `error` (không tự đóng nếu cần hành động). Luôn có icon + chữ.
- Không dùng toast cho lỗi kiểm tra form (lỗi nằm tại trường) hay cho thông tin cần giữ lại (dùng `Alert`).
- Toast thành công dùng câu cụ thể: "Đã chuyển lô cho 6 tổ chức gần bạn", không "Thành công!".

### 12.7 Trạng thái (StatusBadge) — tách biệt với nhãn tươi

Badge trạng thái dùng nền soft trung tính/ngữ nghĩa, icon nhỏ, chữ tiếng Việt; **không** dùng token nhãn tươi.

| Thực thể | Trạng thái (code → chữ) | Tông |
|---|---|---|
| `offers` | draft → "Nháp" · open → "Đang mở" · fully_allocated → "Đã giữ hết" · completed → "Đã xong" · expired → "Hết hạn" · cancelled → "Đã hủy" | neutral · info · info · success · neutral · neutral |
| `allocations` | requested → "Chờ cửa hàng" · confirmed → "Đã xác nhận" · assigned → "Đã phân công" · picked_up → "Đã lấy hàng" · delivered → "Đã giao" · cancelled → "Đã hủy" · rejected → "Bị từ chối" · expired → "Hết hạn giữ chỗ" | warning · info · info · info · success · neutral · danger · neutral |
| `needs` | open → "Đang tìm" · partially_matched → "Đã ghép một phần" · matched → "Đã ghép đủ" · fulfilled → "Đã nhận đủ" · closed_partial → "Đóng (một phần)" · expired → "Hết hạn" · cancelled → "Đã hủy" | info · warning · info · success · neutral · neutral · neutral |
| `need_bundles` | proposed → "Đề xuất" · partially_confirmed → "Xác nhận một phần" · confirmed → "Đã xác nhận" · cancelled → "Đã hủy" | neutral · warning · success · neutral |
| `proofs` | submitted → "Chờ duyệt" · approved → "Hợp lệ" · needs_changes → "Cần sửa" · rejected → "Bị từ chối" | warning · success · warning · danger |
| `organizations` | draft → "Nháp" · submitted → "Chờ duyệt" · needs_changes → "Cần bổ sung" · approved → "Đã duyệt" · rejected → "Bị từ chối" · suspended → "Tạm khóa" · closed → "Đã đóng" | neutral · warning · warning · success · danger · danger · neutral |

Tên enum chính xác theo `DATA-MODEL.md`; nếu DATA-MODEL khác, cập nhật bảng này cùng PR.

### 12.8 Thời gian & số trong giao diện

- Thời gian tuyệt đối cho hạn: "21:00 hôm nay", "08:30 thứ Bảy, 15/11".
- Thời gian tương đối cho hoạt động: "vừa xong", "5 phút trước", "hôm qua lúc 19:20"; quá 7 ngày dùng ngày đầy đủ.
- Đếm ngược: "Còn 2 giờ 14 phút" (> 1 giờ), "Còn 38 phút", "Còn 4 phút 12 giây" (< 10 phút).

---

## 13. Bản đồ

### 13.1 Nền

- Tile **Goong** (nhãn tiếng Việt, thể hiện đúng Hoàng Sa – Trường Sa); dự phòng **OpenFreeMap**. Style nền giữ tông nhạt; không đổi màu nền bản đồ thành màu thương hiệu. Attribution luôn hiển thị (góc dưới phải, chữ `caption`).
- `react-map-gl/maplibre`, import động; trên mobile bản đồ chiếm toàn chiều rộng, chiều cao tối thiểu 280 px (split) hoặc toàn màn (chế độ bản đồ).
- Điều khiển: zoom +/− (44 px), "Về vị trí của tôi", "Vừa khung"; tắt xoay/nghiêng mặc định (dễ dùng trên mobile).

### 13.2 Marker

| Loại | Hình | Màu | Nội dung |
|---|---|---|---|
| Cửa hàng có lô (kho tặng) | Tròn 32 px, halo trắng 2 px | `--label-{nhãn gấp nhất}-solid`; Vàng thêm viền `--label-yellow-fg` | Icon nhãn trắng (Vàng: icon ink) + số lô nếu > 1 |
| Điểm của tôi (tổ chức/cửa hàng) | Giọt nước 36 px | `--ink` + vòng `--role-accent-fill` | Icon `Home`/`Store` |
| Nhu cầu (màn cửa hàng) | Tròn 32 px | `--surface` + viền `--role-charity` 2 px | Icon `HandHeart` |
| Điểm dừng tuyến | Tròn 28 px | `--surface` + viền `--map-route` 3 px | Số thứ tự đậm; đã lấy → nền `--success` + `Check` |
| Tình nguyện viên | Tròn 20 px | `--map-volunteer` + viền `--ink` | — ; nhãn "cập nhật x phút trước" |
| Điểm Admin theo trạng thái duyệt | Tròn 24 px | Chờ duyệt: viền `--warning`, nền surface · Đã duyệt: `--success` · Tạm khóa: `--danger` với icon | Icon `Store`/`Home` |

Marker là phần tử có thể focus (`button` trong `Marker`), `aria-label` đầy đủ ("Tiệm bánh Hạt Lúa, 2 lô, gấp nhất: Đỏ, còn 1 giờ 20 phút, cách 2,4 km"). Chọn marker → làm nổi thẻ tương ứng trong danh sách và ngược lại.

### 13.3 Cluster

- Dùng source GeoJSON `cluster: true` của MapLibre với `clusterProperties` đếm số lô theo nhãn; màu cụm = nhãn gấp nhất có trong cụm; kích thước theo số điểm (32/40/48 px); chữ số tabular.
- Bấm cụm → zoom vào (`getClusterExpansionZoom`).

### 13.4 Vòng bán kính, vùng gần đúng, ẩn

- Bán kính: turf `circle` 64 bước, fill `--primary` 10%, viền nét đứt 2 px `--primary`; nhãn "5 km" trên viền.
- `approximate`: vòng ≥ 500 m, tâm lệch ngẫu nhiên **ổn định** (tính phía server từ id), fill `--ink-subtle` 12% + hoa văn gạch chéo, viền nét đứt; tooltip "Vị trí gần đúng để bảo vệ tổ chức".
- `hidden`: không vẽ hình; danh sách hiển thị "Phường Chánh Hưng · vị trí được ẩn" + icon `EyeOff`.

### 13.5 Tuyến

- Tuyến được chọn: line `--map-route` 5 px, casing trắng 8 px, đầu/cuối tròn; mũi tên hướng mỗi 120 px ở zoom ≥ 14.
- Phương án chưa chọn: `--map-route-alt` 3 px nét đứt, opacity 0,7. Tuyến ước tính (chưa gọi Directions) luôn nét đứt kèm chú thích "Tuyến ước tính".
- Tổng km + thời gian hiển thị trong `BundleCompare`/`StopList`, không chồng lên bản đồ.

### 13.6 Heatmap & bản đồ công khai

- Admin heatmap kg theo phường: choropleth dùng `--chart-seq-1…6` (teal), có chú giải thang và đơn vị; **không** dùng xanh/vàng/đỏ (tránh lẫn nhãn).
- Bản đồ công khai: lưới 500 m (hình vuông/hex) tô theo thang teal; ô < 3 sự kiện gộp lên phường; không marker điểm; chú giải "Mỗi ô ~500 m · số lần bàn giao".

### 13.7 Khả năng tiếp cận bản đồ

- Bản đồ không phải cách duy nhất: mọi màn bản đồ có danh sách tương đương (split view hoặc tab "Danh sách").
- Phím: Tab đi qua marker theo thứ tự danh sách; Enter mở thẻ; Esc đóng thẻ; +/− zoom khi bản đồ có focus.
- Vùng bản đồ có `role="region"` + `aria-label` ("Bản đồ kho tặng, 12 cửa hàng").

---

## 14. Biểu đồ & trực quan hóa ESG

Trước khi dựng biểu đồ, đọc skill **dataviz** (built-in) — tài liệu này là lớp áp dụng riêng cho FoodSave.

### 14.1 Chọn loại biểu đồ

| Chỉ số | Loại | Ghi chú |
|---|---|---|
| kg cứu được theo tháng | Cột (bar) 6–12 tháng | Màu `--chart-e`; tháng hiện tại có nhãn "đang diễn ra" |
| CO₂e, nước | KpiTile + sparkline | Đơn vị đầy đủ "kg CO₂e", "lít"; nhãn chỉ số nước: "Nước tưới tránh lãng phí (ước tính)" |
| Suất ăn, số người hỗ trợ | KpiTile + cột | `--chart-s` |
| Kg theo danh mục | Cột ngang xếp hạng | Một màu `--chart-e`, không cầu vồng; ≤ 8 danh mục + "Khác" (`--chart-neutral`) |
| Tỷ lệ % (lô có minh chứng hợp lệ, nhu cầu đáp ứng đủ, hết hạn chưa nhận, phản ánh đã xử lý) | Thanh tiến độ / bullet (giá trị + mục tiêu) | Không dùng donut cho một tỷ lệ đơn |
| Thời gian (đăng minh chứng, duyệt hồ sơ) | KpiTile + line trung bình theo tuần | `--chart-g` |
| Phân bố theo phường | Choropleth/heatmap (mục 13.6) hoặc cột ngang | Thang teal |
| Kg theo nhãn lúc đăng (Admin) | Cột xếp chồng | **Ngoại lệ duy nhất** được dùng token nhãn, kèm chú giải chữ "Xanh/Vàng/Đỏ" — vì dữ liệu chính là nhãn |

Tránh: biểu đồ 3D, donut nhiều lát, trục kép, cầu vồng, biểu đồ không có đơn vị/nguồn.

### 14.2 Quy tắc màu

- E = teal, S = indigo, G = xanh thép (mục 3.7). Nhóm luôn có chữ "E – Môi trường", "S – Xã hội", "G – Quản trị" + icon `Sprout`/`Users`/`ShieldCheck`.
- Không dùng xanh lá/vàng/đỏ của nhãn tươi cho dữ liệu không phải nhãn; không dùng `--success`/`--danger` để tô "tốt/xấu" — thay bằng chữ + mũi tên ("giảm 3 điểm %, tốt hơn").
- So sánh kỳ trước dùng `--chart-neutral` nhạt.

### 14.3 Trình bày

- Trục và lưới `--border`; nhãn trục `caption` `--ink-subtle`; số định dạng vi-VN; trục y bắt đầu từ 0 cho cột.
- Ghi chú nguồn dưới mỗi biểu đồ: "Nguồn: sổ tác động FoodSave · Hệ số CO₂e 2,0 kg/kg (FAO 2013, v1)". Biểu đồ nước: "Nguồn: sổ tác động FoodSave · Nước tưới 150 L/kg, chỉ nước xanh lam (FAO 2013, v1)".
- Tooltip: giá trị + đơn vị + kỳ; truy cập được bằng bàn phím; mỗi biểu đồ có `<details>` "Xem bảng số liệu".
- Dữ liệu demo: watermark chữ "Dữ liệu demo" góc trên phải biểu đồ.
- Recharts: `isAnimationActive` tắt khi reduced-motion và khi in.

---

## 15. Khả năng tiếp cận — checklist (WCAG 2.2 AA)

Skill `ui-screen` chạy checklist này cho mỗi màn trước khi chốt; Playwright + axe tự động ở CI.

- [ ] Tương phản chữ ≥ 4,5:1 (chữ ≥ 24 px hoặc ≥ 19 px đậm: ≥ 3:1); thành phần UI và biểu tượng thông tin ≥ 3:1 — chỉ dùng cặp token đã kiểm ở mục 3.
- [ ] Không có thông tin chỉ truyền bằng màu (nhãn, trạng thái, marker, biểu đồ).
- [ ] Focus nhìn thấy (`--focus-ring` 2 px + offset 2 px), không bị header dính/bottom tab che (2.4.11).
- [ ] Thứ tự Tab hợp lý; có "Bỏ qua tới nội dung chính"; dialog bẫy focus và trả focus khi đóng.
- [ ] Vùng chạm ≥ 24 × 24 px (2.5.8), khuyến nghị 44 × 44 px trên mobile.
- [ ] Mọi thao tác kéo có cách thay thế không kéo (2.5.7): ghim bản đồ (ô địa chỉ), bán kính (ô số), sắp xếp điểm dừng (nút lên/xuống), so sánh trước/sau (phím mũi tên).
- [ ] Form: nhãn liên kết, lỗi gắn `aria-describedby` + `aria-invalid`, không chỉ dựa vào placeholder, autocomplete đúng (`email`, `tel`, `street-address`, `one-time-code`).
- [ ] Không yêu cầu nhập lại thông tin đã cung cấp trong cùng luồng (3.3.7); xác thực không bắt giải đố nhận thức (3.3.8) — OTP cho phép dán.
- [ ] Trợ giúp nhất quán: link "Trợ giúp/Liên hệ" ở cùng vị trí mọi trang (3.2.6).
- [ ] Ảnh có `alt` mô tả (ảnh minh chứng: dùng mô tả của tổ chức; ảnh trang trí `alt=""`).
- [ ] Nội dung động: toast `role="status"`, lỗi nghiêm trọng `role="alert"`, đếm ngược không đọc liên tục.
- [ ] Phóng to 200% và reflow ở 320 px không mất nội dung/không cuộn ngang (trừ bảng dữ liệu, bản đồ).
- [ ] `prefers-reduced-motion` được tôn trọng.
- [ ] `lang="vi"` trên `<html>`; tên trang (`<title>`) duy nhất, mô tả trang hiện tại.
- [ ] Kiểm tay: bàn phím toàn luồng chính; TalkBack (Android) cho PWA TNV; VoiceOver (macOS/iOS) cho landing — trước M3.

---

## 16. Hướng dẫn viết tiếng Việt

### 16.1 Giọng điệu

- **Ấm áp, rõ ràng, tôn trọng, ngắn.** Câu chủ động, động từ đầu nút ("Đăng lô", "Chọn phương án này", "Xác nhận đã nhận").
- Nói lợi ích bằng con người và thực phẩm ("45 suất ăn cho trẻ"), không bằng thuật ngữ hệ thống ("allocation delivered").
- Không cường điệu, không dùng từ cứu thế/ban ơn ("bố thí", "người nghèo khổ"); gọi người được hỗ trợ là "người được hỗ trợ", "các em", "các cụ" tùy ngữ cảnh tổ chức.
- Không đổ lỗi người dùng trong thông báo lỗi ("Bạn nhập sai" → "Mã chưa đúng").

### 16.2 Xưng hô

- Gọi người dùng là **"bạn"**; hệ thống tự xưng **"FoodSave"** (không "chúng tôi" trong UI giao dịch; được dùng "chúng tôi" ở trang pháp lý/landing).
- Khi nói về tổ chức/cửa hàng của người dùng: "tổ chức của bạn", "cửa hàng của bạn".
- Không dùng "quý khách", "khách hàng", "người mua", "đơn mua".

### 16.3 Từ vựng chuẩn

| Dùng | Không dùng |
|---|---|
| Lô tặng, lô | Sản phẩm bán, hàng khuyến mãi (riêng nút "Thêm sản phẩm" giữ theo tài liệu nhóm) |
| Chuyển từ thiện | Bán, thanh lý |
| Nhu cầu | Đơn đặt hàng |
| Phương án ghép | Combo, gói |
| Đơn hàng cần xử lý (cửa hàng), Phân bổ (Admin) | Đơn mua, hóa đơn |
| Chuyến lấy hàng, điểm dừng | Ship, giao hàng (cho chiều lấy) |
| Bàn giao, mã bàn giao | Thanh toán, check-out |
| Minh chứng | Bằng chứng, báo cáo ảnh |
| Nhãn Xanh / Vàng / Đỏ / Hết hạn | Còn hạn / Cận hạn / Sắp hết hạn; màu xanh lá/cam |
| Hạn hiệu lực | Deadline |
| Tình nguyện viên (TNV chỉ dùng chỗ chật) | Shipper |
| Tổ chức | Charity (trong UI) |
| Cửa hàng | Partner, đối tác bán hàng (trong UI) |
| Kho tặng | Donation box (trong UI; tên gốc giữ trong tài liệu truy vết) |
| Tác động, sổ tác động | Eco point, điểm thưởng |

### 16.4 Định dạng (vi-VN, `Asia/Ho_Chi_Minh`)

| Loại | Định dạng | Ví dụ | Cài đặt |
|---|---|---|---|
| Số nguyên | Dấu chấm phân cách nghìn | 1.234 | `Intl.NumberFormat('vi-VN')` |
| Số thập phân | Dấu phẩy thập phân, tối đa 1 chữ số cho kg hiển thị | 12,5 | `maximumFractionDigits: 1` |
| Khối lượng | số + khoảng trắng + đơn vị | 12,5 kg · 850 g (< 1 kg) | helper `formatKg` |
| CO₂e | | 25 kg CO₂e · 1,2 tấn CO₂e (≥ 1.000 kg) | `formatCo2e` |
| Nước | số nguyên lít; ≥ 1.000 lít hiện m³, 1 chữ số | 150 lít · 1,9 m³ (≥ 1.000 lít) | |
| Suất ăn, người | số nguyên | 36 suất · 45 người | làm tròn xuống, ghi "tương đương" |
| Phần trăm | khoảng trắng hẹp không bắt buộc | 82% · 82,5% | `style: 'percent'` |
| Tiền (chỉ trang pitch/pháp lý, không có trong app) | | 75.000.000 đ | `currency: 'VND'` |
| Ngày | dd/mm/yyyy | 07/10/2026 | `Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })` |
| Giờ | 24 giờ HH:mm | 19:30 | |
| Ngày + thứ | | Thứ Bảy, 15/11/2026 | |
| Khoảng cách | < 1 km dùng m (làm tròn 10 m) | 850 m · 3,2 km | `formatDistance` |
| Thời lượng | | 14 phút · 1 giờ 20 phút | `formatDuration` |
| SĐT | nhóm 4-3-3 | 0901 234 567 | |
| Địa chỉ | số nhà, đường, phường/xã, tỉnh/thành (2 cấp từ 01/7/2025, không có quận/huyện) | 45 Nguyễn Huệ, Phường Sài Gòn, TP.HCM | Theo kết quả geocode, cho sửa |
| Mã 6 số | nhóm 3-3 | 482 913 | |

Mọi hàm định dạng nằm trong `src/lib/format.ts`, có unit test; **không** gọi `toLocaleString()` rời rạc trong component. Server (Vercel chạy UTC) luôn truyền `timeZone: 'Asia/Ho_Chi_Minh'`.

### 16.5 Mẫu câu

| Ngữ cảnh | Mẫu |
|---|---|
| Rỗng — kho hàng | "Chưa có lô nào. Đăng lô đầu tiên để các tổ chức gần bạn nhận được." |
| Rỗng — kho tặng | "Chưa có lô phù hợp trong bán kính 5 km. FoodSave sẽ báo bạn ngay khi có." |
| Thành công — chuyển từ thiện | "Đã chuyển lô cho {n} tổ chức gần bạn." |
| Thành công — bàn giao | "Đã bàn giao 18 ổ bánh mì cho Mái ấm Nắng Mai lúc 19:42." |
| Cảnh báo — lô Đỏ | "Lô này cần được lấy trước 21:00. Chỉ nhận nếu bạn đến kịp." |
| Không khả thi | "Không kịp tới: cần khoảng 66 phút, lô còn 40 phút." |
| Thông báo GẤP | "GẤP · Tiệm bánh Hạt Lúa có 30 ổ bánh mì (Đỏ), cách 2,4 km, cần lấy trước 21:00." |
| Nhắc minh chứng | "Còn 12 giờ để đăng minh chứng cho chuyến nhận 50 bánh ngày 15/11." |
| Riêng tư | "Ảnh được làm mờ khuôn mặt ngay trên điện thoại. Ảnh gốc không được tải lên." |
| AI | "AI gợi ý — vui lòng kiểm tra lại trước khi đăng." |
| Dữ liệu demo | "Dữ liệu demo — số liệu minh họa, không phải hoạt động thật." |

---

## 17. Responsive

| Breakpoint (Tailwind) | Khoảng | Bố cục |
|---|---|---|
| (mặc định) | 360–639 px | 1 cột; bottom tab; bản đồ/danh sách chuyển qua tab; bảng → thẻ; dialog → bottom sheet (`Drawer`) |
| `sm` | ≥ 640 px | 1–2 cột thẻ; form 1 cột rộng hơn |
| `md` | ≥ 768 px | Tablet: sidebar thu gọn 72 px; bảng hiện; split view bản đồ dọc (bản đồ trên 45%, danh sách dưới) |
| `lg` | ≥ 1024 px | Sidebar đầy đủ; split view ngang (danh sách 40% · bản đồ 60%); dashboard 12 cột |
| `xl` | ≥ 1280 px | Nội dung tối đa 1280 px canh giữa; `BundleCompare` 3 cột |
| `2xl` | ≥ 1536 px | Không mở rộng thêm nội dung; tăng khoảng trắng |

- Kiểm tra bắt buộc ở 360, 390, 768, 1024, 1440 px (screenshot Playwright).
- Không cuộn ngang trang ở 360 px. Ô nhập ≥ 16 px trên iOS. Tôn trọng safe-area (notch, thanh home).
- Màn bàn giao (QR/quét) luôn toàn màn hình trên mọi kích thước.

---

## 18. In ấn báo cáo ESG (print CSS)

Báo cáo tháng (F-52) và biên bản bàn giao (F-43) in bằng trình duyệt ("In / Lưu PDF"); react-pdf là tùy chọn (cắt #4).

```css
@media print {
  @page { size: A4; margin: 16mm 14mm 18mm; }
  html { font-size: 11pt; }
  body { background: #fff; color: #000; }
  [data-print="hide"], nav, aside, header[data-app], .toaster { display: none !important; }
  .report-section, table, figure, .kpi-grid { break-inside: avoid; }
  h2 { break-after: avoid; }
  a[href^="http"]::after { content: " (" attr(href) ")"; font-size: 9pt; color: #444; }
  * { box-shadow: none !important; animation: none !important; transition: none !important; }
  .chart svg { max-width: 100%; }
  thead { display: table-header-group; } /* lặp header bảng mỗi trang */
}
```

- Bố cục báo cáo: trang bìa ngắn (logo, tên đơn vị, kỳ báo cáo, ngày xuất) → tóm tắt KPI (lưới 2 × 3) → E/S/G mỗi nhóm một section có biểu đồ SVG → danh sách bàn giao (bảng) → minh chứng tiêu biểu (≤ 6 ảnh đã duyệt, tổ chức) → nhà tài trợ đồng hành (tổ chức) → phương pháp & nguồn (phiên bản hệ số) → chân trang: "Tạo tự động bởi FoodSave · {URL xác minh} · trang x/y" (số trang khi trình duyệt hỗ trợ; nếu không thì bỏ).
- Màu in: giữ màu E/S/G, nhưng S (indigo, L≈47%) và G (xanh thép, L≈47%) gần như cùng độ sáng nên **in đen trắng không phân biệt được** → mỗi biểu đồ chỉ vẽ một nhóm, hoặc ghi nhãn chữ trực tiếp trên cột/đường; không dựa vào chú giải màu.
- Ảnh in ≤ 6 cm cao, `print-color-adjust: exact` chỉ cho biểu đồ và nhãn.
- Kiểm tra in trên Chrome và Edge (Lưu PDF), khổ A4 dọc.

---

## 19. Chế độ tối (tùy chọn — danh sách cắt #3)

Token đã định nghĩa để chuyển đổi rẻ; chỉ bật khi không bị cắt. Kích hoạt bằng `class="dark"` (next-themes), mặc định theo hệ thống. PWA và bản in luôn có thể ép sáng.

| Token | Dark | Ghi chú tương phản |
|---|---|---|
| `--bg` | `#0E1914` | — |
| `--bg-sunken` | `#0A130F` | — |
| `--surface` | `#15221C` | — |
| `--surface-raised` | `#1C2B24` | thay cho bóng |
| `--border` / `--border-strong` | `#2D3E36` / `#5E7268` | border-strong 3,2:1 trên surface ✓ |
| `--ink` / `--ink-muted` / `--ink-subtle` | `#E9F1EC` / `#A7B8AE` / `#8A9C92` | 15,6 / 8,7 / 6,2:1 ✓ |
| `--primary` / hover / foreground / soft | `#5BC48E` / `#74D3A2` / `#06140D` / `#173A2A` | primary trên bg 8,3:1; chữ tối trên primary 8,7:1 ✓ |
| Vai trò | store `#4ED1A1` · charity `#FF9A80` · volunteer `#F7B955` · admin `#AFC0D6` | ≥ 8:1 trên surface ✓ |
| Ngữ nghĩa | success `#6FD39B` · warning `#F5B84A` · danger `#FF8A7E` · info `#8DB4FF` | ≥ 7:1 trên surface ✓ |
| Nhãn Xanh | solid `#2FA163` · bg `#123A24` · fg `#9BE3B4` | fg/bg 8,5:1 ✓; chữ trên solid dùng `--bg` (5,5:1) |
| Nhãn Vàng | solid `#F2B90F` · bg `#3D2E06` · fg `#FFD66B` | fg/bg 9,5:1 ✓ |
| Nhãn Đỏ | solid `#E5483C` · bg `#4A1512` · fg `#FFADA3` | fg/bg 8,4:1 ✓; chữ trên solid dùng `--bg` (4,6:1) |
| Hết hạn | solid `#8A8A80` · bg `#2E2E2A` · fg `#C9C7BF` | fg/bg 8,1:1 ✓ |
| Biểu đồ E/S/G | `#4FC1B5` / `#9C95F0` / `#7FA9D6` | ≥ 6:1 trên surface ✓ |
| Focus | `#7AA7FF` | 7,5:1 ✓ |

Bản đồ ở chế độ tối dùng style tối của Goong nếu có; nếu không, giữ style sáng trong khung bo góc (không đảo màu tile).

---

## 20. Quy trình thiết kế

```
P0  UI UX Pro Max ──► design-system/foodsave/MASTER.md + pages/*.md (bản sinh tự động)
        │  prompt: "nền tảng phi lợi nhuận điều phối thực phẩm" · Next.js + shadcn · Be Vietnam Pro
        ▼
P0  Minh biên tập ──► docs/DESIGN-SYSTEM.md (file này = nguồn sự thật) + globals.css token + logo SVG
        │  giữ quyết định đã chốt trong plan; loại bỏ đề xuất trái nguyên tắc; chạy check-contrast
        ▼
P1+ Mỗi màn hình: skill `ui-screen`
        │  1. đọc DESIGN-SYSTEM + US/AC liên quan trong PRD
        │  2. dựng màn đủ 3 trạng thái, responsive, a11y
        │  3. gọi UI UX Pro Max kiểm anti-pattern + a11y; frontend-design cho chất lượng thị giác
        │  4. Playwright screenshot 360/768/1440 px + axe
        ▼
    Agent `ux-reviewer` ──► đọc screenshot + kiểm văn bản tiếng Việt (mục 16) ──► sửa ──► PR
        ▼
    Gate phase: UAT của Khanh theo docs/uat/ ; ★ quay video demo
```

1. **P0 — Sinh.** Chạy UI UX Pro Max với `--design-system --persist -p "FoodSave"` để tạo `design-system/foodsave/MASTER.md` và `pages/*.md`. Bản sinh là **nguyên liệu tham khảo**, không phải nguồn sự thật.
2. **P0 — Biên tập.** Đối chiếu bản sinh với tài liệu này: chấp nhận đề xuất cải thiện (ví dụ tinh chỉnh thang chữ, quy tắc UX) nếu không trái các quyết định đã chốt (một bộ token; Be Vietnam Pro; accent vai trò; token nhãn riêng; WCAG 2.2 AA). Mọi thay đổi token phải qua lại script kiểm tương phản. Ghi thay đổi vào mục 22. Sau P0, thư mục `design-system/` chỉ để tham khảo; nếu hai bên khác nhau, **file này thắng**.
3. **Mỗi màn — `ui-screen`.** Checklist: đúng token (không màu Tailwind mặc định), component có sẵn trước khi tạo mới, đủ trạng thái, responsive 5 kích thước, a11y mục 15, văn bản mục 16, screenshot.
4. **Review — `ux-reviewer`.** Agent đọc screenshot và chuỗi giao diện, báo lỗi theo mức (Chặn / Nên sửa / Gợi ý): tương phản, chỉ dùng màu, chữ tràn, dấu tiếng Việt bị cắt, xưng hô, thuật ngữ sai (ví dụ "Cận hạn"), thiếu trạng thái rỗng.
5. **Gate.** `phase-gate` kiểm Lighthouse (landing và `/volunteer` ≥ 90 ở Performance/Accessibility/Best Practices/SEO; installability kiểm bằng E2E vì Lighthouse 12 đã bỏ nhóm PWA) và axe không lỗi nghiêm trọng; Khanh UAT.

**Quyết định còn để ngỏ (có phase chốt):** icon nhãn Đỏ (`AlarmClock` đề xuất — chốt P0); có bật dark mode hay không (theo danh sách cắt, chốt tại gate P4); kích thước ô lưới bản đồ công khai (500 m mặc định — chốt P4 sau khi có dữ liệu seed).

---

## 21. Những gì bỏ khỏi giao diện cũ

| Bỏ | Lý do | Thay bằng |
|---|---|---|
| **Ba bảng màu chồng nhau**: (1) đen/trắng + xanh dương/đỏ/vàng Tailwind ở `index.html`; (2) xanh lá Tailwind `#22c55e/#16a34a` + tím/hồng/xanh trời ở `CHARITY.html`/`PARTNER.html`; (3) theme "forest" `#5d7f3f/#153526/#d97721` trong `foodsave-forest-theme.css` | Không nhất quán, không kiểm tương phản, `--green-900` thực chất là màu đen | Một bộ token (mục 3) |
| Font Inter, Plus Jakarta Sans, Satoshi trộn lẫn | Ba font, Satoshi không hỗ trợ tốt tiếng Việt | Be Vietnam Pro duy nhất |
| Mô tả nhãn cũ trên landing ("Xanh: dùng trong 48 giờ · Vàng: 24 giờ · Đỏ: 6–12 giờ") và tên "Còn hạn / Cận hạn / Sắp hết hạn" ở Admin | Mâu thuẫn với quy tắc nhãn theo nhóm hàng | Bảng ngưỡng `label_rules` (PRD mục 9) |
| **Màn B2C**: Đơn hàng của khách, Khiếu nại, Ví · Đối soát, Thanh toán, Chi trả đối tác, Hoa hồng, Người dùng (customer), voucher | Ngoài phạm vi, gây hiểu nhầm | Không có |
| **Bản đồ giả / minh họa tĩnh** ("Bản đồ & Tuyến" chỉ hiển thị) | Tính năng giả | MapLibre + Goong + PostGIS thật (9 màn) |
| **AI insight giả** ("Thống kê · AI" với số mẫu) | Tính năng giả | AI thật có flag, luôn ghi "AI gợi ý" |
| **Quét khuôn mặt mô phỏng** trong eKYC | Tính năng giả, tạo cảm giác an toàn sai | Bỏ; QR CCCD tùy chọn; Face Liveness sau giải |
| Nút "Mã QR"/OTP mẫu vào thẳng cổng, hộp đăng nhập tạm lưu vai trò vào localStorage | Bỏ qua xác thực (L2, L3) | `/login` thật + guard server |
| Khối "Dữ liệu gốc" dump JSON ở Admin | Lộ PII (B3) | Trang chi tiết có chọn lọc + signed URL |
| Số liệu tĩnh trên landing ("đã cứu x tấn" cố định), "Live pulse" giả | Số giả | Bộ đếm từ ledger, nhãn "Dữ liệu demo" khi cần |
| Mục "Cộng đồng" (bài đăng lưu tạm), "Người hưởng lợi" | Ngoài 4 hướng; rủi ro dữ liệu cá nhân | Không có; chỉ đếm số người trong minh chứng |
| Bảng xếp hạng/uy tín người bán, "Cảnh báo gian lận" dữ liệu mẫu | Di sản B2C, số mẫu | Điểm uy tín thật (F-12), Phản ánh (F-66), Bảng xếp hạng Xanh tùy chọn (F-53) |
| Nút hình viên thuốc có mũi tên "->" kiểu landing cũ, chữ 900 khắp nơi | Nặng nề, lẫn với pill nhãn | Nút `radius-md`, trọng lượng 600 |
| File HTML 1.500–4.600 dòng chứa CSS + JS | Không bảo trì được | Component React + token |

**Giữ lại:** chấm vàng (nay là mặt trời trong logo Bát lá, §2.1); tiêu đề "Cứu thực phẩm, Bảo vệ hành tinh."; ý tưởng nhãn màu là "ngôn ngữ chung" giữa hai bên; danh sách loại hình tổ chức/cửa hàng và nhóm thực phẩm; giọng phi lợi nhuận "không thu phí".

---

## 22. Nhật ký thay đổi

| Ngày | Phiên bản | Thay đổi | Người |
|---|---|---|---|
| 07/10/2026 | 1.0 | Bản đề xuất đầu tiên: token đã kiểm tương phản, component, pattern, bản đồ, ESG, copywriting, quy trình | Minh + Claude Code |
| P0 (07–11/10) | 1.1 | (dự kiến) Biên tập sau khi chạy UI UX Pro Max; chốt icon nhãn Đỏ; thêm `scripts/check-contrast.mjs` | Minh |
| 08/10/2026 | 1.2 | Thương hiệu (§2): logo **Bát lá** thay wordmark FOOD/SAVE; bộ SVG/PNG/favicon/ảnh chia sẻ/logo email; màu `--brand-deep/leaf/mint`; ảnh có giấy phép + trang `/credits`; dựng 4 lớp trang công khai; minh họa nét cho trạng thái rỗng. Font hiển thị Bricolage Grotesque cho tiêu đề marketing (§4.1). Chuyển động thương hiệu (§8.1). Landing (§10.4) | Minh + Claude Code |
| 09/10/2026 | 1.3 | Landing vòng 2 (§10.4): trang tĩnh + `/api/public-impact`; hero ảnh nền tràn viền + dải 9 nhóm thực phẩm; "Cách hoạt động" dạng dòng thời gian; khối "Xem sản phẩm" và bento "Minh bạch" bằng ảnh chụp màn hình thật (§2.4); CTA cuối tràn viền. Font: Bricolage 1 tệp tĩnh 17 KB, Be Vietnam Pro tự host 4 tệp (§4.1). Chuyển động `.fs-drift`, `.fs-draw-*` (§8.1) | Minh + Claude Code |
