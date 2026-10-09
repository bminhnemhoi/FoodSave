"use client";

import type { StyleSpecification } from "maplibre-gl";
import { useCallback, useEffect, useState } from "react";

import { cssColor, mapStyleUrl } from "../map-style";

import { basemapPalette, loadStyleJson, patchStyle, type BasemapFlavor } from "./basemap";

/** Style đã phối màu, cache theo URL (mọi bản đồ trong phiên dùng chung một lần tải + một lần phối). */
const patchedCache = new Map<string, Promise<StyleSpecification>>();

function patched(url: string, flavor: BasemapFlavor): Promise<StyleSpecification> {
  const hit = patchedCache.get(url);
  if (hit) return hit;
  const p = loadStyleJson(url)
    .then((raw) => patchStyle(raw, basemapPalette(cssColor), flavor))
    .catch((err: unknown) => {
      patchedCache.delete(url);
      throw err;
    });
  patchedCache.set(url, p);
  return p;
}

export type Basemap = {
  /** null khi đang tải; chuỗi URL khi không tải/phối được (MapLibre tự tải style gốc). */
  style: StyleSpecification | string | null;
  fallback: boolean;
  /** Gắn vào `onError` của bản đồ: lỗi tile/style Goong ⇒ chuyển sang OpenFreeMap (ADR-006). */
  onError: () => void;
};

/**
 * Nền bản đồ thân thiện (DESIGN-SYSTEM §13.1): tải style Goong một lần, phối màu thương hiệu, giảm POI; lỗi ⇒
 * dự phòng OpenFreeMap (cũng được phối màu, có nhãn Hoàng Sa/Trường Sa của FoodSave).
 */
export function useBasemap(): Basemap {
  const [fallback, setFallback] = useState(false);
  // Đổi sang dự phòng: giữ style cũ tới khi style mới sẵn sàng (bản đồ không bị gỡ ra, giữ nguyên khung nhìn)
  const [style, setStyle] = useState<StyleSpecification | string | null>(null);
  const url = mapStyleUrl(fallback);

  useEffect(() => {
    let alive = true;
    patched(url, fallback ? "fallback" : "goong").then(
      (next) => {
        if (alive) setStyle(next);
      },
      () => {
        if (!alive) return;
        // Goong lỗi ⇒ thử dự phòng; dự phòng cũng lỗi ⇒ để MapLibre tự tải URL (hiện lỗi tile như cũ)
        if (!fallback) setFallback(true);
        else setStyle(url);
      },
    );
    return () => {
      alive = false;
    };
  }, [url, fallback]);

  const onError = useCallback(() => setFallback(true), []);
  return { style, fallback, onError };
}
