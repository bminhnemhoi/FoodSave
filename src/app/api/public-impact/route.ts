import { connection } from "next/server";

import { getPublicImpact } from "@/features/impact/queries";

/**
 * GET /api/public-impact — số tác động công khai cho landing (PRD US-PUB-02; DESIGN-SYSTEM §10.4).
 *
 * Landing là trang TĨNH (phục vụ từ CDN, không chờ DB); bộ đếm gọi route này phía trình duyệt. Mỗi request
 * chạy handler (`connection()`), còn số liệu đọc từ Data Cache thẻ `public-impact` (≤ 10 phút) — bàn giao
 * ghi sổ gọi `updateTag(PUBLIC_IMPACT_TAG)` nên request kế tiếp có số mới ngay. Phản hồi không cache ở
 * trình duyệt/CDN (no-store) để không giữ số cũ sau khi thẻ đã bị hủy. Chỉ dữ liệu công khai (view
 * `public_impact_stats` qua khóa anon, loại dữ liệu demo); lỗi ⇒ `{ status: "unavailable" }` + 503.
 */
export async function GET() {
  await connection();
  const impact = await getPublicImpact();
  return Response.json(impact, {
    status: impact.status === "ok" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
