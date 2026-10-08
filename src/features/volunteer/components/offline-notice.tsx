"use client";

import { WifiOff } from "lucide-react";

import { formatClock } from "@/features/charity-allocations/present";

import { useOnline } from "../hooks";

/**
 * Banner ngoại tuyến (DESIGN-SYSTEM §10.3, §12.4; PRD US-VOL-10 AC3): vẫn đọc được dữ liệu đã tải, ghi rõ mốc
 * cập nhật; các nút cần mạng tự khóa kèm giải thích ngay tại nút.
 */
export function OfflineNotice({ loadedAt }: { loadedAt: string }) {
  const online = useOnline();
  if (online) return null;
  return (
    <p
      role="status"
      className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2.5 text-[0.9375rem] text-ink"
    >
      <WifiOff aria-hidden className="mt-0.5 size-5 shrink-0 text-warning" />
      <span>
        Đang ngoại tuyến — dữ liệu cập nhật lúc {formatClock(loadedAt)}. Thao tác cần mạng (nhận chuyến,
        check-in, hiện mã) sẽ mở lại khi có sóng.
      </span>
    </p>
  );
}
