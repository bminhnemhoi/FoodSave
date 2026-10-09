"use client";

import { useRef, useState } from "react";
import { Marker, type MapRef } from "react-map-gl/maplibre";

import { BaseMap } from "@/components/map/kit/base-map";
import { boundsOfPoints } from "@/components/map/kit/geo";
import {
  LegendCluster,
  LegendHome,
  LegendNeed,
  LegendStop,
  LegendStore,
  LegendVolunteer,
  LegendYouAreHere,
  MapLegend,
} from "@/components/map/kit/legend";
import { MapFrame, MapInfoCard } from "@/components/map/kit/map-frame";
import {
  ClusterBubble,
  HomePin,
  NeedMarker,
  StopPin,
  StoreMarker,
  VolunteerMarker,
  YouAreHereMarker,
  type StopStatus,
} from "@/components/map/kit/markers";
import { RouteLine } from "@/components/map/kit/route-line";
import { prefersReducedMotion } from "@/components/map/map-style";
import type { LngLatTuple } from "@/core/geo/types";

const HOME = { lat: 10.7725, lng: 106.698 };
const STOPS: { id: string; seq: number; status: StopStatus; lat: number; lng: number; name: string }[] = [
  { id: "a", seq: 1, status: "done", lat: 10.7801, lng: 106.6992, name: "Tiệm bánh Hạt Lúa" },
  { id: "b", seq: 2, status: "arrived", lat: 10.7838, lng: 106.7046, name: "Lò bánh Mặt Trời" },
  { id: "c", seq: 3, status: "pending", lat: 10.7768, lng: 106.7095, name: "Bánh mì Phố Xanh" },
];
const ROUTE: LngLatTuple[] = [
  [HOME.lng, HOME.lat],
  ...STOPS.map((s): LngLatTuple => [s.lng, s.lat]),
  [HOME.lng, HOME.lat],
];
const ALL = [HOME, ...STOPS, { lat: 10.7641, lng: 106.6889 }, { lat: 10.7862, lng: 106.6905 }];

/** Bản đồ minh họa đủ loại điểm (tên hư cấu). */
export function DemoMap() {
  const mapRef = useRef<MapRef>(null);
  const [card, setCard] = useState<string | null>(null);
  const bounds = boundsOfPoints(ALL)!;
  const open = STOPS.find((s) => s.id === card);

  return (
    <MapFrame
      fit={{
        onClick: () =>
          mapRef.current?.fitBounds(bounds, { padding: 72, duration: prefersReducedMotion() ? 0 : 500 }),
      }}
      legend={
        <MapLegend
          storageKey="demo"
          routes={[{ key: "r", label: "Tuyến xe máy", tone: 0, dashed: false }]}
          items={[
            { key: "red", symbol: <LegendStore label="red" />, label: "Lô Đỏ" },
            { key: "yellow", symbol: <LegendStore label="yellow" />, label: "Lô Vàng" },
            { key: "cluster", symbol: <LegendCluster tone="green" />, label: "Cụm cửa hàng" },
            { key: "stop", symbol: <LegendStop />, label: "Điểm dừng (số = thứ tự)" },
            { key: "arrived", symbol: <LegendStop status="arrived" />, label: "TNV đã đến" },
            { key: "done", symbol: <LegendStop status="done" />, label: "Đã lấy hàng" },
            { key: "home", symbol: <LegendHome kind="charity" />, label: "Giao về" },
            { key: "need", symbol: <LegendNeed />, label: "Nhu cầu" },
            { key: "vol", symbol: <LegendVolunteer />, label: "Tình nguyện viên" },
            { key: "you", symbol: <LegendYouAreHere />, label: "Bạn ở đây" },
          ]}
        />
      }
      ariaLabel="Bản đồ minh họa bộ marker"
      caption={
        <>
          <strong>Minh họa:</strong> chuyến 3 cửa hàng, đi theo số 1 → 2 → 3 rồi giao về điểm nhận · vòng màu
          của cửa hàng = nhãn gấp nhất
        </>
      }
      onEscape={() => setCard(null)}
    >
      <BaseMap ref={mapRef} initialViewState={{ bounds, fitBoundsOptions: { padding: 72 } }}>
        <RouteLine id="demo-route" coordinates={ROUTE} />
        <Marker latitude={HOME.lat} longitude={HOME.lng} anchor="bottom">
          <HomePin
            kind="charity"
            ariaLabel="Giao về: Bếp ăn Hy Vọng"
            caption="Giao về"
            onClick={() => setCard(null)}
          />
        </Marker>
        {STOPS.map((s) => (
          <Marker key={s.id} latitude={s.lat} longitude={s.lng} anchor="bottom">
            <StopPin
              seq={s.seq}
              status={s.status}
              selected={card === s.id}
              ariaLabel={`Điểm ${s.seq}: ${s.name}`}
              onClick={() => setCard(s.id)}
            />
          </Marker>
        ))}
        <Marker latitude={10.7812} longitude={106.7021} anchor="center">
          <VolunteerMarker
            ariaLabel="Tình nguyện viên Minh An, cập nhật 1 phút trước"
            label="Minh An · 1 phút"
          />
        </Marker>
        <Marker latitude={10.7641} longitude={106.6889} anchor="center">
          <StoreMarker
            label="red"
            count={2}
            ariaLabel="Tiệm bánh Sao Mai, 2 lô, gấp nhất: Nhãn Đỏ"
            onClick={() => undefined}
          />
        </Marker>
        <Marker latitude={10.7862} longitude={106.6905} anchor="center">
          <StoreMarker
            label="yellow"
            ariaLabel="Bếp cơm Nhà Mơ, gấp nhất: Nhãn Vàng"
            onClick={() => undefined}
          />
        </Marker>
        <Marker latitude={10.7685} longitude={106.6935} anchor="center">
          <ClusterBubble count={4} tone="green" ariaLabel="Cụm 4 cửa hàng" onClick={() => undefined} />
        </Marker>
        <Marker latitude={10.7695} longitude={106.7055} anchor="center">
          <NeedMarker ariaLabel="Mái ấm Nắng Mai cần 50 ổ" tag="Cần 50 ổ" onClick={() => undefined} />
        </Marker>
        <Marker latitude={10.7752} longitude={106.6935} anchor="center">
          <YouAreHereMarker />
        </Marker>
      </BaseMap>
      {open ? (
        <MapInfoCard title={`Điểm ${open.seq} · ${open.name}`} onClose={() => setCard(null)}>
          Trạng thái:{" "}
          {open.status === "done" ? "đã lấy hàng" : open.status === "arrived" ? "TNV đã đến" : "chưa tới"}
        </MapInfoCard>
      ) : null}
    </MapFrame>
  );
}
