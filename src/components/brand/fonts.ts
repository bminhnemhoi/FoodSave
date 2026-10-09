import localFont from "next/font/local";

/**
 * Chữ hiển thị cho tiêu đề marketing (DESIGN-SYSTEM §4.1): Bricolage Grotesque (SIL OFL 1.1, không có tên
 * dành riêng — xem `fonts/OFL.txt`). Thay cho bản biến thiên đầy đủ của Google Fonts (≈ 120 KB cho latin +
 * latin-ext + vietnamese): một tệp tĩnh duy nhất **17 KB** — ExtraBold (wght 800), opsz 56, wdth 100, chỉ giữ
 * Latin cơ bản + toàn bộ chữ tiếng Việt (dựng sẵn và dấu rời) + dấu câu dùng trên trang (– — “ ” · … ₂ ₫ →),
 * giữ kerning. Dựng bằng fontTools (instancer + subset) từ `BricolageGrotesque[opsz,wdth,wght].ttf` của
 * google/fonts; đổi bộ ký tự thì dựng lại, không sửa tay.
 * Chỉ tải/preload trên các route gắn `displayFont.variable` (landing, xác thực, onboarding).
 */
export const displayFont = localFont({
  src: "./fonts/bricolage-grotesque-800-opsz56.woff2",
  weight: "800",
  style: "normal",
  variable: "--font-bricolage",
  display: "swap",
});
