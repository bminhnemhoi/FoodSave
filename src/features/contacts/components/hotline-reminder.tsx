import { ArrowRight, PhoneCall } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

import { loadOwnHotline } from "../queries";

/**
 * Thẻ nhắc khai hotline (B1) cho owner/manager của tổ chức đã duyệt chưa có `org_contacts`: hiện trên Tổng quan và
 * trong Cài đặt › Hồ sơ. Nhân viên không đọc được bảng nên không thấy thẻ. Đọc lỗi ⇒ không hiện (không chặn trang).
 */
export async function HotlineReminder({
  kind,
  orgId,
  role,
  showLink = true,
  className,
}: {
  kind: "store" | "charity";
  orgId: string;
  role: string;
  showLink?: boolean;
  className?: string;
}) {
  if (role !== "owner" && role !== "manager") return null;
  const hotline = await loadOwnHotline(orgId).catch(() => undefined);
  if (hotline !== null) return null;

  const other = kind === "store" ? "tổ chức nhận" : "cửa hàng";
  return (
    <aside
      aria-labelledby="hotline-reminder-title"
      data-hotline-reminder
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-info/30 bg-info-soft p-4 sm:flex-row sm:items-center",
        className,
      )}
    >
      <PhoneCall aria-hidden className="size-6 shrink-0 text-info" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p id="hotline-reminder-title" className="font-semibold text-ink">
          Thêm hotline để {other} và tình nguyện viên liên hệ khi trao nhận
        </p>
        <p className="text-sm text-ink-muted">
          Hotline không bắt buộc. Số chỉ hiển thị cho các cửa hàng, tổ chức đã được duyệt và tình nguyện viên
          đang chạy chuyến qua {kind === "store" ? "cửa hàng" : "tổ chức"} của bạn.
        </p>
      </div>
      {showLink ? (
        <Link
          href={`/${kind}/settings?tab=profile#profile-hotline`}
          className="inline-flex min-h-11 w-fit shrink-0 items-center gap-1.5 rounded-md px-1 text-sm font-medium text-ink underline underline-offset-4"
        >
          Thêm hotline
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      ) : null}
    </aside>
  );
}
