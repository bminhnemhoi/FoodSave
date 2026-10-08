import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Vị trí + camera chỉ cho chính FoodSave (chọn địa điểm, quét QR, ảnh minh chứng); tắt các API không dùng.
  {
    key: "Permissions-Policy",
    value: "geolocation=(self), camera=(self), microphone=(), payment=(), usb=()",
  },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  // Cho phép nhiều tiến trình build/E2E song song trên cùng máy (mỗi agent một thư mục build).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  // Ảnh trang công khai (public/images): AVIF trước, WebP dự phòng (DESIGN-SYSTEM §2.4)
  images: { formats: ["image/avif", "image/webp"] },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
