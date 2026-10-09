"use client";

import { useMemo, useRef, useState } from "react";
import { Layer, Marker, Source, type MapRef } from "react-map-gl/maplibre";

import { BaseMap } from "@/components/map/kit/base-map";
import { fitPadding, lineLengthM } from "@/components/map/kit/geo";
import {
  LegendApprox,
  LegendHome,
  LegendOrder,
  LegendStore,
  MapLegend,
  type LegendItem,
  type LegendRoute,
} from "@/components/map/kit/legend";
import { MapFrame, MapInfoCard } from "@/components/map/kit/map-frame";
import { HomePin, LABEL_TEXT, StoreMarker } from "@/components/map/kit/markers";
import { RouteLine } from "@/components/map/kit/route-line";
import { cssColor, prefersReducedMotion } from "@/components/map/map-style";
import { circlePolygon } from "@/core/geo/circle";
import type { LatLng, LngLatTuple } from "@/core/geo/types";
import type { FreshnessLabel } from "@/core/labels";
import { formatDistance } from "@/lib/format";

export type MapStop = {
  siteId: string;
  seq: number;
  /** null ⇒ vị trí ẩn: không vẽ trên bản đồ. */
  location: LatLng | null;
  approximate: boolean;
  ariaLabel: string;
  /** Tên cửa hàng (thẻ thông tin khi chạm). */
  name?: string;
  /** Nhãn gấp nhất của các lô lấy ở điểm này (vòng màu marker). */
  label?: FreshnessLabel;
  /** Chữ dưới marker: lượng lấy ở điểm này, ví dụ "20 ổ". */
  tag?: string;
  /** Dòng phụ trong thẻ thông tin (tên lô, khoảng cách…). */
  details?: string;
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
  /** Câu chú thích phía trên bản đồ; mặc định tự tóm tắt (số cửa hàng, loại tuyến, thứ tự đi). */
  caption?: React.ReactNode;
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
 * Bản đồ phương án ghép (C1; DESIGN-SYSTEM §13.5, RouteMap biến thể `plan`) — khoảnh khắc "50 ổ = 20 + 18 + 12":
 * mỗi cửa hàng là tiệm có mái hiên với SỐ THỨ TỰ đi (huy hiệu xanh dương), lượng lấy ("20 ổ") và vòng màu theo nhãn
 * gấp nhất; tuyến có mũi tên hướng đi (ước tính: nét đứt), các phương án khác mờ; điểm gần đúng là vùng mờ, điểm ẩn
 * không vẽ. Chạm một cửa hàng ⇒ thẻ thông tin + nhảy tới dòng tương ứng trong thẻ phương án (bản tương đương).
 */
export function PlanMap({
  home,
  homeName,
  radiusKm,
  plans,
  activeKey,
  ariaLabel,
  onSelectStop,
  caption,
  className,
}: PlanMapProps) {
  const mapRef = useRef<MapRef>(null);
  const [card, setCard] = useState<string | null>(null);
  const [colors] = useState(() => ({
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
      ? { bounds: fit, fitBoundsOptions: { padding: fitPadding(72), maxZoom: 15 } }
      : { latitude: home.lat, longitude: home.lng, zoom: 14 },
  );

  const realRoute = active?.route && active.route.coordinates.length > 1 ? active.route : null;
  const activeCoords = realRoute?.coordinates ?? (active && active.path.length > 1 ? active.path : null);

  const visibleStops = (active?.stops ?? []).filter((s) => s.location);
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

  const stopCount = active?.stops.length ?? 0;
  const hidden = (active?.stops ?? []).filter((s) => !s.location).length;
  const opened = visibleStops.find((s) => s.siteId === card) ?? null;

  function fitAll() {
    mapRef.current?.fitBounds(fit, {
      padding: fitPadding(72),
      maxZoom: 15,
      duration: prefersReducedMotion() ? 0 : 500,
    });
  }

  const labels = new Set(visibleStops.map((s) => s.label).filter((l): l is FreshnessLabel => !!l));
  const legend: LegendItem[] = [
    { key: "order", symbol: <LegendOrder />, label: "Số = thứ tự đi" },
    ...(["red", "yellow", "green", "expired"] as const)
      .filter((l) => labels.has(l))
      .map((l) => ({
        key: l,
        symbol: <LegendStore label={l} />,
        label: l === "red" ? "Lô Đỏ — lấy trước" : `Lô ${LABEL_TEXT[l]}`,
      })),
    ...(approxAreas.features.length > 0
      ? [{ key: "approx", symbol: <LegendApprox />, label: "Vị trí gần đúng" }]
      : []),
    { key: "home", symbol: <LegendHome kind="charity" />, label: "Điểm nhận (về đây)" },
  ];
  const routes: LegendRoute[] = [
    {
      key: "active",
      label: realRoute ? "Tuyến xe máy · mũi tên = hướng đi" : "Tuyến ước tính · mũi tên = hướng đi",
      tone: 0,
      dashed: !realRoute,
    },
    ...(others.length > 0
      ? [{ key: "alt", label: "Phương án khác", tone: "alt" as const, dashed: true }]
      : []),
  ];

  const order = (active?.stops ?? []).map((s) => s.seq).join(" → ");
  const summary =
    caption ??
    (active ? (
      <>
        <strong>
          Phương án {active.rank}: {stopCount} cửa hàng
        </strong>{" "}
        ·{" "}
        {realRoute ? `tuyến xe máy ${formatDistance(lineLengthM(realRoute.coordinates))}` : "tuyến ước tính"}{" "}
        · đi theo số {order} rồi về điểm nhận
      </>
    ) : null);

  return (
    <MapFrame
      fit={{ onClick: fitAll, hint: "hiện cả tuyến" }}
      legend={
        <MapLegend
          items={legend}
          routes={routes}
          storageKey="plan"
          note={hidden > 0 ? `${hidden} điểm ẩn vị trí (không vẽ) — xem trong danh sách` : undefined}
        />
      }
      ariaLabel={ariaLabel}
      caption={summary}
      onEscape={() => setCard(null)}
      className={className}
    >
      <BaseMap ref={mapRef} initialViewState={initialView} cooperativeGestures>
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
        {others.map((p) => (
          <RouteLine key={p.key} id={`plan-alt-${p.rank}`} coordinates={p.path} muted arrows={false} />
        ))}
        {activeCoords ? (
          <RouteLine id="plan-active" coordinates={activeCoords} estimated={!realRoute} />
        ) : null}

        <Marker latitude={home.lat} longitude={home.lng} anchor="bottom" style={{ zIndex: 1 }}>
          <HomePin kind="charity" ariaLabel={`Điểm nhận của bạn: ${homeName}`} title={homeName} />
        </Marker>

        {visibleStops.map((s) => (
          <Marker
            key={`${active!.key}-${s.siteId}`}
            latitude={s.location!.lat}
            longitude={s.location!.lng}
            anchor="center"
            style={{ zIndex: card === s.siteId ? 5 : 3 }}
          >
            <StoreMarker
              label={s.label}
              order={s.seq}
              tag={s.tag}
              approximate={s.approximate}
              selected={card === s.siteId}
              ariaLabel={s.ariaLabel}
              onClick={() => {
                setCard(s.siteId);
                onSelectStop?.(s.siteId);
              }}
            />
          </Marker>
        ))}
      </BaseMap>
      {opened ? (
        <MapInfoCard
          title={`${opened.seq} · ${opened.name ?? opened.ariaLabel}`}
          onClose={() => setCard(null)}
        >
          {[
            opened.tag ? `Lấy ${opened.tag}` : null,
            opened.label ? `Nhãn ${LABEL_TEXT[opened.label]}` : null,
            opened.details ?? null,
            opened.approximate ? "Vị trí gần đúng" : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </MapInfoCard>
      ) : null}
    </MapFrame>
  );
}
