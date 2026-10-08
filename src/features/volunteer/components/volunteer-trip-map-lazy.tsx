"use client";

import { MapPinned } from "lucide-react";
import dynamic from "next/dynamic";

/** Bản đồ chuyến lazy-load, không SSR (CLAUDE.md; PRD US-VOL-03 AC2: bản đồ chỉ tải ở chi tiết chuyến). */
export const VolunteerTripMapLazy = dynamic(
  () => import("./volunteer-trip-map").then((m) => m.VolunteerTripMap),
  {
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
  },
);
