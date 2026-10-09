import "server-only";

import type { LatLng, ProviderCallOptions, TravelMode } from "../types";

export type MapsProviderId = "goong" | "ors" | "aws" | "fake";

export interface GeocodeResult {
  /** Địa chỉ hiển thị tiếng Việt. */
  label: string;
  location: LatLng;
  /** Phường/xã/đặc khu, tên đầy đủ có tiền tố ("Phường Chợ Quán") — TP.HCM không còn cấp quận từ 01/7/2025. */
  ward?: string;
  city?: string;
  precision: "rooftop" | "street" | "ward" | "city" | "approximate";
  provider: MapsProviderId;
  providerPlaceId?: string;
}

export interface AutocompleteSuggestion {
  id: string;
  mainText: string;
  secondaryText?: string;
  distanceM?: number;
}

export interface RouteRequest {
  /** Điểm đầu, các điểm dừng theo thứ tự, điểm cuối. */
  points: LatLng[];
  mode: TravelMode;
  departAt?: Date;
}

export interface RouteResult {
  distanceM: number;
  durationS: number;
  /** GeoJSON LineString, toạ độ [lng, lat]. */
  geometry: { type: "LineString"; coordinates: [number, number][] };
  legs: { distanceM: number; durationS: number }[];
  provider: MapsProviderId;
}

export interface MatrixResult {
  /** [origin][destination]; null = không có tuyến. */
  distancesM: (number | null)[][];
  durationsS: (number | null)[][];
  provider: MapsProviderId;
}

export interface MapsCapabilities {
  autocomplete: boolean;
  motorbikeProfile: boolean;
  maxMatrixElements: number;
}

export interface MapsProvider {
  readonly id: MapsProviderId;
  readonly capabilities: MapsCapabilities;
  geocode(query: string, opts?: ProviderCallOptions & { bias?: LatLng }): Promise<GeocodeResult[]>;
  reverseGeocode(point: LatLng, opts?: ProviderCallOptions): Promise<GeocodeResult | null>;
  autocomplete(
    input: string,
    opts: ProviderCallOptions & { sessionToken: string; bias?: LatLng; radiusM?: number },
  ): Promise<AutocompleteSuggestion[]>;
  /** Đổi gợi ý thành toạ độ (Goong Place Detail). */
  resolveSuggestion(id: string, opts: ProviderCallOptions & { sessionToken: string }): Promise<GeocodeResult>;
  route(req: RouteRequest, opts?: ProviderCallOptions): Promise<RouteResult>;
  matrix(
    origins: LatLng[],
    destinations: LatLng[],
    mode: TravelMode,
    opts?: ProviderCallOptions,
  ): Promise<MatrixResult>;
}
