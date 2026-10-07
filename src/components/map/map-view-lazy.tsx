"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";

/** Bản đồ luôn lazy-load, không SSR (CLAUDE.md). */
export const MapViewLazy = dynamic(() => import("./map-view").then((m) => m.MapView), {
  ssr: false,
  loading: () => <Skeleton className="size-full rounded-lg" aria-label="Đang tải bản đồ" />,
});
