import "server-only";

import { cache } from "react";

import type { LatLng } from "@/core/geo/types";
import type { UnitCode } from "@/features/catalog/labels";
import { parseTstzRange } from "@/features/charity-allocations/present";
import type { LineSpec } from "@/features/handover/lines";
import { parseEwkbPoint, parseLineString, type LineString } from "@/features/pickups/geo";
import { createClient } from "@/server/db/supabase";
import type { Database } from "@/types/database.types";

import type { LocationConsent, TripContactConsent } from "./consent";
import type { VehicleType } from "./labels";
import {
  contactForStop,
  pickupProgress,
  tripStartAt,
  volunteerPhase,
  type PickupStatus,
  type StopKind,
  type StopStatus,
  type TripContact,
  type VolunteerPhase,
} from "./trip-model";

/**
 * Dữ liệu màn tình nguyện viên, đọc bằng client của NGƯỜI DÙNG (RLS — DATA-MODEL §9.2 cột V): chuyến mình được
 * gán (`assignee_user_id`), điểm dừng, phân bổ + lô của chuyến, bàn giao của các điểm. Toạ độ chính xác của điểm
 * dừng chỉ qua `get_site_location` khi chuyến còn chạy (US-VOL-05 AC3); chuyến đã xong chỉ còn toạ độ công khai.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Mốc "bây giờ" của request (một giá trị cho cả trang — đồng hồ đếm ngược, khung giờ, nhóm "Hôm nay"). */
export const requestNow = cache((): number => Date.now());
type AllocationStatus = Database["public"]["Enums"]["allocation_status"];
type HandoverMethod = Database["public"]["Enums"]["handover_method"];

const RUNNING: readonly PickupStatus[] = ["planned", "assigned", "in_progress"];

type AllocRow = {
  id: string;
  pickup_id: string | null;
  stop_id: string | null;
  status: AllocationStatus;
  unit: UnitCode;
  unit_weight_kg_snapshot: number | string;
  qty_reserved: number | string;
  qty_released: number | string;
  qty_picked: number | string;
  qty_delivered: number | string;
  offers: { title: string; pickup_window: unknown } | null;
};

const ALLOC_COLUMNS =
  "id, pickup_id, stop_id, status, unit, unit_weight_kg_snapshot, qty_reserved, qty_released, qty_picked, qty_delivered, offers(title, pickup_window)";

/** Số lượng đang "trên chuyến" của một phân bổ theo trạng thái (đặt ⇒ lấy ⇒ giao). */
function heldQty(a: AllocRow): number {
  switch (a.status) {
    case "assigned":
      return Number(a.qty_reserved) - Number(a.qty_released);
    case "picked_up":
      return Number(a.qty_picked);
    case "delivered":
      return Number(a.qty_delivered);
    default:
      return 0;
  }
}

const kgOf = (a: AllocRow) => Math.round(heldQty(a) * Number(a.unit_weight_kg_snapshot) * 1000) / 1000;

function windowOf(a: AllocRow) {
  return parseTstzRange(typeof a.offers?.pickup_window === "string" ? a.offers.pickup_window : null);
}

async function loadAllocations(supabase: Supabase, pickupIds: string[]): Promise<AllocRow[]> {
  if (pickupIds.length === 0) return [];
  const { data, error } = await supabase
    .from("allocations")
    .select(ALLOC_COLUMNS)
    .in("pickup_id", pickupIds)
    .overrideTypes<AllocRow[], { merge: false }>();
  if (error) throw new Error(`Không tải được hàng của chuyến (${error.code})`);
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Danh sách chuyến
// ---------------------------------------------------------------------------

export type VolunteerTripSummary = {
  id: string;
  status: PickupStatus;
  phase: VolunteerPhase;
  acceptedAt: string | null;
  startAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  charityName: string;
  dropoffSiteName: string;
  pickupStops: number;
  closedStops: number;
  storeNames: string[];
  totalKg: number;
};

type TripListRow = {
  id: string;
  status: PickupStatus;
  accepted_at: string | null;
  planned_start_at: string | null;
  created_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
  charity_org: { name: string } | null;
  charity_site: { name: string } | null;
  stops: {
    id: string;
    seq: number;
    kind: StopKind;
    status: StopStatus;
    site: { org: { name: string } | null } | null;
  }[];
};

/** Chuyến chế độ tình nguyện viên được gán cho người dùng (mới nhất trước). */
export async function loadMyTrips(userId: string, limit = 60): Promise<VolunteerTripSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pickups")
    .select(
      `id, status, accepted_at, planned_start_at, created_at, completed_at, cancelled_at,
       charity_org:organizations!pickups_charity_org_id_fkey(name),
       charity_site:sites!pickups_charity_site_id_fkey(name),
       stops:pickup_stops(id, seq, kind, status, site:sites!pickup_stops_site_id_fkey(org:organizations!sites_org_id_fkey(name)))`,
    )
    .eq("assignee_user_id", userId)
    .eq("mode", "volunteer")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Không tải được chuyến của bạn (${error.code})`);
  const rows = (data ?? []) as unknown as TripListRow[];
  const allocations = await loadAllocations(
    supabase,
    rows.map((r) => r.id),
  );

  return rows.map((r) => {
    const mine = allocations.filter((a) => a.pickup_id === r.id);
    const starts = mine
      .map((a) => windowOf(a)?.start.toISOString())
      .filter((s): s is string => !!s)
      .sort();
    const stops = r.stops.map((s) => ({ ...s, location: null }));
    const progress = pickupProgress(stops);
    return {
      id: r.id,
      status: r.status,
      phase: volunteerPhase(r.status, r.accepted_at),
      acceptedAt: r.accepted_at,
      startAt: tripStartAt({
        plannedStartAt: r.planned_start_at,
        earliestWindowStart: starts[0] ?? null,
        createdAt: r.created_at,
      }),
      completedAt: r.completed_at,
      cancelledAt: r.cancelled_at,
      charityName: r.charity_org?.name ?? "Tổ chức",
      dropoffSiteName: r.charity_site?.name ?? "Điểm nhận",
      pickupStops: progress.total,
      closedStops: progress.closed,
      storeNames: [
        ...new Set(
          [...r.stops]
            .sort((a, b) => a.seq - b.seq)
            .filter((s) => s.kind === "pickup")
            .map((s) => s.site?.org?.name)
            .filter((n): n is string => !!n),
        ),
      ],
      totalKg: Math.round(mine.reduce((sum, a) => sum + kgOf(a), 0) * 10) / 10,
    };
  });
}

/** Số chuyến đã hoàn tất (trạng thái rỗng của "Hôm nay" — US-VOL-03 AC3). */
export async function countCompletedTrips(userId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("pickups")
    .select("id", { count: "exact", head: true })
    .eq("assignee_user_id", userId)
    .eq("mode", "volunteer")
    .eq("status", "completed");
  if (error) return 0;
  return count ?? 0;
}

// ---------------------------------------------------------------------------
// Chi tiết một chuyến
// ---------------------------------------------------------------------------

export type StopLine = {
  allocationId: string;
  title: string;
  unit: UnitCode;
  qty: number;
  status: AllocationStatus;
  unitWeightKg: number;
};

export type VolunteerStop = {
  id: string;
  seq: number;
  kind: StopKind;
  status: StopStatus;
  siteName: string;
  orgName: string;
  /** Tổ chức sở hữu điểm (cửa hàng hoặc tổ chức nhận) — để mở hotline theo yêu cầu (get_org_contact). */
  orgId: string | null;
  address: string | null;
  location: LatLng | null;
  eta: string | null;
  arrivedAt: string | null;
  completedAt: string | null;
  arrivalCheck: "geofence" | "manual" | "no_location" | null;
  arrivalNote: string | null;
  skipReason: string | null;
  window: { start: string; end: string } | null;
  /** Hàng của điểm (điểm lấy: phân bổ của điểm; điểm giao: mọi phân bổ đã lấy/đã giao của chuyến). */
  lines: StopLine[];
  /** Dòng để phát mã bàn giao: điểm lấy = phân bổ `assigned`; điểm giao = phân bổ `picked_up`. */
  carrierLines: LineSpec[];
  handover: {
    id: string;
    consumedAt: string | null;
    expiresAt: string | null;
    method: HandoverMethod | null;
  } | null;
  contact: TripContact | null;
};

export type VolunteerTrip = {
  id: string;
  status: PickupStatus;
  phase: VolunteerPhase;
  acceptedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  startAt: string;
  charityName: string;
  charitySiteName: string;
  route: LineString | null;
  stops: VolunteerStop[];
  totalKg: number;
  /** Hàng đã giao về (chuyến hoàn tất) — tóm tắt "Bạn vừa giúp chuyển …" (US-VOL-09 AC2). */
  delivered: { title: string; unit: UnitCode; qty: number; kg: number }[];
};

type StopRow = {
  id: string;
  seq: number;
  kind: StopKind;
  status: StopStatus;
  site_id: string;
  eta: string | null;
  arrived_at: string | null;
  completed_at: string | null;
  arrival_check: string | null;
  arrival_note: string | null;
  skip_reason: string | null;
  site: {
    name: string;
    org_id: string;
    public_address: string | null;
    public_location: string | null;
    ward: string | null;
    org: { name: string } | null;
  } | null;
};

const CHECKS = new Set(["geofence", "manual", "no_location"]);

/** Chi tiết chuyến của chính người dùng; không thấy (RLS), không phải người được gán hoặc sai id ⇒ null. */
export async function loadVolunteerTrip(userId: string, pickupId: string): Promise<VolunteerTrip | null> {
  const supabase = await createClient();
  const { data: p, error } = await supabase
    .from("pickups")
    .select(
      `id, status, mode, assignee_user_id, accepted_at, started_at, completed_at, cancelled_at, cancel_reason,
       planned_start_at, created_at, route,
       charity_org:organizations!pickups_charity_org_id_fkey(name),
       charity_site:sites!pickups_charity_site_id_fkey(name)`,
    )
    .eq("id", pickupId)
    .maybeSingle();
  if (error) {
    if (error.code === "22P02") return null;
    throw new Error(`Không tải được chuyến (${error.code})`);
  }
  if (!p || p.assignee_user_id !== userId || p.mode !== "volunteer") return null;
  const charity = p.charity_org as unknown as { name: string } | null;
  const charitySite = p.charity_site as unknown as { name: string } | null;

  const [stopsRes, handoverRes, allocations, contactsRes] = await Promise.all([
    supabase
      .from("pickup_stops")
      .select(
        `id, seq, kind, status, site_id, eta, arrived_at, completed_at, arrival_check, arrival_note, skip_reason,
         site:sites!pickup_stops_site_id_fkey(name, org_id, public_address, public_location, ward,
           org:organizations!sites_org_id_fkey(name))`,
      )
      .eq("pickup_id", pickupId)
      .order("seq", { ascending: true }),
    supabase
      .from("handovers")
      .select("id, stop_id, consumed_at, token_expires_at, method")
      .eq("pickup_id", pickupId),
    loadAllocations(supabase, [pickupId]),
    supabase.rpc("get_pickup_contacts", { p_pickup_id: pickupId }),
  ]);
  if (stopsRes.error) throw new Error(`Không tải được điểm dừng (${stopsRes.error.code})`);
  if (handoverRes.error) throw new Error(`Không tải được bàn giao (${handoverRes.error.code})`);
  const rows = (stopsRes.data ?? []) as unknown as StopRow[];
  const running = RUNNING.includes(p.status);

  // Toạ độ + địa chỉ chính xác chỉ khi chuyến còn chạy (người được gán — get_site_location)
  const exact = await Promise.all(
    rows.map(async (s) => {
      if (!running) return null;
      const { data, error: e } = await supabase.rpc("get_site_location", { p_site_id: s.site_id });
      if (e || !data?.[0]) return null;
      return { lat: Number(data[0].lat), lng: Number(data[0].lng), address: data[0].address_line };
    }),
  );

  const contacts: TripContact[] = contactsRes.error
    ? []
    : (contactsRes.data ?? []).map((c) => ({
        role: c.role,
        displayName: c.display_name,
        phoneMasked: c.phone_masked,
      }));
  const handoverByStop = new Map((handoverRes.data ?? []).map((h) => [h.stop_id, h]));

  const lineOf = (a: AllocRow): StopLine => ({
    allocationId: a.id,
    title: a.offers?.title ?? "Lô tặng",
    unit: a.unit,
    qty: heldQty(a),
    status: a.status,
    unitWeightKg: Number(a.unit_weight_kg_snapshot),
  });

  const stops: VolunteerStop[] = rows.map((s, i) => {
    const ex = exact[i];
    const orgName = s.site?.org?.name ?? "";
    const siteName = s.site?.name ?? "";
    const atStop =
      s.kind === "pickup"
        ? allocations.filter((a) => a.stop_id === s.id)
        : allocations.filter((a) => a.status === "picked_up" || a.status === "delivered");
    const windows = atStop.map(windowOf).filter((w): w is NonNullable<typeof w> => w !== null);
    const h = handoverByStop.get(s.id);
    const carrierSource =
      s.kind === "pickup"
        ? atStop.filter((a) => a.status === "assigned")
        : atStop.filter((a) => a.status === "picked_up");
    return {
      id: s.id,
      seq: s.seq,
      kind: s.kind,
      status: s.status,
      siteName,
      orgName,
      orgId: s.site?.org_id ?? null,
      address: ex?.address ?? s.site?.public_address ?? s.site?.ward ?? null,
      location: ex ? { lat: ex.lat, lng: ex.lng } : parseEwkbPoint(s.site?.public_location ?? null),
      eta: s.eta,
      arrivedAt: s.arrived_at,
      completedAt: s.completed_at,
      arrivalCheck:
        s.arrival_check && CHECKS.has(s.arrival_check)
          ? (s.arrival_check as VolunteerStop["arrivalCheck"])
          : null,
      arrivalNote: s.arrival_note,
      skipReason: s.skip_reason,
      window:
        s.kind === "pickup" && windows.length > 0
          ? {
              // Khung chung của mọi lô ở điểm (mã chỉ dùng được trong khung của MỌI phân bổ)
              start: new Date(Math.max(...windows.map((w) => w.start.getTime()))).toISOString(),
              end: new Date(Math.min(...windows.map((w) => w.end.getTime()))).toISOString(),
            }
          : null,
      lines: atStop.map(lineOf),
      carrierLines: carrierSource.map((a) => ({
        allocationId: a.id,
        title: a.offers?.title ?? "Lô tặng",
        unit: a.unit,
        expectedQty: heldQty(a),
        unitWeightKg: Number(a.unit_weight_kg_snapshot),
      })),
      handover: h
        ? { id: h.id, consumedAt: h.consumed_at, expiresAt: h.token_expires_at, method: h.method }
        : null,
      contact: contactForStop(contacts, { kind: s.kind, orgName, siteName }),
    };
  });

  const starts = allocations
    .map((a) => windowOf(a)?.start.toISOString())
    .filter((x): x is string => !!x)
    .sort();
  const delivered = allocations
    .filter((a) => a.status === "delivered")
    .map((a) => ({
      title: a.offers?.title ?? "Lô tặng",
      unit: a.unit,
      qty: Number(a.qty_delivered),
      kg: kgOf(a),
    }));

  return {
    id: p.id,
    status: p.status,
    phase: volunteerPhase(p.status, p.accepted_at),
    acceptedAt: p.accepted_at,
    startedAt: p.started_at,
    completedAt: p.completed_at,
    cancelledAt: p.cancelled_at,
    cancelReason: p.cancel_reason,
    startAt: tripStartAt({
      plannedStartAt: p.planned_start_at,
      earliestWindowStart: starts[0] ?? null,
      createdAt: p.created_at,
    }),
    charityName: charity?.name ?? "Tổ chức",
    charitySiteName: charitySite?.name ?? "Điểm nhận",
    route: parseLineString(p.route),
    stops,
    totalKg: Math.round(allocations.reduce((sum, a) => sum + kgOf(a), 0) * 10) / 10,
    delivered,
  };
}

// ---------------------------------------------------------------------------
// Đồng ý vị trí + hồ sơ
// ---------------------------------------------------------------------------

export async function loadLocationConsent(userId: string): Promise<LocationConsent> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("consents")
    .select("policy_version, granted_at, withdrawn_at")
    .eq("user_id", userId)
    .eq("purpose", "location_trip")
    .order("granted_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`Không tải được trạng thái đồng ý (${error.code})`);
  const row = data?.[0];
  return {
    active: !!row && row.withdrawn_at === null,
    grantedAt: row?.granted_at ?? null,
    withdrawnAt: row?.withdrawn_at ?? null,
    policyVersion: row?.policy_version ?? null,
    everAnswered: !!row,
  };
}

/** Đồng ý `trip_contact` đang hiệu lực (công tắc "Cho phép … gọi tôi khi chuyến đang chạy" — mặc định tắt). */
export async function loadTripContactConsent(userId: string): Promise<TripContactConsent> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("consents")
    .select("granted_at")
    .eq("user_id", userId)
    .eq("purpose", "trip_contact")
    .is("withdrawn_at", null)
    .maybeSingle();
  if (error) throw new Error(`Không tải được trạng thái cho phép gọi (${error.code})`);
  return { active: !!data, grantedAt: data?.granted_at ?? null };
}

export type VolunteerProfileView = {
  fullName: string;
  phone: string | null;
  exists: boolean;
  vehicle: VehicleType;
  capacityKg: number;
  area: LatLng | null;
  areaLabel: string | null;
  availabilityNote: string | null;
  updatedAt: string | null;
};

export async function loadVolunteerProfile(userId: string): Promise<VolunteerProfileView> {
  const supabase = await createClient();
  const [profileRes, vpRes] = await Promise.all([
    supabase.from("profiles").select("full_name, phone").eq("id", userId).maybeSingle(),
    supabase
      .from("volunteer_profiles")
      .select("vehicle, capacity_kg, base_area, base_area_label, availability_note, updated_at")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  if (profileRes.error) throw new Error(`Không tải được hồ sơ (${profileRes.error.code})`);
  if (vpRes.error) throw new Error(`Không tải được hồ sơ tình nguyện viên (${vpRes.error.code})`);
  const vp = vpRes.data;
  return {
    fullName: profileRes.data?.full_name ?? "",
    phone: profileRes.data?.phone ?? null,
    exists: !!vp,
    vehicle: vp?.vehicle ?? "motorbike",
    capacityKg: vp ? Number(vp.capacity_kg) : 20,
    area: vp ? parseEwkbPoint(typeof vp.base_area === "string" ? vp.base_area : null) : null,
    areaLabel: vp?.base_area_label ?? null,
    availabilityNote: vp?.availability_note ?? null,
    updatedAt: vp?.updated_at ?? null,
  };
}

/** Đã có hồ sơ TNV chưa (gợi ý hoàn thiện hồ sơ trên "Hôm nay" — US-VOL-01 AC1). */
export async function hasVolunteerProfile(userId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("volunteer_profiles")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return !error && !!data;
}
