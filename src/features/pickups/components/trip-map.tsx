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

/** Tông của tuyến: 0 = `--map-route` (xanh dương, điểm tròn), 1 = `--chart-e` (xanh mòng két, điểm vuông). */
export type RouteTone = 0 | 1;

export type TripMapStop = {
  id: string;
  /** Số hiển thị trên marker (thứ tự trong tuyến của nó). */
  seq: number;
  kind: "pickup" | "dropoff";
  done: boolean;
  skipped: boolean;
  /** Đã đến (check-in) nhưng chưa bàn giao. */
  arrived?: boolean;
  /** Trễ hơn ETA 15 phút (US-CHA-18 AC3). */
  late?: boolean;
  location: LatLng;
  approximate: boolean;
  tone?: RouteTone;
  ariaLabel: string;
};

export type TripMapRoute = {
  id: string;
  line: LineString;
  /** Tuyến ước tính (nối thẳng) ⇒ nét đứt (DESIGN-SYSTEM §13.5). */
  estimated: boolean;
  tone: RouteTone;
  /** Chú thích ("Tuyến xe máy", "Tuyến 2 · Vy — ước tính"…). */
  label: string;
};

export type TripMapVolunteer = { location: LatLng; label: string; ariaLabel: string };

type TripMapProps = {
  stops: TripMapStop[];
  routes: TripMapRoute[];
  volunteer?: TripMapVolunteer | null;
  activeStopId: string | null;
  onSelectStop: (stopId: string) => void;
  ariaLabel: string;
  className?: string;
};

const TONE_BORDER: Record<RouteTone, string> = { 0: "border-info", 1: "border-chart-e" };
const TONE_LINE: Record<RouteTone, string> = { 0: "border-info", 1: "border-chart-e" };

/**
 * Bản đồ chuyến (DESIGN-SYSTEM §11.2 RouteMap, §13.5): điểm dừng đánh số, điểm giao về là giọt nước, một hoặc
 * hai tuyến (2 TNV chia tuyến — khác màu VÀ khác hình điểm dừng), tuyến thật nét liền hoặc tuyến ước tính nét
 * đứt, vị trí tình nguyện viên (chỉ khi được chia sẻ). Danh sách điểm dừng bên cạnh là bản tương đương.
 */
export function TripMap({
  stops,
  routes,
  volunteer = null,
  activeStopId,
  onSelectStop,
  ariaLabel,
  className,
}: TripMapProps) {
  const mapRef = useRef<MapRef>(null);
  const [fallback, setFallback] = useState(false);
  const [colors] = useState(() => ({
    route: [cssColor("--map-route", "#1f5fbf"), cssColor("--chart-e", "#0f766e")] as const,
    halo: cssColor("--map-halo", "#ffffff"),
    approx: cssColor("--ink-subtle", "#5f7068"),
  }));

  const allPoints = useMemo(
    () => [
      ...stops.map((s) => s.location),
      ...routes.flatMap((r) => r.line.coordinates.map(([lng, lat]) => ({ lat, lng }))),
      ...(volunteer ? [volunteer.location] : []),
    ],
    [stops, routes, volunteer],
  );
  const bounds = useMemo(() => boundsOf(allPoints), [allPoints]);
  // Chừa chỗ cho khối chú thích tuyến ở góc dưới để marker không bị che
  const padding = { top: 56, left: 56, right: 56, bottom: 56 + 20 * routes.length };
  const [initialView] = useState(() =>
    bounds
      ? { bounds, fitBoundsOptions: { padding, maxZoom: 15 } }
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
      padding,
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
        {routes.map((r) => (
          <Source
            key={r.id}
            id={`trip-route-${r.id}`}
            type="geojson"
            data={{ type: "Feature", properties: {}, geometry: r.line }}
          >
            <Layer
              id={`trip-route-casing-${r.id}`}
              type="line"
              layout={{ "line-cap": "round", "line-join": "round" }}
              paint={{ "line-color": colors.halo, "line-width": r.estimated ? 6 : 8 }}
            />
            <Layer
              id={`trip-route-line-${r.id}`}
              type="line"
              layout={{ "line-cap": "round", "line-join": "round" }}
              paint={
                r.estimated
                  ? { "line-color": colors.route[r.tone], "line-width": 3, "line-dasharray": [2, 1.5] }
                  : { "line-color": colors.route[r.tone], "line-width": 5 }
              }
            />
          </Source>
        ))}
        {stops.map((s) => {
          const active = s.id === activeStopId;
          const tone = s.tone ?? 0;
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
                className={cn("block", tone === 1 ? "rounded-md" : "rounded-full")}
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
                      "grid place-items-center border-[3px] text-sm font-bold tabular-nums shadow-2 transition-[width,height] duration-100",
                      tone === 1 ? "rounded-md" : "rounded-full",
                      active ? "size-9 ring-2 ring-ink ring-offset-1" : "size-7",
                      s.done
                        ? "border-white bg-success text-white"
                        : s.skipped
                          ? "border-ink-subtle bg-bg-sunken text-ink-subtle line-through"
                          : s.late
                            ? "border-danger bg-danger-soft text-danger"
                            : s.arrived
                              ? cn(TONE_BORDER[tone], "bg-warning-soft text-ink")
                              : cn(TONE_BORDER[tone], "bg-surface text-ink"),
                    )}
                  >
                    {s.done ? <Check aria-hidden className="size-4" /> : s.seq}
                  </span>
                )}
              </button>
            </Marker>
          );
        })}
        {volunteer ? (
          <Marker
            latitude={volunteer.location.lat}
            longitude={volunteer.location.lng}
            anchor="center"
            style={{ zIndex: 4 }}
          >
            <span role="img" aria-label={volunteer.ariaLabel} className="flex flex-col items-center gap-0.5">
              <span
                aria-hidden
                className="block size-5 rounded-full border-2 border-ink shadow-2"
                style={{ background: "var(--map-volunteer)" }}
              />
              <span className="rounded bg-surface/95 px-1.5 py-0.5 text-[11px] leading-tight font-medium whitespace-nowrap text-ink shadow-1">
                {volunteer.label}
              </span>
            </span>
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
      {routes.length > 0 ? (
        <ul
          aria-label="Chú thích tuyến"
          className="pointer-events-none absolute bottom-2 left-2 flex max-w-[calc(100%-7.5rem)] flex-col gap-1 rounded-md bg-surface/90 px-2.5 py-1.5 text-xs text-ink shadow-1"
        >
          {routes.map((r) => (
            <li key={r.id} className="flex items-center gap-2">
              <span
                aria-hidden
                className={cn(
                  "block h-0 w-6 shrink-0 border-t-[3px]",
                  TONE_LINE[r.tone],
                  r.estimated && "border-dashed",
                )}
              />
              <span className="truncate">{r.label}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {fallback ? (
        <p className="absolute top-2.5 left-1/2 -translate-x-1/2 rounded bg-surface/90 px-2 py-1 text-xs text-ink-muted">
          Đang dùng bản đồ dự phòng
        </p>
      ) : null}
    </div>
  );
}
