import "server-only";

import type { LatLng } from "@/core/geo/types";
import type { PickupStatus } from "@/features/catalog/labels";
import { loadAllocations, type CharityAllocation } from "@/features/charity-allocations/queries";
import { createClient } from "@/server/db/supabase";

import { parseEwkbPoint, parseLineString, type LineString } from "./geo";

/**
 * Chuyến lấy hàng của tổ chức (RLS §9.2: chuyến tới điểm nhận người xem có quyền).
 * Địa chỉ điểm dừng theo đúng mức được phép: `get_site_location` (chính xác) khi chuyến đang chạy hoặc là
 * điểm của chính tổ chức; ngoài ra chỉ `public_location`/`public_address` (gần đúng/ẩn theo `visibility`).
 */

export type StopStatus = "pending" | "arrived" | "done" | "skipped";

export type TripStop = {
  id: string;
  seq: number;
  kind: "pickup" | "dropoff";
  status: StopStatus;
  siteId: string;
  siteName: string;
  orgName: string;
  address: string | null;
  location: LatLng | null;
  precision: "exact" | "approximate" | "hidden";
  eta: string | null;
  arrivedAt: string | null;
  completedAt: string | null;
  skipReason: string | null;
  handoverConsumedAt: string | null;
  allocations: CharityAllocation[];
};

export type Trip = {
  id: string;
  status: PickupStatus;
  mode: "self" | "volunteer";
  charitySiteId: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  route: LineString | null;
  routeDistanceM: number | null;
  routeDurationS: number | null;
  routeProvider: string | null;
  stops: TripStop[];
};

export type TripSummary = {
  id: string;
  status: PickupStatus;
  mode: "self" | "volunteer";
  charitySiteName: string;
  createdAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  pickupStops: number;
  doneStops: number;
  storeNames: string[];
};

const RUNNING: readonly PickupStatus[] = ["planned", "assigned", "in_progress"];

export function isRunning(status: PickupStatus): boolean {
  return RUNNING.includes(status);
}

type StopRow = {
  id: string;
  seq: number;
  kind: "pickup" | "dropoff";
  status: StopStatus;
  site_id: string;
  eta: string | null;
  arrived_at: string | null;
  completed_at: string | null;
  skip_reason: string | null;
  site: {
    name: string;
    public_address: string | null;
    public_location: string | null;
    visibility: "public" | "approximate" | "hidden";
    org: { name: string } | null;
  } | null;
};

/** Danh sách chuyến (mới nhất trước), kèm số điểm dừng và tên cửa hàng. */
export async function loadTrips(orgId: string, limit = 50): Promise<TripSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pickups")
    .select(
      `id, status, mode, created_at, completed_at, cancelled_at,
       charity_site:sites!pickups_charity_site_id_fkey(name),
       stops:pickup_stops(kind, status, site:sites!pickup_stops_site_id_fkey(org:organizations!sites_org_id_fkey(name)))`,
    )
    .eq("charity_org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Không tải được danh sách chuyến (${error.code})`);
  type Row = {
    id: string;
    status: PickupStatus;
    mode: "self" | "volunteer";
    created_at: string;
    completed_at: string | null;
    cancelled_at: string | null;
    charity_site: { name: string } | null;
    stops: { kind: string; status: StopStatus; site: { org: { name: string } | null } | null }[];
  };
  return ((data ?? []) as unknown as Row[]).map((r) => {
    const pickups = r.stops.filter((s) => s.kind === "pickup");
    return {
      id: r.id,
      status: r.status,
      mode: r.mode,
      charitySiteName: r.charity_site?.name ?? "Điểm nhận",
      createdAt: r.created_at,
      completedAt: r.completed_at,
      cancelledAt: r.cancelled_at,
      pickupStops: pickups.length,
      doneStops: pickups.filter((s) => s.status === "done").length,
      storeNames: [...new Set(pickups.map((s) => s.site?.org?.name).filter((n): n is string => !!n))],
    };
  });
}

/** Chi tiết một chuyến; không thấy (RLS) hoặc không thuộc tổ chức ⇒ null. */
export async function loadTrip(orgId: string, pickupId: string): Promise<Trip | null> {
  const supabase = await createClient();
  const { data: p, error } = await supabase
    .from("pickups")
    .select(
      "id, status, mode, charity_org_id, charity_site_id, created_at, started_at, completed_at, cancelled_at, cancel_reason, route, route_distance_m, route_duration_s, route_provider",
    )
    .eq("id", pickupId)
    .maybeSingle();
  if (error) {
    // uuid sai định dạng ⇒ 22P02: coi như không tìm thấy
    if (error.code === "22P02") return null;
    throw new Error(`Không tải được chuyến (${error.code})`);
  }
  if (!p || p.charity_org_id !== orgId) return null;

  const [stopsRes, handoversRes, allocations] = await Promise.all([
    supabase
      .from("pickup_stops")
      .select(
        `id, seq, kind, status, site_id, eta, arrived_at, completed_at, skip_reason,
         site:sites!pickup_stops_site_id_fkey(name, public_address, public_location, visibility,
           org:organizations!sites_org_id_fkey(name))`,
      )
      .eq("pickup_id", pickupId)
      .order("seq", { ascending: true }),
    supabase.from("handovers").select("stop_id, consumed_at").eq("pickup_id", pickupId),
    loadAllocations(orgId, {
      statuses: ["assigned", "picked_up", "delivered", "cancelled", "expired"],
      pickupId,
    }),
  ]);
  if (stopsRes.error) throw new Error(`Không tải được điểm dừng (${stopsRes.error.code})`);
  const consumed = new Map((handoversRes.data ?? []).map((h) => [h.stop_id, h.consumed_at]));
  const rows = (stopsRes.data ?? []) as unknown as StopRow[];

  // Toạ độ chính xác: chỉ khi được phép (chuyến đang chạy, hoặc điểm của chính tổ chức)
  const exact = await Promise.all(
    rows.map(async (s) => {
      if (!isRunning(p.status) && s.kind === "pickup") return null;
      const { data, error: e } = await supabase.rpc("get_site_location", { p_site_id: s.site_id });
      if (e || !data?.[0]) return null;
      return { lat: Number(data[0].lat), lng: Number(data[0].lng), address: data[0].address_line };
    }),
  );

  const stops: TripStop[] = rows.map((s, i) => {
    const ex = exact[i];
    const pub = parseEwkbPoint(s.site?.public_location ?? null);
    const visibility = s.site?.visibility ?? "hidden";
    return {
      id: s.id,
      seq: s.seq,
      kind: s.kind,
      status: s.status,
      siteId: s.site_id,
      siteName: s.site?.name ?? "",
      orgName: s.site?.org?.name ?? "",
      address: ex?.address ?? s.site?.public_address ?? null,
      location: ex ? { lat: ex.lat, lng: ex.lng } : pub,
      precision: ex ? "exact" : visibility === "public" && pub ? "exact" : pub ? "approximate" : "hidden",
      eta: s.eta,
      arrivedAt: s.arrived_at,
      completedAt: s.completed_at,
      skipReason: s.skip_reason,
      handoverConsumedAt: consumed.get(s.id) ?? null,
      allocations: allocations.filter((a) => a.stopId === s.id),
    };
  });

  return {
    id: p.id,
    status: p.status,
    mode: p.mode,
    charitySiteId: p.charity_site_id,
    createdAt: p.created_at,
    startedAt: p.started_at,
    completedAt: p.completed_at,
    cancelledAt: p.cancelled_at,
    cancelReason: p.cancel_reason,
    route: parseLineString(p.route),
    routeDistanceM: p.route_distance_m,
    routeDurationS: p.route_duration_s,
    routeProvider: p.route_provider,
    stops,
  };
}
