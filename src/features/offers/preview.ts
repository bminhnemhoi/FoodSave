import {
  effectiveDeadline,
  freshnessLabel,
  LABEL_THRESHOLDS_V1,
  type FreshnessLabel,
  type Perishability,
} from "@/core/labels";

/**
 * Xem trước hạn hiệu lực + nhãn khi đăng lô (US-STO-09, DATA-MODEL §4.2) — thuần, có unit test.
 * Công thức giống RPC `publish_offer`: least(hạn dùng, cuối khung lấy, giờ đóng cửa của điểm).
 * Đây chỉ là bản xem trước; giá trị lưu do RPC tính lúc đăng.
 */

export type DeadlineReason = "site_close" | "expiry" | "pickup_end";

export const DEADLINE_REASON_LABEL: Record<DeadlineReason, string> = {
  site_close: "giờ đóng cửa",
  expiry: "hạn sử dụng",
  pickup_end: "hết khung giờ lấy",
};

export type DeadlinePreview = {
  deadline: Date;
  reason: DeadlineReason;
  label: FreshnessLabel;
  /** Mốc chuyển Vàng (chỉ khi hiện đang Xanh). */
  turnsYellowAt: Date | null;
  /** Mốc chuyển Đỏ (khi hiện đang Xanh/Vàng). */
  turnsRedAt: Date | null;
};

export function computeDeadlinePreview(input: {
  expiresAt: Date | null;
  pickupEnd: Date | null;
  siteCloseAt: Date | null;
  perishability: Perishability | null;
  now: Date;
}): DeadlinePreview | null {
  const { expiresAt, pickupEnd, siteCloseAt, perishability, now } = input;
  if (!expiresAt || !perishability) return null;
  const deadline = effectiveDeadline({ expiresAt, pickupWindowEnd: pickupEnd, siteCloseAt });
  const t = deadline.getTime();
  // Hòa nhau: giờ đóng cửa > hạn sử dụng > khung lấy (giải thích sát nghĩa nhất cho cửa hàng)
  const reason: DeadlineReason =
    siteCloseAt && siteCloseAt.getTime() === t
      ? "site_close"
      : expiresAt.getTime() === t
        ? "expiry"
        : "pickup_end";
  const label = freshnessLabel(deadline, perishability, now);
  const th = LABEL_THRESHOLDS_V1[perishability];
  const yellowAt = new Date(t - th.yellowAtMostMs);
  const redAt = new Date(t - th.redBelowMs);
  return {
    deadline,
    reason,
    label,
    turnsYellowAt: label === "green" ? yellowAt : null,
    turnsRedAt: label === "green" || label === "yellow" ? redAt : null,
  };
}
