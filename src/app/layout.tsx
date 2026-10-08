import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro } from "next/font/google";

import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import { Toaster } from "@/components/ui/sonner";
import { clientEnv } from "@/lib/env.client";

import "./globals.css";

const beVietnamPro = Be_Vietnam_Pro({
  variable: "--font-be-vietnam-pro",
  subsets: ["vietnamese", "latin"],
  weight: ["400", "500", "600", "700"],
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
