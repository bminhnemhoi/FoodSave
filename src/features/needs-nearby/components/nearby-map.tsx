"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Layer, Marker, Source, type MapRef } from "react-map-gl/maplibre";

import { BaseMap } from "@/components/map/kit/base-map";
import { useDomClusters } from "@/components/map/kit/clusters";
import { fitPadding } from "@/components/map/kit/geo";
import {
  LegendApprox,
  LegendCluster,
  LegendNeed,
  MapLegend,
  type LegendItem,
} from "@/components/map/kit/legend";
import { MapFrame } from "@/components/map/kit/map-frame";
import { ClusterBubble, HomePin, NeedMarker } from "@/components/map/kit/markers";
import { cssColor, prefersReducedMotion } from "@/components/map/map-style";
import { circlePolygon } from "@/core/geo/circle";
import { DEFAULT_MAP_CENTER } from "@/core/geo/service-area";
import type { LatLng } from "@/core/geo/types";

export type NeedPoint = {
  needId: string;
  location: LatLng;
  approximate: boolean;
  ariaLabel: string;
  /** Chữ dưới marker, ví dụ "Cần 50 ổ". */
  tag?: string;
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
  /** Câu chú thích phía trên bản đồ; mặc định tự tóm tắt. */
  caption?: React.ReactNode;
  className?: string;
};

/** Vùng gần đúng ≥ 500 m (DESIGN-SYSTEM §13.4); lưới `public_location` ≈ 550 m. */
const APPROX_RADIUS_KM = 0.6;
/** Gom cụm khi nhiều nhu cầu (ít điểm thì luôn thấy từng nhu cầu). */
const CLUSTER_FROM = 15;
const needIdOf = (p: NeedPoint) => p.needId;

/**
 * Bản đồ "Nhu cầu gần bạn" (P3-07, US-STO-20 AC2; C1, DESIGN-SYSTEM §13.2–13.4): cửa hàng của bạn (ghim "Cửa hàng
 * của bạn"), mỗi nhu cầu là mái nhà có tim viền màu tổ chức kèm lượng cần; điểm nhận gần đúng vẽ thành vùng mờ + viền
 * nét đứt; điểm ẩn không vẽ (chỉ có trong danh sách). Nhiều nhu cầu ⇒ gom cụm. Danh sách bên cạnh là bản tương đương.
 */
export function NearbyMap({
  stores,
  points,
  hiddenCount,
  selectedId,
  onSelect,
  focusRequest,
  ariaLabel,
  caption,
  className,
}: NearbyMapProps) {
  const mapRef = useRef<MapRef>(null);
  const [colors] = useState(() => ({ approx: cssColor("--ink-subtle", "#5f7068") }));
  const clusters = useDomClusters({
    mapRef,
    sourceId: "needs",
    layerId: "needs-anchor",
    points,
    idOf: needIdOf,
  });

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
      ? { bounds: fit, fitBoundsOptions: { padding: fitPadding(80), maxZoom: 15 } }
      : {
          latitude: all[0]?.lat ?? DEFAULT_MAP_CENTER.lat,
          longitude: all[0]?.lng ?? DEFAULT_MAP_CENTER.lng,
          zoom: all.length ? 14 : 11,
        },
  );

  const needsData = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: points.map((p) => ({
        type: "Feature" as const,
        properties: { id: p.needId },
        geometry: { type: "Point" as const, coordinates: [p.location.lng, p.location.lat] },
      })),
    }),
    [points],
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
    mapRef.current?.fitBounds(fit, {
      padding: fitPadding(80),
      maxZoom: 15,
      duration: prefersReducedMotion() ? 0 : 500,
    });
  }

  const legend: LegendItem[] = [
    ...(points.length > 0 ? [{ key: "need", symbol: <LegendNeed />, label: "Tổ chức đang cần" }] : []),
    ...(clusters.items.some((r) => r.kind === "cluster")
      ? [{ key: "cluster", symbol: <LegendCluster tone="charity" />, label: "Nhiều nhu cầu gần nhau" }]
      : []),
    ...(points.some((p) => p.approximate)
      ? [{ key: "approx", symbol: <LegendApprox />, label: "Vị trí gần đúng" }]
      : []),
  ];

  const summary =
    caption ??
    (points.length + hiddenCount === 0 ? (
      <>Chưa có tổ chức nào gần cửa hàng của bạn đang cần thực phẩm.</>
    ) : (
      <>
        <strong>{points.length + hiddenCount} nhu cầu</strong> của tổ chức quanh cửa hàng bạn · mái nhà có tim
        = tổ chức đang cần, số dưới = lượng cần · chạm để xem chi tiết
      </>
    ));

  return (
    <MapFrame
      fit={fit ? { onClick: fitAll, hint: "hiện mọi nhu cầu và cửa hàng" } : null}
      legend={
        <MapLegend
          items={legend}
          storageKey="nearby"
          note={hiddenCount > 0 ? `${hiddenCount} nhu cầu ẩn vị trí — xem trong danh sách` : undefined}
        />
      }
      ariaLabel={ariaLabel}
      caption={summary}
      onEscape={() => {
        if (selectedId) onSelect(null);
      }}
      className={className}
    >
      <BaseMap
        ref={mapRef}
        initialViewState={initialView}
        onLoad={clusters.recompute}
        onMoveEnd={clusters.recompute}
        onSourceData={clusters.onSourceData}
        onIdle={clusters.onIdle}
      >
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
        <Source
          id="needs"
          type="geojson"
          data={needsData}
          cluster={points.length >= CLUSTER_FROM}
          clusterRadius={52}
          clusterMaxZoom={14}
        >
          {/* Lớp ẩn: chỉ để MapLibre nạp tile của source; cụm/điểm vẽ bằng DOM bên dưới */}
          <Layer id="needs-anchor" type="circle" paint={{ "circle-radius": 1, "circle-opacity": 0 }} />
        </Source>

        {stores.map((s) => (
          <Marker
            key={s.siteId}
            latitude={s.location.lat}
            longitude={s.location.lng}
            anchor="bottom"
            style={{ zIndex: 1 }}
          >
            <HomePin
              kind="store"
              ariaLabel={`Cửa hàng của bạn: ${s.name}`}
              title={s.name}
              caption={stores.length === 1 ? "Cửa hàng của bạn" : s.name}
            />
          </Marker>
        ))}

        {clusters.items.map((r) => {
          if (r.kind === "cluster")
            return (
              <Marker key={r.key} latitude={r.lat} longitude={r.lng} anchor="center" style={{ zIndex: 2 }}>
                <ClusterBubble
                  count={r.count}
                  tone="charity"
                  ariaLabel={`Cụm ${r.count} nhu cầu. Bấm để phóng to.`}
                  onClick={() => void clusters.zoomInto(r)}
                />
              </Marker>
            );
          const p = r.point;
          const selected = p.needId === selectedId;
          return (
            <Marker
              key={r.key}
              latitude={p.location.lat}
              longitude={p.location.lng}
              anchor="center"
              style={{ zIndex: selected ? 4 : 2 }}
            >
              <NeedMarker
                ariaLabel={p.ariaLabel}
                approximate={p.approximate}
                selected={selected}
                tag={p.tag}
                pressed={selected}
                onClick={() => onSelect(p.needId)}
              />
            </Marker>
          );
        })}
      </BaseMap>
    </MapFrame>
  );
}
