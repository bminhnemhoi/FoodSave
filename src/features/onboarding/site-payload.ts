import type { Json } from "@/types/database.types";

import { FOOD_CATEGORY_CODES, type OrgKind } from "./options";

/**
 * Dựng jsonb `p_site` cho RPC `upsert_site` (DATA-MODEL §8.2) từ giá trị đã qua `siteFields(kind)`.
 * Dùng chung cho wizard onboarding và trang Cài đặt. Thuần, không IO.
 */

export const SOURCE_TO_DB = { autocomplete: "geocode", pin: "pin", gps: "gps" } as const;

export type ParsedSite = {
  name?: string;
  location?: {
    lat: number;
    lng: number;
    addressLine: string;
    ward: string | null;
    city: string | null;
    source: keyof typeof SOURCE_TO_DB;
  };
  visibility?: string;
  radiusKm?: number;
  acceptedCategories?: string[];
  capacityKg?: number | null;
};

export function buildSitePayload(
  kind: OrgKind,
  siteId: string | null,
  d: ParsedSite,
): { [key: string]: Json } {
  const site: { [key: string]: Json } = {};
  if (siteId) site.id = siteId;
  if (d.name !== undefined) site.name = d.name;
  if (d.location) {
    site.address_line = d.location.addressLine;
    site.ward = d.location.ward;
    if (d.location.city) site.city = d.location.city;
    site.lat = d.location.lat;
    site.lng = d.location.lng;
    site.location_source = SOURCE_TO_DB[d.location.source];
  }
  if (kind === "charity") {
    if (d.visibility !== undefined) site.visibility = d.visibility;
    if (d.radiusKm !== undefined) site.radius_km = d.radiusKm;
    if (d.acceptedCategories !== undefined) {
      // Chọn đủ mọi loại ⇒ null (= nhận tất cả, kể cả loại thêm sau)
      const all = FOOD_CATEGORY_CODES.every((c) => d.acceptedCategories!.includes(c));
      site.accepted_categories = all ? null : [...d.acceptedCategories].sort();
    }
    if (d.capacityKg !== undefined) site.capacity_kg = d.capacityKg;
  }
  return site;
}
