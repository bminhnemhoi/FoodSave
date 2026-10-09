"use client";

import { Loader2, PhoneCall } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";

import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

import { setTripContactConsent } from "../actions";
import { TRIP_CONTACT_LABEL, TRIP_CONTACT_POINTS, type TripContactConsent } from "../consent";
import { consentSource, useOnline } from "../hooks";

function PointList() {
  return (
    <ul className="flex list-disc flex-col gap-1 pl-4">
      {TRIP_CONTACT_POINTS.map((p) => (
        <li key={p}>{p}</li>
      ))}
    </ul>
  );
}

/**
 * Công tắc "Cho phép cửa hàng và điều phối viên gọi tôi khi chuyến đang chạy" (B1, consent `trip_contact`) —
 * KHÔNG bật sẵn (NĐ 356/2025). Lưu ngay khi gạt (không cần "Lưu hồ sơ"); lỗi ⇒ trả công tắc về trạng thái cũ.
 * Dùng trong hồ sơ tình nguyện viên và ở bước nhận chuyến.
 */
export function TripContactSwitch({
  consent,
  compact = false,
  className,
}: {
  consent: TripContactConsent;
  /** Bản gọn ở bước nhận chuyến: giải thích thu vào "Ai xem được số của bạn?". */
  compact?: boolean;
  className?: string;
}) {
  const id = useId();
  const online = useOnline();
  const [checked, setChecked] = useState(consent.active);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = (next: boolean) => {
    setError(null);
    setChecked(next);
    startTransition(async () => {
      try {
        const res = await setTripContactConsent({ enabled: next, source: consentSource() });
        if (!res.ok) {
          setChecked(!next);
          setError(res.error.message);
          return;
        }
        toast.success(
          next
            ? "Đã cho phép gọi bạn khi chuyến đang chạy."
            : "Đã tắt. Cửa hàng và điều phối viên không xem được số đầy đủ của bạn nữa.",
        );
      } catch {
        setChecked(!next);
        setError("Không có kết nối mạng. Hãy thử lại khi có sóng.");
      }
    });
  };

  return (
    <div
      className={cn("flex flex-col gap-2 rounded-lg border bg-bg p-3", className)}
      data-trip-contact={checked ? "on" : "off"}
    >
      <div className="flex items-start gap-3">
        <PhoneCall aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-subtle" />
        <label
          htmlFor={`${id}-switch`}
          className="min-w-0 flex-1 cursor-pointer text-[0.9375rem] font-medium text-ink"
        >
          {TRIP_CONTACT_LABEL}
        </label>
        <div className="flex min-h-11 items-center gap-2">
          {pending ? <Loader2 aria-hidden className="size-4 animate-spin text-ink-muted" /> : null}
          <Switch
            id={`${id}-switch`}
            checked={checked}
            onCheckedChange={toggle}
            disabled={pending || !online}
            aria-describedby={`${id}-desc`}
            aria-busy={pending}
          />
        </div>
      </div>
      <div id={`${id}-desc`} className="pl-8 text-sm text-ink-muted">
        {compact ? (
          <details>
            <summary className="min-h-11 cursor-pointer py-2 font-medium text-ink underline-offset-4 hover:underline">
              Ai xem được số của bạn?
            </summary>
            <PointList />
          </details>
        ) : (
          <PointList />
        )}
      </div>
      {!online ? (
        <p className="pl-8 text-sm text-ink-muted">Đang ngoại tuyến — cần mạng để đổi lựa chọn này.</p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
