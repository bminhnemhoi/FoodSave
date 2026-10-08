import "server-only";

import type { LatLng } from "@/core/geo/types";
import { createClient } from "@/server/db/supabase";

import { toNearbyNeed, type NearbyNeed, type NearbyRow } from "./present";

/**
 * Dữ liệu "Nhu cầu gần bạn" (P3-07, US-STO-20): RPC `needs_nearby` bằng client của NGƯỜI DÙNG — DB kiểm quyền
 * (owner/manager/staff có quyền điểm, cửa hàng đã duyệt) và chỉ trả vị trí ở độ chính xác công khai.
 */

export type NearbyResult = { ok: true; needs: NearbyNeed[] } | { ok: false; code: string };

export async function loadNearbyNeeds(
  siteId: string | null,
  categories: readonly string[],
): Promise<NearbyResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("needs_nearby", {
    ...(siteId ? { p_store_site_id: siteId } : {}),
    ...(categories.length > 0 ? { p_category_codes: [...categories] } : {}),
  });
  if (error) {
    console.error("[needs-nearby] needs_nearby", { code: error.code, message: error.message });
    return { ok: false, code: error.code ?? "unknown" };
  }
  return { ok: true, needs: ((data ?? []) as unknown as NearbyRow[]).map(toNearbyNeed) };
}

/** Toạ độ chính xác các điểm của chính cửa hàng (thành viên được phép — `get_site_location`). */
export async function loadStoreLocations(siteIds: readonly string[]): Promise<Record<string, LatLng>> {
  const supabase = await createClient();
  const pairs = await Promise.all(
    siteIds.map(async (id) => {
      const { data, error } = await supabase.rpc("get_site_location", { p_site_id: id });
      if (error || !data?.[0]) return null;
      return [id, { lat: Number(data[0].lat), lng: Number(data[0].lng) }] as const;
    }),
  );
  return Object.fromEntries(pairs.filter((p): p is NonNullable<typeof p> => p !== null));
}
