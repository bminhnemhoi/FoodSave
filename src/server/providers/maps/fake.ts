import "server-only";

import type { LatLng } from "../types";
import type { MapsProvider } from "./types";

/** Provider giả lập cho E2E/CI: không gọi mạng, kết quả xác định. Khoảng cách = đường chim bay × 1,4; 18 km/h. */
function haversineM(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const roadM = (a: LatLng, b: LatLng) => haversineM(a, b) * 1.4;
const secondsAt18kmh = (m: number) => Math.round(m / (18_000 / 3600));

export function createFakeMapsProvider(): MapsProvider {
  const place = { lat: 10.7725, lng: 106.698 };
  return {
    id: "fake",
    capabilities: { autocomplete: true, motorbikeProfile: true, maxMatrixElements: 10_000 },
    async geocode(query) {
      return [
        {
          label: `${query} (giả lập)`,
          location: place,
          ward: "Phường Bến Thành",
          city: "Hồ Chí Minh",
          precision: "street",
          provider: "fake",
        },
      ];
    },
    async reverseGeocode(point) {
      return {
        label: "Địa chỉ giả lập, Bến Thành, Hồ Chí Minh",
        location: point,
        ward: "Phường Bến Thành",
        city: "Hồ Chí Minh",
        precision: "street",
        provider: "fake",
      };
    },
    async autocomplete(input) {
      return [{ id: `fake:${input}`, mainText: input, secondaryText: "Bến Thành, Hồ Chí Minh" }];
    },
    async resolveSuggestion(id) {
      return {
        label: id.replace(/^fake:/, ""),
        location: place,
        ward: "Phường Bến Thành",
        city: "Hồ Chí Minh",
        precision: "rooftop",
        provider: "fake",
        providerPlaceId: id,
      };
    },
    async route(req) {
      const legs = req.points.slice(1).map((p, i) => {
        const m = roadM(req.points[i]!, p);
        return { distanceM: Math.round(m), durationS: secondsAt18kmh(m) };
      });
      return {
        distanceM: legs.reduce((s, l) => s + l.distanceM, 0),
        durationS: legs.reduce((s, l) => s + l.durationS, 0),
        geometry: { type: "LineString", coordinates: req.points.map((p) => [p.lng, p.lat]) },
        legs,
        provider: "fake",
      };
    },
    async matrix(origins, destinations) {
      const d = origins.map((o) => destinations.map((t) => Math.round(roadM(o, t))));
      return { distancesM: d, durationsS: d.map((r) => r.map(secondsAt18kmh)), provider: "fake" };
    },
  };
}
