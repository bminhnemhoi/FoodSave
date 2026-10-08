"use client";

import { Loader2, LocateOff, MapPin, ShieldCheck } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";

import { grantLocationConsent, withdrawLocationConsent } from "../actions";
import { LOCATION_PROMPT_DECLINED_KEY, type LocationConsent } from "../consent";
import { consentSource, useOnline, writeLocalFlag } from "../hooks";
import { LocationConsentSheet } from "./location-consent-sheet";

/**
 * Quyền riêng tư trong hồ sơ (PRD US-VOL-02 AC2; SECURITY-PRIVACY §6, §7): trạng thái đồng ý `location_trip`
 * (thời điểm, phiên bản chính sách), bật hoặc rút lại bất cứ lúc nào — rút là ngừng gửi và xóa điểm đã lưu ngay.
 */
export function ConsentPanel({ consent }: { consent: LocationConsent }) {
  const online = useOnline();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (op: "grant" | "withdraw") => {
    setError(null);
    startTransition(async () => {
      try {
        const res =
          op === "grant"
            ? await grantLocationConsent({ source: consentSource() })
            : await withdrawLocationConsent();
        if (!res.ok) {
          setError(res.error.message);
          return;
        }
        // Lựa chọn "không" đã ghi trên máy không còn ý nghĩa khi người dùng tự quyết định ở đây
        writeLocalFlag(LOCATION_PROMPT_DECLINED_KEY, op === "withdraw" ? "declined" : null);
        setSheetOpen(false);
        toast.success(
          op === "grant"
            ? "Đã bật chia sẻ vị trí trong chuyến."
            : "Đã rút lại đồng ý. FoodSave ngừng gửi và đã xóa vị trí đã lưu.",
        );
      } catch {
        setError("Không có kết nối mạng. Hãy thử lại khi có sóng.");
      }
    });
  };

  return (
    <section
      aria-labelledby="privacy-heading"
      className="flex flex-col gap-4 rounded-xl border bg-surface p-4 sm:p-6"
    >
      <div className="flex flex-col gap-1">
        <h2 id="privacy-heading" className="text-lg font-semibold">
          Quyền riêng tư
        </h2>
        <p className="text-sm text-ink-muted">
          Check-in tại điểm dừng chỉ dùng vị trí đúng lúc bạn bấm “Tôi đã tới” và không lưu toạ độ.
        </p>
      </div>

      <div
        className="flex items-start gap-3 rounded-lg border bg-bg p-3"
        data-consent-state={consent.active ? "on" : "off"}
      >
        {consent.active ? (
          <ShieldCheck aria-hidden className="mt-0.5 size-6 shrink-0 text-success" />
        ) : (
          <LocateOff aria-hidden className="mt-0.5 size-6 shrink-0 text-ink-muted" />
        )}
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-semibold text-ink">
            Chia sẻ vị trí khi chuyến đang chạy: {consent.active ? "đang bật" : "đang tắt"}
          </p>
          <p className="text-sm text-ink-muted">
            {consent.active && consent.grantedAt
              ? `Bạn đồng ý lúc ${formatDateTime(consent.grantedAt)} (chính sách ${consent.policyVersion ?? "—"}). Chỉ gửi khi chuyến đang chạy và màn hình chuyến đang mở; làm tròn ~11 m; xóa khi chuyến kết thúc.`
              : consent.withdrawnAt
                ? `Bạn đã rút lại đồng ý lúc ${formatDateTime(consent.withdrawnAt)}. FoodSave không gửi vị trí của bạn.`
                : "Bạn chưa bật. Mọi chức năng chuyến vẫn dùng được bằng check-in tại từng điểm."}
          </p>
        </div>
      </div>

      {consent.active ? (
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-12 w-full text-base sm:w-fit"
          onClick={() => run("withdraw")}
          disabled={pending || !online}
          aria-busy={pending}
        >
          {pending ? <Loader2 aria-hidden className="animate-spin" /> : <LocateOff aria-hidden />}
          Rút lại đồng ý
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-12 w-full text-base sm:w-fit"
          onClick={() => {
            setError(null);
            setSheetOpen(true);
          }}
          disabled={!online}
        >
          <MapPin aria-hidden />
          Bật chia sẻ vị trí trong chuyến
        </Button>
      )}
      {error && !sheetOpen ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <LocationConsentSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        mode="toggle"
        pending={pending}
        error={sheetOpen ? error : null}
        onAgree={() => run("grant")}
        onDecline={() => setSheetOpen(false)}
      />
    </section>
  );
}
