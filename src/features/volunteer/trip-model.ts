import type { LatLng } from "@/core/geo/types";
import { googleMapsDirectionsUrl, routeDirectionsLinks, type DirectionsLinks } from "@/core/routing";
import type { Database } from "@/types/database.types";

/**
 * Mô hình hiển thị chuyến của tình nguyện viên (PRD US-VOL-03…09; DATA-MODEL §6.5) — thuần, không IO, có test.
 * Trạng thái DB (`pickup_status` + `accepted_at`) ⇒ giai đoạn TNV hiểu được; điểm dừng kế tiếp; deep link chỉ
 * đường qua các điểm còn lại; nhóm chuyến cho màn "Hôm nay".
 */

export type PickupStatus = Database["public"]["Enums"]["pickup_status"];
export type StopStatus = Database["public"]["Enums"]["stop_status"];
export type StopKind = Database["public"]["Enums"]["handover_kind"];

export type VolunteerPhase =
  "awaiting_response" | "accepted" | "in_progress" | "completed" | "cancelled" | "unassigned";

export function volunteerPhase(status: PickupStatus, acceptedAt: string | null): VolunteerPhase {
  switch (status) {
    case "assigned":
      return acceptedAt ? "accepted" : "awaiting_response";
    case "in_progress":
      return "in_progress";
    case "completed":
      return "completed";
    case "cancelled":
      return "cancelled";
    case "planned":
      return "unassigned";
  }
}

export const PHASE_LABEL: Record<VolunteerPhase, string> = {
  awaiting_response: "Chờ nhận lời",
  accepted: "Đã nhận",
  in_progress: "Đang chạy",
  completed: "Xong",
  cancelled: "Đã hủy",
  unassigned: "Đã giao người khác",
};

export const PICKUP_STOP_TEXT: Record<StopStatus, string> = {
  pending: "Chưa tới",
  arrived: "Đã tới nơi",
  done: "Đã lấy hàng",
  skipped: "Đã bỏ qua",
};

export const DROPOFF_STOP_TEXT: Record<StopStatus, string> = {
  pending: "Chờ giao về",
  arrived: "Đã về tới",
  done: "Đã giao xong",
  skipped: "Không giao",
};

export function stopStatusText(kind: StopKind, status: StopStatus): string {
  return (kind === "pickup" ? PICKUP_STOP_TEXT : DROPOFF_STOP_TEXT)[status];
}

export type ModelStop = {
  id: string;
  seq: number;
  kind: StopKind;
  status: StopStatus;
  location: LatLng | null;
};

export function isOpenStop(s: Pick<ModelStop, "status">): boolean {
  return s.status === "pending" || s.status === "arrived";
}

const bySeq = <T extends Pick<ModelStop, "seq">>(stops: readonly T[]) =>
  [...stops].sort((a, b) => a.seq - b.seq);

/**
 * Điểm kế tiếp: điểm lấy hàng còn mở có thứ tự nhỏ nhất; lấy xong/bỏ qua hết thì là điểm giao về (nếu còn mở);
 * không còn gì ⇒ null.
 */
export function currentStop<T extends ModelStop>(stops: readonly T[]): T | null {
  const sorted = bySeq(stops);
  return (
    sorted.find((s) => s.kind === "pickup" && isOpenStop(s)) ??
    sorted.find((s) => s.kind === "dropoff" && isOpenStop(s)) ??
    null
  );
}

/** Số điểm lấy hàng đã khép lại (xong hoặc bỏ qua) trên tổng số điểm lấy hàng. */
export function pickupProgress(stops: readonly ModelStop[]): { closed: number; total: number } {
  const pickups = stops.filter((s) => s.kind === "pickup");
  return {
    closed: pickups.filter((s) => s.status === "done" || s.status === "skipped").length,
    total: pickups.length,
  };
}

/** Trình duyệt/ứng dụng Google Maps trên điện thoại chỉ nhận chắc chắn 3 điểm trung gian (Maps URLs). */
export const MOBILE_GOOGLE_WAYPOINTS = 3;

/**
 * Deep link chỉ đường từ vị trí hiện tại: qua các điểm lấy hàng còn mở (bắt đầu từ điểm kế tiếp) rồi về điểm
 * giao (ROADMAP P3-10, PRD US-VOL-05 AC2). Google: còn nhiều hơn 3 điểm trung gian thì dẫn tới điểm lấy thứ 4
 * trước (mở lại link sau khi xong các điểm đầu); Apple Maps nhận đủ. Thiếu toạ độ ⇒ không dựng tuyến sai.
 */
export function directionsFromHere(
  stops: readonly ModelStop[],
  maxGoogleWaypoints: number = MOBILE_GOOGLE_WAYPOINTS,
): DirectionsLinks | null {
  const cur = currentStop(stops);
  if (!cur) return null;
  const sorted = bySeq(stops);
  const dropoff = sorted.find((s) => s.kind === "dropoff");
  if (cur.kind === "dropoff" || !dropoff?.location)
    return cur.location ? routeDirectionsLinks([], cur.location) : null;
  const remaining = sorted
    .filter((s) => s.kind === "pickup" && isOpenStop(s) && s.seq >= cur.seq)
    .map((s) => s.location);
  if (remaining.some((p) => !p)) return cur.location ? routeDirectionsLinks([], cur.location) : null;
  const points = remaining as LatLng[];
  const links = routeDirectionsLinks(points, dropoff.location);
  if (points.length <= maxGoogleWaypoints) return links;
  return {
    google: googleMapsDirectionsUrl(points[maxGoogleWaypoints]!, {
      waypoints: points.slice(0, maxGoogleWaypoints),
    }),
    apple: links.apple,
  };
}

// ---------------------------------------------------------------------------
// Màn "Hôm nay"
// ---------------------------------------------------------------------------

const dayKeyFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Ho_Chi_Minh",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "2026-10-08" theo giờ Việt Nam (so sánh ngày không phụ thuộc múi giờ máy chủ). */
export function vnDayKey(value: string | Date): string {
  return dayKeyFormat.format(typeof value === "string" ? new Date(value) : value);
}

/** Mốc bắt đầu dự kiến: giờ điều phối viên đặt, nếu không có thì đầu khung lấy sớm nhất, cuối cùng là lúc tạo. */
export function tripStartAt(t: {
  plannedStartAt: string | null;
  earliestWindowStart: string | null;
  createdAt: string;
}): string {
  return t.plannedStartAt ?? t.earliestWindowStart ?? t.createdAt;
}

export type TripListItem = {
  status: PickupStatus;
  acceptedAt: string | null;
  startAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
};

export type TodayGroups<T> = {
  /** Đang chạy (luôn ở đầu). */
  running: T[];
  /** Chờ nhận lời / đã nhận, bắt đầu hôm nay hoặc đã tới giờ. */
  today: T[];
  /** Bắt đầu từ ngày mai trở đi. */
  upcoming: T[];
  /** Xong hoặc bị hủy trong hôm nay. */
  finishedToday: T[];
};

export function groupTodayTrips<T extends TripListItem>(trips: readonly T[], now: Date): TodayGroups<T> {
  const today = vnDayKey(now);
  const groups: TodayGroups<T> = { running: [], today: [], upcoming: [], finishedToday: [] };
  for (const t of trips) {
    const phase = volunteerPhase(t.status, t.acceptedAt);
    if (phase === "in_progress") groups.running.push(t);
    else if (phase === "awaiting_response" || phase === "accepted") {
      (vnDayKey(t.startAt) <= today ? groups.today : groups.upcoming).push(t);
    } else if (phase === "completed" || phase === "cancelled") {
      const at = t.completedAt ?? t.cancelledAt;
      if (at && vnDayKey(at) === today) groups.finishedToday.push(t);
    }
  }
  const asc = (a: T, b: T) => a.startAt.localeCompare(b.startAt);
  groups.running.sort(asc);
  groups.today.sort(asc);
  groups.upcoming.sort(asc);
  groups.finishedToday.sort((a, b) =>
    (b.completedAt ?? b.cancelledAt ?? "").localeCompare(a.completedAt ?? a.cancelledAt ?? ""),
  );
  return groups;
}

// ---------------------------------------------------------------------------
// Liên hệ (get_pickup_contacts — số điện thoại đã che)
// ---------------------------------------------------------------------------

export type TripContact = { role: string; displayName: string; phoneMasked: string | null };

/**
 * Liên hệ của một điểm dừng: điểm lấy ⇒ dòng `store` có tên "<cửa hàng> — <chi nhánh>"; điểm giao ⇒ dòng
 * `charity`. Không khớp ⇒ null (không đoán).
 */
export function contactForStop(
  contacts: readonly TripContact[],
  stop: { kind: StopKind; orgName: string; siteName: string },
): TripContact | null {
  if (stop.kind === "dropoff") return contacts.find((c) => c.role === "charity") ?? null;
  const name = `${stop.orgName} — ${stop.siteName}`;
  return contacts.find((c) => c.role === "store" && c.displayName === name) ?? null;
}
