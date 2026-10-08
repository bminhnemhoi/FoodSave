import { formatDayTime } from "@/features/charity-allocations/present";
import { mapRpcError, parseRpcDetail, type ActionError, type PgLikeError } from "@/lib/rpc-errors";

/**
 * Lỗi "Xin nhận" (`request_offer`, DATA-MODEL §8.4) → câu tiếng Việt cụ thể theo ngữ cảnh Kho tặng.
 * Thuần (không IO) để test; server action gọi hàm này.
 */

export const REQUEST_OVERRIDES: Record<string, string> = {
  out_of_radius:
    "Lô này nằm ngoài bán kính phục vụ của điểm nhận đang chọn. Hãy chọn điểm nhận khác, hoặc tăng bán kính trong Cài đặt.",
  deadline_passed: "Lô này vừa quá hạn hiệu lực nên không nhận được nữa. Hãy chọn lô khác trong danh sách.",
  self_dealing:
    "Đây là lô của một cửa hàng mà bạn cũng là thành viên, nên không thể tự nhận cho tổ chức mình.",
  "invalid_state:store_paused": "Cửa hàng này vừa tạm ngưng nhận yêu cầu. Hãy chọn lô của cửa hàng khác.",
  invalid_state:
    "Lô này không còn nhận yêu cầu (đã được giữ hết hoặc cửa hàng đã đóng lô). Hãy tải lại danh sách để xem lô mới nhất.",
  not_found: "Lô này không còn hiển thị với tổ chức của bạn. Hãy tải lại danh sách.",
};

export type RequestError = ActionError & { available?: number };

/** `infeasible_timing` có detail {eta_pickup, eta_dropoff, effective_deadline} ⇒ nói rõ vì sao không kịp. */
export function infeasibleMessage(detail: Record<string, unknown> | null, now: Date = new Date()): string {
  const eta = typeof detail?.eta_pickup === "string" ? detail.eta_pickup : null;
  const dropoff = typeof detail?.eta_dropoff === "string" ? detail.eta_dropoff : null;
  const deadline = typeof detail?.effective_deadline === "string" ? detail.effective_deadline : null;
  if (eta && deadline && new Date(eta) > new Date(deadline)) {
    return `Không kịp tới: đi xe máy dự kiến tới cửa hàng lúc ${formatDayTime(eta, now)}, nhưng lô hết hạn hiệu lực lúc ${formatDayTime(deadline, now)}.`;
  }
  if (dropoff) {
    return `Điểm nhận đang chọn không mở cửa lúc dự kiến mang hàng về (${formatDayTime(dropoff, now)}). Hãy chọn điểm nhận khác, hoặc cập nhật giờ nhận hàng trong Cài đặt.`;
  }
  return "Không kịp đến lấy trước hạn hiệu lực của lô này (tính theo xe máy). Hãy chọn lô khác.";
}

export function mapRequestError(err: PgLikeError, now: Date = new Date()): RequestError {
  const detail = parseRpcDetail(err.details);
  if (err.message === "insufficient_quantity") {
    const available = Number(detail?.available);
    return {
      code: "insufficient_quantity",
      message: Number.isFinite(available)
        ? "Lô vừa được tổ chức khác giữ một phần."
        : "Số lượng còn lại không đủ — có tổ chức khác vừa giữ trước. Hãy tải lại và chọn số lượng nhỏ hơn.",
      ...(Number.isFinite(available) ? { available } : {}),
    };
  }
  if (err.message === "infeasible_timing") {
    return { code: "infeasible_timing", message: infeasibleMessage(detail, now) };
  }
  const mapped = mapRpcError(err, REQUEST_OVERRIDES);
  if (mapped.code === "validation_failed") {
    if (mapped.fieldErrors?.category_code === "not_accepted_by_site")
      return {
        code: "category_not_accepted",
        message:
          "Điểm nhận đang chọn không nhận danh mục thực phẩm này. Đổi danh mục nhận trong Cài đặt nếu cần.",
      };
    if (mapped.fieldErrors?.offer_id === "demo_mismatch")
      return {
        code: "demo_mismatch",
        message: "Lô thuộc dữ liệu demo không ghép được với tổ chức thật (và ngược lại).",
      };
    if (mapped.fieldErrors?.qty)
      return { code: "validation_failed", message: "Số lượng chưa hợp lệ. Vui lòng kiểm tra lại." };
  }
  return mapped;
}
