import "server-only";

import type { FreshnessLabel, Perishability } from "@/core/labels";
import type { UnitCode } from "@/features/catalog/labels";
import { parseTstzRange } from "@/features/charity-allocations/present";
import { createClient } from "@/server/db/supabase";

import { toRpcArgs, type MarketplaceFilters } from "./filters";

/**
 * Dữ liệu Kho tặng (P2-07/08, US-CHA-05/06/07): RPC `marketplace_offers` (DATA-MODEL §8.3) đã lọc
 * lô khả thi (§4.7), trong bán kính điểm nhận, danh mục điểm nhận chấp nhận, sắp Đỏ → Vàng → Xanh rồi gần trước.
 * Toạ độ cửa hàng là `public_location` (gần đúng/ẩn theo `visibility`).
 */

export type FoodCategory = {
  code: string;
  name: string;
  perishability: Perishability;
  icon: string;
};

export type MarketOffer = {
  offerId: string;
  title: string;
  categoryCode: string;
  categoryName: string;
  categoryIcon: string;
  perishability: Perishability;
  unit: UnitCode;
  qtyAvailable: number;
  unitWeightKg: number;
  effectiveDeadline: string;
  label: FreshnessLabel;
  distanceKm: number;
  travelMin: number;
  etaPickup: string;
  storeOrgId: string;
  storeName: string;
  trustScore: number;
  storeSiteId: string;
  /** null khi cửa hàng ẩn vị trí. */
  lat: number | null;
  lng: number | null;
  approximate: boolean;
  photoUrl: string | null;
  pickupStart: string | null;
  pickupEnd: string | null;
  description: string | null;
};

export type MarketplaceResult = { ok: true; offers: MarketOffer[] } | { ok: false; code: string };

export async function loadCategories(): Promise<FoodCategory[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("food_categories")
    .select("code, name_vi, perishability, icon, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(`Không tải được danh mục thực phẩm (${error.code})`);
  return (data ?? []).map((c) => ({
    code: c.code,
    name: c.name_vi,
    perishability: c.perishability,
    icon: c.icon,
  }));
}

function mediaUrl(supabase: Awaited<ReturnType<typeof createClient>>, path: string | null): string | null {
  if (!path) return null;
  return supabase.storage.from("media").getPublicUrl(path).data.publicUrl;
}

export async function loadMarketplace(
  filters: MarketplaceFilters,
  site: { id: string; radiusKm: number },
  categories: readonly FoodCategory[],
): Promise<MarketplaceResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "marketplace_offers",
    toRpcArgs(filters, site.id, site.radiusKm),
  );
  if (error) {
    console.error("[marketplace] marketplace_offers", { code: error.code, message: error.message });
    return { ok: false, code: error.code ?? "unknown" };
  }
  const rows = data ?? [];
  if (rows.length === 0) return { ok: true, offers: [] };

  // Khung giờ lấy + mô tả không có trong RPC ⇒ đọc thêm từ `offers` (RLS: lô đang mở của cửa hàng đã duyệt)
  const extra = await supabase
    .from("offers")
    .select("id, pickup_window, description")
    .in(
      "id",
      rows.map((r) => r.offer_id),
    );
  if (extra.error) {
    console.error("[marketplace] offers extra", { code: extra.error.code });
  }
  const byId = new Map((extra.data ?? []).map((o) => [o.id, o]));
  const catByCode = new Map(categories.map((c) => [c.code, c]));

  const offers = rows.map((r): MarketOffer => {
    const cat = catByCode.get(r.category_code);
    const more = byId.get(r.offer_id);
    const window = parseTstzRange(more?.pickup_window as string | null | undefined);
    return {
      offerId: r.offer_id,
      title: r.title,
      categoryCode: r.category_code,
      categoryName: cat?.name ?? r.category_code,
      categoryIcon: cat?.icon ?? "package",
      perishability: cat?.perishability ?? "packaged",
      unit: r.unit,
      qtyAvailable: Number(r.qty_available),
      unitWeightKg: Number(r.unit_weight_kg),
      effectiveDeadline: r.effective_deadline,
      label: r.label,
      distanceKm: Number(r.distance_km),
      travelMin: Number(r.travel_min),
      etaPickup: r.eta_pickup,
      storeOrgId: r.store_org_id,
      storeName: r.store_name,
      trustScore: Number(r.trust_score),
      storeSiteId: r.site_id,
      lat: r.site_lat ?? null,
      lng: r.site_lng ?? null,
      approximate: !!r.site_is_approximate,
      photoUrl: mediaUrl(supabase, r.photo_path),
      pickupStart: window?.start.toISOString() ?? null,
      pickupEnd: window?.end.toISOString() ?? null,
      description: more?.description ?? null,
    };
  });
  return { ok: true, offers };
}
