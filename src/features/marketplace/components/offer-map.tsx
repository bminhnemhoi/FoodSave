"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { AlarmClock, CircleSlash, Clock, Leaf, LocateFixed, type LucideIcon } from "lucide-react";
import { setWorkerUrl, type GeoJSONSource } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, { Layer, Marker, NavigationControl, Source, type MapRef } from "react-map-gl/maplibre";

import { cssColor, MAP_LOCALE, mapStyleUrl, prefersReducedMotion } from "@/components/map/map-style";
import type { FreshnessLabel } from "@/core/labels";
import { circlePolygon } from "@/core/geo/circle";
import { destinationPoint } from "@/core/geo/distance";
import { DEFAULT_MAP_CENTER } from "@/core/geo/service-area";
import type { LatLng } from "@/core/geo/types";
import { formatKm } from "@/lib/format";
import { cn } from "@/lib/utils";

// Worker được chép vào public/ ở bước prebuild/predev (scripts/copy-maplibre-worker.mjs).
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

/** Một điểm cửa hàng có lô (gộp các lô cùng chi nhánh). */
export type StorePoint = {
  siteId: string;
  lat: number;
  lng: number;
  approximate: boolean;
  /** Nhãn gấp nhất trong các lô của điểm. */
  label: FreshnessLabel;
  /** Số lô. */
  count: number;
  ariaLabel: string;
};

type OfferMapProps = {
  center: LatLng | null;
  siteName: string;
  radiusKm: number;
  /** Bộ lọc khoảng cách nhỏ hơn bán kính ⇒ vẽ thêm vòng lọc. */
  filterKm: number | null;
  /** Theo đúng thứ tự danh sách (Tab đi qua marker theo thứ tự này — DESIGN-SYSTEM §13.7). */
  points: StorePoint[];
  selectedSiteId: string | null;
  highlightedSiteId: string | null;
  onSelect: (siteId: string | null) => void;
  /** Tăng `n` để bay tới điểm `siteId` (chọn từ danh sách). */
  focusRequest: { siteId: string; n: number } | null;
  ariaLabel: string;
  className?: string;
};

const LABEL_ICON: Record<FreshnessLabel, LucideIcon> = {
  red: AlarmClock,
  yellow: Clock,
  green: Leaf,
  expired: CircleSlash,
};

const LABEL_TEXT: Record<FreshnessLabel, string> = {
  red: "Đỏ",
  yellow: "Vàng",
  green: "Xanh",
  expired: "Hết hạn",
};

/** Marker đặc theo nhãn; Vàng bắt buộc viền `--label-yellow-fg` và chữ/icon `--ink` (DESIGN-SYSTEM §3.6). */
const SOLID_TONE: Record<FreshnessLabel, string> = {
  red: "bg-label-red text-white border-white",
  yellow: "bg-label-yellow text-ink border-label-yellow-fg",
  green: "bg-label-green text-white border-white",
  expired: "bg-label-expired text-white border-white",
};

/** Vùng gần đúng: viền nét đứt màu nhãn trên nền surface. */
const APPROX_TONE: Record<FreshnessLabel, string> = {
  red: "border-label-red text-label-red-fg",
  yellow: "border-label-yellow-fg text-label-yellow-fg",
  green: "border-label-green text-label-green-fg",
  expired: "border-label-expired text-label-expired-fg",
};

const CLUSTER_MAX_ZOOM = 14;
/** Bán kính vùng gần đúng (≥ 500 m — DESIGN-SYSTEM §13.4); lưới `public_location` ≈ 550 m. */
const APPROX_RADIUS_KM = 0.6;

type Rendered =
  | {
      kind: "cluster";
      key: string;
      clusterId: number;
      lng: number;
      lat: number;
      stores: number;
      lots: number;
      label: FreshnessLabel;
    }
  | { kind: "point"; key: string; point: StorePoint };

function boundsOfCircle(center: LatLng, radiusKm: number): [[number, number], [number, number]] {
  const ring = circlePolygon(center, radiusKm, 32).coordinates[0];
  const lngs = ring.map((c) => c[0]);
  const lats = ring.map((c) => c[1]);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

function urgent(red: number, yellow: number, green: number): FreshnessLabel {
  if (red > 0) return "red";
  if (yellow > 0) return "yellow";
  if (green > 0) return "green";
  return "expired";
}

/**
 * Bản đồ Kho tặng (P2-07, DESIGN-SYSTEM §13): điểm nhận (giọt nước), vòng bán kính, cửa hàng tô màu theo nhãn
 * gấp nhất, gom cụm bằng source cluster của MapLibre; điểm gần đúng vẽ thành vùng mờ chứ không phải ghim.
 * Marker và cụm là `<button>` (focus bằng bàn phím, `aria-label` đầy đủ); danh sách bên cạnh là bản tương đương.
 */
export function OfferMap({
  center,
  siteName,
  radiusKm,
  filterKm,
  points,
  selectedSiteId,
  highlightedSiteId,
  onSelect,
  focusRequest,
  ariaLabel,
  className,
}: OfferMapProps) {
  const mapRef = useRef<MapRef>(null);
  const [fallback, setFallback] = useState(false);
  const [rendered, setRendered] = useState<Rendered[]>([]);
  // Trước khi source cụm sẵn sàng (style chưa tải, mạng chậm) vẫn vẽ đủ điểm — không bao giờ để bản đồ trống
  const [clusterReady, setClusterReady] = useState(false);
  const [colors] = useState(() => ({
    primary: cssColor("--primary", "#1b6b47"),
    red: cssColor("--label-red-solid", "#c42b21"),
    yellow: cssColor("--label-yellow-fg", "#6b4500"),
    green: cssColor("--label-green-solid", "#2e7d32"),
    expired: cssColor("--label-expired-solid", "#6a6a62"),
  }));

  const home = center ?? DEFAULT_MAP_CENTER;
  const [initialView] = useState(() =>
    center
      ? { bounds: boundsOfCircle(center, radiusKm), fitBoundsOptions: { padding: 24 } }
      : { latitude: DEFAULT_MAP_CENTER.lat, longitude: DEFAULT_MAP_CENTER.lng, zoom: 11 },
  );

  const exact = useMemo(() => points.filter((p) => !p.approximate), [points]);
  const approx = useMemo(() => points.filter((p) => p.approximate), [points]);
  const byId = useMemo(() => new globalThis.Map(points.map((p) => [p.siteId, p])), [points]);
  const order = useMemo(() => new globalThis.Map(points.map((p, i) => [p.siteId, i])), [points]);

  const storesData = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: exact.map((p) => ({
        type: "Feature" as const,
        properties: {
          siteId: p.siteId,
          count: p.count,
          red: p.label === "red" ? 1 : 0,
          yellow: p.label === "yellow" ? 1 : 0,
          green: p.label === "green" ? 1 : 0,
        },
        geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
      })),
    }),
    [exact],
  );

  const approxData = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: approx.map((p) => ({
        type: "Feature" as const,
        properties: { label: p.label },
        geometry: circlePolygon({ lat: p.lat, lng: p.lng }, APPROX_RADIUS_KM, 32),
      })),
    }),
    [approx],
  );

  const radiusCircle = useMemo(() => (center ? circlePolygon(center, radiusKm) : null), [center, radiusKm]);
  const filterCircle = useMemo(
    () => (center && filterKm && filterKm < radiusKm ? circlePolygon(center, filterKm) : null),
    [center, filterKm, radiusKm],
  );
  const radiusLabelAt = useMemo(
    () => (center ? destinationPoint(center, radiusKm * 1000, 0) : null),
    [center, radiusKm],
  );

  /** Đọc cụm/điểm đang hiển thị từ source cluster để vẽ bằng DOM (focus được). */
  const recompute = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map || !map.getSource("stores")) return;
    const seen = new Set<string>();
    const out: Rendered[] = [];
    for (const f of map.querySourceFeatures("stores")) {
      const p = f.properties ?? {};
      if (p.cluster) {
        const key = `c${p.cluster_id}`;
        if (seen.has(key) || f.geometry.type !== "Point") continue;
        seen.add(key);
        const [lng, lat] = f.geometry.coordinates as [number, number];
        out.push({
          kind: "cluster",
          key,
          clusterId: Number(p.cluster_id),
          lng,
          lat,
          stores: Number(p.point_count),
          lots: Number(p.lots ?? p.point_count),
          label: urgent(Number(p.red), Number(p.yellow), Number(p.green)),
        });
      } else {
        const point = byId.get(String(p.siteId));
        const key = `s${p.siteId}`;
        if (!point || seen.has(key)) continue;
        seen.add(key);
        out.push({ kind: "point", key, point });
      }
    }
    // Thứ tự Tab theo danh sách: cụm theo điểm đầu tiên của danh sách nằm trong cụm không xác định được ⇒ cụm trước
    out.sort((a, b) => {
      const ia = a.kind === "point" ? (order.get(a.point.siteId) ?? 0) : -1;
      const ib = b.kind === "point" ? (order.get(b.point.siteId) ?? 0) : -1;
      return ia - ib;
    });
    setRendered(out);
  }, [byId, order]);

  // Dữ liệu đổi (lọc) ⇒ tính lại khi source cập nhật xong
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const t = setTimeout(recompute, 50);
    return () => clearTimeout(t);
  }, [recompute, storesData]);

  // Chọn từ danh sách ⇒ bay tới điểm (đủ gần để tách khỏi cụm). Bản đồ vừa được mở (mobile) thì bay khi tải xong.
  const appliedFocus = useRef(0);
  const applyFocus = useCallback(() => {
    if (!focusRequest || appliedFocus.current === focusRequest.n) return;
    const map = mapRef.current;
    const p = byId.get(focusRequest.siteId);
    if (!map || !p) return;
    appliedFocus.current = focusRequest.n;
    // Mobile: thẻ lô nổi ở nửa dưới khung bản đồ ⇒ đặt điểm ở phần trên để không bị che
    const narrow = window.matchMedia("(max-width: 1023px)").matches;
    const h = map.getContainer().clientHeight;
    map.easeTo({
      center: [p.lng, p.lat],
      zoom: Math.max(map.getZoom(), CLUSTER_MAX_ZOOM + 1),
      offset: narrow ? [0, -Math.round(h * 0.28)] : [0, 0],
      duration: prefersReducedMotion() ? 0 : 800,
    });
  }, [focusRequest, byId]);
  useEffect(applyFocus, [applyFocus]);

  async function zoomIntoCluster(c: Extract<Rendered, { kind: "cluster" }>) {
    const map = mapRef.current;
    const source = map?.getMap().getSource("stores") as GeoJSONSource | undefined;
    if (!map || !source) return;
    let zoom = map.getZoom() + 2;
    try {
      zoom = await source.getClusterExpansionZoom(c.clusterId);
    } catch {
      // cụm đã đổi do dữ liệu mới — vẫn phóng to theo mặc định
    }
    map.easeTo({ center: [c.lng, c.lat], zoom, duration: prefersReducedMotion() ? 0 : 500 });
  }

  function fitAll() {
    const map = mapRef.current;
    if (!map || !center) return;
    map.fitBounds(boundsOfCircle(center, radiusKm), {
      padding: 24,
      duration: prefersReducedMotion() ? 0 : 500,
    });
  }

  const labelColor = [
    "match",
    ["get", "label"],
    "red",
    colors.red,
    "yellow",
    colors.yellow,
    "green",
    colors.green,
    colors.expired,
  ] as unknown as string;

  return (
    <div
      role="region"
      aria-label={ariaLabel}
      onKeyDown={(e) => {
        if (e.key === "Escape" && selectedSiteId) onSelect(null);
      }}
      className={cn(
        "relative size-full overflow-hidden rounded-lg border bg-bg-sunken",
        // Nút phóng to/thu nhỏ 44 px (DESIGN-SYSTEM §13.1)
        "[&_.maplibregl-ctrl-group_button]:size-11",
        className,
      )}
    >
      <Map
        ref={mapRef}
        initialViewState={initialView}
        mapStyle={mapStyleUrl(fallback)}
        locale={MAP_LOCALE}
        onError={() => setFallback(true)}
        onLoad={() => {
          recompute();
          applyFocus();
        }}
        onMoveEnd={recompute}
        onSourceData={(e) => {
          if (e.sourceId === "stores" && e.isSourceLoaded) {
            setClusterReady(true);
            recompute();
          }
        }}
        dragRotate={false}
        touchPitch={false}
        pitchWithRotate={false}
        attributionControl={{ compact: true }}
        style={{ width: "100%", height: "100%" }}
      >
        <NavigationControl position="top-right" showCompass={false} />

        {radiusCircle ? (
          <Source
            id="radius"
            type="geojson"
            data={{ type: "Feature", properties: {}, geometry: radiusCircle }}
          >
            <Layer
              id="radius-fill"
              type="fill"
              paint={{ "fill-color": colors.primary, "fill-opacity": 0.08 }}
            />
            <Layer
              id="radius-line"
              type="line"
              paint={{ "line-color": colors.primary, "line-width": 2, "line-dasharray": [2, 2] }}
            />
          </Source>
        ) : null}
        {filterCircle ? (
          <Source
            id="filter-radius"
            type="geojson"
            data={{ type: "Feature", properties: {}, geometry: filterCircle }}
          >
            <Layer
              id="filter-radius-line"
              type="line"
              paint={{ "line-color": colors.primary, "line-width": 2.5, "line-opacity": 0.9 }}
            />
          </Source>
        ) : null}

        <Source id="approx" type="geojson" data={approxData}>
          <Layer id="approx-fill" type="fill" paint={{ "fill-color": labelColor, "fill-opacity": 0.14 }} />
          <Layer
            id="approx-line"
            type="line"
            paint={{ "line-color": labelColor, "line-width": 1.5, "line-dasharray": [2, 2] }}
          />
        </Source>

        <Source
          id="stores"
          type="geojson"
          data={storesData}
          cluster
          clusterRadius={52}
          clusterMaxZoom={CLUSTER_MAX_ZOOM}
          clusterProperties={{
            red: ["+", ["get", "red"]],
            yellow: ["+", ["get", "yellow"]],
            green: ["+", ["get", "green"]],
            lots: ["+", ["get", "count"]],
          }}
        >
          {/* Lớp ẩn: chỉ để MapLibre nạp tile của source; cụm/điểm vẽ bằng DOM bên dưới */}
          <Layer id="stores-anchor" type="circle" paint={{ "circle-radius": 1, "circle-opacity": 0 }} />
        </Source>

        {radiusLabelAt ? (
          <Marker latitude={radiusLabelAt.lat} longitude={radiusLabelAt.lng} anchor="bottom">
            <span className="mb-1 rounded-sm bg-surface/90 px-1.5 py-0.5 text-xs font-medium text-primary tabular-nums shadow-1">
              Bán kính {formatKm(radiusKm)}
            </span>
          </Marker>
        ) : null}

        {center ? (
          <Marker latitude={home.lat} longitude={home.lng} anchor="bottom" style={{ zIndex: 1 }}>
            <span role="img" aria-label={`Điểm nhận của bạn: ${siteName}`} title={siteName} className="block">
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
            </span>
          </Marker>
        ) : null}

        {approx.map((p) => {
          const Icon = LABEL_ICON[p.label];
          const active = p.siteId === selectedSiteId || p.siteId === highlightedSiteId;
          return (
            <Marker
              key={`a${p.siteId}`}
              latitude={p.lat}
              longitude={p.lng}
              anchor="center"
              style={{ zIndex: active ? 3 : 2 }}
            >
              <button
                type="button"
                aria-label={p.ariaLabel}
                aria-pressed={p.siteId === selectedSiteId}
                onClick={() => onSelect(p.siteId)}
                className={cn(
                  "grid place-items-center rounded-full border-2 border-dashed bg-surface/90 shadow-1 transition-[width,height] duration-100",
                  active ? "size-10 ring-2 ring-ink" : "size-8",
                  APPROX_TONE[p.label],
                )}
              >
                <Icon aria-hidden className="size-4" />
              </button>
            </Marker>
          );
        })}

        {(clusterReady
          ? rendered
          : exact.map((point): Rendered => ({ kind: "point", key: `s${point.siteId}`, point }))
        ).map((r) => {
          if (r.kind === "cluster") {
            const size = r.stores >= 10 ? "size-12" : r.stores >= 5 ? "size-10" : "size-9";
            return (
              <Marker key={r.key} latitude={r.lat} longitude={r.lng} anchor="center" style={{ zIndex: 2 }}>
                <button
                  type="button"
                  aria-label={`Cụm ${r.stores} cửa hàng, ${r.lots} lô, gấp nhất: Nhãn ${LABEL_TEXT[r.label]}. Bấm để phóng to.`}
                  onClick={() => void zoomIntoCluster(r)}
                  className={cn(
                    "grid place-items-center rounded-full border-2 text-sm font-bold tabular-nums shadow-2 outline-offset-2",
                    size,
                    SOLID_TONE[r.label],
                  )}
                >
                  {r.stores}
                </button>
              </Marker>
            );
          }
          const p = r.point;
          const Icon = LABEL_ICON[p.label];
          const selected = p.siteId === selectedSiteId;
          const active = selected || p.siteId === highlightedSiteId;
          return (
            <Marker
              key={r.key}
              latitude={p.lat}
              longitude={p.lng}
              anchor="center"
              style={{ zIndex: active ? 4 : 2 }}
            >
              <button
                type="button"
                aria-label={p.ariaLabel}
                aria-pressed={selected}
                onClick={() => onSelect(p.siteId)}
                className={cn(
                  "relative grid place-items-center rounded-full border-2 shadow-2 transition-[width,height] duration-100",
                  active ? "size-10 ring-2 ring-ink ring-offset-1" : "size-8",
                  SOLID_TONE[p.label],
                )}
              >
                <Icon aria-hidden className="size-4" />
                {p.count > 1 ? (
                  <span
                    aria-hidden
                    className="absolute -top-2 -right-2 grid h-5 min-w-5 place-items-center rounded-full bg-ink px-1 text-[11px] leading-none font-bold text-white tabular-nums ring-2 ring-white"
                  >
                    {p.count}
                  </span>
                ) : null}
              </button>
            </Marker>
          );
        })}
      </Map>

      {center ? (
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
        aria-label="Chú giải"
        className="pointer-events-none absolute bottom-2 left-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-surface/90 px-2.5 py-1.5 text-xs text-ink shadow-1"
      >
        {(["red", "yellow", "green"] as const).map((l) => {
          const Icon = LABEL_ICON[l];
          return (
            <li key={l} className="flex items-center gap-1">
              <span className={cn("grid size-4 place-items-center rounded-full border", SOLID_TONE[l])}>
                <Icon aria-hidden className="size-2.5" />
              </span>
              {LABEL_TEXT[l]}
            </li>
          );
        })}
        <li className="flex items-center gap-1">
          <span
            aria-hidden
            className="size-4 rounded-full border-2 border-dashed border-ink-subtle bg-surface"
          />
          Vị trí gần đúng
        </li>
      </ul>

      {fallback ? (
        <p className="absolute top-2.5 left-1/2 -translate-x-1/2 rounded bg-surface/90 px-2 py-1 text-xs text-ink-muted">
          Đang dùng bản đồ dự phòng
        </p>
      ) : null}
    </div>
  );
}
