"use client";

import { Loader2, MapPin, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";

import { LOCATION_CONSENT_POINTS, LOCATION_CONSENT_TITLE, LOCATION_POLICY_VERSION } from "../consent";
import { BottomSheet } from "./bottom-sheet";

type LocationConsentSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Ghi đồng ý (và bắt đầu chuyến nếu `mode = start`). */
  onAgree: () => void;
  /** "Không, chỉ dùng check-in" (chế độ start) / "Để sau" (chế độ toggle). */
  onDecline: () => void;
  pending: boolean;
  error: string | null;
  /** `start`: hỏi khi bắt đầu chuyến lần đầu (US-VOL-02 AC1). `toggle`: bật công tắc chia sẻ trong chuyến. */
  mode: "start" | "toggle";
};

/**
 * Màn giải thích + xin đồng ý `location_trip` (PRD US-VOL-02 AC1; SECURITY-PRIVACY §6): dùng để làm gì, chỉ khi
 * nào, làm tròn ra sao, ai xem được, rút lại thế nào. Chữ hiển thị chính là chữ được băm vào `text_hash`.
 */
export function LocationConsentSheet({
  open,
  onOpenChange,
  onAgree,
  onDecline,
  pending,
  error,
  mode,
}: LocationConsentSheetProps) {
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={LOCATION_CONSENT_TITLE}
      description={`Không bắt buộc. Chính sách bảo mật phiên bản ${LOCATION_POLICY_VERSION}.`}
      footer={
        <>
          {error ? (
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </p>
          ) : null}
          <Button
            type="button"
            size="lg"
            className="h-[3.25rem] w-full text-base"
            onClick={onAgree}
            disabled={pending}
            aria-busy={pending}
          >
            {pending ? <Loader2 aria-hidden className="animate-spin" /> : <MapPin aria-hidden />}
            {mode === "start" ? "Đồng ý và bắt đầu chuyến" : "Đồng ý chia sẻ vị trí"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-12 w-full text-base"
            onClick={onDecline}
            disabled={pending}
          >
            {mode === "start" ? "Không, chỉ dùng check-in" : "Để sau"}
          </Button>
        </>
      }
    >
      <ul className="flex flex-col gap-3">
        {LOCATION_CONSENT_POINTS.map((p) => (
          <li key={p} className="flex items-start gap-2.5 text-[0.9375rem] leading-6 text-ink">
            <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-role-accent" />
            <span>{p}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm text-ink-muted">
        Xem thêm{" "}
        <a href="/privacy" className="font-medium text-ink underline underline-offset-4">
          Chính sách bảo mật
        </a>
        .
      </p>
    </BottomSheet>
  );
}
