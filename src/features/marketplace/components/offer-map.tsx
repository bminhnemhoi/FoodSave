"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Layer, Marker, Source, type MapRef } from "react-map-gl/maplibre";

import { BaseMap } from "@/components/map/kit/base-map";
import { useDomClusters } from "@/components/map/kit/clusters";
import {
  LegendApprox,
  LegendCluster,
  LegendCount,
  LegendStore,
  MapLegend,
  type LegendItem,
} from "@/components/map/kit/legend";
import { MapFrame } from "@/components/map/kit/map-frame";
import { ClusterBubble, HomePin, LABEL_TEXT, StoreMarker } from "@/components/map/kit/markers";
import { cssColor, prefersReducedMotion } from "@/components/map/map-style";
import { circlePolygon } from "@/core/geo/circle";
import { destinationPoint } from "@/core/geo/distance";
import { DEFAULT_MAP_CENTER } from "@/core/geo/service-area";
import type { LatLng } from "@/core/geo/types";
import { LABEL_PRIORITY, type FreshnessLabel } from "@/core/labels";
import { formatKm } from "@/lib/format";

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
  /** Câu chú thích phía trên bản đồ; mặc định tự tóm tắt từ dữ liệu. */
  caption?: React.ReactNode;
  className?: string;
};

const CLUSTER_MAX_ZOOM = 14;
/** Bán kính vùng gần đúng (≥ 500 m — DESIGN-SYSTEM §13.4); lưới `public_location` ≈ 550 m. */
const APPROX_RADIUS_KM = 0.6;
const siteIdOf = (p: StorePoint) => p.siteId;

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
 * Bản đồ Kho tặng (P2-07, C1; DESIGN-SYSTEM §13): điểm nhận (ghim "Điểm nhận của bạn"), vòng bán kính, cửa hàng
 * là tiệm có mái hiên với vòng màu theo nhãn gấp nhất + số lô, lô Đỏ có quầng tỏa; gom cụm bằng source cluster
 * của MapLibre; điểm gần đúng vẽ thành vùng mờ + marker viền nét đứt. Marker và cụm là `<button>` (focus bằng
 * bàn phím, `aria-label` đầy đủ); danh sách bên cạnh là bản tương đương.
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
  caption,
  className,
}: OfferMapProps) {
  const mapRef = useRef<MapRef>(null);
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

  const approx = useMemo(() => points.filter((p) => p.approximate), [points]);
  const byId = useMemo(() => new globalThis.Map(points.map((p) => [p.siteId, p])), [points]);

  // Mọi cửa hàng (cả vị trí gần đúng) chung một source cụm ⇒ marker/cụm không bao giờ đè lên nhau ở cùng mức zoom
  const clusters = useDomClusters({
    mapRef,
    sourceId: "stores",
    layerId: "stores-anchor",
    points,
    idOf: siteIdOf,
  });

  const storesData = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: points.map((p) => ({
        type: "Feature" as const,
        properties: {
          id: p.siteId,
          count: p.count,
          red: p.label === "red" ? 1 : 0,
          yellow: p.label === "yellow" ? 1 : 0,
          green: p.label === "green" ? 1 : 0,
        },
        geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
      })),
    }),
    [points],
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

  const present = new Set(points.map((p) => p.label));
  const redStores = points.filter((p) => p.label === "red").length;
  const legend: LegendItem[] = [
    ...(["red", "yellow", "green", "expired"] as const)
      .filter((l) => present.has(l))
      .map((l) => ({
        key: l,
        symbol: <LegendStore label={l} />,
        label: l === "red" ? "Lô Đỏ — lấy trước" : l === "expired" ? "Hết hạn" : `Lô ${LABEL_TEXT[l]}`,
      })),
    ...(points.some((p) => p.count > 1)
      ? [{ key: "count", symbol: <LegendCount />, label: "Số lô ở cửa hàng" }]
      : []),
    ...(clusters.items.some((r) => r.kind === "cluster")
      ? [{ key: "cluster", symbol: <LegendCluster />, label: "Cụm cửa hàng (chạm để phóng to)" }]
      : []),
    ...(approx.length > 0 ? [{ key: "approx", symbol: <LegendApprox />, label: "Vị trí gần đúng" }] : []),
  ];

  const summary =
    caption ??
    (points.length === 0 ? (
      <>Chưa có cửa hàng nào có lô trong bán kính {formatKm(radiusKm)} quanh điểm nhận.</>
    ) : (
      <>
        <strong>{points.length} cửa hàng</strong> có lô quanh điểm nhận
        {redStores > 0 ? (
          <>
            {" "}
            · <strong>{redStores}</strong> có lô Đỏ (lấy trước)
          </>
        ) : null}{" "}
        · vòng màu = nhãn gấp nhất · chạm cửa hàng để xem lô
      </>
    ));

  return (
    <MapFrame
      fit={center ? { onClick: fitAll, hint: "hiện trọn bán kính quanh điểm nhận" } : null}
      legend={<MapLegend items={legend} listLabel="Chú giải" storageKey="offer" />}
      ariaLabel={ariaLabel}
      caption={summary}
      onEscape={() => {
        if (selectedSiteId) onSelect(null);
      }}
      className={className}
    >
      <BaseMap
        ref={mapRef}
        initialViewState={initialView}
        onLoad={() => {
          clusters.recompute();
          applyFocus();
        }}
        onMoveEnd={clusters.recompute}
        onSourceData={clusters.onSourceData}
        onIdle={clusters.onIdle}
      >
        {radiusCircle ? (
          <Source
            id="radius"
            type="geojson"
            data={{ type: "Feature", properties: {}, geometry: radiusCircle }}
          >
            <Layer
              id="radius-fill"
              type="fill"
              paint={{ "fill-color": colors.primary, "fill-opacity": 0.06 }}
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
            <HomePin
              kind="charity"
              ariaLabel={`Điểm nhận của bạn: ${siteName}`}
              title={siteName}
              caption="Điểm nhận của bạn"
            />
          </Marker>
        ) : null}

        {clusters.items.map((r) => {
          if (r.kind === "cluster") {
            const label = urgent(Number(r.props.red), Number(r.props.yellow), Number(r.props.green));
            const lots = Number(r.props.lots ?? r.count);
            return (
              <Marker key={r.key} latitude={r.lat} longitude={r.lng} anchor="center" style={{ zIndex: 3 }}>
                <ClusterBubble
                  count={r.count}
                  tone={label}
                  ariaLabel={`Cụm ${r.count} cửa hàng, ${lots} lô, gấp nhất: Nhãn ${LABEL_TEXT[label]}. Bấm để phóng to.`}
                  onClick={() => void clusters.zoomInto(r)}
                />
              </Marker>
            );
          }
          const p = r.point;
          const selected = p.siteId === selectedSiteId;
          const active = selected || p.siteId === highlightedSiteId;
          return (
            <Marker
              key={r.key}
              latitude={p.lat}
              longitude={p.lng}
              anchor="center"
              style={{ zIndex: active ? 7 : 6 - LABEL_PRIORITY[p.label] }}
            >
              <StoreMarker
                label={p.label}
                count={p.count}
                approximate={p.approximate}
                selected={active}
                ariaLabel={p.ariaLabel}
                pressed={selected}
                onClick={() => onSelect(p.siteId)}
              />
            </Marker>
          );
        })}
      </BaseMap>
    </MapFrame>
  );
}
