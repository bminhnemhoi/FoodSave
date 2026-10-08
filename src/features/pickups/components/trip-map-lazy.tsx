"use client";

import { MapPinned } from "lucide-react";
import dynamic from "next/dynamic";

/** Bản đồ chuyến lazy-load, không SSR (CLAUDE.md); danh sách điểm dừng hiện trước. */
export const TripMapLazy = dynamic(() => import("./trip-map").then((m) => m.TripMap), {
  ssr: false,
  loading: () => (
    <div
      role="status"
      className="grid size-full place-items-center rounded-lg border bg-bg-sunken text-ink-muted"
    >
      <span className="flex flex-col items-center gap-2 text-sm">
        <MapPinned aria-hidden className="size-8 animate-pulse" strokeWidth={1.75} />
        Đang tải bản đồ…
      </span>
    </div>
  ),
});
