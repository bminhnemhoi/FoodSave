import type { Database } from "@/types/database.types";

/**
 * Nhãn tiếng Việt cho bàn giao (DATA-MODEL §2.3 handover_lines, §6.6; PRD US-STO-18). Một nguồn duy nhất.
 */

export type ShortfallReason = Database["public"]["Enums"]["shortfall_reason"];
export type HandoverKind = Database["public"]["Enums"]["handover_kind"];
export type HandoverMethod = Database["public"]["Enums"]["handover_method"];

export const SHORTFALL_REASON_LABEL: Record<ShortfallReason, string> = {
  store_short: "Cửa hàng không đủ hàng",
  quality_reject: "Không đạt chất lượng",
  capacity: "Không đủ sức chở",
  no_show: "Người nhận không đến",
};

/** Hệ quả của phần thiếu theo lý do (DATA-MODEL §4.5, ESG §6.2) — hiện cạnh lựa chọn. */
export const SHORTFALL_REASON_HINT: Record<ShortfallReason, string> = {
  store_short: "Phần thiếu không trả lại lô.",
  quality_reject: "Phần bị từ chối không trả lại lô và không tính vào tác động.",
  capacity: "Phần còn lại được trả về lô nếu lô còn hạn hiệu lực.",
  no_show: "Phần còn lại được trả về lô nếu lô còn hạn hiệu lực.",
};

/** Lý do cửa hàng chọn khi đối soát ở bước lấy hàng (no_show dành cho xử lý hệ thống/phản ánh). */
export const STORE_SHORTFALL_REASONS: readonly ShortfallReason[] = [
  "store_short",
  "quality_reject",
  "capacity",
];

/** Lý do người mang hàng đề xuất trước khi hiện mã (mang ít hơn số đã đặt). */
export const CARRIER_SHORTFALL_REASONS: readonly ShortfallReason[] = [
  "capacity",
  "quality_reject",
  "store_short",
];

export const HANDOVER_METHOD_LABEL: Record<HandoverMethod, string> = {
  qr: "Quét mã QR",
  code: "Nhập mã 6 số",
  auto: "Tự động (tự đến lấy)",
};

/** Cụm từ giữa câu: "… đã xác nhận (quét QR)". */
export const HANDOVER_METHOD_PHRASE: Record<HandoverMethod, string> = {
  qr: "quét QR",
  code: "nhập mã 6 số",
  auto: "tự động",
};
