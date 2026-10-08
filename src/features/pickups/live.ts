/**
 * Trạng thái "trực tiếp" của bản đồ điều phối (thuần — PRD US-CHA-18; ROADMAP P3-11): áp thay đổi Realtime của
 * `pickup_stops` (trạng thái, ETA, check-in) vào danh sách điểm dừng, câu thông báo cho trình đọc màn hình,
 * cảnh báo trễ ETA 15 phút và tuổi của vị trí tình nguyện viên. Realtime chỉ là tín hiệu; trang vẫn đọc lại
 * qua RLS (router.refresh) để đồng bộ phân bổ/bàn giao.
 */

export type LiveStopStatus = "pending" | "arrived" | "done" | "skipped";
export type ArrivalCheck = "geofence" | "manual" | "no_location";

export type LiveStopFields = {
  id: string;
  seq: number;
  kind: "pickup" | "dropoff";
  status: LiveStopStatus;
  eta: string | null;
  arrivedAt: string | null;
  completedAt: string | null;
  skipReason: string | null;
  arrivalCheck: ArrivalCheck | null;
  arrivalNote: string | null;
};

/** Dòng `pickup_stops` từ Realtime (`payload.new`, tên cột DB). */
export type StopRow = {
  id?: unknown;
  pickup_id?: unknown;
  seq?: unknown;
  status?: unknown;
  eta?: unknown;
  arrived_at?: unknown;
  completed_at?: unknown;
  skip_reason?: unknown;
  arrival_check?: unknown;
  arrival_note?: unknown;
};

const STATUSES: readonly LiveStopStatus[] = ["pending", "arrived", "done", "skipped"];
const CHECKS: readonly ArrivalCheck[] = ["geofence", "manual", "no_location"];

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

export type LiveAction<T extends LiveStopFields> =
  { type: "reset"; stops: T[] } | { type: "change"; pickupId: string; row: StopRow };

export type LiveState<T extends LiveStopFields> = {
  stops: T[];
  /** Điểm dừng vừa đổi (để thông báo/nhấn mạnh); null khi không có gì đổi. */
  changed: { before: T; after: T } | null;
  /** Có dòng lạ (điểm dừng mới do lên lại kế hoạch) ⇒ cần tải lại từ server. */
  needsRefresh: boolean;
};

/** Áp một dòng Realtime vào danh sách; bỏ qua dòng của chuyến khác. Không đổi gì ⇒ trả lại đúng mảng cũ. */
export function applyStopChange<T extends LiveStopFields>(
  stops: T[],
  pickupId: string,
  row: StopRow,
): { stops: T[]; changed: { before: T; after: T } | null; unknown: boolean } {
  if (row.pickup_id !== undefined && row.pickup_id !== pickupId)
    return { stops, changed: null, unknown: false };
  const id = str(row.id);
  if (!id) return { stops, changed: null, unknown: false };
  const index = stops.findIndex((s) => s.id === id);
  if (index === -1) return { stops, changed: null, unknown: true };

  const before = stops[index]!;
  const after: T = { ...before };
  if (typeof row.seq === "number") after.seq = row.seq;
  if (typeof row.status === "string" && (STATUSES as readonly string[]).includes(row.status))
    after.status = row.status as LiveStopStatus;
  if ("eta" in row) after.eta = str(row.eta);
  if ("arrived_at" in row) after.arrivedAt = str(row.arrived_at);
  if ("completed_at" in row) after.completedAt = str(row.completed_at);
  if ("skip_reason" in row) after.skipReason = str(row.skip_reason);
  if ("arrival_check" in row) {
    const c = str(row.arrival_check);
    after.arrivalCheck = c && (CHECKS as readonly string[]).includes(c) ? (c as ArrivalCheck) : null;
  }
  if ("arrival_note" in row) after.arrivalNote = str(row.arrival_note);

  const same =
    after.seq === before.seq &&
    after.status === before.status &&
    after.eta === before.eta &&
    after.arrivedAt === before.arrivedAt &&
    after.completedAt === before.completedAt &&
    after.skipReason === before.skipReason &&
    after.arrivalCheck === before.arrivalCheck &&
    after.arrivalNote === before.arrivalNote;
  if (same) return { stops, changed: null, unknown: false };

  const next = [...stops];
  next[index] = after;
  next.sort((a, b) => a.seq - b.seq);
  return { stops: next, changed: { before, after }, unknown: false };
}

export function liveReducer<T extends LiveStopFields>(
  state: LiveState<T>,
  action: LiveAction<T>,
): LiveState<T> {
  if (action.type === "reset") return { stops: action.stops, changed: null, needsRefresh: false };
  const r = applyStopChange(state.stops, action.pickupId, action.row);
  if (r.unknown) return { ...state, changed: null, needsRefresh: true };
  if (!r.changed) return state;
  return { stops: r.stops, changed: r.changed, needsRefresh: state.needsRefresh };
}

const PICKUP_STATUS_TEXT: Record<LiveStopStatus, string> = {
  pending: "chưa tới",
  arrived: "tình nguyện viên đã đến",
  done: "đã lấy hàng",
  skipped: "đã bỏ qua",
};
const DROPOFF_STATUS_TEXT: Record<LiveStopStatus, string> = {
  pending: "chờ giao về",
  arrived: "tình nguyện viên đã về tới",
  done: "đã giao về",
  skipped: "đã bỏ qua",
};

/** "Điểm 2 · Tiệm bánh A: tình nguyện viên đã đến (check-in thủ công)." — null khi chỉ ETA đổi. */
export function stopChangeAnnouncement(
  before: LiveStopFields,
  after: LiveStopFields,
  title: string,
): string | null {
  if (before.status === after.status) return null;
  const text = (after.kind === "pickup" ? PICKUP_STATUS_TEXT : DROPOFF_STATUS_TEXT)[after.status];
  const flag =
    after.status === "arrived" && after.arrivalCheck === "manual"
      ? " (check-in thủ công, ngoài 100 m)"
      : after.status === "arrived" && after.arrivalCheck === "no_location"
        ? " (không xác minh vị trí)"
        : "";
  return `Điểm ${after.seq} · ${title}: ${text}${flag}.`;
}

/** Phút cho phép trễ so với ETA trước khi cảnh báo (US-CHA-18 AC3). */
export const LATE_GRACE_MINUTES = 15;

/** Điểm chưa tới mà đã quá ETA + 15 phút. */
export function isStopLate(stop: Pick<LiveStopFields, "status" | "eta">, nowMs: number): boolean {
  if (stop.status !== "pending" || !stop.eta) return false;
  const eta = Date.parse(stop.eta);
  return Number.isFinite(eta) && nowMs > eta + LATE_GRACE_MINUTES * 60_000;
}

/** "vừa cập nhật" / "cập nhật 3 phút trước" / "cập nhật 2 giờ trước" cho vị trí mới nhất của TNV. */
export function positionAgeLabel(at: string | null, nowMs: number): string | null {
  if (!at) return null;
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return null;
  const minutes = Math.max(0, Math.floor((nowMs - t) / 60_000));
  if (minutes < 1) return "vừa cập nhật";
  if (minutes < 60) return `cập nhật ${minutes} phút trước`;
  return `cập nhật ${Math.floor(minutes / 60)} giờ trước`;
}

/** Vị trí cũ hơn 10 phút coi như không còn theo dõi được (app TNV đã đóng hoặc mất mạng). */
export const STALE_POSITION_MINUTES = 10;

export function isPositionStale(at: string | null, nowMs: number): boolean {
  if (!at) return true;
  const t = Date.parse(at);
  return !Number.isFinite(t) || nowMs - t > STALE_POSITION_MINUTES * 60_000;
}
