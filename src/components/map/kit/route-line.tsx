"use client";

import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useState } from "react";
import { Layer, Source, useMap } from "react-map-gl/maplibre";

import type { LngLatTuple } from "@/core/geo/types";

import { cssColor } from "../map-style";

const ARROW_PREFIX = "fs-route-arrow-";

/**
 * Mũi tên hướng đi: chấm tròn màu tuyến có chevron trắng (nổi trên cả nét liền lẫn nét đứt), vẽ bằng canvas, nạp
 * vào style một lần cho mỗi màu; đổi style (dự phòng) thì nạp lại qua sự kiện `styleimagemissing`.
 */
function ensureArrow(map: MapLibreMap, name: string, color: string) {
  if (map.hasImage(name)) return;
  const size = 36;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = color;
  ctx.strokeStyle = cssColor("--map-halo", "#ffffff");
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.lineWidth = 4.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(14, 10);
  ctx.lineTo(22, 18);
  ctx.lineTo(14, 26);
  ctx.stroke();
  map.addImage(name, ctx.getImageData(0, 0, size, size), { pixelRatio: 2 });
}

function useRouteArrow(name: string, color: string) {
  const { current } = useMap();
  useEffect(() => {
    const map = current?.getMap();
    if (!map) return;
    const add = () => {
      try {
        ensureArrow(map, name, color);
      } catch {
        // style đang đổi — sự kiện styleimagemissing sẽ gọi lại
      }
    };
    const onMissing = (e: { id: string }) => {
      if (e.id === name) add();
    };
    add();
    map.on("styleimagemissing", onMissing);
    return () => {
      map.off("styleimagemissing", onMissing);
    };
  }, [current, name, color]);
}

export type RouteLineProps = {
  id: string;
  coordinates: LngLatTuple[];
  /** Màu nét (CSS var, ví dụ `--map-route`, `--chart-e`). */
  colorVar?: `--${string}`;
  /** Tuyến ước tính (nối thẳng, chưa gọi chỉ đường) ⇒ nét đứt (§13.5). */
  estimated?: boolean;
  /** Phương án khác (không phải đang xem): xám, mảnh, nét đứt, không mũi tên. */
  muted?: boolean;
  /** Không vẽ mũi tên (ví dụ đường nối các phương án khác). */
  arrows?: boolean;
};

/**
 * Tuyến (§13.5): viền trắng + nét màu tuyến (đứt khi là ước tính) + mũi tên hướng đi từ zoom 12. Một nguồn
 * GeoJSON riêng cho mỗi tuyến; `id` phải duy nhất trong bản đồ.
 */
export function RouteLine({
  id,
  coordinates,
  colorVar = "--map-route",
  estimated = false,
  muted = false,
  arrows = true,
}: RouteLineProps) {
  const [colors] = useState(() => ({
    halo: cssColor("--map-halo", "#ffffff"),
    route: cssColor(colorVar, "#1f5fbf"),
    alt: cssColor("--map-route-alt", "#8e8676"),
  }));
  const arrow = `${ARROW_PREFIX}${colorVar.slice(2)}`;
  useRouteArrow(arrow, colors.route);
  if (coordinates.length < 2) return null;
  const data = {
    type: "Feature" as const,
    properties: {},
    geometry: { type: "LineString" as const, coordinates },
  };
  if (muted)
    return (
      <Source id={id} type="geojson" data={data}>
        <Layer
          id={`${id}-line`}
          type="line"
          layout={{ "line-cap": "round", "line-join": "round" }}
          paint={{
            "line-color": colors.alt,
            "line-width": 3,
            "line-opacity": 0.6,
            "line-dasharray": [1.5, 2],
          }}
        />
      </Source>
    );
  return (
    <Source id={id} type="geojson" data={data}>
      <Layer
        id={`${id}-casing`}
        type="line"
        layout={{ "line-cap": "round", "line-join": "round" }}
        paint={{ "line-color": colors.halo, "line-width": estimated ? 8 : 9 }}
      />
      <Layer
        id={`${id}-line`}
        type="line"
        layout={{ "line-cap": "round", "line-join": "round" }}
        paint={
          estimated
            ? { "line-color": colors.route, "line-width": 4.5, "line-dasharray": [2, 1.3] }
            : { "line-color": colors.route, "line-width": 5.5 }
        }
      />
      {arrows ? (
        <Layer
          id={`${id}-arrows`}
          type="symbol"
          minzoom={12}
          layout={{
            "symbol-placement": "line",
            "symbol-spacing": 90,
            "icon-image": arrow,
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
            "icon-rotation-alignment": "map",
          }}
        />
      ) : null}
    </Source>
  );
}
