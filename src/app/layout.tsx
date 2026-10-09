import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import { Toaster } from "@/components/ui/sonner";
import { clientEnv } from "@/lib/env.client";

import "./globals.css";

/**
 * Be Vietnam Pro (SIL OFL 1.1, `fonts/OFL.txt`) — chữ giao diện mọi trang (DESIGN-SYSTEM §4.1). Tự host MỘT tệp
 * mỗi trọng lượng gộp đúng dải unicode "latin" + "vietnamese" của Google Fonts (≈ 16–17 KB/tệp, 4 tệp ≈ 68 KB)
 * thay cho 8 tệp preload + 3 tệp latin-ext tải muộn (≈ 98 KB) của next/font/google: ít request hơn, không
 * phụ thuộc mạng lúc build. Dựng bằng fontTools subset (bỏ hinting) từ BeVietnamPro-*.ttf của google/fonts.
 */
const beVietnamPro = localFont({
  variable: "--font-be-vietnam-pro",
  src: [
    { path: "./fonts/be-vietnam-pro-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/be-vietnam-pro-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/be-vietnam-pro-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/be-vietnam-pro-700.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(clientEnv.NEXT_PUBLIC_APP_URL),
  title: {
    default: "FoodSave — Cứu thực phẩm, minh bạch đến từng suất ăn",
    template: "%s · FoodSave",
  },
  description:
    "Nền tảng phi lợi nhuận kết nối thực phẩm dư thừa từ cửa hàng tới tổ chức từ thiện: nhãn tươi Xanh/Vàng/Đỏ, ghép đơn nhiều cửa hàng, bàn giao QR, minh chứng và ESG minh bạch.",
  applicationName: "FoodSave",
  // Icon/favicon/apple-icon/ảnh chia sẻ: quy ước tệp trong src/app (icon.svg, favicon.ico, apple-icon.png,
  // opengraph-image.jpg) — logo "Bát lá", DESIGN-SYSTEM §2.
  openGraph: { type: "website", locale: "vi_VN", siteName: "FoodSave" },
  twitter: { card: "summary_large_image" },
  appleWebApp: { capable: true, title: "FoodSave", statusBarStyle: "default" },
  robots: clientEnv.NEXT_PUBLIC_APP_ENV === "production" ? undefined : { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#1b6b47",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi" className={`${beVietnamPro.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        {children}
        <Toaster richColors closeButton position="top-center" />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
