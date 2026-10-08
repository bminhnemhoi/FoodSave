import { VEHICLE_LABEL } from "@/features/volunteer/labels";

import type { VehicleType, VolunteerRow } from "./queries";

/**
 * Trình bày danh sách tình nguyện viên (thuần — PRD US-CHA-15 AC1): tên hiển thị, phương tiện, trạng thái,
 * tóm tắt số liệu đầu trang. Không IO, có unit test.
 */

export type VolunteerState = "paused" | "on_trip" | "active";

export const VOLUNTEER_STATE_LABEL: Record<VolunteerState, string> = {
  active: "Sẵn sàng",
  on_trip: "Đang có chuyến",
  paused: "Tạm ngưng",
};

export function volunteerState(v: Pick<VolunteerRow, "pausedAt" | "openTrips">): VolunteerState {
  if (v.pausedAt) return "paused";
  if (v.openTrips > 0) return "on_trip";
  return "active";
}

/** Tên hiển thị; chưa có tên thì gọi chung kèm SĐT đã che để còn phân biệt. */
export function volunteerName(v: Pick<VolunteerRow, "name" | "phoneMasked">): string {
  if (v.name) return v.name;
  return v.phoneMasked ? `Tình nguyện viên ${v.phoneMasked}` : "Tình nguyện viên chưa đặt tên";
}

export function vehicleLabel(vehicle: VehicleType | null): string {
  return vehicle ? VEHICLE_LABEL[vehicle] : "Chưa khai";
}

export type VolunteerSummary = { active: number; paused: number; onTrip: number; tripsThisMonth: number };

export function summarize(list: readonly VolunteerRow[]): VolunteerSummary {
  let paused = 0;
  let onTrip = 0;
  let trips = 0;
  for (const v of list) {
    const s = volunteerState(v);
    if (s === "paused") paused++;
    if (s === "on_trip") onTrip++;
    trips += v.tripsThisMonth;
  }
  return { active: list.length - paused, paused, onTrip, tripsThisMonth: trips };
}
