import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FoodSave — Cứu thực phẩm",
    short_name: "FoodSave",
    description:
      "Kết nối thực phẩm dư thừa từ cửa hàng tới tổ chức từ thiện. Tình nguyện viên nhận chuyến, chỉ đường và bàn giao bằng QR.",
    lang: "vi",
    dir: "ltr",
    start_url: "/volunteer",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#faf7f0",
    theme_color: "#1b6b47",
    categories: ["social", "food", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      // Logo "Bát lá" một màu (chỉ dùng kênh alpha) cho biểu tượng theo chủ đề / huy hiệu thông báo
      { src: "/icons/badge-96.png", sizes: "96x96", type: "image/png", purpose: "monochrome" },
    ],
  };
}
