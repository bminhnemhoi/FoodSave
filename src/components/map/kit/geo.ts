import { haversineM } from "@/core/geo/distance";
import type { LatLng, LngLatTuple } from "@/core/geo/types";

export type Bounds = [[number, number], [number, number]];

/** Khung bao [[minLng, minLat], [maxLng, maxLat]]; rỗng ⇒ null. */
export function boundsOfPoints(points: readonly LatLng[]): Bounds | null {
  if (points.length === 0) return null;
  const lngs = points.map((p) => p.lng);
  const lats = points.map((p) => p.lat);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

/** Độ dài đường gấp khúc [lng, lat] (m, haversine). */
export function lineLengthM(coordinates: readonly LngLatTuple[]): number {
  let total = 0;
  for (let i = 1; i < coordinates.length; i++) {
    const [aLng, aLat] = coordinates[i - 1]!;
    const [bLng, bLat] = coordinates[i]!;
    total += haversineM({ lat: aLat, lng: aLng }, { lat: bLat, lng: bLng });
  }
  return total;
}

/**
 * Lề khi "vừa khung": ghim neo ở đáy nên phần trên cần lề lớn hơn, chữ cạnh ghim ("Giao về", "Kế tiếp") nằm bên
 * phải; màn hẹp (< 640 px) dùng lề nhỏ để các điểm không dồn cục giữa bản đồ.
 */
export function fitPadding(wide: number): { top: number; right: number; bottom: number; left: number } {
  const narrow = typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches;
  // Chừa chỗ cho nút "Vừa khung" (trên trái), phóng to/thu nhỏ (trên phải) và ghi nguồn (dưới phải): marker không
  // nằm dưới nút điều khiển khi vừa mở bản đồ (vùng chạm bị che — WCAG 2.5.8)
  // Nút điều khiển ~54 px tính từ mép + nửa marker 22 px + 8 px ⇒ phải ≥ 84; dưới: ghi nguồn ~28 px + nhãn lượng
  // dưới marker ~28 px ⇒ ≥ 72; trên: ghim nhô ~50 px phía trên điểm ⇒ ≥ 72 (ảnh C1 mobile: marker sát nút zoom).
  if (narrow) return { top: 72, right: 84, bottom: 72, left: 44 };
  return { top: Math.max(72, wide + 8), right: Math.max(84, wide), bottom: Math.max(72, wide - 16), left: wide };
}
