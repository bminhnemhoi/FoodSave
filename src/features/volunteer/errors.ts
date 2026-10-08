import { mapRpcError, type ActionError, type PgLikeError } from "@/lib/rpc-errors";

/**
 * Lỗi RPC chuyến của TNV (DATA-MODEL §8.5 "Ghi chú triển khai P3") → câu tiếng Việt theo từng thao tác.
 * Không đổ lỗi người dùng, luôn nói bước tiếp theo (DESIGN-SYSTEM §16.1).
 */

export type TripOp =
  "respond" | "start" | "check_in" | "skip" | "incident" | "profile" | "consent" | "location";

const RELOAD = "Hãy tải lại trang để xem trạng thái mới nhất.";

const COMMON: Record<string, string> = {
  not_authorized: `Chuyến này không còn được giao cho bạn (điều phối viên có thể vừa đổi người). ${RELOAD}`,
  not_found: `Không tìm thấy chuyến này, hoặc chuyến không còn giao cho bạn. ${RELOAD}`,
};

const BY_OP: Record<TripOp, Record<string, string>> = {
  respond: {
    "invalid_state:already_accepted": "Bạn đã nhận chuyến này rồi.",
    invalid_state: `Chuyến vừa thay đổi (đã bắt đầu, bị hủy hoặc giao lại). ${RELOAD}`,
  },
  start: {
    invalid_state: `Chuyến chưa thể bắt đầu (có thể đã bắt đầu hoặc bị hủy). ${RELOAD}`,
  },
  check_in: {
    "invalid_state:trip_not_started": "Hãy bấm “Bắt đầu chuyến” trước khi check-in.",
    "invalid_state:pickups_pending": "Hãy hoàn tất các điểm lấy hàng trước khi check-in điểm giao về.",
    invalid_state: `Điểm dừng này đã check-in hoặc đã xong. ${RELOAD}`,
  },
  skip: {
    "invalid_state:dropoff_stop": "Không thể bỏ qua điểm giao về tổ chức.",
    invalid_state: `Điểm dừng này đã xong hoặc chuyến đã kết thúc. ${RELOAD}`,
  },
  incident: {
    ambiguous_actor:
      "Bạn đang là thành viên của cả cửa hàng lẫn tổ chức trong chuyến này nên chưa gửi được phản ánh. Hãy liên hệ FoodSave.",
  },
  profile: {},
  consent: {},
  location: {
    "not_authorized:consent_required": "Bạn chưa đồng ý chia sẻ vị trí nên FoodSave không gửi vị trí.",
    invalid_state: "Chuyến không còn đang chạy nên đã ngừng gửi vị trí.",
  },
};

const FIELD_MESSAGES: Record<string, string> = {
  capacity_kg: "Sức chở từ 1 đến 500 kg.",
  vehicle: "Vui lòng chọn phương tiện.",
  location: "Khu vực nằm ngoài vùng FoodSave đang hoạt động (TP.HCM).",
  base_area_label: "Tên khu vực tối đa 120 ký tự.",
  availability_note: "Ghi chú tối đa 300 ký tự.",
  reason: "Vui lòng chọn hoặc ghi lý do (tối đa 300 ký tự).",
  description: "Mô tả từ 10 đến 2.000 ký tự.",
};

export function mapTripError(err: PgLikeError, op: TripOp): ActionError {
  const mapped = mapRpcError(err, { ...COMMON, ...BY_OP[op] });
  if (mapped.fieldErrors) {
    const fieldErrors: Record<string, string> = {};
    for (const k of Object.keys(mapped.fieldErrors)) fieldErrors[k] = FIELD_MESSAGES[k] ?? mapped.message;
    const first = Object.values(fieldErrors)[0];
    return {
      ...mapped,
      fieldErrors,
      message: Object.keys(fieldErrors).length === 1 && first ? first : mapped.message,
    };
  }
  return mapped;
}

/** `consent_required` của `update_pickup_progress` (PT403 + detail) — dừng gửi vị trí ngay. */
export function isConsentRequired(err: PgLikeError): boolean {
  return err.code === "PT403" && err.details === "consent_required";
}
