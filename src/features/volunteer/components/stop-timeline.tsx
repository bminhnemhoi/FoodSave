import { Check, Home, MapPinCheck, SkipForward } from "lucide-react";

import { formatClock } from "@/features/charity-allocations/present";
import { cn } from "@/lib/utils";

import type { VolunteerStop } from "../queries";
import { stopStatusText } from "../trip-model";

const CHECK_TEXT: Record<"geofence" | "manual" | "no_location", string> = {
  geofence: "trong phạm vi 100 m",
  manual: "check-in thủ công",
  no_location: "chưa xác minh vị trí",
};

const SKIP_TEXT: Record<string, string> = {
  trip_cancelled: "chuyến bị hủy",
  no_allocations: "không còn lô nào ở điểm này",
  nothing_to_deliver: "không còn hàng để giao",
};

export function stopTitle(s: Pick<VolunteerStop, "kind" | "orgName" | "siteName">): string {
  if (s.kind === "dropoff") return `Giao về ${s.siteName || s.orgName}`;
  return s.siteName && s.siteName !== s.orgName ? `${s.orgName} — ${s.siteName}` : s.orgName || s.siteName;
}

/**
 * Lộ trình (US-VOL-05 AC1): mọi điểm dừng theo thứ tự với trạng thái (icon + chữ) và giờ — đã xong, đã tới, dự
 * kiến tới (ETA máy chủ tính, cập nhật theo vị trí nếu đang chia sẻ). Đây cũng là bản tương đương của bản đồ.
 */
export function StopTimeline({
  stops,
  currentStopId,
  etas,
}: {
  stops: VolunteerStop[];
  currentStopId: string | null;
  /** ETA mới nhất từ `update_pickup_progress` (ghi đè giá trị lúc tải trang). */
  etas: Record<string, string>;
}) {
  return (
    <ol className="flex flex-col" aria-label="Các điểm dừng theo thứ tự">
      {stops.map((s, i) => {
        const current = s.id === currentStopId;
        const eta = etas[s.id] ?? s.eta;
        const last = i === stops.length - 1;
        let detail: string;
        if (s.status === "done")
          detail = s.completedAt ? `Xong lúc ${formatClock(s.completedAt)}` : "Đã xong";
        else if (s.status === "skipped")
          detail = `Bỏ qua${s.skipReason ? `: ${SKIP_TEXT[s.skipReason] ?? s.skipReason}` : ""}`;
        else if (s.status === "arrived")
          detail = `Tới lúc ${s.arrivedAt ? formatClock(s.arrivedAt) : "—"}${
            s.arrivalCheck ? ` · ${CHECK_TEXT[s.arrivalCheck]}` : ""
          }`;
        else detail = eta ? `Dự kiến tới ${formatClock(eta)}` : "Chưa có giờ dự kiến";
        return (
          <li key={s.id} data-stop={s.id} data-stop-status={s.status} className="relative flex gap-3 pb-4">
            {!last ? (
              <span aria-hidden className="absolute top-9 bottom-0 left-[17px] w-0.5 bg-border" />
            ) : null}
            <span
              aria-hidden
              className={cn(
                "relative z-[1] grid size-9 shrink-0 place-items-center rounded-full border-[3px] text-sm font-bold tabular-nums",
                s.status === "done"
                  ? "border-success bg-success text-white"
                  : s.status === "skipped"
                    ? "border-border-strong bg-bg-sunken text-ink-subtle"
                    : current
                      ? "border-ink bg-role-accent-fill text-ink"
                      : s.kind === "dropoff"
                        ? "border-role-accent-fill bg-ink text-white"
                        : "border-info bg-surface text-ink",
              )}
            >
              {s.status === "done" ? (
                <Check className="size-4" />
              ) : s.status === "skipped" ? (
                <SkipForward className="size-4" />
              ) : s.status === "arrived" ? (
                <MapPinCheck className="size-4" />
              ) : s.kind === "dropoff" ? (
                <Home className="size-4" />
              ) : (
                s.seq
              )}
            </span>
            <div className="flex min-w-0 flex-1 flex-col pt-1">
              <p className={cn("leading-snug font-medium text-pretty", current ? "text-ink" : "text-ink")}>
                <span className="sr-only">Điểm {s.seq}: </span>
                {stopTitle(s)}
                {current ? (
                  <span className="ml-2 inline-flex rounded-full bg-role-accent-soft px-2 py-0.5 align-middle text-xs font-semibold text-role-accent">
                    Kế tiếp
                  </span>
                ) : null}
              </p>
              <p className="text-sm text-ink-muted tabular-nums">
                {stopStatusText(s.kind, s.status)} · {detail}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
