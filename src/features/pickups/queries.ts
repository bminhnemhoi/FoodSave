import "server-only";

import type { LatLng } from "@/core/geo/types";
import type { PickupStatus } from "@/features/catalog/labels";
import { loadAllocations, type CharityAllocation } from "@/features/charity-allocations/queries";
import { createClient } from "@/server/db/supabase";

import { parseEwkbPoint, parseLineString, type LineString } from "./geo";
import type { ArrivalCheck } from "./live";

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
  /** Cách xác nhận đến nơi (geofence / thủ công / không vị trí) — cờ cho điều phối viên, không có toạ độ. */
  arrivalCheck: ArrivalCheck | null;
  arrivalNote: string | null;
  handoverConsumedAt: string | null;
  allocations: CharityAllocation[];
};

export type TripContact = {
  role: "volunteer" | "carrier" | "charity" | "store";
  name: string;
  /** SĐT đã che (`get_pickup_contacts`): 3 số đầu + 3 số cuối. */
  phoneMasked: string | null;
};

/** Mã giao về của chuyến TNV (handover `dropoff`) — chỉ trạng thái, không bao giờ có token/mã. */
export type DropoffHandover = {
  id: string;
  issuedAt: string | null;
  expiresAt: string | null;
  consumedAt: string | null;
  locked: boolean;
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
  assigneeUserId: string | null;
  assigneeName: string | null;
  acceptedAt: string | null;
  plannedStartAt: string | null;
  /**
   * Vị trí mới nhất của TNV (RLS §9.2: điều phối viên đọc được `pickups.last_location`). Chỉ có khi TNV đồng ý
   * `location_trip`, chuyến đang chạy và app đang mở (làm tròn ~11 m, xóa khi chuyến kết thúc).
   */
  lastLocation: LatLng | null;
  lastLocationAt: string | null;
  lastLocationAccuracyM: number | null;
  dropoffHandover: DropoffHandover | null;
  contacts: TripContact[];
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
  assigneeName: string | null;
  acceptedAt: string | null;
  /** Chuyến TNV đã lấy xong mọi điểm, đang chờ tổ chức nhận hàng (dropoff). */
  awaitingDropoff: boolean;
};

const RUNNING: readonly PickupStatus[] = ["planned", "assigned", "in_progress"];

/** `handover_max_failed_attempts` mặc định (DATA-MODEL §2.3). */
const MAX_FAILED_ATTEMPTS = 5;

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
  arrival_check: ArrivalCheck | null;
  arrival_note: string | null;
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
      `id, status, mode, created_at, completed_at, cancelled_at, accepted_at,
       charity_site:sites!pickups_charity_site_id_fkey(name),
       assignee:profiles!pickups_assignee_user_id_fkey(full_name),
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
    accepted_at: string | null;
    charity_site: { name: string } | null;
    assignee: { full_name: string | null } | null;
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
      awaitingDropoff:
        r.mode === "volunteer" &&
        r.status === "in_progress" &&
        pickups.some((s) => s.status === "done") &&
        pickups.every((s) => s.status === "done" || s.status === "skipped") &&
        r.stops.some((s) => s.kind === "dropoff" && (s.status === "pending" || s.status === "arrived")),
      storeNames: [...new Set(pickups.map((s) => s.site?.org?.name).filter((n): n is string => !!n))],
      assigneeName: r.assignee?.full_name?.trim() || null,
      acceptedAt: r.accepted_at,
    };
  });
}

/** Chi tiết một chuyến; không thấy (RLS) hoặc không thuộc tổ chức ⇒ null. */
export async function loadTrip(orgId: string, pickupId: string): Promise<Trip | null> {
  const supabase = await createClient();
  const { data: p, error } = await supabase
    .from("pickups")
    .select(
      `id, status, mode, charity_org_id, charity_site_id, created_at, started_at, completed_at, cancelled_at,
       cancel_reason, route, route_distance_m, route_duration_s, route_provider, assignee_user_id, accepted_at,
       planned_start_at, last_location, last_location_at, last_location_accuracy_m,
       assignee:profiles!pickups_assignee_user_id_fkey(full_name)`,
    )
    .eq("id", pickupId)
    .maybeSingle();
  if (error) {
    // uuid sai định dạng ⇒ 22P02: coi như không tìm thấy
    if (error.code === "22P02") return null;
    throw new Error(`Không tải được chuyến (${error.code})`);
  }
  if (!p || p.charity_org_id !== orgId) return null;

  const [stopsRes, handoversRes, allocations, contactsRes] = await Promise.all([
    supabase
      .from("pickup_stops")
      .select(
        `id, seq, kind, status, site_id, eta, arrived_at, completed_at, skip_reason, arrival_check, arrival_note,
         site:sites!pickup_stops_site_id_fkey(name, public_address, public_location, visibility,
           org:organizations!sites_org_id_fkey(name))`,
      )
      .eq("pickup_id", pickupId)
      .order("seq", { ascending: true }),
    supabase
      .from("handovers")
      .select("id, stop_id, kind, consumed_at, issued_at, token_expires_at, failed_attempts")
      .eq("pickup_id", pickupId),
    loadAllocations(orgId, {
      statuses: ["assigned", "picked_up", "delivered", "cancelled", "expired"],
      pickupId,
    }),
    p.mode === "volunteer"
      ? supabase.rpc("get_pickup_contacts", { p_pickup_id: pickupId })
      : Promise.resolve({ data: [], error: null }),
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
      arrivalCheck: s.arrival_check,
      arrivalNote: s.arrival_note,
      handoverConsumedAt: consumed.get(s.id) ?? null,
      allocations: allocations.filter((a) => a.stopId === s.id),
    };
  });

  const dropoff = (handoversRes.data ?? []).find((h) => h.kind === "dropoff");
  // Danh bạ không được làm hỏng trang chuyến (vd. chuyến vừa đổi người): thiếu thì chỉ ẩn khối liên hệ
  if (contactsRes.error) console.error("[pickups] get_pickup_contacts", { code: contactsRes.error.code });
  const assignee = p.assignee as unknown as { full_name: string | null } | null;
  type ContactRow = { role: string; display_name: string | null; phone_masked: string | null };
  const contacts: TripContact[] = ((contactsRes.data ?? []) as ContactRow[])
    .filter((c): c is ContactRow & { role: TripContact["role"] } =>
      ["volunteer", "carrier", "charity", "store"].includes(c.role),
    )
    .map((c) => ({ role: c.role, name: c.display_name?.trim() || "—", phoneMasked: c.phone_masked }));

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
    assigneeUserId: p.assignee_user_id,
    assigneeName: assignee?.full_name?.trim() || null,
    acceptedAt: p.accepted_at,
    plannedStartAt: p.planned_start_at,
    lastLocation: parseEwkbPoint(p.last_location as unknown as string | null),
    lastLocationAt: p.last_location_at,
    lastLocationAccuracyM: p.last_location_accuracy_m,
    dropoffHandover: dropoff
      ? {
          id: dropoff.id,
          issuedAt: dropoff.issued_at,
          expiresAt: dropoff.token_expires_at,
          consumedAt: dropoff.consumed_at,
          locked: dropoff.failed_attempts >= MAX_FAILED_ATTEMPTS,
        }
      : null,
    contacts,
    stops,
  };
}

// ---------------------------------------------------------------------------
// Lập chuyến tình nguyện viên (P3-09): toạ độ công khai của cửa hàng, toạ độ điểm nhận, danh sách TNV
// ---------------------------------------------------------------------------

export type PlannerStoreSite = {
  siteId: string;
  name: string;
  /** `public_location`: chính xác khi `public`, lưới ~550 m khi `approximate`, null khi `hidden`. */
  location: LatLng | null;
  approximate: boolean;
  isPublic: boolean;
};

/**
 * Toạ độ cửa hàng cho xem trước tuyến — chỉ `public_location` (chưa có chuyến nên chưa được đọc toạ độ chính
 * xác, DATA-MODEL §8.2 `get_site_location`), và toạ độ chính xác của các điểm nhận của chính tổ chức.
 */
export async function loadPlannerGeo(
  storeSiteIds: readonly string[],
  receivingSiteIds: readonly string[],
): Promise<{ stores: PlannerStoreSite[]; dropoffs: Record<string, LatLng | null> }> {
  const supabase = await createClient();
  const [sitesRes, ...homes] = await Promise.all([
    storeSiteIds.length
      ? supabase
          .from("sites")
          .select("id, name, visibility, public_location, org:organizations!sites_org_id_fkey(name)")
          .in("id", [...storeSiteIds])
      : Promise.resolve({ data: [], error: null }),
    ...receivingSiteIds.map((id) => supabase.rpc("get_site_location", { p_site_id: id })),
  ]);
  if (sitesRes.error) throw new Error(`Không tải được vị trí cửa hàng (${sitesRes.error.code})`);
  type SiteRow = {
    id: string;
    name: string;
    visibility: "public" | "approximate" | "hidden";
    public_location: string | null;
    org: { name: string } | null;
  };
  const stores = ((sitesRes.data ?? []) as unknown as SiteRow[]).map((s) => {
    const location = s.visibility === "hidden" ? null : parseEwkbPoint(s.public_location);
    const orgName = s.org?.name ?? "";
    return {
      siteId: s.id,
      name: orgName && s.name && orgName !== s.name ? `${orgName} · ${s.name}` : orgName || s.name,
      location,
      approximate: s.visibility === "approximate" && location !== null,
      isPublic: s.visibility === "public" && location !== null,
    };
  });
  const dropoffs: Record<string, LatLng | null> = {};
  receivingSiteIds.forEach((id, i) => {
    const r = homes[i] as { data: { lat: number; lng: number }[] | null; error: unknown } | undefined;
    const row = r && !r.error ? r.data?.[0] : undefined;
    dropoffs[id] = row ? { lat: Number(row.lat), lng: Number(row.lng) } : null;
  });
  return { stores, dropoffs };
}
