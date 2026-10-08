"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { HandHeart, LocateFixed, Store } from "lucide-react";
import { setWorkerUrl } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import Map, { Layer, Marker, NavigationControl, Source, type MapRef } from "react-map-gl/maplibre";

import { cssColor, MAP_LOCALE, mapStyleUrl, prefersReducedMotion } from "@/components/map/map-style";
import { circlePolygon } from "@/core/geo/circle";
import { DEFAULT_MAP_CENTER } from "@/core/geo/service-area";
import type { LatLng } from "@/core/geo/types";
import { cn } from "@/lib/utils";

// Worker được chép vào public/ ở bước prebuild/predev (scripts/copy-maplibre-worker.mjs).
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

export type NeedPoint = {
  needId: string;
  location: LatLng;
  approximate: boolean;
  ariaLabel: string;
};

export type StorePin = { siteId: string; name: string; location: LatLng };

type NearbyMapProps = {
  stores: StorePin[];
  points: NeedPoint[];
  hiddenCount: number;
  selectedId: string | null;
  onSelect: (needId: string | null) => void;
  focusRequest: { needId: string; n: number } | null;
  ariaLabel: string;
  className?: string;
};

/** Vùng gần đúng ≥ 500 m (DESIGN-SYSTEM §13.4); lưới `public_location` ≈ 550 m. */
const APPROX_RADIUS_KM = 0.6;

/**
 * Bản đồ "Nhu cầu gần bạn" (P3-07, US-STO-20 AC2; DESIGN-SYSTEM §13.2–13.4): điểm của cửa hàng (giọt nước),
 * nhu cầu là nút tròn viền màu tổ chức; điểm nhận gần đúng vẽ thành vùng mờ chứ không phải ghim; điểm ẩn
 * không vẽ (chỉ có trong danh sách). Marker là `<button>` focus được; danh sách bên cạnh là bản tương đương.
 */
export function NearbyMap({
  stores,
  points,
  hiddenCount,
  selectedId,
  onSelect,
  focusRequest,
  ariaLabel,
  className,
}: NearbyMapProps) {
  const mapRef = useRef<MapRef>(null);
  const [fallback, setFallback] = useState(false);
  const [colors] = useState(() => ({ approx: cssColor("--ink-subtle", "#5f7068") }));

  const all = useMemo(
    () => [...stores.map((s) => s.location), ...points.map((p) => p.location)],
    [stores, points],
  );
  const fit = useMemo(() => {
    if (all.length === 0) return null;
    const lngs = all.map((p) => p.lng);
    const lats = all.map((p) => p.lat);
    return [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ] as [[number, number], [number, number]];
  }, [all]);
  const [initialView] = useState(() =>
    fit && all.length > 1
      ? { bounds: fit, fitBoundsOptions: { padding: 72, maxZoom: 15 } }
      : {
          latitude: all[0]?.lat ?? DEFAULT_MAP_CENTER.lat,
          longitude: all[0]?.lng ?? DEFAULT_MAP_CENTER.lng,
          zoom: all.length ? 14 : 11,
        },
  );

  const approxAreas = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: points
        .filter((p) => p.approximate)
        .map((p) => ({
          type: "Feature" as const,
          properties: {},
          geometry: circlePolygon(p.location, APPROX_RADIUS_KM, 40),
        })),
    }),
    [points],
  );

  // Chọn từ danh sách ⇒ bay tới điểm
  const applied = useRef(0);
  useEffect(() => {
    if (!focusRequest || applied.current === focusRequest.n) return;
    const p = points.find((x) => x.needId === focusRequest.needId);
    const map = mapRef.current;
    if (!p || !map) return;
    applied.current = focusRequest.n;
    map.easeTo({
      center: [p.location.lng, p.location.lat],
      zoom: Math.max(map.getZoom(), 14),
      duration: prefersReducedMotion() ? 0 : 800,
    });
  }, [focusRequest, points]);

  function fitAll() {
    if (!fit) return;
    mapRef.current?.fitBounds(fit, { padding: 72, maxZoom: 15, duration: prefersReducedMotion() ? 0 : 500 });
  }

  return (
    <div
      role="region"
      aria-label={ariaLabel}
      onKeyDown={(e) => {
        if (e.key === "Escape" && selectedId) onSelect(null);
      }}
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
        attributionControl={{ compact: true }}
        style={{ width: "100%", height: "100%" }}
      >
        <NavigationControl position="top-right" showCompass={false} />
        <Source id="need-approx" type="geojson" data={approxAreas}>
          <Layer
            id="need-approx-fill"
            type="fill"
            paint={{ "fill-color": colors.approx, "fill-opacity": 0.12 }}
          />
          <Layer
            id="need-approx-line"
            type="line"
            paint={{ "line-color": colors.approx, "line-width": 1.5, "line-dasharray": [2, 2] }}
          />
        </Source>

        {stores.map((s) => (
          <Marker
            key={s.siteId}
            latitude={s.location.lat}
            longitude={s.location.lng}
            anchor="bottom"
            style={{ zIndex: 1 }}
          >
            <span
              role="img"
              aria-label={`Cửa hàng của bạn: ${s.name}`}
              title={s.name}
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
              <Store aria-hidden className="absolute top-[11px] left-[11px] size-3.5 text-surface" />
            </span>
          </Marker>
        ))}

        {points.map((p) => {
          const selected = p.needId === selectedId;
          return (
            <Marker
              key={p.needId}
              latitude={p.location.lat}
              longitude={p.location.lng}
              anchor="center"
              style={{ zIndex: selected ? 4 : 2 }}
            >
              <button
                type="button"
                data-role="charity"
                aria-label={p.ariaLabel}
                aria-pressed={selected}
                onClick={() => onSelect(p.needId)}
                className={cn(
                  "grid place-items-center rounded-full border-2 bg-surface text-role-accent shadow-2 transition-[width,height] duration-100",
                  p.approximate ? "border-dashed border-role-accent" : "border-role-accent",
                  selected ? "size-10 ring-2 ring-ink ring-offset-1" : "size-8",
                )}
              >
                <HandHeart aria-hidden className="size-4" />
              </button>
            </Marker>
          );
        })}
      </Map>

      {fit ? (
        <button
          type="button"
          onClick={fitAll}
          className="absolute top-2.5 left-2.5 inline-flex h-11 items-center gap-1.5 rounded-md border bg-surface px-3 text-sm font-medium text-ink shadow-1 hover:bg-bg"
        >
          <LocateFixed aria-hidden className="size-4" />
          Vừa khung
        </button>
      ) : null}

      <ul
        aria-label="Chú giải bản đồ"
        className="pointer-events-none absolute bottom-2 left-2 flex max-w-[calc(100%-8.5rem)] flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-surface/95 px-2.5 py-1.5 text-xs text-ink shadow-1"
      >
        <li className="flex items-center gap-1.5" data-role="charity">
          <span
            aria-hidden
            className="grid size-4 place-items-center rounded-full border-2 border-role-accent bg-surface"
          >
            <HandHeart className="size-2.5 text-role-accent" />
          </span>
          Nhu cầu
        </li>
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-4 rounded-full border-2 border-dashed border-ink-subtle bg-bg-sunken"
          />
          Vị trí gần đúng
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-3 rounded-full bg-ink ring-2 ring-role-accent-fill" />
          Cửa hàng của bạn
        </li>
        {hiddenCount > 0 ? <li>{hiddenCount} nhu cầu ẩn vị trí — xem trong danh sách</li> : null}
      </ul>

      {fallback ? (
        <p className="absolute top-2.5 left-1/2 -translate-x-1/2 rounded bg-surface/90 px-2 py-1 text-xs text-ink-muted">
          Đang dùng bản đồ dự phòng
        </p>
      ) : null}
    </div>
  );
}
