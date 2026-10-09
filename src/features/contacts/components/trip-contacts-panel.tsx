import { PhoneCall } from "lucide-react";

import { CallVolunteerButton } from "./call-volunteer-button";
import { OrgContactButton } from "./org-contact-button";

/**
 * Khối "Gọi trong chuyến" cho điều phối viên (B1; bổ sung cho danh bạ số đã che "Liên hệ trong chuyến"): gọi
 * tình nguyện viên (nếu họ đã cho phép — mỗi lần xem số có nhật ký) và hotline của từng cửa hàng trên tuyến. Mọi
 * số chỉ tải khi bấm (không tải hàng loạt).
 */
export function TripContactsPanel({
  pickupId,
  volunteerName,
  stores,
}: {
  pickupId: string;
  /** Có tình nguyện viên đã nhận/đang chạy chuyến ⇒ hiện nút gọi. */
  volunteerName: string | null;
  stores: { orgId: string; name: string }[];
}) {
  if (!volunteerName && stores.length === 0) return null;
  return (
    <section
      aria-labelledby="trip-call-title"
      className="flex flex-col gap-3 rounded-xl border bg-surface p-4 shadow-1"
      data-trip-contacts
    >
      <div className="flex flex-col gap-1">
        <h2 id="trip-call-title" className="flex items-center gap-2 text-lg font-semibold">
          <PhoneCall aria-hidden className="size-5 text-role-accent" />
          Gọi trong chuyến
        </h2>
        <p className="text-sm text-ink-muted">
          Số tình nguyện viên chỉ hiện khi họ bật “cho phép gọi trong chuyến”; hotline cửa hàng do cửa hàng tự
          khai.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {volunteerName ? <CallVolunteerButton pickupId={pickupId} /> : null}
        {stores.map((s) => (
          <OrgContactButton key={s.orgId} orgId={s.orgId} orgName={s.name} label={`Hotline ${s.name}`} />
        ))}
      </div>
    </section>
  );
}
