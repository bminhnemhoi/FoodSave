"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { Home, LocateFixed } from "lucide-react";
import { setWorkerUrl } from "maplibre-gl";
import { useMemo, useRef, useState } from "react";
import Map, { Layer, Marker, NavigationControl, Source, type MapRef } from "react-map-gl/maplibre";

import { cssColor, MAP_LOCALE, mapStyleUrl, prefersReducedMotion } from "@/components/map/map-style";
import { circlePolygon } from "@/core/geo/circle";
import type { LatLng, LngLatTuple } from "@/core/geo/types";
import { cn } from "@/lib/utils";

// Worker được chép vào public/ ở bước prebuild/predev (scripts/copy-maplibre-worker.mjs).
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

export type MapStop = {
  siteId: string;
  seq: number;
  /** null ⇒ vị trí ẩn: không vẽ trên bản đồ. */
  location: LatLng | null;
  approximate: boolean;
  ariaLabel: string;
};

export type MapPlan = {
  key: string;
  rank: number;
  stops: MapStop[];
  /** Đường ước tính [lng, lat] theo thứ tự đi (điểm nhận → … → điểm nhận). */
  path: LngLatTuple[];
  /** Tuyến xe máy thật (phương án đã chọn, khi mọi điểm công khai). */
  route?: { type: "LineString"; coordinates: LngLatTuple[] } | null;
};

type PlanMapProps = {
  home: LatLng;
  homeName: string;
  radiusKm?: number | null;
  plans: MapPlan[];
  activeKey: string | null;
  ariaLabel: string;
  onSelectStop?: (siteId: string) => void;
  className?: string;
};

/** Vùng gần đúng ≥ 500 m (DESIGN-SYSTEM §13.4); lưới `public_location` ≈ 550 m. */
const APPROX_RADIUS_KM = 0.6;

function bounds(points: LngLatTuple[]): [[number, number], [number, number]] {
  const lngs = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

/**
 * Bản đồ phương án ghép (DESIGN-SYSTEM §13.5, RouteMap biến thể `plan`): điểm nhận (giọt nước), điểm dừng
 * đánh số theo thứ tự đi của phương án đang xem, tuyến ước tính nét đứt (chú thích "ước tính"), tuyến các
 * phương án khác mờ; điểm gần đúng là vùng mờ, điểm ẩn không vẽ. Danh sách điểm dừng là bản tương đương.
 */
export function PlanMap({
  home,
  homeName,
  radiusKm,
  plans,
  activeKey,
  ariaLabel,
  onSelectStop,
  className,
}: PlanMapProps) {
  const mapRef = useRef<MapRef>(null);
  const [fallback, setFallback] = useState(false);
  const [colors] = useState(() => ({
    route: cssColor("--map-route", "#1f5fbf"),
    alt: cssColor("--map-route-alt", "#8e8676"),
    halo: cssColor("--map-halo", "#ffffff"),
    approx: cssColor("--ink-subtle", "#5f7068"),
    primary: cssColor("--primary", "#1b6b47"),
  }));

  const active = plans.find((p) => p.key === activeKey) ?? plans[0] ?? null;
  const others = plans.filter((p) => p !== active);

  const allPoints = useMemo<LngLatTuple[]>(() => {
    const pts: LngLatTuple[] = [[home.lng, home.lat]];
    for (const p of plans) {
      for (const c of p.path) pts.push(c);
      for (const c of p.route?.coordinates ?? []) pts.push(c);
    }
    return pts;
  }, [home, plans]);
  const fit = useMemo(() => bounds(allPoints), [allPoints]);
  const [initialView] = useState(() =>
    allPoints.length > 1
      ? { bounds: fit, fitBoundsOptions: { padding: 64, maxZoom: 15 } }
      : { latitude: home.lat, longitude: home.lng, zoom: 14 },
  );

  const altLines = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: others
        .filter((p) => p.path.length > 1)
        .map((p) => ({
          type: "Feature" as const,
          properties: { rank: p.rank },
          geometry: { type: "LineString" as const, coordinates: p.path },
        })),
    }),
    [others],
  );

  const realRoute = active?.route && active.route.coordinates.length > 1 ? active.route : null;
  const activeLine =
    realRoute ??
    (active && active.path.length > 1 ? { type: "LineString" as const, coordinates: active.path } : null);

  const approxAreas = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: (active?.stops ?? [])
        .filter((s) => s.approximate && s.location)
        .map((s) => ({
          type: "Feature" as const,
          properties: {},
          geometry: circlePolygon(s.location!, APPROX_RADIUS_KM, 40),
        })),
    }),
    [active],
  );
  const radiusCircle = useMemo(
    () => (radiusKm && radiusKm > 0 ? circlePolygon(home, radiusKm) : null),
    [home, radiusKm],
  );

  const hidden = (active?.stops ?? []).filter((s) => !s.location).length;

  function fitAll() {
    mapRef.current?.fitBounds(fit, { padding: 64, maxZoom: 15, duration: prefersReducedMotion() ? 0 : 500 });
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
        {radiusCircle ? (
          <Source
            id="plan-radius"
            type="geojson"
            data={{ type: "Feature", properties: {}, geometry: radiusCircle }}
          >
            <Layer
              id="plan-radius-fill"
              type="fill"
              paint={{ "fill-color": colors.primary, "fill-opacity": 0.04 }}
            />
            <Layer
              id="plan-radius-line"
              type="line"
              paint={{
                "line-color": colors.primary,
                "line-width": 1.5,
                "line-opacity": 0.5,
                "line-dasharray": [2, 2],
              }}
            />
          </Source>
        ) : null}
        <Source id="plan-approx" type="geojson" data={approxAreas}>
          <Layer
            id="plan-approx-fill"
            type="fill"
            paint={{ "fill-color": colors.approx, "fill-opacity": 0.12 }}
          />
          <Layer
            id="plan-approx-line"
            type="line"
            paint={{ "line-color": colors.approx, "line-width": 1.5, "line-dasharray": [2, 2] }}
          />
        </Source>
        <Source id="plan-alt" type="geojson" data={altLines}>
          <Layer
            id="plan-alt-line"
            type="line"
            layout={{ "line-cap": "round", "line-join": "round" }}
            paint={{
              "line-color": colors.alt,
              "line-width": 3,
              "line-opacity": 0.55,
              "line-dasharray": [1.5, 2],
            }}
          />
        </Source>
        {activeLine ? (
          <Source
            id="plan-active"
            type="geojson"
            data={{ type: "Feature", properties: {}, geometry: activeLine }}
          >
            <Layer
              id="plan-active-casing"
              type="line"
              layout={{ "line-cap": "round", "line-join": "round" }}
              paint={{ "line-color": colors.halo, "line-width": realRoute ? 9 : 7 }}
            />
            <Layer
              id="plan-active-line"
              type="line"
              layout={{ "line-cap": "round", "line-join": "round" }}
              paint={
                realRoute
                  ? { "line-color": colors.route, "line-width": 5 }
                  : { "line-color": colors.route, "line-width": 4, "line-dasharray": [2, 1.4] }
              }
            />
          </Source>
        ) : null}

        <Marker latitude={home.lat} longitude={home.lng} anchor="bottom" style={{ zIndex: 1 }}>
          <span
            role="img"
            aria-label={`Điểm nhận của bạn: ${homeName}`}
            title={homeName}
            className="relative block"
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
                r="9"
                className="fill-role-accent-fill stroke-surface"
                strokeWidth={2}
              />
            </svg>
            <Home aria-hidden className="absolute top-[11px] left-[11px] size-3.5 text-ink" />
          </span>
        </Marker>

        {(active?.stops ?? [])
          .filter((s) => s.location)
          .map((s) => (
            <Marker
              key={`${active!.key}-${s.siteId}`}
              latitude={s.location!.lat}
              longitude={s.location!.lng}
              anchor="center"
              style={{ zIndex: 3 }}
            >
              <button
                type="button"
                aria-label={s.ariaLabel}
                onClick={() => onSelectStop?.(s.siteId)}
                className={cn(
                  "grid size-8 place-items-center rounded-full border-[3px] bg-surface text-sm font-bold text-ink tabular-nums shadow-2 outline-offset-2",
                  s.approximate ? "border-dashed border-info" : "border-info",
                )}
              >
                {s.seq}
              </button>
            </Marker>
          ))}
      </Map>

      <button
        type="button"
        onClick={fitAll}
        className="absolute top-2.5 left-2.5 inline-flex h-11 items-center gap-1.5 rounded-md border bg-surface px-3 text-sm font-medium text-ink shadow-1 hover:bg-bg"
      >
        <LocateFixed aria-hidden className="size-4" />
        Vừa khung
      </button>

      <ul
        aria-label="Chú giải bản đồ"
        className="pointer-events-none absolute bottom-2 left-2 flex max-w-[calc(100%-8.5rem)] flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-surface/95 px-2.5 py-1.5 text-xs text-ink shadow-1"
      >
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={cn("block h-0 w-6 border-t-[3px] border-info", !realRoute && "border-dashed")}
          />
          {realRoute ? "Tuyến xe máy" : "Tuyến ước tính"}
        </li>
        {others.length > 0 ? (
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="block h-0 w-6 border-t-2 border-dashed border-border-strong" />
            Phương án khác
          </li>
        ) : null}
        {approxAreas.features.length > 0 ? (
          <li className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-3.5 rounded-full border-2 border-dashed border-ink-subtle bg-bg-sunken"
            />
            Vị trí gần đúng
          </li>
        ) : null}
        {hidden > 0 ? <li>{hidden} điểm ẩn vị trí (không vẽ)</li> : null}
      </ul>

      {fallback ? (
        <p className="absolute top-2.5 left-1/2 -translate-x-1/2 rounded bg-surface/90 px-2 py-1 text-xs text-ink-muted">
          Đang dùng bản đồ dự phòng
        </p>
      ) : null}
    </div>
  );
}
