import { OUTSIDE_SERVICE_AREA_MESSAGE } from "@/features/locations/schemas";
import { DOC_TYPE_LABEL } from "@/features/organizations/labels";

import type { StepKey } from "./progress";

/**
 * Mã lỗi RPC/PostgREST (DATA-MODEL §8.0) → câu tiếng Việt cho wizard onboarding (DESIGN-SYSTEM §12.1).
 * Không đổ lỗi người dùng, luôn nói bước tiếp theo.
 */

export type MissingItem = { step: StepKey; message: string };

export type ActionError = {
  code: string;
  message: string;
  fieldErrors?: Record<string, string>;
  missing?: MissingItem[];
};

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionError };

type PgLikeError = { code?: string | null; message?: string | null; details?: string | null };

export const ERROR_MESSAGES = {
  unauthenticated: "Phiên đăng nhập đã hết. Vui lòng đăng nhập lại để tiếp tục.",
  emailNotConfirmed: "Bạn cần xác nhận email trước khi tạo hồ sơ. Hãy mở thư xác nhận FoodSave đã gửi.",
  signupsDisabled: "FoodSave đang tạm dừng nhận hồ sơ mới. Vui lòng quay lại sau.",
  forbidden: "Bạn không có quyền thực hiện thao tác này.",
  notFound: "Không tìm thấy hồ sơ, hoặc bạn không có quyền sửa hồ sơ này.",
  draftLimit: "Bạn đã có 3 hồ sơ nháp. Hãy hoàn thiện hồ sơ đang có trước khi tạo hồ sơ mới.",
  notEditable: "Hồ sơ đã được gửi duyệt nên không sửa được nữa. Xem trạng thái hồ sơ để biết bước tiếp theo.",
  busy: "Thao tác trước đó đang được xử lý. Vui lòng thử lại sau vài giây.",
  overlap: "Các khung giờ bị chồng lên nhau (kể cả khung qua nửa đêm). Vui lòng kiểm tra lại.",
  invalid: "Dữ liệu chưa hợp lệ. Vui lòng kiểm tra lại các trường được đánh dấu.",
  rateLimited: "Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.",
  duplicate: "Dữ liệu này đã tồn tại. Vui lòng tải lại trang.",
  offline: "Không có kết nối mạng. Dữ liệu của bạn vẫn còn — hãy thử lại khi có mạng.",
  server: "Đã có lỗi phía FoodSave. Vui lòng thử lại; nếu vẫn lỗi, hãy liên hệ FoodSave.",
} as const;

function parseDetail(details: string | null | undefined): Record<string, unknown> | null {
  if (!details) return null;
  try {
    const v: unknown = JSON.parse(details);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Danh sách điều kiện còn thiếu khi `submit_organization` trả PT422 (detail: sites/documents/consent). */
export function missingFromSubmitDetail(detail: Record<string, unknown>): MissingItem[] {
  const out: MissingItem[] = [];
  if ("sites" in detail) out.push({ step: "location", message: "Chưa có địa điểm trên bản đồ." });
  if ("documents" in detail) {
    out.push({
      step: "documents",
      message:
        detail.documents === "business_license"
          ? `Chưa tải ${DOC_TYPE_LABEL.business_license.toLowerCase()}.`
          : `Chưa tải ${DOC_TYPE_LABEL.establishment_decision.toLowerCase()} hoặc ${DOC_TYPE_LABEL.operating_license.toLowerCase()}.`,
    });
  }
  if ("consent" in detail) out.push({ step: "review", message: "Chưa ghi nhận đồng ý Điều khoản sử dụng." });
  return out;
}

export function mapDbError(err: PgLikeError): ActionError {
  const code = err.code ?? "";
  const message = err.message ?? "";
  const details = err.details ?? "";

  switch (code) {
    case "PT401":
      return { code: "unauthenticated", message: ERROR_MESSAGES.unauthenticated };
    case "PT403":
      if (details === "email_not_confirmed")
        return { code: "email_not_confirmed", message: ERROR_MESSAGES.emailNotConfirmed };
      if (details === "signups_disabled")
        return { code: "signups_disabled", message: ERROR_MESSAGES.signupsDisabled };
      return { code: "forbidden", message: ERROR_MESSAGES.forbidden };
    case "PT404":
      return { code: "not_found", message: ERROR_MESSAGES.notFound };
    case "PT409":
      if (message === "invalid_state" && details === "draft_limit")
        return { code: "draft_limit", message: ERROR_MESSAGES.draftLimit };
      if (message === "idempotency_conflict" || message === "concurrent_update")
        return { code: message, message: ERROR_MESSAGES.busy };
      return { code: "invalid_state", message: ERROR_MESSAGES.notEditable };
    case "PT422": {
      const detail = parseDetail(details);
      if (detail?.location === "out_of_service_area") {
        return {
          code: "out_of_service_area",
          message: OUTSIDE_SERVICE_AREA_MESSAGE,
          fieldErrors: { location: OUTSIDE_SERVICE_AREA_MESSAGE },
        };
      }
      if (detail?.p_hours === "overlap") return { code: "hours_overlap", message: ERROR_MESSAGES.overlap };
      if (detail && ("sites" in detail || "documents" in detail || "consent" in detail)) {
        const missing = missingFromSubmitDetail(detail);
        return {
          code: "incomplete",
          message: "Hồ sơ còn thiếu một số mục bắt buộc. Vui lòng bổ sung rồi gửi lại.",
          missing,
        };
      }
      return { code: "validation_failed", message: ERROR_MESSAGES.invalid };
    }
    case "PT429":
      return { code: "rate_limited", message: ERROR_MESSAGES.rateLimited };
    case "42501":
      return { code: "forbidden", message: ERROR_MESSAGES.forbidden };
    case "23514":
    case "22P02":
      return { code: "validation_failed", message: ERROR_MESSAGES.invalid };
    case "23505":
      return { code: "duplicate", message: ERROR_MESSAGES.duplicate };
    default:
      return { code: "server_error", message: ERROR_MESSAGES.server };
  }
}

/** Lỗi khi gọi Storage từ trình duyệt (RLS policy `kyc_insert`/`media_insert`, giới hạn bucket). */
export function mapStorageError(err: { message?: string; statusCode?: string | number } | null): string {
  const msg = (err?.message ?? "").toLowerCase();
  const status = String(err?.statusCode ?? "");
  if (msg.includes("row-level security") || status === "403" || msg.includes("unauthorized")) {
    return "FoodSave chưa nhận tệp này: hồ sơ không còn ở trạng thái cho phép tải lên, hoặc bạn đã tải quá 20 tệp trong một giờ. Vui lòng thử lại sau.";
  }
  if (msg.includes("exceeded the maximum") || msg.includes("payload too large") || status === "413") {
    return "Tệp lớn hơn 10 MB. Vui lòng chọn tệp nhỏ hơn.";
  }
  if (msg.includes("mime") || status === "415") return "Chỉ nhận ảnh JPG, PNG, WebP hoặc PDF.";
  if (msg.includes("failed to fetch") || msg.includes("network")) return ERROR_MESSAGES.offline;
  return "Chưa tải được tệp lên. Vui lòng thử lại.";
}
