import {
  Ban,
  BadgeCheck,
  CircleCheckBig,
  CircleDashed,
  CircleSlash,
  Hourglass,
  type LucideIcon,
  PackageCheck,
  Search,
  Split,
} from "lucide-react";

import type { Database } from "@/types/database.types";

/**
 * Nhãn trạng thái nhu cầu và phương án ghép (DATA-MODEL §6.2, §6.3; DESIGN-SYSTEM §12.7) — tông ngữ nghĩa,
 * không dùng token nhãn tươi; luôn icon + chữ. Một nguồn duy nhất cho mọi màn của nhu cầu.
 */

type Enums = Database["public"]["Enums"];
export type NeedStatus = Enums["need_status"];
export type BundleStatus = Enums["bundle_status"];
export type SiteVisibility = Enums["site_visibility"];

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

export const STATUS_TONE_CLASS: Record<StatusTone, string> = {
  neutral: "border-border-strong/40 bg-bg-sunken text-ink-muted",
  info: "border-info/30 bg-info-soft text-info",
  success: "border-success/30 bg-success-soft text-success",
  warning: "border-warning/30 bg-warning-soft text-warning",
  danger: "border-danger/30 bg-danger-soft text-danger",
};

export const NEED_STATUS: Record<NeedStatus, { text: string; tone: StatusTone; icon: LucideIcon }> = {
  open: { text: "Đang mở", tone: "info", icon: Search },
  partially_matched: { text: "Đã ghép một phần", tone: "warning", icon: Split },
  matched: { text: "Đã ghép đủ", tone: "info", icon: BadgeCheck },
  fulfilled: { text: "Hoàn tất", tone: "success", icon: CircleCheckBig },
  closed_partial: { text: "Đóng một phần", tone: "neutral", icon: CircleDashed },
  expired: { text: "Hết hạn", tone: "neutral", icon: CircleSlash },
  cancelled: { text: "Đã hủy", tone: "neutral", icon: Ban },
};

/** `proposed` = đã gửi yêu cầu, chờ cửa hàng (DATA-MODEL §6.3) — không phải "gợi ý". */
export const BUNDLE_STATUS: Record<BundleStatus, { text: string; tone: StatusTone; icon: LucideIcon }> = {
  proposed: { text: "Chờ cửa hàng xác nhận", tone: "warning", icon: Hourglass },
  partially_confirmed: { text: "Xác nhận một phần", tone: "warning", icon: Split },
  confirmed: { text: "Đã xác nhận", tone: "success", icon: PackageCheck },
  cancelled: { text: "Đã hủy", tone: "neutral", icon: Ban },
};

/** Nhu cầu còn sống (ghép được, hủy được). */
export const LIVE_NEED_STATUSES: readonly NeedStatus[] = ["open", "partially_matched", "matched"];

export function isLiveNeed(status: NeedStatus): boolean {
  return LIVE_NEED_STATUSES.includes(status);
}
