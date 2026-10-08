/**
 * Máy trạng thái "Tôi đã tới" (PRD US-VOL-06; DATA-MODEL §8.5 `check_in_stop`) — thuần, không IO, có test.
 *
 * idle → locating → submitting → done
 *                 ↘ needs_reason (no_location: bị chặn quyền / không định vị được / quá thời gian / không hỗ trợ)
 *      submitting → needs_reason (outside_fence: RPC trả `reason_required`, kèm khoảng cách)
 *      needs_reason → submitting (kèm lý do; ngoài vùng thì gửi lại đúng toạ độ đã lấy, không lấy toạ độ mới)
 *      submitting → error → submitting (thử lại cùng toạ độ + lý do ⇒ cùng `client_op_id`, DB không ghi hai lần)
 *
 * Toạ độ chỉ nằm trong state bộ nhớ của lượt check-in này (SECURITY-PRIVACY C9, §5 dòng 10): không lưu ở
 * đâu khác, và DB chỉ ghi cờ `geofence|manual|no_location`.
 */

export type GeoFix = { lat: number; lng: number; accuracyM: number | null };

/** Vì sao không có toạ độ: mã `GeolocationPositionError` (1 = từ chối, 2 = không có tín hiệu, 3 = quá giờ). */
export type GeoProblem = "denied" | "unavailable" | "timeout" | "unsupported";

export type CheckResult = {
  arrived: boolean;
  distanceM: number | null;
  check: "geofence" | "manual" | "no_location" | null;
  reasonRequired: boolean;
};

type Attempt = { fix: GeoFix | null; reason: string | null };

export type CheckInState =
  | { step: "idle" }
  | { step: "locating" }
  | ({ step: "submitting" } & Attempt)
  | { step: "needs_reason"; cause: "outside_fence"; distanceM: number | null; fix: GeoFix }
  | { step: "needs_reason"; cause: "no_location"; problem: GeoProblem }
  | { step: "done"; check: CheckResult["check"]; distanceM: number | null }
  | ({ step: "error"; message: string } & Attempt);

export type CheckInEvent =
  | { type: "start"; supported: boolean }
  | { type: "geo_fix"; fix: GeoFix }
  | { type: "geo_error"; code: number }
  | { type: "server"; result: CheckResult }
  | { type: "submit_reason"; reason: string }
  | { type: "failed"; message: string }
  | { type: "retry" }
  | { type: "cancel" };

export const INITIAL_CHECK_IN: CheckInState = { step: "idle" };

/** `GeolocationPositionError.code` ⇒ lý do không có toạ độ. */
export function geoProblemFromCode(code: number): GeoProblem {
  if (code === 1) return "denied";
  if (code === 3) return "timeout";
  return "unavailable";
}

export function checkInReducer(state: CheckInState, event: CheckInEvent): CheckInState {
  switch (event.type) {
    case "start":
      // Đang gửi thì bỏ qua lần bấm thứ hai (một ý định = một lần gọi RPC)
      if (state.step === "locating" || state.step === "submitting") return state;
      return event.supported
        ? { step: "locating" }
        : { step: "needs_reason", cause: "no_location", problem: "unsupported" };
    case "geo_fix":
      return state.step === "locating" ? { step: "submitting", fix: event.fix, reason: null } : state;
    case "geo_error":
      return state.step === "locating"
        ? { step: "needs_reason", cause: "no_location", problem: geoProblemFromCode(event.code) }
        : state;
    case "server": {
      if (state.step !== "submitting") return state;
      const r = event.result;
      if (r.arrived) return { step: "done", check: r.check, distanceM: r.distanceM };
      if (r.reasonRequired && state.fix)
        return { step: "needs_reason", cause: "outside_fence", distanceM: r.distanceM, fix: state.fix };
      // Không đến nơi mà cũng không đòi lý do: coi như lỗi máy chủ, cho thử lại
      return {
        step: "error",
        message: "Chưa ghi nhận được check-in. Vui lòng thử lại.",
        fix: state.fix,
        reason: state.reason,
      };
    }
    case "submit_reason": {
      if (state.step !== "needs_reason") return state;
      const reason = event.reason.trim();
      if (!reason) return state;
      return { step: "submitting", fix: state.cause === "outside_fence" ? state.fix : null, reason };
    }
    case "failed":
      return state.step === "submitting"
        ? { step: "error", message: event.message, fix: state.fix, reason: state.reason }
        : state;
    case "retry":
      return state.step === "error" ? { step: "submitting", fix: state.fix, reason: state.reason } : state;
    case "cancel":
      return state.step === "submitting" ? state : INITIAL_CHECK_IN;
  }
}

/** Khóa ý định cho `client_op_id`: cùng điểm + cùng toạ độ + cùng lý do ⇒ cùng id (an toàn khi gửi lại). */
export function checkInIntentKey(stopId: string, attempt: Attempt): string {
  const f = attempt.fix;
  return [stopId, f ? `${f.lat},${f.lng}` : "no-location", attempt.reason ?? ""].join("|");
}

/** Câu giải thích vì sao phải check-in thủ công (không đổ lỗi người dùng — DESIGN-SYSTEM §16.1). */
export const GEO_PROBLEM_MESSAGE: Record<GeoProblem, string> = {
  denied:
    "FoodSave chưa được phép dùng vị trí trên điện thoại này. Bạn vẫn check-in được: chọn lý do bên dưới, điều phối viên sẽ thấy đây là check-in chưa xác minh vị trí.",
  unavailable:
    "Điện thoại chưa lấy được vị trí (GPS yếu hoặc đang tắt định vị). Bạn vẫn check-in được: chọn lý do bên dưới, điều phối viên sẽ thấy đây là check-in chưa xác minh vị trí.",
  timeout:
    "Lấy vị trí quá lâu (có thể do ở trong nhà hoặc sóng yếu). Bạn vẫn check-in được: chọn lý do bên dưới, điều phối viên sẽ thấy đây là check-in chưa xác minh vị trí.",
  unsupported:
    "Trình duyệt này không hỗ trợ định vị. Bạn vẫn check-in được: chọn lý do bên dưới, điều phối viên sẽ thấy đây là check-in chưa xác minh vị trí.",
};
