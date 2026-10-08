import { OUTSIDE_SERVICE_AREA_MESSAGE } from "@/features/locations/schemas";
import { ERROR_MESSAGES as WIZARD_MESSAGES, type ActionError } from "@/features/onboarding/errors";

/**
 * Mã lỗi RPC/PostgREST (DATA-MODEL §8.0) → câu tiếng Việt cho trang Cài đặt và lời mời thành viên.
 * Không đổ lỗi người dùng, luôn nói bước tiếp theo (DESIGN-SYSTEM §16.1).
 */

export type { ActionError, ActionResult } from "@/features/onboarding/errors";

export const SETTINGS_MESSAGES = {
  unauthenticated: WIZARD_MESSAGES.unauthenticated,
  forbidden: "Bạn không có quyền thực hiện thao tác này. Liên hệ chủ sở hữu nếu cần thêm quyền.",
  notFound: "Không tìm thấy dữ liệu, hoặc bạn không có quyền với mục này. Hãy tải lại trang.",
  orgNotActive: "Tổ chức chưa ở trạng thái hoạt động (đã duyệt) nên chưa thực hiện được thao tác này.",
  invalidState:
    "Trạng thái hiện tại không cho phép thao tác này. Hãy tải lại trang để xem thông tin mới nhất.",
  busy: WIZARD_MESSAGES.busy,
  invalid: WIZARD_MESSAGES.invalid,
  overlap: WIZARD_MESSAGES.overlap,
  duplicate: "Dữ liệu này đã tồn tại. Hãy tải lại trang.",
  server: WIZARD_MESSAGES.server,
  noChanges: "Bạn chưa thay đổi mục nào.",
  pendingRequest:
    "Đang có một đề nghị sửa thông tin pháp lý chờ FoodSave duyệt. Vui lòng chờ kết quả rồi gửi đề nghị mới.",
  alreadyMember: "Email này đã là thành viên của tổ chức.",
  lastOwner: "Tổ chức cần ít nhất một chủ sở hữu. Hãy chuyển quyền chủ sở hữu cho người khác trước.",
  managerCannotInviteOwner: "Chỉ chủ sở hữu mới mời được chủ sở hữu khác.",
  volunteerRequiresCharity: "Vai trò tình nguyện viên chỉ dành cho tổ chức từ thiện.",
  siteScope: "Chọn ít nhất một điểm, hoặc chọn “Mọi điểm”.",
  closureExists: "Ngày này đã là ngày nghỉ.",
  tokenInvalid:
    "Liên kết mời không hợp lệ hoặc đã được thay bằng lời mời mới. Hãy dùng email mời gần nhất, hoặc nhờ người mời gửi lại.",
  tokenExpired:
    "Lời mời đã hết hạn (lời mời có hiệu lực 7 ngày). Hãy nhờ người mời bấm “Gửi lại” để nhận liên kết mới.",
  tokenConsumed:
    "Lời mời này đã được một tài khoản khác sử dụng. Nếu đó không phải bạn, hãy liên hệ người mời.",
  emailMismatch:
    "Lời mời được gửi tới một địa chỉ email khác với tài khoản bạn đang đăng nhập. Hãy đăng xuất rồi đăng nhập (hoặc tạo tài khoản) bằng đúng email đã nhận lời mời.",
  inviteOrgInactive:
    "Tổ chức mời bạn hiện không hoạt động trên FoodSave nên chưa nhận lời mời được. Hãy liên hệ người mời.",
} as const;

type PgLikeError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

function parseDetail(details: string | null | undefined): Record<string, unknown> | null {
  if (!details) return null;
  try {
    const v: unknown = JSON.parse(details);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

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

export function mapSettingsError(err: PgLikeError): ActionError {
  const code = err.code ?? "";
  const message = err.message ?? "";
  const details = err.details ?? "";

  switch (code) {
    case "PT401":
      return { code: "unauthenticated", message: SETTINGS_MESSAGES.unauthenticated };
    case "PT403":
      if (details === "email_mismatch")
        return { code: "email_mismatch", message: SETTINGS_MESSAGES.emailMismatch };
      if (details === "manager_cannot_invite_owner")
        return { code: "forbidden", message: SETTINGS_MESSAGES.managerCannotInviteOwner };
      if (message === "org_not_active")
        return { code: "org_not_active", message: SETTINGS_MESSAGES.orgNotActive };
      return { code: "forbidden", message: SETTINGS_MESSAGES.forbidden };
    case "PT404":
      return { code: "not_found", message: SETTINGS_MESSAGES.notFound };
    case "PT409":
      if (message === "token_consumed")
        return { code: "token_consumed", message: SETTINGS_MESSAGES.tokenConsumed };
      if (message === "idempotency_conflict" || message === "concurrent_update")
        return { code: message, message: SETTINGS_MESSAGES.busy };
      if (details === "pending_request_exists")
        return { code: "pending_request_exists", message: SETTINGS_MESSAGES.pendingRequest };
      if (details === "already_member")
        return { code: "already_member", message: SETTINGS_MESSAGES.alreadyMember };
      if (details === "last_owner") return { code: "last_owner", message: SETTINGS_MESSAGES.lastOwner };
      return { code: "invalid_state", message: SETTINGS_MESSAGES.invalidState };
    case "PT422": {
      if (message === "token_invalid")
        return { code: "token_invalid", message: SETTINGS_MESSAGES.tokenInvalid };
      if (message === "token_expired")
        return { code: "token_expired", message: SETTINGS_MESSAGES.tokenExpired };
      const detail = parseDetail(details);
      if (detail?.location === "out_of_service_area") {
        return {
          code: "out_of_service_area",
          message: OUTSIDE_SERVICE_AREA_MESSAGE,
          fieldErrors: { location: OUTSIDE_SERVICE_AREA_MESSAGE },
        };
      }
      if (detail?.p_hours === "overlap") return { code: "hours_overlap", message: SETTINGS_MESSAGES.overlap };
      if (detail?.p_role === "volunteer_requires_charity")
        return { code: "validation_failed", message: SETTINGS_MESSAGES.volunteerRequiresCharity };
      if (detail && "p_site_ids" in detail)
        return { code: "validation_failed", message: SETTINGS_MESSAGES.siteScope };
      return { code: "validation_failed", message: SETTINGS_MESSAGES.invalid };
    }
    case "PT429":
      return { code: "rate_limited", message: rateLimitedMessage(err.hint) };
    case "42501":
      return { code: "forbidden", message: SETTINGS_MESSAGES.forbidden };
    case "23514":
    case "22P02":
    case "22007":
    case "22008":
      return { code: "validation_failed", message: SETTINGS_MESSAGES.invalid };
    case "23505":
      return { code: "duplicate", message: SETTINGS_MESSAGES.duplicate };
    default:
      return { code: "server_error", message: SETTINGS_MESSAGES.server };
  }
}
