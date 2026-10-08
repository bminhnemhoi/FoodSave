import "server-only";

import type { LatLng } from "@/core/geo/types";
import type { createClient } from "@/server/db/supabase";
import { getMapsProvider } from "@/server/providers/maps";

import { parseEwkbPoint } from "./geo";

/**
 * Tuyến xe máy cho chuyến tự lấy (tùy chọn, US-CHA-17 AC2 làm sớm cho P2): điểm nhận → các cửa hàng theo
 * hạn hiệu lực sớm nhất (đúng thứ tự `assign_pickup` tự sinh) → về điểm nhận; gọi Directions một lần qua
 * `MapsProvider` (vehicle=bike). Chỉ tính khi mọi cửa hàng công khai vị trí (không dựng tuyến từ toạ độ gần đúng).
 * Lỗi provider/thiếu dữ liệu ⇒ null: chuyến vẫn được tạo, trang chuyến vẽ tuyến ước tính.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type SelfRoutePlan = {
  stops: { site_id: string; seq: number; kind: "pickup" | "dropoff" }[];
  route: {
    geojson: { type: "LineString"; coordinates: [number, number][] };
    distance_m: number;
    duration_s: number;
    provider: string;
  };
};

export async function planSelfRoute(
  supabase: Supabase,
  charitySiteId: string,
  allocationIds: readonly string[],
): Promise<SelfRoutePlan | null> {
  try {
    const { data: rows, error } = await supabase
      .from("allocations")
      .select("id, store_site_id, offer:offers!allocations_offer_id_fkey(effective_deadline)")
      .in("id", [...allocationIds]);
    if (error || !rows || rows.length !== new Set(allocationIds).size) return null;

    const deadlineBySite = new Map<string, number>();
    for (const r of rows as unknown as {
      store_site_id: string;
      offer: { effective_deadline: string | null } | null;
    }[]) {
      const d = r.offer?.effective_deadline
        ? new Date(r.offer.effective_deadline).getTime()
        : Number.POSITIVE_INFINITY;
      deadlineBySite.set(r.store_site_id, Math.min(deadlineBySite.get(r.store_site_id) ?? Infinity, d));
    }
    const order = [...deadlineBySite.entries()]
      .sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([siteId]) => siteId);

    const sites = await supabase.from("sites").select("id, visibility, public_location").in("id", order);
    if (sites.error || !sites.data) return null;
    const located = new Map<string, LatLng>();
    for (const s of sites.data) {
      const p = parseEwkbPoint(s.public_location as unknown as string | null);
      if (s.visibility !== "public" || !p) return null;
      located.set(s.id, p);
    }

    const home = await supabase.rpc("get_site_location", { p_site_id: charitySiteId });
    if (home.error || !home.data?.[0]) return null;
    const charity = { lat: Number(home.data[0].lat), lng: Number(home.data[0].lng) };

    const stores = order.map((id) => located.get(id));
    if (stores.some((p) => !p)) return null;

    const route = await getMapsProvider().route({
      points: [charity, ...(stores as LatLng[]), charity],
      mode: "motorbike",
    });
    if (route.geometry.coordinates.length < 2) return null;

    return {
      stops: [
        ...order.map((site_id, i) => ({ site_id, seq: i + 1, kind: "pickup" as const })),
        { site_id: charitySiteId, seq: order.length + 1, kind: "dropoff" as const },
      ],
      route: {
        geojson: route.geometry,
        distance_m: Math.round(route.distanceM),
        duration_s: Math.round(route.durationS),
        provider: route.provider,
      },
    };
  } catch (err) {
    console.warn("[pickups] route plan skipped", err instanceof Error ? err.message : String(err));
    return null;
  }
}
