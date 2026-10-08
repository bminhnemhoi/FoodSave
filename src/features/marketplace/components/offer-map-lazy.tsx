"use client";

import { MapPinned } from "lucide-react";
import dynamic from "next/dynamic";

/** Bản đồ Kho tặng luôn lazy-load, không SSR: danh sách hiện trước, bản đồ tải sau (US-CHA-05 AC5). */
export const OfferMapLazy = dynamic(() => import("./offer-map").then((m) => m.OfferMap), {
  ssr: false,
  loading: () => (
    <div
      role="status"
      className="grid size-full place-items-center rounded-lg border bg-bg-sunken text-ink-muted"
    >
      <span className="flex flex-col items-center gap-2 text-sm">
        {/* chỉ icon nhấp nháy: làm mờ cả khối kéo tương phản chữ xuống dưới 4,5:1 */}
        <MapPinned aria-hidden className="size-8 animate-pulse" strokeWidth={1.75} />
        Đang tải bản đồ…
      </span>
    </div>
  ),
});
