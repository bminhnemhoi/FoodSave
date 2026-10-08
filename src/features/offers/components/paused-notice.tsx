import { PauseCircle } from "lucide-react";
import Link from "next/link";

/** Cửa hàng đang tạm ngưng (`organizations.is_paused`): `publish_offer` sẽ từ chối — nói trước, không để bất ngờ. */
export function PausedNotice({ canManage }: { canManage: boolean }) {
  return (
    <div
      role="note"
      className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning-soft p-4 text-sm text-ink"
    >
      <PauseCircle aria-hidden className="mt-0.5 size-5 shrink-0 text-warning" />
      <p>
        <span className="font-semibold">Cửa hàng đang tạm ngưng.</span> Bạn vẫn lưu nháp được, nhưng chưa đăng
        lô mới cho tới khi bật lại hoạt động.{" "}
        {canManage ? (
          <Link
            href="/store/settings?tab=pause"
            className="font-medium text-primary underline underline-offset-4"
          >
            Mở Cài đặt
          </Link>
        ) : (
          "Liên hệ chủ cửa hàng để bật lại."
        )}
      </p>
    </div>
  );
}
