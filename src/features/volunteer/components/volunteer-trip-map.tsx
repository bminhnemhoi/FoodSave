"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { Check, Home, LocateFixed } from "lucide-react";
import { setWorkerUrl } from "maplibre-gl";
import { useMemo, useRef, useState } from "react";
import Map, { Layer, Marker, NavigationControl, Source, type MapRef } from "react-map-gl/maplibre";

import { cssColor, MAP_LOCALE, mapStyleUrl, prefersReducedMotion } from "@/components/map/map-style";
import { DEFAULT_MAP_CENTER } from "@/core/geo/service-area";
import type { LatLng } from "@/core/geo/types";
import { boundsOf, type LineString } from "@/features/pickups/geo";
import { cn } from "@/lib/utils";

// Worker được chép vào public/ ở bước prebuild/predev (scripts/copy-maplibre-worker.mjs).
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

export type VolunteerMapStop = {
  id: string;
  seq: number;
  kind: "pickup" | "dropoff";
  status: "pending" | "arrived" | "done" | "skipped";
  location: LatLng;
  title: string;
};

type VolunteerTripMapProps = {
  stops: VolunteerMapStop[];
  route: LineString | null;
  /** Tuyến ước tính (nối thẳng) ⇒ nét đứt (DESIGN-SYSTEM §13.5). */
  estimated: boolean;
  currentStopId: string | null;
  /** Vị trí của tôi — chỉ có khi đang chia sẻ (đã đồng ý), chỉ trong bộ nhớ. */
  me: LatLng | null;
  ariaLabel: string;
  className?: string;
};

/**
 * Bản đồ nhỏ của chuyến cho TNV (DESIGN-SYSTEM §11.2 `RouteMap` biến thể `volunteer`, §13): điểm dừng đánh số theo
 * thứ tự, điểm kế tiếp phóng to viền amber, điểm đã xong có dấu ✓, điểm giao về là giọt nước; vị trí của tôi là chấm
 * amber viền đậm (`--map-volunteer`). Bản tương đương cho trình đọc màn hình là danh sách "Lộ trình".
 */
export function VolunteerTripMap({
  stops,
  route,
  estimated,
  currentStopId,
  me,
  ariaLabel,
  className,
}: VolunteerTripMapProps) {
  const mapRef = useRef<MapRef>(null);
  const [fallback, setFallback] = useState(false);
  const [colors] = useState(() => ({
    route: cssColor("--map-route", "#1f5fbf"),
    halo: cssColor("--map-halo", "#ffffff"),
  }));

  const bounds = useMemo(() => boundsOf(stops.map((s) => s.location)), [stops]);
  const [initialView] = useState(() =>
    bounds
      ? { bounds, fitBoundsOptions: { padding: 48, maxZoom: 15 } }
      : { latitude: DEFAULT_MAP_CENTER.lat, longitude: DEFAULT_MAP_CENTER.lng, zoom: 11 },
  );

  function fitAll() {
    const b = boundsOf([...stops.map((s) => s.location), ...(me ? [me] : [])]);
    if (!b) return;
    mapRef.current?.fitBounds(b, { padding: 48, maxZoom: 15, duration: prefersReducedMotion() ? 0 : 500 });
  }

  return (
    <div
      role="region"
      aria-label={ariaLabel}
      className={cn(
        "relative size-full overflow-hidden rounded-xl border bg-bg-sunken [&_.maplibregl-ctrl-group_button]:size-11",
        className,
      )}
    >
      <Map
        ref={mapRef}
        initialViewState={initialView}
        mapStyle={mapStyleUrl(fallback)}
        locale={MAP_LOCALE}
        onError={() => setFallback(true)}
        dragRotate={false}
        touchPitch={false}
        pitchWithRotate={false}
        cooperativeGestures
        attributionControl={{ compact: true }}
        style={{ width: "100%", height: "100%" }}
      >
        <NavigationControl position="top-right" showCompass={false} />
        {route ? (
          <Source id="vol-route" type="geojson" data={{ type: "Feature", properties: {}, geometry: route }}>
            <Layer
              id="vol-route-casing"
              type="line"
              layout={{ "line-cap": "round", "line-join": "round" }}
              paint={{ "line-color": colors.halo, "line-width": estimated ? 6 : 8 }}
            />
            <Layer
              id="vol-route-line"
              type="line"
              layout={{ "line-cap": "round", "line-join": "round" }}
              paint={
                estimated
                  ? { "line-color": colors.route, "line-width": 3, "line-dasharray": [2, 1.5] }
                  : { "line-color": colors.route, "line-width": 5 }
              }
            />
          </Source>
        ) : null}
        {stops.map((s) => {
          const current = s.id === currentStopId;
          return (
            <Marker
              key={s.id}
              latitude={s.location.lat}
              longitude={s.location.lng}
              anchor={s.kind === "dropoff" ? "bottom" : "center"}
              style={{ zIndex: current ? 3 : s.kind === "dropoff" ? 1 : 2 }}
            >
              {s.kind === "dropoff" ? (
                <span title={s.title} className="relative block">
                  <svg
                    viewBox="0 0 36 46"
                    width={current ? 42 : 36}
                    height={current ? 54 : 46}
                    aria-hidden
                    className="drop-shadow-md"
                  >
                    <path
                      d="M18 44.5C16.6 42.4 3 27.1 3 18a15 15 0 0 1 30 0c0 9.1-13.6 24.4-15 26.5Z"
                      className="fill-ink stroke-surface"
                      strokeWidth={2.5}
                    />
                    <circle
                      cx="18"
                      cy="18"
                      r="9"
                      className="fill-role-accent-fill stroke-surface"
                      strokeWidth={2}
                    />
                  </svg>
                  <Home
                    aria-hidden
                    className={cn(
                      "absolute size-3.5 text-ink",
                      current ? "top-[13px] left-[14px]" : "top-[11px] left-[11px]",
                    )}
                  />
                </span>
              ) : (
                <span
                  title={s.title}
                  className={cn(
                    "grid place-items-center rounded-full border-[3px] font-bold tabular-nums shadow-2",
                    current
                      ? "size-10 border-ink bg-role-accent-fill text-base text-ink ring-4 ring-role-accent-fill/40"
                      : "size-7 text-sm",
                    !current &&
                      (s.status === "done"
                        ? "border-white bg-success text-white"
                        : s.status === "skipped"
                          ? "border-ink-subtle bg-bg-sunken text-ink-subtle line-through"
                          : "border-info bg-surface text-ink"),
                  )}
                >
                  {s.status === "done" ? <Check aria-hidden className="size-4" /> : s.seq}
                </span>
              )}
            </Marker>
          );
        })}
        {me ? (
          <Marker latitude={me.lat} longitude={me.lng} anchor="center" style={{ zIndex: 4 }}>
            <span
              title="Vị trí của bạn"
              className="block size-5 rounded-full border-[3px] border-ink bg-[var(--map-volunteer)] shadow-2"
            />
          </Marker>
        ) : null}
      </Map>
      {bounds ? (
        <button
          type="button"
          onClick={fitAll}
          className="absolute top-2.5 left-2.5 inline-flex h-11 items-center gap-1.5 rounded-md border bg-surface px-3 text-sm font-medium text-ink shadow-1 hover:bg-bg"
        >
          <LocateFixed aria-hidden className="size-4" />
          Vừa khung
        </button>
      ) : null}
      {route ? (
        <p className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-2 rounded-md bg-surface/90 px-2.5 py-1.5 text-xs text-ink shadow-1">
          <span
            aria-hidden
            className={cn("block h-0 w-6 border-t-[3px] border-info", estimated && "border-dashed")}
          />
          {estimated ? "Thứ tự điểm (đường thẳng)" : "Tuyến xe máy"}
        </p>
      ) : null}
      {fallback ? (
        <p className="absolute top-2.5 left-1/2 -translate-x-1/2 rounded bg-surface/90 px-2 py-1 text-xs text-ink-muted">
          Đang dùng bản đồ dự phòng
        </p>
      ) : null}
    </div>
  );
}
