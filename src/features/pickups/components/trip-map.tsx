"use client";

import { useMemo, useRef, useState } from "react";
import { Layer, Marker, Source, type MapRef } from "react-map-gl/maplibre";

import { BaseMap } from "@/components/map/kit/base-map";
import { fitPadding, lineLengthM } from "@/components/map/kit/geo";
import {
  LegendApprox,
  LegendStop,
  LegendVolunteer,
  MapLegend,
  type LegendItem,
  type LegendRoute,
} from "@/components/map/kit/legend";
import { MapFrame, MapInfoCard } from "@/components/map/kit/map-frame";
import { HomePin, StopPin, VolunteerMarker, type StopStatus } from "@/components/map/kit/markers";
import { RouteLine } from "@/components/map/kit/route-line";
import { cssColor, prefersReducedMotion } from "@/components/map/map-style";
import { circlePolygon } from "@/core/geo/circle";
import { DEFAULT_MAP_CENTER } from "@/core/geo/service-area";
import type { LatLng } from "@/core/geo/types";
import { formatDistance } from "@/lib/format";

import { boundsOf, type LineString } from "../geo";

/** Tông của tuyến: 0 = `--map-route` (xanh dương, ghim tròn), 1 = `--chart-e` (xanh mòng két, ghim vuông). */
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

export type TripMapVolunteer = {
  location: LatLng;
  /** Chữ dưới marker: "Minh An · cập nhật 3 phút trước". */
  label: string;
  ariaLabel: string;
  /** Vị trí cũ hơn 10 phút (app TNV có thể đã đóng) ⇒ marker xám + cảnh báo. */
  stale?: boolean;
};

type TripMapProps = {
  stops: TripMapStop[];
  routes: TripMapRoute[];
  volunteer?: TripMapVolunteer | null;
  activeStopId: string | null;
  onSelectStop: (stopId: string) => void;
  ariaLabel: string;
  /** Câu chú thích phía trên bản đồ; mặc định tự tóm tắt (số điểm, loại tuyến, thứ tự đi). */
  caption?: React.ReactNode;
  className?: string;
};

const TONE_VAR: Record<RouteTone, `--${string}`> = { 0: "--map-route", 1: "--chart-e" };

function statusOf(s: TripMapStop): StopStatus {
  if (s.done) return "done";
  if (s.skipped) return "skipped";
  if (s.late) return "late";
  if (s.arrived) return "arrived";
  return "pending";
}

const STATUS_LEGEND: Record<StopStatus, string> = {
  pending: "Điểm lấy hàng — số = thứ tự đi",
  arrived: "Tình nguyện viên đã đến",
  done: "Đã lấy hàng",
  late: "Trễ hơn dự kiến 15 phút",
  skipped: "Bỏ qua",
};

/**
 * Bản đồ chuyến (C1; DESIGN-SYSTEM §11.2 RouteMap, §13.5): điểm lấy là ghim có số thứ tự (trạng thái bằng màu VÀ
 * ký hiệu: ✓ đã lấy, ! trễ), điểm giao cuối là ghim mái nhà "Giao về", một hoặc hai tuyến (2 TNV chia tuyến — khác
 * màu VÀ khác hình ghim) có mũi tên hướng đi, tuyến ước tính nét đứt, tình nguyện viên trên xe máy kèm "cập nhật x
 * phút trước" (chỉ khi được chia sẻ). Chạm điểm ⇒ thẻ thông tin; danh sách điểm dừng bên cạnh là bản tương đương.
 */
export function TripMap({
  stops,
  routes,
  volunteer = null,
  activeStopId,
  onSelectStop,
  ariaLabel,
  caption,
  className,
}: TripMapProps) {
  const mapRef = useRef<MapRef>(null);
  const [card, setCard] = useState<string | null>(null);
  const [colors] = useState(() => ({ approx: cssColor("--ink-subtle", "#5f7068") }));

  const allPoints = useMemo(
    () => [
      ...stops.map((s) => s.location),
      ...routes.flatMap((r) => r.line.coordinates.map(([lng, lat]) => ({ lat, lng }))),
      ...(volunteer ? [volunteer.location] : []),
    ],
    [stops, routes, volunteer],
  );
  const bounds = useMemo(() => boundsOf(allPoints), [allPoints]);
  const padding = fitPadding(64);
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
    mapRef.current?.fitBounds(bounds, { padding, maxZoom: 15, duration: prefersReducedMotion() ? 0 : 500 });
  }

  const pickups = stops.filter((s) => s.kind === "pickup");
  const statuses = new Set(pickups.map(statusOf));
  const tones = new Set(pickups.map((s) => s.tone ?? 0));
  const legend: LegendItem[] = [
    ...(["pending", "arrived", "done", "late", "skipped"] as const)
      .filter((st) => statuses.has(st))
      .map((st) => ({ key: st, symbol: <LegendStop status={st} />, label: STATUS_LEGEND[st] })),
    ...(tones.has(1)
      ? [{ key: "tone1", symbol: <LegendStop tone={1} />, label: "Điểm của tuyến 2 (ghim vuông)" }]
      : []),
    ...(volunteer
      ? [
          {
            key: "vol",
            symbol: <LegendVolunteer stale={volunteer.stale} />,
            label: volunteer.stale ? "Tình nguyện viên (vị trí cũ)" : "Tình nguyện viên",
          },
        ]
      : []),
    ...(approxAreas.features.length > 0
      ? [{ key: "approx", symbol: <LegendApprox />, label: "Vị trí gần đúng" }]
      : []),
  ];
  const legendRoutes: LegendRoute[] = routes.map((r) => ({
    key: r.id,
    label: r.label,
    tone: r.tone,
    dashed: r.estimated,
  }));

  const summary =
    caption ??
    (routes.length > 1 ? (
      <>
        <strong>{routes.length} tuyến</strong> cho {routes.length} tình nguyện viên (ghim tròn = tuyến 1, ghim
        vuông = tuyến 2) · mỗi người đi theo số của mình rồi giao về điểm nhận
      </>
    ) : (
      <>
        <strong>{pickups.length} điểm lấy</strong> ·{" "}
        {routes[0]
          ? routes[0].estimated
            ? "tuyến ước tính (nối thẳng)"
            : `tuyến xe máy ${formatDistance(lineLengthM(routes[0].line.coordinates))}`
          : "chưa có tuyến"}{" "}
        · đi theo số {pickups.map((s) => s.seq).join(" → ")}
        {stops.some((s) => s.kind === "dropoff") ? " rồi giao về điểm nhận" : ""}
        {volunteer ? ` · TNV: ${volunteer.label}` : ""}
      </>
    ));

  const opened = stops.find((s) => s.id === card) ?? null;

  return (
    <MapFrame
      fit={bounds ? { onClick: fitAll, hint: "hiện cả tuyến" } : null}
      legend={
        <MapLegend items={legend} routes={legendRoutes} listLabel="Chú giải ký hiệu" storageKey="trip" />
      }
      ariaLabel={ariaLabel}
      caption={summary}
      onEscape={() => setCard(null)}
      className={className}
    >
      <BaseMap ref={mapRef} initialViewState={initialView}>
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
          <RouteLine
            key={r.id}
            id={`trip-route-${r.id}`}
            coordinates={r.line.coordinates}
            colorVar={TONE_VAR[r.tone]}
            estimated={r.estimated}
          />
        ))}
        {stops.map((s) => {
          const active = s.id === activeStopId || s.id === card;
          const select = () => {
            setCard(s.id);
            onSelectStop(s.id);
          };
          return (
            <Marker
              key={s.id}
              latitude={s.location.lat}
              longitude={s.location.lng}
              anchor="bottom"
              style={{ zIndex: active ? 4 : s.kind === "dropoff" ? 1 : 2 }}
            >
              {s.kind === "dropoff" ? (
                <HomePin
                  kind="charity"
                  caption="Giao về"
                  done={s.done}
                  selected={active}
                  ariaLabel={s.ariaLabel}
                  pressed={active}
                  onClick={select}
                />
              ) : (
                <StopPin
                  seq={s.seq}
                  status={statusOf(s)}
                  tone={s.tone ?? 0}
                  selected={active}
                  ariaLabel={s.ariaLabel}
                  pressed={active}
                  onClick={select}
                />
              )}
            </Marker>
          );
        })}
        {volunteer ? (
          <Marker
            latitude={volunteer.location.lat}
            longitude={volunteer.location.lng}
            anchor="center"
            style={{ zIndex: 5 }}
          >
            <VolunteerMarker
              ariaLabel={volunteer.ariaLabel}
              label={volunteer.label}
              stale={volunteer.stale}
            />
          </Marker>
        ) : null}
      </BaseMap>
      {opened ? <MapInfoCard title={opened.ariaLabel} onClose={() => setCard(null)} /> : null}
    </MapFrame>
  );
}
