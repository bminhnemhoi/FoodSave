"use client";

import { useMemo, useRef } from "react";
import { Marker, type MapProps, type MapRef } from "react-map-gl/maplibre";

import type { FreshnessLabel } from "@/components/labels/freshness-badge";
import { cn } from "@/lib/utils";

import { BaseMap } from "./kit/base-map";
import { boundsOfPoints, fitPadding } from "./kit/geo";
import {
  LegendHome,
  LegendOrder,
  LegendStore,
  LegendVolunteer,
  MapLegend,
  type LegendItem,
} from "./kit/legend";
import { MapFrame } from "./kit/map-frame";
import { HomePin, LABEL_TEXT, StoreMarker, VolunteerMarker } from "./kit/markers";
import { RouteLine } from "./kit/route-line";
import { prefersReducedMotion } from "./map-style";

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
  /** Một câu phía trên bản đồ: bản đồ cho thấy gì. */
  caption?: React.ReactNode;
  initialView?: MapProps["initialViewState"];
};

/**
 * Bản đồ chỉ để xem (không chọn điểm): điểm theo loại bằng marker minh họa của bộ dùng chung, tuyến (nếu có),
 * chú giải theo các loại điểm đang có (DESIGN-SYSTEM §13). Dùng ở trang duyệt hồ sơ (Admin) và trang thử.
 */
export function MapView({ points, route, className, ariaLabel, caption, initialView }: MapViewProps) {
  const mapRef = useRef<MapRef>(null);
  const bounds = useMemo(() => boundsOfPoints(points), [points]);

  const view = useMemo(() => {
    if (initialView) return initialView;
    if (!bounds) return { latitude: 10.7769, longitude: 106.7009, zoom: 12 };
    return { bounds, fitBoundsOptions: { padding: fitPadding(72), maxZoom: 16 } };
  }, [initialView, bounds]);

  const legend = useMemo<LegendItem[]>(() => {
    const items: LegendItem[] = [];
    const labels = new Set(points.filter((p) => p.label).map((p) => p.label!));
    for (const l of ["red", "yellow", "green", "expired"] as const)
      if (labels.has(l))
        items.push({ key: l, symbol: <LegendStore label={l} />, label: `Cửa hàng có lô ${LABEL_TEXT[l]}` });
    if (points.some((p) => p.order))
      items.push({ key: "order", symbol: <LegendOrder />, label: "Thứ tự đi" });
    if (points.some((p) => p.kind === "store" && !p.label))
      items.push({ key: "store", symbol: <LegendHome kind="store" />, label: "Cửa hàng" });
    if (points.some((p) => p.kind === "charity" || p.kind === "home"))
      items.push({ key: "charity", symbol: <LegendHome kind="charity" />, label: "Tổ chức / điểm nhận" });
    if (points.some((p) => p.kind === "volunteer"))
      items.push({ key: "vol", symbol: <LegendVolunteer />, label: "Tình nguyện viên" });
    return items;
  }, [points]);

  function fitAll() {
    if (!bounds) return;
    mapRef.current?.fitBounds(bounds, {
      padding: fitPadding(72),
      maxZoom: 16,
      duration: prefersReducedMotion() ? 0 : 500,
    });
  }

  return (
    <MapFrame
      fit={points.length > 1 ? { onClick: fitAll, hint: "hiện tất cả các điểm" } : null}
      legend={<MapLegend items={legend} storageKey="view" />}
      ariaLabel={ariaLabel}
      caption={caption}
      className={cn("rounded-lg", className)}
    >
      <BaseMap ref={mapRef} initialViewState={view}>
        {route ? <RouteLine id="route" coordinates={route.coordinates} /> : null}
        {points.map((p) => (
          <Marker
            key={p.id}
            latitude={p.lat}
            longitude={p.lng}
            anchor={p.label || p.kind === "volunteer" ? "center" : "bottom"}
          >
            {p.kind === "volunteer" ? (
              <VolunteerMarker ariaLabel={p.title} label={p.title} />
            ) : p.label ? (
              <StoreMarker label={p.label} order={p.order} ariaLabel={p.title} title={p.title} />
            ) : (
              <HomePin
                kind={p.kind === "store" ? "store" : "charity"}
                ariaLabel={p.title}
                title={p.title}
                caption={points.length === 1 ? p.title : undefined}
              />
            )}
          </Marker>
        ))}
      </BaseMap>
    </MapFrame>
  );
}
