"use client";

import { MapPinned } from "lucide-react";
import dynamic from "next/dynamic";

/** Bản đồ chọn vị trí luôn lazy-load, không SSR (CLAUDE.md); skeleton đúng hình khi tải. */
export const LocationPickerMapLazy = dynamic(
  () => import("./location-picker-map").then((m) => m.LocationPickerMap),
  {
    ssr: false,
    loading: () => (
      <div
        role="status"
        className="grid size-full animate-pulse place-items-center rounded-lg border bg-bg-sunken text-ink-subtle"
      >
        <span className="flex flex-col items-center gap-2 text-sm">
          <MapPinned aria-hidden className="size-8" strokeWidth={1.75} />
          Đang tải bản đồ…
        </span>
      </div>
    ),
  },
);
