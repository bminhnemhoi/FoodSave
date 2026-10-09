"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { Scan } from "lucide-react";
import { setWorkerUrl } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import Map, {
  Layer,
  Marker,
  NavigationControl,
  Source,
  type MapLayerMouseEvent,
  type MapRef,
  type MarkerDragEvent,
} from "react-map-gl/maplibre";

import { circlePolygon } from "@/core/geo/circle";
import { DEFAULT_MAP_CENTER } from "@/core/geo/service-area";
import type { LatLng } from "@/core/geo/types";
import { cn } from "@/lib/utils";

import { cssColor, MAP_LOCALE, mapStyleUrl, prefersReducedMotion } from "./map-style";

// Worker được chép vào public/ ở bước prebuild/predev (scripts/copy-maplibre-worker.mjs).
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

/** Bước dịch ghim bằng phím mũi tên: ~11 m, giữ Shift ~110 m (WCAG 2.5.7 — thay cho kéo). */
const KEY_STEP_DEG = 0.0001;
const KEY_STEP_LARGE_DEG = 0.001;
const ARROWS: Record<string, [number, number]> = {
  ArrowUp: [1, 0],
  ArrowDown: [-1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};

export type PinChangePhase = "move" | "commit";

export type LocationPickerMapProps = {
  pin: LatLng | null;
  /** Tăng giá trị để bay tới ghim (sau khi chọn gợi ý / định vị GPS). */
  focusKey: number;
  radiusKm?: number;
  /** `move` khi đang kéo/nhấn phím, `commit` khi thả ghim hoặc bấm lên bản đồ. */
  onPinChange: (point: LatLng, phase: PinChangePhase) => void;
  ariaLabel: string;
  className?: string;
};

function circleBounds(center: LatLng, radiusKm: number): [[number, number], [number, number]] {
  const ring = circlePolygon(center, radiusKm, 32).coordinates[0];
  const lngs = ring.map((c) => c[0]);
  const lats = ring.map((c) => c[1]);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

/** Bản đồ chọn vị trí: ghim kéo được (nguồn sự thật — ADR-006), bấm lên bản đồ để đặt ghim, vòng bán kính tùy chọn. */
export function LocationPickerMap({
  pin,
  focusKey,
  radiusKm,
  onPinChange,
  ariaLabel,
  className,
}: LocationPickerMapProps) {
  const mapRef = useRef<MapRef>(null);
  const [fallback, setFallback] = useState(false);
  const [colors] = useState(() => ({
    radius: cssColor("--primary", "#1b6b47"),
  }));
  // Lần đầu: vừa khung vòng bán kính (nếu có), nếu không thì phóng tới ghim
  const [initialView] = useState(() =>
    pin && radiusKm && radiusKm > 0
      ? { bounds: circleBounds(pin, radiusKm), fitBoundsOptions: { padding: 32, maxZoom: 16 } }
      : pin
        ? { latitude: pin.lat, longitude: pin.lng, zoom: 16 }
        : { ...toView(DEFAULT_MAP_CENTER), zoom: 11 },
  );

  const circle = useMemo(
    () => (pin && radiusKm && radiusKm > 0 ? circlePolygon(pin, radiusKm) : null),
    [pin, radiusKm],
  );

  /** Vừa khung vòng bán kính (hoặc phóng tới ghim khi không có bán kính). */
  function fitToPin(duration: number) {
    const map = mapRef.current;
    if (!map || !pin) return;
    if (radiusKm && radiusKm > 0) {
      map.fitBounds(circleBounds(pin, radiusKm), { padding: 32, duration, maxZoom: 16 });
    } else {
      map.flyTo({ center: [pin.lng, pin.lat], zoom: Math.max(map.getZoom(), 16), duration });
    }
  }

  // Bay tới ghim khi chọn gợi ý / GPS (không bay khi người dùng tự kéo ghim). Đổi bán kính KHÔNG tự thu
  // phóng: giữ mức zoom để vòng 2 km và 8 km trông khác cỡ (UAT 09/10 C4); muốn thấy cả vòng thì bấm "Vừa khung".
  useEffect(() => {
    if (focusKey === 0) return;
    fitToPin(prefersReducedMotion() ? 0 : 800);
    // Chỉ chạy theo focusKey — pin thay đổi do kéo không được làm bản đồ nhảy
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);

  function handleMapClick(e: MapLayerMouseEvent) {
    const target = e.originalEvent.target;
    if (target instanceof Element && target.closest("[data-pin]")) return;
    onPinChange({ lat: e.lngLat.lat, lng: e.lngLat.lng }, "commit");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    const dir = ARROWS[e.key];
    if (!dir || !pin) return;
    e.preventDefault();
    e.stopPropagation(); // không để bản đồ cuộn theo phím
    const step = e.shiftKey ? KEY_STEP_LARGE_DEG : KEY_STEP_DEG;
    onPinChange({ lat: pin.lat + dir[0] * step, lng: pin.lng + dir[1] * step }, "move");
  }

  function handleKeyUp(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (!ARROWS[e.key] || !pin) return;
    e.stopPropagation();
    onPinChange(pin, "commit");
  }

  return (
    <div
      role="region"
      aria-label={ariaLabel}
      className={cn("relative size-full overflow-hidden rounded-lg border bg-bg-sunken", className)}
    >
      <Map
        ref={mapRef}
        initialViewState={initialView}
        mapStyle={mapStyleUrl(fallback)}
        locale={MAP_LOCALE}
        onError={() => setFallback(true)}
        onClick={handleMapClick}
        dragRotate={false}
        touchPitch={false}
        pitchWithRotate={false}
        attributionControl={{ compact: true }}
        style={{ width: "100%", height: "100%" }}
        cursor="crosshair"
      >
        <NavigationControl position="top-right" showCompass={false} />
        {circle ? (
          <Source
            id="service-radius"
            type="geojson"
            data={{ type: "Feature", properties: {}, geometry: circle }}
          >
            <Layer
              id="service-radius-fill"
              type="fill"
              paint={{ "fill-color": colors.radius, "fill-opacity": 0.1 }}
            />
            <Layer
              id="service-radius-line"
              type="line"
              paint={{ "line-color": colors.radius, "line-width": 2, "line-dasharray": [2, 2] }}
            />
          </Source>
        ) : null}
        {pin ? (
          <Marker
            latitude={pin.lat}
            longitude={pin.lng}
            anchor="bottom"
            draggable
            onDrag={(e: MarkerDragEvent) => onPinChange({ lat: e.lngLat.lat, lng: e.lngLat.lng }, "move")}
            onDragEnd={(e: MarkerDragEvent) =>
              onPinChange({ lat: e.lngLat.lat, lng: e.lngLat.lng }, "commit")
            }
          >
            <button
              type="button"
              data-pin
              aria-label="Ghim vị trí — kéo để chỉnh, hoặc dùng phím mũi tên (giữ Shift để dịch xa hơn)"
              onKeyDown={handleKeyDown}
              onKeyUp={handleKeyUp}
              className="block cursor-grab rounded-full active:cursor-grabbing"
            >
              <svg viewBox="0 0 36 46" width="36" height="46" aria-hidden className="drop-shadow-md">
                <path
                  d="M18 44.5C16.6 42.4 3 27.1 3 18a15 15 0 0 1 30 0c0 9.1-13.6 24.4-15 26.5Z"
                  className="fill-ink stroke-surface"
                  strokeWidth={2.5}
                />
                <circle
                  cx="18"
                  cy="18"
                  r="6.5"
                  className="fill-role-accent-fill stroke-surface"
                  strokeWidth={2}
                />
              </svg>
            </button>
          </Marker>
        ) : null}
      </Map>
      {pin ? (
        <button
          type="button"
          onClick={() => fitToPin(prefersReducedMotion() ? 0 : 400)}
          className="absolute top-2.5 left-2.5 inline-flex min-h-11 items-center gap-1.5 rounded-lg border bg-surface px-3 text-sm font-medium text-ink shadow-2 outline-none hover:bg-bg-sunken focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Scan aria-hidden className="size-4" />
          Vừa khung
          <span className="sr-only">
            {radiusKm && radiusKm > 0 ? ": hiện trọn vòng bán kính phục vụ" : ": về ghim vị trí"}
          </span>
        </button>
      ) : null}
      {fallback ? (
        <p className="absolute bottom-2 left-2 rounded bg-surface/90 px-2 py-1 text-xs text-ink-muted">
          Đang dùng bản đồ dự phòng
        </p>
      ) : null}
    </div>
  );
}

function toView(p: LatLng) {
  return { latitude: p.lat, longitude: p.lng };
}
