"use client";

import { Loader2, Save } from "lucide-react";
import { useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { HoursEditor } from "@/features/onboarding/components/steps/hours-editor";
import {
  hoursFromRows,
  hoursToRows,
  summarizeHours,
  validateHours,
  type HoursRow,
} from "@/features/onboarding/hours";
import { KIND_COPY, type OrgKind } from "@/features/onboarding/options";

import { saveSettingsHours } from "../actions";

/**
 * Giờ mở cửa / giờ nhận hàng của một điểm (P1-06, US-CHA-34 AC1–AC2): bảng 7 ngày, 24 giờ, qua nửa đêm,
 * 24/7; nút "Lưu giờ hoạt động" ⇒ `set_site_hours` (thay toàn bộ, DB kiểm chồng lấn).
 */
export function HoursForm({
  kind,
  siteId,
  initialRows,
  canEdit,
}: {
  kind: OrgKind;
  siteId: string;
  initialRows: HoursRow[];
  canEdit: boolean;
}) {
  const copy = KIND_COPY[kind];
  const [hours, setHours] = useState(() => hoursFromRows(initialRows, true, kind));
  const [attempted, setAttempted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const boxRef = useRef<HTMLDivElement>(null);

  const errors = useMemo(() => validateHours(hours), [hours]);
  const visibleErrors = errors && (attempted || Object.keys(errors.days).length > 0) ? errors : null;

  if (!canEdit) {
    return (
      <ul className="flex flex-col gap-1 text-sm">
        {summarizeHours(hours).map((line) => (
          <li key={line} className="tabular-nums">
            {line}
          </li>
        ))}
      </ul>
    );
  }

  function save() {
    setAttempted(true);
    setFormError(null);
    if (errors) {
      boxRef.current?.querySelector<HTMLElement>("[aria-invalid=true], input, button")?.focus();
      return;
    }
    startTransition(async () => {
      try {
        const res = await saveSettingsHours({ siteId, rows: hoursToRows(hours) });
        if (!res.ok) {
          setFormError(res.error.message);
          return;
        }
        toast.success("Đã lưu giờ hoạt động.");
      } catch {
        setFormError("Không có kết nối mạng. Dữ liệu của bạn vẫn còn — hãy thử lại khi có mạng.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div ref={boxRef}>
        <HoursEditor
          value={hours}
          onChange={setHours}
          errors={visibleErrors}
          openLabel={copy.hoursOpenLabel}
        />
      </div>
      {formError ? (
        <p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
          {formError}
        </p>
      ) : null}
      <div>
        <Button type="button" onClick={save} disabled={pending} aria-disabled={pending} className="min-h-11">
          {pending ? <Loader2 aria-hidden className="animate-spin" /> : <Save aria-hidden />}
          {pending ? "Đang lưu…" : "Lưu giờ hoạt động"}
        </Button>
      </div>
    </div>
  );
}
