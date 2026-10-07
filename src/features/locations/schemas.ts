import { z } from "zod";

import { isInServiceArea } from "@/core/geo/service-area";

/** Schema dùng chung client/server cho bộ chọn vị trí (F-05, P1-03). */

export const SEARCH_MIN_CHARS = 2;
export const SEARCH_MAX_CHARS = 120;

export const latLngSchema = z.object({
  lat: z.number({ error: "Vĩ độ không hợp lệ." }).min(-90).max(90),
  lng: z.number({ error: "Kinh độ không hợp lệ." }).min(-180).max(180),
});

export const searchPlacesSchema = z.object({
  input: z
    .string()
    .trim()
    .min(SEARCH_MIN_CHARS, { error: `Nhập ít nhất ${SEARCH_MIN_CHARS} ký tự để tìm địa chỉ.` })
    .max(SEARCH_MAX_CHARS, { error: `Từ khóa tối đa ${SEARCH_MAX_CHARS} ký tự.` }),
  sessionToken: z.uuid(),
  bias: latLngSchema.optional(),
});

export const resolvePlaceSchema = z.object({
  id: z.string().trim().min(1).max(300),
  sessionToken: z.uuid(),
});

export const locationSourceSchema = z.enum(["autocomplete", "gps", "pin"]);

export const OUTSIDE_SERVICE_AREA_MESSAGE =
  "Vị trí này nằm ngoài vùng phục vụ của FoodSave (TP.HCM). Hãy chọn lại địa chỉ hoặc kéo ghim vào trong thành phố.";

/** Giá trị LocationPicker phát ra; ghim (lat/lng) là nguồn sự thật (ADR-006). */
export const locationValueSchema = z
  .object({
    lat: latLngSchema.shape.lat,
    lng: latLngSchema.shape.lng,
    addressLine: z
      .string()
      .trim()
      .min(3, { error: "Vui lòng nhập địa chỉ (số nhà, tên đường)." })
      .max(200, { error: "Địa chỉ tối đa 200 ký tự." }),
    ward: z.string().trim().max(120).nullable(),
    city: z.string().trim().max(120).nullable(),
    source: locationSourceSchema,
  })
  .refine((v) => isInServiceArea(v), { error: OUTSIDE_SERVICE_AREA_MESSAGE, path: ["lat"] });

export type LocationSource = z.infer<typeof locationSourceSchema>;
export type LocationValue = z.infer<typeof locationValueSchema>;

export type PlaceSuggestion = {
  id: string;
  mainText: string;
  secondaryText?: string;
  distanceM?: number;
};

/** Địa chỉ đã phân giải (place detail hoặc reverse geocode). */
export type ResolvedPlace = {
  lat: number;
  lng: number;
  /** Địa chỉ đầy đủ provider trả về. */
  label: string;
  /** Phần "số nhà, đường" (bỏ phường/xã, tỉnh/thành). */
  addressLine: string;
  ward: string | null;
  city: string | null;
};

export type LocationActionResult<T> = { ok: true; data: T } | { ok: false; error: string };
