import type { ActionError } from "@/features/onboarding/errors";

/**
 * Lỗi RPC vòng lõi P2 (lô tặng, phân bổ, chuyến, bàn giao, tác động — DATA-MODEL §8.0) → câu tiếng Việt.
 * Không đổ lỗi người dùng, luôn nói bước tiếp theo (DESIGN-SYSTEM §16.1). Mỗi feature có thể truyền
 * `overrides` (khóa = `message` hoặc `message:detail` của RPC) để nói cụ thể hơn theo ngữ cảnh.
 */

export type { ActionError, ActionResult } from "@/features/onboarding/errors";

export type PgLikeError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

export const RPC_MESSAGES = {
  unauthenticated: "Phiên đăng nhập đã hết. Vui lòng đăng nhập lại để tiếp tục.",
  forbidden: "Bạn không có quyền thực hiện thao tác này. Liên hệ chủ sở hữu tổ chức nếu cần thêm quyền.",
  mfaRequired: "Thao tác quản trị cần xác thực hai lớp. Hãy xác thực lại rồi thử lại.",
  orgNotActive: "Tổ chức chưa ở trạng thái hoạt động (đã duyệt) nên chưa thực hiện được thao tác này.",
  orgPaused: "Tổ chức đang tạm ngưng. Bật lại hoạt động trong Cài đặt để tiếp tục.",
  storePaused: "Cửa hàng này đang tạm ngưng nhận yêu cầu. Hãy chọn lô của cửa hàng khác.",
  selfDealing: "Không thể nhận lô của chính tổ chức mình.",
  notFound: "Không tìm thấy dữ liệu, hoặc bạn không có quyền với mục này. Hãy tải lại trang.",
  invalidState:
    "Trạng thái đã thay đổi nên không thực hiện được thao tác này. Hãy tải lại trang để xem mới nhất.",
  busy: "Thao tác trước đó đang được xử lý. Vui lòng thử lại sau vài giây.",
  invalid: "Dữ liệu chưa hợp lệ. Vui lòng kiểm tra lại các trường được đánh dấu.",
  deadlinePassed: "Lô này đã quá hạn hiệu lực nên không còn nhận/giao được.",
  insufficientQuantity:
    "Số lượng còn lại không đủ — có tổ chức khác vừa giữ trước. Hãy tải lại và chọn số lượng nhỏ hơn.",
  outOfRadius: "Lô này nằm ngoài bán kính phục vụ của điểm nhận đã chọn.",
  infeasibleTiming: "Không kịp đến lấy trước hạn hiệu lực của lô này (tính theo xe máy). Hãy chọn lô khác.",
  unitMismatch: "Đơn vị tính không khớp với lô. Hãy tải lại trang.",
  tokenInvalid: "Mã QR hoặc mã 6 số không đúng. Hãy kiểm tra lại, hoặc nhờ người giao mở lại mã mới.",
  tokenExpired: "Mã bàn giao đã hết hạn (hiệu lực 15 phút). Nhờ người giao bấm “Tạo mã mới”.",
  tokenLocked: "Nhập sai quá số lần cho phép. Nhờ người giao bấm “Tạo mã mới” rồi thử lại.",
  tokenConsumed: "Mã này đã được dùng — lần bàn giao đã ghi nhận xong.",
  outsidePickupWindow: "Chưa tới khung giờ lấy hàng của lô (chỉ mở mã trước giờ lấy tối đa 30 phút).",
  duplicate: "Dữ liệu này đã tồn tại. Hãy tải lại trang.",
  server: "Đã có lỗi phía FoodSave. Vui lòng thử lại; nếu vẫn lỗi, hãy liên hệ FoodSave.",
} as const;

/** PT429: `hint` = số giây chờ ⇒ "Vui lòng thử lại sau 5 phút." */
export function rateLimitedMessage(hint: string | null | undefined): string {
  const seconds = Number(hint);
  if (!Number.isFinite(seconds) || seconds <= 0)
    return "Bạn đã thao tác quá nhiều lần. Vui lòng thử lại sau ít phút.";
  if (seconds < 90) return `Bạn đã thao tác quá nhiều lần. Vui lòng thử lại sau ${Math.ceil(seconds)} giây.`;
  if (seconds < 90 * 60)
    return `Bạn đã thao tác quá nhiều lần. Vui lòng thử lại sau ${Math.ceil(seconds / 60)} phút.`;
  return `Bạn đã thao tác quá nhiều lần. Vui lòng thử lại sau ${Math.ceil(seconds / 3600)} giờ.`;
}

/** `details` của RPC: chuỗi JSON (lỗi theo trường) hoặc mã ngắn ("paused", "wrong_store"…). */
export function parseRpcDetail(details: string | null | undefined): Record<string, unknown> | null {
  if (!details) return null;
  try {
    const v: unknown = JSON.parse(details);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Ánh xạ lỗi PostgREST/RPC. `overrides` tra theo `"message:detail"` trước, rồi `"message"`.
 * `fieldErrors` lấy từ `details` JSON của PT422 khi giá trị là chuỗi (khóa = tên tham số, bỏ tiền tố `p_`).
 */
export function mapRpcError(err: PgLikeError, overrides: Record<string, string> = {}): ActionError {
  const code = err.code ?? "";
  const message = err.message ?? "";
  const details = err.details ?? "";
  const override = overrides[`${message}:${details}`] ?? overrides[message];
  const make = (c: string, m: string, extra: Partial<ActionError> = {}): ActionError => ({
    code: c,
    message: override ?? m,
    ...extra,
  });

  switch (code) {
    case "PT401":
      return make("unauthenticated", RPC_MESSAGES.unauthenticated);
    case "PT403":
      if (message === "mfa_required") return make("mfa_required", RPC_MESSAGES.mfaRequired);
      if (message === "self_dealing") return make("self_dealing", RPC_MESSAGES.selfDealing);
      if (message === "org_not_active")
        return make(
          "org_not_active",
          details === "paused" ? RPC_MESSAGES.orgPaused : RPC_MESSAGES.orgNotActive,
        );
      return make("forbidden", RPC_MESSAGES.forbidden);
    case "PT404":
      return make("not_found", RPC_MESSAGES.notFound);
    case "PT409":
      switch (message) {
        case "deadline_passed":
          return make(message, RPC_MESSAGES.deadlinePassed);
        case "insufficient_quantity":
          return make(message, RPC_MESSAGES.insufficientQuantity);
        case "token_consumed":
          return make(message, RPC_MESSAGES.tokenConsumed);
        case "idempotency_conflict":
        case "concurrent_update":
          return make(message, RPC_MESSAGES.busy);
      }
      if (details === "store_paused") return make("store_paused", RPC_MESSAGES.storePaused);
      if (details === "outside_pickup_window")
        return make("outside_pickup_window", RPC_MESSAGES.outsidePickupWindow);
      return make("invalid_state", RPC_MESSAGES.invalidState);
    case "PT422": {
      switch (message) {
        case "token_invalid":
          return make(message, RPC_MESSAGES.tokenInvalid);
        case "token_expired":
          return make(
            message,
            details === "outside_pickup_window"
              ? RPC_MESSAGES.outsidePickupWindow
              : RPC_MESSAGES.tokenExpired,
          );
        case "token_locked":
          return make(message, RPC_MESSAGES.tokenLocked);
        case "out_of_radius":
          return make(message, RPC_MESSAGES.outOfRadius);
        case "infeasible_timing":
          return make(message, RPC_MESSAGES.infeasibleTiming);
        case "unit_mismatch":
          return make(message, RPC_MESSAGES.unitMismatch);
      }
      const detail = parseRpcDetail(details);
      const fieldErrors: Record<string, string> = {};
      if (detail) {
        for (const [k, v] of Object.entries(detail)) {
          if (typeof v === "string") fieldErrors[k.replace(/^p_/, "")] = v;
        }
      }
      return make(
        "validation_failed",
        RPC_MESSAGES.invalid,
        Object.keys(fieldErrors).length ? { fieldErrors } : {},
      );
    }
    case "PT429":
      return make("rate_limited", rateLimitedMessage(err.hint));
    case "42501":
      return make("forbidden", RPC_MESSAGES.forbidden);
    case "23514":
    case "22P02":
    case "22007":
    case "22008":
      return make("validation_failed", RPC_MESSAGES.invalid);
    case "23505":
      return make("duplicate", RPC_MESSAGES.duplicate);
    default:
      return make("server_error", RPC_MESSAGES.server);
  }
}
