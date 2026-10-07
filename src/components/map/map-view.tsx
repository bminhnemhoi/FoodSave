"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { setWorkerUrl } from "maplibre-gl";
import { useMemo, useState } from "react";
import Map, { Layer, Marker, NavigationControl, Source, type MapProps } from "react-map-gl/maplibre";

import type { FreshnessLabel } from "@/components/labels/freshness-badge";
import { cn } from "@/lib/utils";

import { MAP_LOCALE, mapStyleUrl } from "./map-style";

export type MapPoint = {
  id: string;
  lat: number;
  lng: number;
  title: string;
  label?: FreshnessLabel;
  kind?: "store" | "charity" | "volunteer" | "home";
  order?: number;
};

type MapViewProps = {
  points: MapPoint[];
  route?: { type: "LineString"; coordinates: [number, number][] };
  className?: string;
  /** Mô tả văn bản cho trình đọc màn hình (bản đồ là nội dung trực quan). */
  ariaLabel: string;
  initialView?: MapProps["initialViewState"];
};

// Worker được chép vào public/ ở bước prebuild/predev (scripts/copy-maplibre-worker.mjs).
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

const MARKER_TONE: Record<FreshnessLabel, string> = {
  green: "bg-label-green text-white",
  yellow: "bg-label-yellow text-ink ring-2 ring-label-yellow-fg", // vàng bắt buộc viền đậm (DESIGN-SYSTEM §3.6)
  red: "bg-label-red text-white",
  expired: "bg-label-expired text-white",
};

/** Bản đồ dùng chung: tile Goong (dự phòng OpenFreeMap), marker theo nhãn, polyline tuyến (DESIGN-SYSTEM §13). */
export function MapView({ points, route, className, ariaLabel, initialView }: MapViewProps) {
  const [fallback, setFallback] = useState(false);

  const view = useMemo(() => {
    if (initialView) return initialView;
    if (points.length === 0) return { latitude: 10.7769, longitude: 106.7009, zoom: 12 };
    const lats = points.map((p) => p.lat);
    const lngs = points.map((p) => p.lng);
    return {
      bounds: [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ] as [[number, number], [number, number]],
      fitBoundsOptions: { padding: 64, maxZoom: 16 },
    };
  }, [initialView, points]);

  return (
    <div
      role="region"
      aria-label={ariaLabel}
      className={cn("relative size-full overflow-hidden rounded-lg border bg-bg-sunken", className)}
    >
      <Map
        initialViewState={view}
        mapStyle={mapStyleUrl(fallback)}
        locale={MAP_LOCALE}
        onError={() => setFallback(true)}
        attributionControl={{ compact: true }}
        style={{ width: "100%", height: "100%" }}
      >
        <NavigationControl position="top-right" showCompass={false} />
        {route ? (
          <Source id="route" type="geojson" data={{ type: "Feature", properties: {}, geometry: route }}>
            <Layer id="route-casing" type="line" paint={{ "line-color": "#ffffff", "line-width": 8 }} />
            <Layer id="route-line" type="line" paint={{ "line-color": "#1f5fbf", "line-width": 5 }} />
          </Source>
        ) : null}
        {points.map((p) => (
          <Marker key={p.id} latitude={p.lat} longitude={p.lng} anchor="bottom">
            <span
              title={p.title}
              className={cn(
                "grid size-8 place-items-center rounded-full border-2 border-white text-sm font-bold tabular-nums shadow-2",
                p.label ? MARKER_TONE[p.label] : "bg-ink text-white",
              )}
            >
              {p.order ?? ""}
            </span>
          </Marker>
        ))}
      </Map>
      {fallback ? (
        <p className="absolute bottom-2 left-2 rounded bg-surface/90 px-2 py-1 text-xs text-ink-muted">
          Đang dùng bản đồ dự phòng
        </p>
      ) : null}
    </div>
  );
}
