"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import "./kit.css";

import { MapPinned } from "lucide-react";
import { setWorkerUrl, type Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useRef } from "react";
import Map, { NavigationControl, type MapProps, type MapRef } from "react-map-gl/maplibre";

import { clientEnv } from "@/lib/env.client";

import { MAP_LOCALE } from "../map-style";

import { FallbackNotice } from "./map-frame";
import { useBasemap } from "./use-basemap";

// Worker được chép vào public/ ở bước prebuild/predev (scripts/copy-maplibre-worker.mjs).
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

type TestWindow = Window & { __foodsaveMaps?: MapLibreMap[] };

/**
 * Trang thử/E2E (không phải production): đưa bản đồ đang mở vào `window.__foodsaveMaps` để Playwright gọi
 * `queryRenderedFeatures` (kiểm nhãn Hoàng Sa/Trường Sa — tests/e2e/map/sovereignty.spec.ts).
 */
function exposeForTests(map: MapLibreMap): () => void {
  if (clientEnv.NEXT_PUBLIC_APP_ENV === "production") return () => undefined;
  const w = window as TestWindow;
  w.__foodsaveMaps = [...(w.__foodsaveMaps ?? []), map];
  return () => {
    w.__foodsaveMaps = (w.__foodsaveMaps ?? []).filter((m) => m !== map);
  };
}

export type BaseMapProps = Omit<MapProps, "mapStyle" | "locale" | "onError" | "style"> & {
  ref?: React.Ref<MapRef>;
  children?: React.ReactNode;
};

/**
 * Bản đồ MapLibre với cấu hình chung của FoodSave (DESIGN-SYSTEM §13.1): nền Goong đã phối màu (dự phòng
 * OpenFreeMap), chữ giao diện tiếng Việt, tắt xoay/nghiêng, nút phóng to/thu nhỏ 44 px, ghi nguồn gọn.
 * Trong lúc tải style: khung giữ chỗ cùng cỡ (không nhảy bố cục).
 */
export function BaseMap({ ref, children, onLoad, ...props }: BaseMapProps) {
  const { style, fallback, onError } = useBasemap();
  const release = useRef<(() => void) | null>(null);
  useEffect(() => () => release.current?.(), []);

  if (!style)
    return (
      <div role="status" className="grid size-full place-items-center text-ink-muted">
        <span className="flex flex-col items-center gap-2 text-sm">
          <MapPinned aria-hidden className="size-8 animate-pulse" strokeWidth={1.75} />
          Đang tải bản đồ…
        </span>
      </div>
    );

  return (
    <>
      <Map
        ref={ref}
        mapStyle={style}
        locale={MAP_LOCALE}
        onError={onError}
        dragRotate={false}
        touchPitch={false}
        pitchWithRotate={false}
        attributionControl={{ compact: true }}
        // isolation: z-index của marker không vượt ra ngoài bản đồ (đè lên nút "Vừa khung", chú giải, thẻ thông tin)
        style={{ width: "100%", height: "100%", isolation: "isolate" }}
        onLoad={(e) => {
          release.current?.();
          release.current = exposeForTests(e.target);
          onLoad?.(e);
        }}
        {...props}
      >
        <NavigationControl position="top-right" showCompass={false} />
        {children}
      </Map>
      {fallback ? <FallbackNotice /> : null}
    </>
  );
}
