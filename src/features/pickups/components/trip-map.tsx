"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { Check, Home, LocateFixed } from "lucide-react";
import { setWorkerUrl } from "maplibre-gl";
import { useMemo, useRef, useState } from "react";
import Map, { Layer, Marker, NavigationControl, Source, type MapRef } from "react-map-gl/maplibre";

import { cssColor, MAP_LOCALE, mapStyleUrl, prefersReducedMotion } from "@/components/map/map-style";
import { circlePolygon } from "@/core/geo/circle";
import { DEFAULT_MAP_CENTER } from "@/core/geo/service-area";
import type { LatLng } from "@/core/geo/types";
import { cn } from "@/lib/utils";

import { boundsOf, type LineString } from "../geo";

// Worker được chép vào public/ ở bước prebuild/predev (scripts/copy-maplibre-worker.mjs).
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

export type TripMapStop = {
  id: string;
  seq: number;
  kind: "pickup" | "dropoff";
  done: boolean;
  skipped: boolean;
  location: LatLng;
  approximate: boolean;
  ariaLabel: string;
};

type TripMapProps = {
  stops: TripMapStop[];
  route: LineString | null;
  /** Tuyến ước tính (nối thẳng) ⇒ nét đứt (DESIGN-SYSTEM §13.5). */
  estimated: boolean;
  activeStopId: string | null;
  onSelectStop: (stopId: string) => void;
  ariaLabel: string;
  className?: string;
};

/**
 * Bản đồ chuyến (DESIGN-SYSTEM §11.2 RouteMap, §13.5): điểm dừng đánh số, điểm giao về là giọt nước,
 * tuyến thật nét liền (casing trắng) hoặc tuyến ước tính nét đứt. Danh sách điểm dừng là bản tương đương.
 */
export function TripMap({
  stops,
  route,
  estimated,
  activeStopId,
  onSelectStop,
  ariaLabel,
  className,
}: TripMapProps) {
  const mapRef = useRef<MapRef>(null);
  const [fallback, setFallback] = useState(false);
  const [colors] = useState(() => ({
    route: cssColor("--map-route", "#1f5fbf"),
    halo: cssColor("--map-halo", "#ffffff"),
    approx: cssColor("--ink-subtle", "#5f7068"),
  }));

  const allPoints = useMemo(
    () => [
      ...stops.map((s) => s.location),
      ...(route?.coordinates ?? []).map(([lng, lat]) => ({ lat, lng })),
    ],
    [stops, route],
  );
  const bounds = useMemo(() => boundsOf(allPoints), [allPoints]);
  const [initialView] = useState(() =>
    bounds
      ? { bounds, fitBoundsOptions: { padding: 56, maxZoom: 15 } }
      : { latitude: DEFAULT_MAP_CENTER.lat, longitude: DEFAULT_MAP_CENTER.lng, zoom: 11 },
  );

  const approxAreas = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: stops
        .filter((s) => s.approximate)
        .map((s) => ({
          type: "Feature" as const,
          properties: {},
          geometry: circlePolygon(s.location, 0.6, 32),
        })),
    }),
    [stops],
  );

  function fitAll() {
    if (!bounds) return;
    mapRef.current?.fitBounds(bounds, {
      padding: 56,
      maxZoom: 15,
      duration: prefersReducedMotion() ? 0 : 500,
    });
  }

  return (
    <div
      role="region"
      aria-label={ariaLabel}
      className={cn(
        "relative size-full overflow-hidden rounded-lg border bg-bg-sunken [&_.maplibregl-ctrl-group_button]:size-11",
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
        attributionControl={{ compact: true }}
        style={{ width: "100%", height: "100%" }}
      >
        <NavigationControl position="top-right" showCompass={false} />
        <Source id="approx-stops" type="geojson" data={approxAreas}>
          <Layer
            id="approx-stops-fill"
            type="fill"
            paint={{ "fill-color": colors.approx, "fill-opacity": 0.12 }}
          />
          <Layer
            id="approx-stops-line"
            type="line"
            paint={{ "line-color": colors.approx, "line-width": 1.5, "line-dasharray": [2, 2] }}
          />
        </Source>
        {route ? (
          <Source id="trip-route" type="geojson" data={{ type: "Feature", properties: {}, geometry: route }}>
            <Layer
              id="trip-route-casing"
              type="line"
              layout={{ "line-cap": "round", "line-join": "round" }}
              paint={{ "line-color": colors.halo, "line-width": estimated ? 6 : 8 }}
            />
            <Layer
              id="trip-route-line"
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
          const active = s.id === activeStopId;
          return (
            <Marker
              key={s.id}
              latitude={s.location.lat}
              longitude={s.location.lng}
              anchor={s.kind === "dropoff" ? "bottom" : "center"}
              style={{ zIndex: active ? 3 : s.kind === "dropoff" ? 1 : 2 }}
            >
              <button
                type="button"
                aria-label={s.ariaLabel}
                aria-pressed={active}
                onClick={() => onSelectStop(s.id)}
                className="block rounded-full"
              >
                {s.kind === "dropoff" ? (
                  <span className="relative block">
                    <svg viewBox="0 0 36 46" width="36" height="46" aria-hidden className="drop-shadow-md">
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
                    <Home aria-hidden className="absolute top-[11px] left-[11px] size-3.5 text-ink" />
                  </span>
                ) : (
                  <span
                    className={cn(
                      "grid place-items-center rounded-full border-[3px] text-sm font-bold tabular-nums shadow-2 transition-[width,height] duration-100",
                      active ? "size-9 ring-2 ring-ink ring-offset-1" : "size-7",
                      s.done
                        ? "border-white bg-success text-white"
                        : s.skipped
                          ? "border-ink-subtle bg-bg-sunken text-ink-subtle line-through"
                          : "border-info bg-surface text-ink",
                    )}
                  >
                    {s.done ? <Check aria-hidden className="size-4" /> : s.seq}
                  </span>
                )}
              </button>
            </Marker>
          );
        })}
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
          {estimated ? "Tuyến ước tính (đường thẳng)" : "Tuyến xe máy"}
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
