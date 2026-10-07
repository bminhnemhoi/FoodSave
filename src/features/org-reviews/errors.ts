/**
 * Mã lỗi RPC (DATA-MODEL §8.0: errcode PTxxx + message máy) → câu tiếng Việt cho Admin.
 * Không đổ lỗi người dùng (DESIGN-SYSTEM §16.1); lỗi không nhận ra ⇒ câu chung + gợi ý thử lại.
 */

export type RpcErrorLike = { code?: string | null; message?: string | null; details?: string | null };

export type AdminErrorKind =
  | "mfa_required"
  | "not_authorized"
  | "self_dealing"
  | "not_found"
  | "invalid_state"
  | "validation_failed"
  | "rate_limited"
  | "idempotency_conflict"
  | "network"
  | "unknown";

/** Phân loại lỗi PostgREST/RPC. `TypeError: fetch failed` và lỗi mạng ⇒ `network`. */
export function classifyRpcError(error: RpcErrorLike | null | undefined): AdminErrorKind {
  if (!error) return "unknown";
  const msg = error.message ?? "";
  switch (msg) {
    case "mfa_required":
    case "self_dealing":
    case "not_found":
    case "invalid_state":
    case "validation_failed":
    case "rate_limited":
    case "idempotency_conflict":
      return msg;
    case "not_authorized":
    case "not_authenticated":
      return "not_authorized";
  }
  if (error.code === "PT429") return "rate_limited";
  if (error.code === "PT404") return "not_found";
  if (error.code === "PT401" || error.code === "PT403" || error.code === "42501") return "not_authorized";
  if (/fetch failed|network|ECONNREFUSED|ETIMEDOUT/i.test(msg)) return "network";
  return "unknown";
}

const MESSAGES: Record<AdminErrorKind, string> = {
  mfa_required: "Phiên xác thực hai lớp đã hết hạn. Vui lòng nhập lại mã xác thực rồi thử lại.",
  not_authorized: "Tài khoản của bạn không có quyền thực hiện thao tác này.",
  self_dealing:
    "Bạn là thành viên hoặc người tạo của tổ chức này nên không thể tự ra quyết định. Hãy nhờ một Admin khác xử lý.",
  not_found: "Không tìm thấy hồ sơ này. Có thể hồ sơ đã bị xóa hoặc đường dẫn chưa đúng.",
  invalid_state: "Hồ sơ đã được xử lý trước đó. Tải lại trang để xem trạng thái mới nhất.",
  validation_failed: "Thông tin gửi đi chưa hợp lệ. Vui lòng kiểm tra lại lý do và thử lại.",
  rate_limited: "Bạn thao tác quá nhanh. Vui lòng đợi một chút rồi thử lại.",
  idempotency_conflict: "Thao tác này đã được gửi với nội dung khác. Đóng hộp thoại và thử lại.",
  network: "Không kết nối được tới máy chủ. Dữ liệu của bạn vẫn còn — hãy thử lại khi mạng ổn định.",
  unknown: "Đã có lỗi phía FoodSave. Vui lòng thử lại; nếu vẫn lỗi, báo cho người phụ trách kỹ thuật.",
};

export function adminErrorMessage(kind: AdminErrorKind): string {
  return MESSAGES[kind];
}
