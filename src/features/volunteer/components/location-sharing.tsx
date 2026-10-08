"use client";

import { Loader2, LocateFixed, LocateOff, MapPin, Pause } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { formatClock } from "@/features/charity-allocations/present";
import { cn } from "@/lib/utils";

import { grantLocationConsent, withdrawLocationConsent } from "../actions";
import { consentSource, useOnline } from "../hooks";
import { LocationConsentSheet } from "./location-consent-sheet";
import type { SharingStatus } from "./use-location-sharing";

const ACTIVE: readonly SharingStatus[] = ["waiting", "sharing", "retrying"];

/**
 * Banner thường trực "Đang chia sẻ vị trí — Dừng" (DESIGN-SYSTEM §10.3; PRD US-VOL-12 AC3): dính dưới thanh
 * trên cùng, nền `--role-accent-soft`; "Dừng" ngừng gửi ngay.
 */
export function LocationBanner({
  status,
  lastSentAt,
  onStop,
}: {
  status: SharingStatus;
  lastSentAt: number | null;
  onStop: () => void;
}) {
  if (!ACTIVE.includes(status)) return null;
  return (
    <div
      role="status"
      data-location-banner
      className="sticky top-16 z-20 -mx-4 flex items-center gap-3 border-y border-role-accent/40 bg-role-accent-soft px-4 py-2"
    >
      <span aria-hidden className="relative flex size-3 shrink-0">
        <span className="absolute inline-flex size-full rounded-full bg-role-accent-fill opacity-75 motion-safe:animate-ping" />
        <span className="relative inline-flex size-3 rounded-full border border-ink bg-role-accent-fill" />
      </span>
      <p className="min-w-0 flex-1 text-[0.9375rem] leading-5 text-ink">
        <span className="font-semibold">Đang chia sẻ vị trí</span>
        <span className="block text-sm text-ink-muted">
          {status === "retrying"
            ? "Mất kết nối — sẽ gửi lại sau ít giây"
            : lastSentAt
              ? `Cập nhật lúc ${formatClock(new Date(lastSentAt))} · làm tròn ~11 m`
              : "Đang lấy vị trí…"}
        </span>
      </p>
      <Button
        type="button"
        variant="outline"
        className="h-11 shrink-0 bg-surface px-4 text-base"
        onClick={onStop}
      >
        <Pause aria-hidden />
        Dừng
      </Button>
    </div>
  );
}

const STATUS_TEXT: Record<SharingStatus, string> = {
  off: "Đang tắt. Điều phối viên chỉ thấy giờ dự kiến từ các lần check-in.",
  waiting: "Đang lấy vị trí đầu tiên…",
  sharing: "Đang gửi vị trí làm tròn ~11 m, tối đa mỗi 30 giây.",
  hidden: "Tạm ngừng vì màn hình đang tắt hoặc bạn mở ứng dụng khác. Mở lại trang chuyến để tiếp tục.",
  denied:
    "Trình duyệt đang chặn quyền vị trí cho FoodSave. Mở cài đặt trang để cho phép, hoặc cứ check-in thủ công tại từng điểm.",
  unavailable: "Điện thoại chưa lấy được vị trí (GPS yếu). FoodSave sẽ thử lại khi có tín hiệu.",
  unsupported: "Trình duyệt này không hỗ trợ định vị. Bạn vẫn check-in thủ công tại từng điểm.",
  retrying: "Mất kết nối — FoodSave sẽ gửi lại sau ít giây.",
};

/**
 * Thẻ "Vị trí trong chuyến" (US-VOL-02, US-VOL-12): bật/dừng chia sẻ, xin đồng ý lần đầu, rút lại đồng ý (DB xóa
 * điểm đã lưu ngay). Không đồng ý thì mọi chức năng chuyến vẫn dùng được.
 */
export function LocationCard({
  consentActive,
  tripRunning,
  paused,
  onPausedChange,
  status,
  lastSentAt,
}: {
  consentActive: boolean;
  tripRunning: boolean;
  paused: boolean;
  onPausedChange: (paused: boolean) => void;
  status: SharingStatus;
  lastSentAt: number | null;
}) {
  const online = useOnline();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const grant = () => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await grantLocationConsent({ source: consentSource() });
        if (!res.ok) {
          setError(res.error.message);
          return;
        }
        onPausedChange(false);
        setSheetOpen(false);
        toast.success("Đã bật chia sẻ vị trí trong chuyến.");
      } catch {
        setError("Không có kết nối mạng. Hãy thử lại khi có sóng.");
      }
    });
  };

  const withdraw = () => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await withdrawLocationConsent();
        if (!res.ok) {
          setError(res.error.message);
          return;
        }
        toast.success("Đã rút lại đồng ý. FoodSave đã ngừng gửi và xóa vị trí đã lưu.");
      } catch {
        setError("Không có kết nối mạng. Hãy thử lại khi có sóng.");
      }
    });
  };

  const sharingOn = consentActive && !paused;

  return (
    <section
      aria-labelledby="location-heading"
      className="flex flex-col gap-3 rounded-xl border bg-surface p-4"
    >
      <h2 id="location-heading" className="flex items-center gap-2 text-lg font-semibold">
        <MapPin aria-hidden className="size-5 text-role-accent" />
        Vị trí trong chuyến
      </h2>

      {consentActive ? (
        <>
          <label
            htmlFor="location-share-switch"
            className="flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-lg border bg-bg px-3 py-2"
          >
            <span className="font-medium text-ink">Chia sẻ vị trí khi chuyến đang chạy</span>
            <Switch
              id="location-share-switch"
              checked={sharingOn}
              onCheckedChange={(v) => onPausedChange(!v)}
              disabled={!tripRunning}
              className="scale-125"
            />
          </label>
          <p
            className={cn(
              "flex items-start gap-2 text-sm",
              status === "denied" || status === "unsupported" ? "text-warning" : "text-ink-muted",
            )}
          >
            {sharingOn && tripRunning ? (
              <LocateFixed aria-hidden className="mt-0.5 size-4 shrink-0" />
            ) : (
              <LocateOff aria-hidden className="mt-0.5 size-4 shrink-0" />
            )}
            <span>
              {!tripRunning
                ? "Chỉ gửi khi chuyến đang chạy và trang này đang mở."
                : !sharingOn
                  ? "Đang dừng. Bật lại công tắc để điều phối viên thấy giờ dự kiến chính xác hơn."
                  : status === "sharing" && lastSentAt
                    ? `Đã gửi lúc ${formatClock(new Date(lastSentAt))} — làm tròn ~11 m, tối đa mỗi 30 giây.`
                    : STATUS_TEXT[status]}
            </span>
          </p>
          <Button
            type="button"
            variant="link"
            className="h-11 w-fit px-0 text-ink underline"
            onClick={withdraw}
            disabled={pending || !online}
          >
            {pending ? <Loader2 aria-hidden className="animate-spin" /> : null}
            Rút lại đồng ý chia sẻ vị trí
          </Button>
        </>
      ) : (
        <>
          <p className="text-[0.9375rem] text-ink-muted">
            Đang tắt. Bật để điều phối viên thấy giờ dự kiến tới chính xác hơn — chỉ khi chuyến đang chạy và
            trang này đang mở. Không bật thì bạn vẫn check-in bình thường.
          </p>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-12 w-full text-base"
            onClick={() => {
              setError(null);
              setSheetOpen(true);
            }}
            disabled={!online}
          >
            <MapPin aria-hidden />
            Bật chia sẻ vị trí
          </Button>
        </>
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
        onAgree={grant}
        onDecline={() => setSheetOpen(false)}
      />
    </section>
  );
}
