import "server-only";

import polyline from "@mapbox/polyline";

import { normalizeWardName } from "@/core/geo/ward";

import { fetchJson, ProviderError, type LatLng, type ProviderCallOptions, type TravelMode } from "../types";
import type { AutocompleteSuggestion, GeocodeResult, MapsProvider, MatrixResult, RouteResult } from "./types";

const BASE = "https://rsapi.goong.io";

/** Tâm TP.HCM cũ — dùng làm ưu tiên vị trí mặc định cho gợi ý địa chỉ (spike P0-17). */
export const HCMC_CENTER: LatLng = { lat: 10.7769, lng: 106.7009 };

type GoongGeocodeItem = {
  formatted_address: string;
  place_id?: string;
  geometry: { location: LatLng };
  address_components?: { long_name: string }[];
  compound?: { commune?: string; province?: string };
  types?: string[];
};

const VEHICLE: Record<TravelMode, string> = { motorbike: "bike", bicycle: "bike", car: "car", walk: "bike" };

function toGeocode(item: GoongGeocodeItem, precision: GeocodeResult["precision"]): GeocodeResult {
  const parts = item.address_components?.map((c) => c.long_name) ?? [];
  return {
    label: item.formatted_address,
    location: { lat: item.geometry.location.lat, lng: item.geometry.location.lng },
    // Goong trả tên trần ("Chợ Quán") ⇒ "Phường Chợ Quán" / "Xã …" / "Đặc khu …" (UAT 09/10 C3)
    ward:
      normalizeWardName(
        item.compound?.commune ?? (parts.length >= 2 ? parts[parts.length - 2] : undefined),
      ) ?? undefined,
    city: item.compound?.province ?? parts.at(-1),
    precision,
    provider: "goong",
    providerPlaceId: item.place_id,
  };
}

/** Chờ trước lần thử lại duy nhất khi Goong chậm/lỗi 5xx (UAT 09/10: gợi ý địa chỉ quá 4 s khi tải nặng). */
export const GOONG_RETRY_DELAY_MS = 300;

export function createGoongProvider(apiKey: string, fetchImpl?: typeof fetch): MapsProvider {
  if (!apiKey) throw new ProviderError("goong", "unauthorized", "Thiếu GOONG_API_KEY", false);
  const once = <T>(path: string, params: Record<string, string>, opts?: ProviderCallOptions) =>
    fetchJson<T>("goong", `${BASE}${path}?${new URLSearchParams({ ...params, api_key: apiKey })}`, {
      ...opts,
      fetchImpl,
    });
  // Mọi lời gọi Goong là GET (không đổi dữ liệu) ⇒ thử lại đúng 1 lần khi quá thời gian hoặc 5xx.
  // Không thử lại 429 (càng gọi càng bị chặn) và khi người gọi tự truyền signal (họ đã chủ động hủy/hẹn giờ).
  const get = async <T>(path: string, params: Record<string, string>, opts?: ProviderCallOptions) => {
    try {
      return await once<T>(path, params, opts);
    } catch (err) {
      const transient = err instanceof ProviderError && (err.kind === "timeout" || err.kind === "unavailable");
      if (!transient || opts?.signal) throw err;
      await new Promise((r) => setTimeout(r, GOONG_RETRY_DELAY_MS));
      return once<T>(path, params, opts);
    }
  };

  return {
    id: "goong",
    capabilities: { autocomplete: true, motorbikeProfile: true, maxMatrixElements: 625 },

    async geocode(query, opts) {
      // Lưu ý ADR-006: KHÔNG dùng kết quả này để lấy toạ độ nơi cửa hàng/tổ chức — dùng autocomplete + ghim.
      const data = await get<{ results?: GoongGeocodeItem[] }>("/v2/geocode", { address: query }, opts);
      return (data.results ?? []).map((r) => toGeocode(r, "street"));
    },

    async reverseGeocode(point, opts) {
      const data = await get<{ results?: GoongGeocodeItem[] }>(
        "/v2/geocode",
        { latlng: `${point.lat},${point.lng}` },
        opts,
      );
      const top = data.results?.[0];
      return top ? toGeocode(top, "street") : null;
    },

    async autocomplete(input, opts) {
      const bias = opts.bias ?? HCMC_CENTER;
      const data = await get<{
        predictions?: {
          place_id: string;
          description: string;
          distance_meters?: number;
          structured_formatting?: { main_text: string; secondary_text?: string };
        }[];
      }>(
        "/v2/place/autocomplete",
        {
          input,
          location: `${bias.lat},${bias.lng}`,
          radius: String(Math.round((opts.radiusM ?? 30_000) / 1000)),
          sessiontoken: opts.sessionToken,
        },
        opts,
      );
      return (data.predictions ?? []).map<AutocompleteSuggestion>((p) => ({
        id: p.place_id,
        mainText: p.structured_formatting?.main_text ?? p.description,
        secondaryText: p.structured_formatting?.secondary_text,
        distanceM: p.distance_meters,
      }));
    },

    async resolveSuggestion(id, opts) {
      const data = await get<{ result?: GoongGeocodeItem }>(
        "/v2/place/detail",
        { place_id: id, sessiontoken: opts.sessionToken },
        opts,
      );
      if (!data.result?.geometry?.location) {
        throw new ProviderError("goong", "invalid_response", "Place detail không có toạ độ", true);
      }
      return toGeocode({ ...data.result, place_id: id }, "rooftop");
    },

    async route(req, opts): Promise<RouteResult> {
      if (req.points.length < 2) throw new ProviderError("goong", "bad_request", "Cần ít nhất 2 điểm", false);
      const [origin, ...rest] = req.points;
      const data = await get<{
        routes?: {
          overview_polyline?: { points: string };
          legs: { distance: { value: number }; duration: { value: number } }[];
        }[];
      }>(
        "/Direction",
        {
          origin: `${origin!.lat},${origin!.lng}`,
          destination: rest.map((p) => `${p.lat},${p.lng}`).join(";"),
          vehicle: VEHICLE[req.mode],
        },
        opts,
      );
      const route = data.routes?.[0];
      if (!route) throw new ProviderError("goong", "invalid_response", "Không tìm được tuyến", false);
      const coords = route.overview_polyline?.points ? polyline.decode(route.overview_polyline.points) : [];
      const legs = route.legs.map((l) => ({ distanceM: l.distance.value, durationS: l.duration.value }));
      return {
        distanceM: legs.reduce((s, l) => s + l.distanceM, 0),
        durationS: legs.reduce((s, l) => s + l.durationS, 0),
        geometry: { type: "LineString", coordinates: coords.map(([lat, lng]) => [lng, lat]) },
        legs,
        provider: "goong",
      };
    },

    async matrix(origins, destinations, mode, opts): Promise<MatrixResult> {
      if (origins.length * destinations.length > 625) {
        throw new ProviderError("goong", "bad_request", "Ma trận vượt 625 phần tử", false);
      }
      const data = await get<{
        rows?: {
          elements: { status: string; distance?: { value: number }; duration?: { value: number } }[];
        }[];
      }>(
        "/DistanceMatrix",
        {
          origins: origins.map((p) => `${p.lat},${p.lng}`).join("|"),
          destinations: destinations.map((p) => `${p.lat},${p.lng}`).join("|"),
          vehicle: VEHICLE[mode],
        },
        opts,
      );
      const rows = data.rows ?? [];
      return {
        distancesM: rows.map((r) =>
          r.elements.map((e) => (e.status === "OK" ? (e.distance?.value ?? null) : null)),
        ),
        durationsS: rows.map((r) =>
          r.elements.map((e) => (e.status === "OK" ? (e.duration?.value ?? null) : null)),
        ),
        provider: "goong",
      };
    },
  };
}
