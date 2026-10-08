import { Bricolage_Grotesque } from "next/font/google";

/**
 * Chữ hiển thị cho tiêu đề marketing (DESIGN-SYSTEM §4.1): Bricolage Grotesque — có subset `vietnamese`,
 * giấy phép SIL OFL. next/font tự host (trình duyệt không gọi Google). Font chỉ được tải và preload trên
 * các route dùng lớp `displayFont.variable` (landing, xác thực, onboarding) — các cổng làm việc chỉ dùng
 * Be Vietnam Pro để nhẹ trên điện thoại rẻ.
 */
export const displayFont = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["vietnamese", "latin"],
  axes: ["opsz"],
  display: "swap",
});
