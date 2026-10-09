"use client";

import { useMemo, useRef, useState } from "react";
import { Marker, type MapRef } from "react-map-gl/maplibre";

import { BaseMap } from "@/components/map/kit/base-map";
import { fitPadding } from "@/components/map/kit/geo";
import { LegendStop, MapLegend, type LegendItem } from "@/components/map/kit/legend";
import { MapFrame, MapInfoCard } from "@/components/map/kit/map-frame";
import { HomePin, StopPin, YouAreHereMarker } from "@/components/map/kit/markers";
import { RouteLine } from "@/components/map/kit/route-line";
import { prefersReducedMotion } from "@/components/map/map-style";
import { DEFAULT_MAP_CENTER } from "@/core/geo/service-area";
import type { LatLng } from "@/core/geo/types";
import { boundsOf, type LineString } from "@/features/pickups/geo";

export type VolunteerMapStop = {
  id: string;
  seq: number;
  kind: "pickup" | "dropoff";
  status: "pending" | "arrived" | "done" | "skipped";
  location: LatLng;
  title: string;
};

type VolunteerTripMapProps = {
  stops: VolunteerMapStop[];
  route: LineString | null;
  /** Tuyến ước tính (nối thẳng) ⇒ nét đứt (DESIGN-SYSTEM §13.5). */
  estimated: boolean;
  currentStopId: string | null;
  /** Vị trí của tôi — chỉ có khi đang chia sẻ (đã đồng ý), chỉ trong bộ nhớ. */
  me: LatLng | null;
  ariaLabel: string;
  /** Câu chú thích phía trên bản đồ; mặc định tự tóm tắt (thứ tự đi, điểm kế tiếp). */
  caption?: React.ReactNode;
  className?: string;
};

const STATUS_TEXT: Record<VolunteerMapStop["status"], string> = {
  pending: "chưa tới",
  arrived: "bạn đã đến",
  done: "đã xong",
  skipped: "bỏ qua",
};

/**
 * Bản đồ nhỏ của chuyến cho TNV (C1; DESIGN-SYSTEM §11.2 `RouteMap` biến thể `volunteer`, §13): ghim có số thứ tự,
 * điểm kế tiếp to hơn kèm chữ "Kế tiếp", điểm đã xong có ✓, điểm giao cuối là ghim mái nhà "Giao về", tuyến có mũi
 * tên hướng đi; "Bạn ở đây" khi đang chia sẻ vị trí. Chạm điểm ⇒ thẻ thông tin. Bản tương đương: danh sách "Lộ trình".
 */
export function VolunteerTripMap({
  stops,
  route,
  estimated,
  currentStopId,
  me,
  ariaLabel,
  caption,
  className,
}: VolunteerTripMapProps) {
  const mapRef = useRef<MapRef>(null);
  const [card, setCard] = useState<string | null>(null);

  const bounds = useMemo(() => boundsOf(stops.map((s) => s.location)), [stops]);
  const [initialView] = useState(() =>
    bounds
      ? { bounds, fitBoundsOptions: { padding: fitPadding(56), maxZoom: 15 } }
      : { latitude: DEFAULT_MAP_CENTER.lat, longitude: DEFAULT_MAP_CENTER.lng, zoom: 11 },
  );

  function fitAll() {
    const b = boundsOf([...stops.map((s) => s.location), ...(me ? [me] : [])]);
    if (!b) return;
    mapRef.current?.fitBounds(b, {
      padding: fitPadding(56),
      maxZoom: 15,
      duration: prefersReducedMotion() ? 0 : 500,
    });
  }

  const pickups = stops.filter((s) => s.kind === "pickup");
  const current = stops.find((s) => s.id === currentStopId) ?? null;
  const statuses = new Set(pickups.map((s) => s.status));
  const legend: LegendItem[] = [
    { key: "pending", symbol: <LegendStop />, label: "Điểm lấy — số = thứ tự đi" },
    ...(statuses.has("arrived")
      ? [{ key: "arrived", symbol: <LegendStop status="arrived" />, label: "Bạn đã đến" }]
      : []),
    ...(statuses.has("done")
      ? [{ key: "done", symbol: <LegendStop status="done" />, label: "Đã xong" }]
      : []),
    ...(statuses.has("skipped")
      ? [{ key: "skipped", symbol: <LegendStop status="skipped" />, label: "Bỏ qua" }]
      : []),
  ];

  const summary = caption ?? (
    <>
      Đi theo số <strong>{pickups.map((s) => s.seq).join(" → ")}</strong>
      {stops.some((s) => s.kind === "dropoff") ? " rồi giao về điểm nhận" : ""}
      {current ? (
        <>
          {" "}
          · kế tiếp:{" "}
          <strong>{current.kind === "dropoff" ? "giao về điểm nhận" : `điểm ${current.seq}`}</strong>
        </>
      ) : null}
      {estimated ? " · đường nối thẳng (ước tính)" : ""}
    </>
  );

  const opened = stops.find((s) => s.id === card) ?? null;

  return (
    <MapFrame
      fit={bounds ? { onClick: fitAll, hint: "hiện cả chuyến" } : null}
      legend={<MapLegend items={legend} storageKey="volunteer-trip" />}
      ariaLabel={ariaLabel}
      caption={summary}
      onEscape={() => setCard(null)}
      className={className}
    >
      <BaseMap ref={mapRef} initialViewState={initialView} cooperativeGestures>
        {route ? <RouteLine id="vol-route" coordinates={route.coordinates} estimated={estimated} /> : null}
        {stops.map((s) => {
          const isCurrent = s.id === currentStopId;
          const label = `${s.title}${isCurrent ? " (kế tiếp)" : ""} — ${STATUS_TEXT[s.status]}`;
          return (
            <Marker
              key={s.id}
              latitude={s.location.lat}
              longitude={s.location.lng}
              anchor="bottom"
              style={{ zIndex: isCurrent || card === s.id ? 3 : s.kind === "dropoff" ? 1 : 2 }}
            >
              {s.kind === "dropoff" ? (
                <HomePin
                  kind="charity"
                  caption="Giao về"
                  done={s.status === "done"}
                  selected={card === s.id}
                  ariaLabel={label}
                  title={s.title}
                  onClick={() => setCard(s.id)}
                />
              ) : (
                <StopPin
                  seq={s.seq}
                  status={s.status}
                  current={isCurrent}
                  selected={card === s.id}
                  ariaLabel={label}
                  title={s.title}
                  onClick={() => setCard(s.id)}
                />
              )}
            </Marker>
          );
        })}
        {me ? (
          <Marker latitude={me.lat} longitude={me.lng} anchor="center" style={{ zIndex: 4 }}>
            <YouAreHereMarker />
          </Marker>
        ) : null}
      </BaseMap>
      {opened ? (
        <MapInfoCard title={opened.title} onClose={() => setCard(null)}>
          {opened.id === currentStopId ? "Điểm kế tiếp · " : ""}
          {STATUS_TEXT[opened.status]}
        </MapInfoCard>
      ) : null}
    </MapFrame>
  );
}
