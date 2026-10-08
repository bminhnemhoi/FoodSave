import "server-only";

import type { LatLng } from "@/core/geo/types";
import { listOpenInvitations, type InvitationRow } from "@/features/members/queries";
import { createClient } from "@/server/db/supabase";
import type { Database } from "@/types/database.types";

/**
 * Danh sách tình nguyện viên cho điều phối viên (RPC `list_org_volunteers`, migration 20261008170200 —
 * owner/manager/staff của tổ chức đã duyệt). Chỉ có SĐT đã che, khu vực gần đúng (lưới 0,01°) và cờ đồng ý
 * chia sẻ vị trí; bản ghi đồng ý và toạ độ chính xác không bao giờ rời DB (SECURITY-PRIVACY §5 dòng 2, 9).
 */

export type VehicleType = Database["public"]["Enums"]["vehicle_type"];

export type VolunteerRow = {
  userId: string;
  /** null khi TNV chưa đặt tên hiển thị. */
  name: string | null;
  phoneMasked: string | null;
  joinedAt: string;
  pausedAt: string | null;
  pausedReason: string | null;
  hasProfile: boolean;
  vehicle: VehicleType | null;
  capacityKg: number | null;
  /** Khu vực gần đúng (đã làm tròn 0,01° ≈ 1,1 km). */
  base: LatLng | null;
  areaLabel: string | null;
  availabilityNote: string | null;
  locationConsent: boolean;
  tripsCompleted: number;
  tripsThisMonth: number;
  lastTripAt: string | null;
  openTrips: number;
};

/** Sức chở mặc định khi TNV chưa khai hồ sơ (= mặc định của `volunteer_profiles.capacity_kg`). */
export const DEFAULT_CAPACITY_KG = 20;

export async function listVolunteers(orgId: string): Promise<VolunteerRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_org_volunteers", { p_org_id: orgId });
  if (error) throw new Error(`Không tải được danh sách tình nguyện viên (${error.code})`);
  // Kiểu sinh tự động coi mọi cột là NOT NULL; thực tế nhiều cột có thể null (left join hồ sơ).
  type Row = { [K in keyof (typeof data)[number]]: (typeof data)[number][K] | null };
  return ((data ?? []) as Row[]).map((r) => ({
    userId: r.user_id!,
    name: r.full_name?.trim() || null,
    phoneMasked: r.phone_masked,
    joinedAt: r.joined_at!,
    pausedAt: r.paused_at,
    pausedReason: r.paused_reason,
    hasProfile: r.has_profile === true,
    vehicle: r.vehicle,
    capacityKg: r.capacity_kg === null ? null : Number(r.capacity_kg),
    base:
      r.base_lat === null || r.base_lng === null
        ? null
        : { lat: Number(r.base_lat), lng: Number(r.base_lng) },
    areaLabel: r.base_area_label,
    availabilityNote: r.availability_note,
    locationConsent: r.location_consent === true,
    tripsCompleted: Number(r.trips_completed ?? 0),
    tripsThisMonth: Number(r.trips_this_month ?? 0),
    lastTripAt: r.last_trip_at,
    openTrips: Number(r.open_trips ?? 0),
  }));
}

/** Lời mời tình nguyện viên đang mở (RLS: chỉ owner/manager đọc được `org_invitations`; staff nhận danh sách rỗng). */
export async function listVolunteerInvitations(orgId: string): Promise<InvitationRow[]> {
  const all = await listOpenInvitations(orgId);
  return all.filter((i) => i.role === "volunteer");
}
