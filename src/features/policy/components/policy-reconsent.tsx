import { Suspense } from "react";

import { loadNeedsReconsent } from "../queries";
import { PolicyUpdateBanner } from "./policy-update-banner";

async function Check({ userId }: { userId: string }) {
  return (await loadNeedsReconsent(userId)) ? <PolicyUpdateBanner /> : null;
}

/**
 * Đặt ở đầu nội dung của app shell Cửa hàng / Tổ chức / Tình nguyện viên (không có ở trang chủ công khai). Tải
 * song song với trang (Suspense, không có khung chờ) — banner không bao giờ chặn nội dung.
 */
export function PolicyReconsent({ userId }: { userId: string }) {
  return (
    <Suspense fallback={null}>
      <Check userId={userId} />
    </Suspense>
  );
}
