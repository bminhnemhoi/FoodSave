import { destinationPoint } from "./distance";
import type { LatLng, LngLatTuple } from "./types";

export interface CirclePolygon {
  type: "Polygon";
  /** Một vòng khép kín [lng, lat], điểm cuối trùng điểm đầu (chuẩn GeoJSON). */
  coordinates: [LngLatTuple[]];
}

/**
 * Đa giác xấp xỉ vòng tròn bán kính `radiusKm` quanh `center` (vòng bán kính phục vụ — DESIGN-SYSTEM §13.4).
 * Mặc định 64 bước như turf `circle`. Thuần, không IO.
 */
export function circlePolygon(center: LatLng, radiusKm: number, steps = 64): CirclePolygon {
  if (!Number.isFinite(radiusKm) || radiusKm <= 0) {
    throw new RangeError("radiusKm phải là số dương");
  }
  if (!Number.isInteger(steps) || steps < 3) {
    throw new RangeError("steps phải là số nguyên ≥ 3");
  }
  if (!Number.isFinite(center.lat) || !Number.isFinite(center.lng) || Math.abs(center.lat) > 90) {
    throw new RangeError("center không hợp lệ");
  }

  const ring: LngLatTuple[] = [];
  for (let i = 0; i < steps; i++) {
    // Đi ngược chiều kim đồng hồ (bearing giảm dần) — vòng ngoài GeoJSON theo RFC 7946
    const p = destinationPoint(center, radiusKm * 1000, (-360 * i) / steps);
    ring.push([p.lng, p.lat]);
  }
  ring.push([ring[0]![0], ring[0]![1]]);
  return { type: "Polygon", coordinates: [ring] };
}
