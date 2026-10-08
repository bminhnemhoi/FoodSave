import type { LatLng, LngLatTuple } from "@/core/geo/types";

/**
 * Hình học của chuyến lấy hàng (thuần, không IO): đọc toạ độ PostGIS, dựng tuyến ước tính và link chỉ đường.
 */

export type LineString = { type: "LineString"; coordinates: LngLatTuple[] };

function readDouble(view: DataView, offset: number, little: boolean): number {
  return view.getFloat64(offset, little);
}

/**
 * Điểm PostGIS ở dạng EWKB hex (PostgREST trả `geography` như vậy vì không có cast sang json),
 * ví dụ `0101000020E6100000…`. Chỉ nhận Point (2D, có hoặc không SRID); sai định dạng ⇒ null.
 */
export function parseEwkbPoint(hex: string | null | undefined): LatLng | null {
  if (typeof hex !== "string" || !/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  if (bytes.length < 21) return null;
  const view = new DataView(bytes.buffer);
  const little = bytes[0] === 1;
  const type = view.getUint32(1, little);
  const hasSrid = (type & 0x20000000) !== 0;
  if ((type & 0x0fffffff) !== 1) return null; // chỉ Point
  if (type & 0xc0000000) return null; // không nhận Z/M
  const offset = hasSrid ? 9 : 5;
  if (bytes.length < offset + 16) return null;
  const lng = readDouble(view, offset, little);
  const lat = readDouble(view, offset + 8, little);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
    return null;
  return { lat, lng };
}

/** Tuyến PostGIS `geometry(LineString)` do PostgREST trả về dạng GeoJSON; khác dạng ⇒ null. */
export function parseLineString(value: unknown): LineString | null {
  if (!value || typeof value !== "object") return null;
  const v = value as { type?: unknown; coordinates?: unknown };
  if (v.type !== "LineString" || !Array.isArray(v.coordinates) || v.coordinates.length < 2) return null;
  const coords: LngLatTuple[] = [];
  for (const c of v.coordinates) {
    if (!Array.isArray(c) || c.length < 2) return null;
    const [lng, lat] = c as unknown[];
    if (typeof lng !== "number" || typeof lat !== "number" || !Number.isFinite(lng) || !Number.isFinite(lat))
      return null;
    coords.push([lng, lat]);
  }
  return { type: "LineString", coordinates: coords };
}

/** Tuyến ước tính: nối thẳng các điểm theo thứ tự (luôn ghi chú "Tuyến ước tính" khi hiển thị). */
export function straightLine(points: readonly LatLng[]): LineString | null {
  if (points.length < 2) return null;
  return { type: "LineString", coordinates: points.map((p) => [p.lng, p.lat]) };
}

/** Khung bao các điểm [[minLng, minLat], [maxLng, maxLat]]; rỗng ⇒ null. */
export function boundsOf(points: readonly LatLng[]): [[number, number], [number, number]] | null {
  if (points.length === 0) return null;
  const lngs = points.map((p) => p.lng);
  const lats = points.map((p) => p.lat);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

const coord = (p: LatLng) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

export type TravelMode = "two-wheeler" | "driving";

/**
 * Link chỉ đường Google Maps (Maps URLs, `api=1`): điểm đi = vị trí hiện tại của người dùng.
 * `travelmode=two-wheeler` (xe máy) có ở Việt Nam; nơi chưa hỗ trợ Google tự chọn phương tiện phù hợp.
 * `waypoints` (tối đa 9) cho cả tuyến nhiều điểm dừng.
 */
export function googleMapsDirectionsUrl(
  destination: LatLng,
  opts: { waypoints?: readonly LatLng[]; mode?: TravelMode } = {},
): string {
  const params = new URLSearchParams({ api: "1", destination: coord(destination) });
  params.set("travelmode", opts.mode ?? "two-wheeler");
  const waypoints = (opts.waypoints ?? []).slice(0, 9);
  if (waypoints.length > 0) params.set("waypoints", waypoints.map(coord).join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
