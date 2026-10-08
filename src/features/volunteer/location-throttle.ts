/**
 * Nhịp gửi vị trí trong chuyến (PRD US-VOL-12; SECURITY-PRIVACY C9; DATA-MODEL §8.5 `update_pickup_progress`):
 * tối đa một điểm mỗi `location_min_interval_seconds` (30 giây), tôn trọng gợi ý chờ của PT429, không gửi chồng
 * khi lần trước chưa xong. Thuần, không IO, có test — hook phía client chỉ hỏi "gửi ngay hay chờ bao lâu".
 */

/** `app_settings.location_min_interval_seconds` mặc định. */
export const LOCATION_MIN_INTERVAL_MS = 30_000;

/** Lỗi mạng tạm thời ⇒ thử lại sau một nhịp (không dồn dập khi sóng yếu). */
export const LOCATION_RETRY_MS = LOCATION_MIN_INTERVAL_MS;

export type ThrottleState = {
  /** Mốc gửi thành công gần nhất (ms). */
  lastSentAt: number | null;
  /** Máy chủ yêu cầu chờ tới mốc này (PT429 `hint`, hoặc lỗi mạng). */
  blockedUntil: number | null;
  /** Đang có một lần gửi chưa trả lời. */
  inFlight: boolean;
};

export const INITIAL_THROTTLE: ThrottleState = { lastSentAt: null, blockedUntil: null, inFlight: false };

export type SendDecision = { action: "send" } | { action: "wait"; ms: number } | { action: "busy" };

export function nextSend(
  state: ThrottleState,
  now: number,
  minIntervalMs: number = LOCATION_MIN_INTERVAL_MS,
): SendDecision {
  if (state.inFlight) return { action: "busy" };
  const earliest = Math.max(
    state.lastSentAt === null ? Number.NEGATIVE_INFINITY : state.lastSentAt + minIntervalMs,
    state.blockedUntil ?? Number.NEGATIVE_INFINITY,
  );
  return earliest <= now ? { action: "send" } : { action: "wait", ms: Math.ceil(earliest - now) };
}

/** PT429: `hint` = số giây phải chờ (chuỗi). Sai/thiếu ⇒ một nhịp mặc định. */
export function retryAfterMs(hint: string | null | undefined, fallbackMs = LOCATION_MIN_INTERVAL_MS): number {
  const seconds = Number(hint);
  if (!hint || !Number.isFinite(seconds) || seconds <= 0) return fallbackMs;
  return Math.min(Math.ceil(seconds) * 1000, 10 * 60_000);
}

/**
 * Làm tròn toạ độ trước khi rời máy (4 chữ số ≈ 11 m — cùng mức DB lưu): máy chủ không bao giờ nhận
 * toạ độ chính xác hơn mức cần cho ETA.
 */
export function roundCoord(value: number, decimals = 4): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/** Độ chính xác (m) gửi kèm: số nguyên 0–100000 như RPC yêu cầu; không có/không hợp lệ ⇒ null. */
export function accuracyForRpc(accuracy: number | null | undefined): number | null {
  if (accuracy === null || accuracy === undefined || !Number.isFinite(accuracy) || accuracy < 0) return null;
  return Math.min(100_000, Math.round(accuracy));
}
