"use client";

import { MapPinned } from "lucide-react";
import dynamic from "next/dynamic";

/** Bản đồ "Nhu cầu gần bạn" lazy-load, không SSR (CLAUDE.md); danh sách hiện trước. */
export const NearbyMapLazy = dynamic(() => import("./nearby-map").then((m) => m.NearbyMap), {
  ssr: false,
  loading: () => (
    <div
      role="status"
      className="grid size-full place-items-center rounded-xl border bg-bg-sunken text-ink-muted"
    >
      <span className="flex flex-col items-center gap-2 text-sm">
        <MapPinned aria-hidden className="size-8 animate-pulse" strokeWidth={1.75} />
        Đang tải bản đồ…
      </span>
    </div>
  ),
});
