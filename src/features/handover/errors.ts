import { mapRpcError, parseRpcDetail, type ActionError, type PgLikeError } from "@/lib/rpc-errors";

import { formatClock, parsePgTimestamp } from "./format";

/**
 * Lỗi RPC bàn giao (DATA-MODEL §6.6, §8.0; SECURITY-PRIVACY C10) → câu tiếng Việt cụ thể theo ngữ cảnh.
 * Không bao giờ đưa token/mã vào thông điệp. Lỗi dòng (`validation_failed` với `p_lines`) gắn vào đúng dòng
 * qua `fieldErrors["line:<allocation_id>"]`.
 */

export const HANDOVER_MESSAGES = {
  selfDealing: "Người tạo mã không thể tự xác nhận. Hãy để nhân viên cửa hàng quét hoặc nhập mã.",
  wrongStore:
    "Mã này thuộc điểm lấy hàng của cửa hàng/chi nhánh khác. Hãy kiểm tra người nhận đã đến đúng chi nhánh chưa.",
  notFoundCode: "Không tìm thấy lượt bàn giao này ở cửa hàng của bạn. Hãy tải lại danh sách rồi thử lại.",
  issueForbidden: "Chỉ người mang hàng của chuyến này mới hiện được mã bàn giao.",
  stopDone: "Điểm dừng này đã bàn giao xong.",
  noAllocations: "Điểm dừng này không còn hàng cần nhận (phân bổ đã bị hủy hoặc hết hạn).",
  linesChanged: "Danh sách hàng vừa thay đổi (có phân bổ bị hủy hoặc hết hạn). Hãy tải lại rồi đối soát lại.",
  notPickupToken: "Đây không phải mã lấy hàng tại cửa hàng. Hãy nhờ người nhận mở đúng mã ở điểm dừng này.",
  scanNotHandover: "Mã QR này không phải mã bàn giao FoodSave. Hãy quét mã trên màn hình “Mã bàn giao”.",
  codeLocked: "Mã đã bị khóa do nhập sai 5 lần. Nhờ người nhận bấm “Tạo mã mới” rồi thử lại.",
} as const;

const LINE_MESSAGES: Record<string, string> = {
  qty_out_of_range: "Số lượng vượt số đã đặt. Hãy tải lại để xem số mới nhất.",
  qty_required: "Vui lòng nhập số lượng.",
  integer_required: "Số lượng phải là số nguyên với đơn vị này.",
  reason_required: "Vui lòng chọn lý do thiếu.",
  reason_not_allowed: "Lý do này không dùng được ở bước này.",
  note_required: "Vui lòng mô tả ngắn vì sao hàng không đạt chất lượng.",
  note_too_long: "Ghi chú tối đa 300 ký tự.",
};

/** "Mã này đã được dùng lúc 14:32 — …" (PRD US-STO-17 AC3); `detail` = consumed_at. */
export function tokenConsumedMessage(details: string | null | undefined): string {
  const at = parsePgTimestamp(details);
  return at
    ? `Mã này đã được dùng lúc ${formatClock(at)} — lượt bàn giao đã ghi nhận xong.`
    : "Mã này đã được dùng — lượt bàn giao đã ghi nhận xong.";
}

export function mapHandoverError(err: PgLikeError, context: "issue" | "consume" | "peek"): ActionError {
  if (err.code === "PT409" && err.message === "token_consumed") {
    return {
      code: "token_consumed",
      message: context === "issue" ? HANDOVER_MESSAGES.stopDone : tokenConsumedMessage(err.details),
    };
  }

  if (err.code === "PT422" && err.message === "validation_failed") {
    const detail = parseRpcDetail(err.details);
    const lineCode = typeof detail?.p_lines === "string" ? detail.p_lines : null;
    if (lineCode) {
      const allocationId = typeof detail?.allocation_id === "string" ? detail.allocation_id : null;
      const message = LINE_MESSAGES[lineCode] ?? HANDOVER_MESSAGES.linesChanged;
      return {
        code: "validation_failed",
        message: LINE_MESSAGES[lineCode]
          ? "Có dòng chưa hợp lệ. Vui lòng kiểm tra các dòng được đánh dấu."
          : message,
        fieldErrors: allocationId ? { [`line:${allocationId}`]: message } : undefined,
      };
    }
  }

  const overrides: Record<string, string> = {
    self_dealing: HANDOVER_MESSAGES.selfDealing,
    "not_authorized:wrong_store": HANDOVER_MESSAGES.wrongStore,
    "token_invalid:not_a_pickup_handover": HANDOVER_MESSAGES.notPickupToken,
    "invalid_state:no_allocations": HANDOVER_MESSAGES.noAllocations,
  };
  if (context === "issue") overrides.not_authorized = HANDOVER_MESSAGES.issueForbidden;
  if (context === "consume") overrides.not_found = HANDOVER_MESSAGES.notFoundCode;
  return mapRpcError(err, overrides);
}
