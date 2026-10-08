"use client";

import { Check, Loader2, Play, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { grantLocationConsent, respondToTrip, startTrip } from "../actions";
import { LOCATION_PROMPT_DECLINED_KEY, type LocationConsent } from "../consent";
import { consentSource, readLocalFlag, useIntentId, useOnline, writeLocalFlag } from "../hooks";
import { DECLINE_REASONS } from "../labels";
import { BottomSheet } from "./bottom-sheet";
import { LocationConsentSheet } from "./location-consent-sheet";
import { EMPTY_REASON, ReasonPicker, resolveReason, type ReasonValue } from "./reason-picker";

const NETWORK = "Không có kết nối mạng nên chưa gửi được. Hãy thử lại khi có sóng.";
const OFFLINE_HINT = "Đang ngoại tuyến — cần mạng để gửi thao tác này.";

/** Nhận chuyến / Không thể nhận (US-VOL-04): nhận = một chạm; từ chối bắt buộc lý do. */
export function RespondButtons({
  pickupId,
  afterDecline = "stay",
  className,
}: {
  pickupId: string;
  /** Trang chi tiết: từ chối xong thì chuyến không còn của mình ⇒ về "Hôm nay". */
  afterDecline?: "stay" | "home";
  className?: string;
}) {
  const router = useRouter();
  const online = useOnline();
  const accept = useIntentId();
  const decline = useIntentId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [reason, setReason] = useState<ReasonValue>(EMPTY_REASON);
  const [reasonError, setReasonError] = useState<string | null>(null);

  const onAccept = () => {
    setError(null);
    const clientOpId = accept.idFor(`accept:${pickupId}`);
    startTransition(async () => {
      try {
        const res = await respondToTrip({ pickupId, accept: true, clientOpId });
        if (!res.ok) {
          setError(res.error.message);
          return;
        }
        accept.done();
        toast.success("Đã nhận chuyến. Điều phối viên đã được báo.");
      } catch {
        setError(NETWORK);
      }
    });
  };

  const onDecline = () => {
    const text = resolveReason(reason);
    if (!text) {
      setReasonError("Vui lòng chọn hoặc ghi lý do để điều phối viên sắp xếp người khác.");
      return;
    }
    setReasonError(null);
    const clientOpId = decline.idFor(`decline:${pickupId}:${text}`);
    startTransition(async () => {
      try {
        const res = await respondToTrip({ pickupId, accept: false, reason: text, clientOpId });
        if (!res.ok) {
          setReasonError(res.error.fieldErrors?.reason ?? res.error.message);
          return;
        }
        decline.done();
        setSheetOpen(false);
        toast.success("Đã báo không thể nhận chuyến. Điều phối viên sẽ sắp xếp người khác.");
        if (afterDecline === "home") router.push("/volunteer");
      } catch {
        setReasonError(NETWORK);
      }
    });
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {/* Xếp dọc trên điện thoại (360–430 px, chữ 17 px): hai nút cạnh nhau sẽ tràn; từ sm thì đặt cạnh nhau */}
      <div className="flex flex-col gap-2 sm:grid sm:grid-cols-[3fr_2fr]">
        <Button
          type="button"
          size="lg"
          className="h-[3.25rem] w-full text-lg"
          onClick={onAccept}
          disabled={pending || !online}
          aria-busy={pending}
        >
          {pending ? <Loader2 aria-hidden className="animate-spin" /> : <Check aria-hidden />}
          Nhận chuyến
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-12 w-full text-base"
          onClick={() => setSheetOpen(true)}
          disabled={pending || !online}
        >
          <X aria-hidden />
          Không thể nhận
        </Button>
      </div>
      {!online ? <p className="text-sm text-ink-muted">{OFFLINE_HINT}</p> : null}
      {error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <BottomSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title="Không thể nhận chuyến này?"
        description="Chuyến sẽ trở về chờ phân công và điều phối viên được báo ngay để sắp xếp người khác."
        footer={
          <>
            <Button
              type="button"
              variant="destructive"
              size="lg"
              className="h-12 w-full text-base"
              onClick={onDecline}
              disabled={pending}
              aria-busy={pending}
            >
              {pending ? <Loader2 aria-hidden className="animate-spin" /> : <X aria-hidden />}
              Báo không thể nhận
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-12 w-full text-base"
              onClick={() => setSheetOpen(false)}
            >
              Quay lại
            </Button>
          </>
        }
      >
        <ReasonPicker
          legend="Lý do"
          options={DECLINE_REASONS}
          value={reason}
          onChange={(v) => {
            setReason(v);
            setReasonError(null);
          }}
          maxLength={300}
          error={reasonError}
          disabled={pending}
        />
      </BottomSheet>
    </div>
  );
}

/**
 * "Bắt đầu chuyến" (start_pickup). Lần đầu (chưa từng trả lời đồng ý vị trí trên tài khoản, chưa chọn "không" trên
 * máy này) ⇒ hiện màn giải thích vị trí trước (US-VOL-02 AC1); cả hai lựa chọn đều bắt đầu chuyến (AC3).
 */
export function StartTripButton({
  pickupId,
  consent,
  navigateTo,
  className,
}: {
  pickupId: string;
  consent: LocationConsent;
  /** Bắt đầu xong thì mở trang này (từ "Hôm nay" ⇒ trang chuyến). */
  navigateTo?: string;
  className?: string;
}) {
  const router = useRouter();
  const online = useOnline();
  const start = useIntentId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const run = (withConsent: boolean) => {
    setError(null);
    const clientOpId = start.idFor(`start:${pickupId}`);
    startTransition(async () => {
      try {
        if (withConsent) {
          const granted = await grantLocationConsent({ source: consentSource() });
          if (!granted.ok) {
            setError(granted.error.message);
            return;
          }
        }
        const res = await startTrip({ pickupId, clientOpId });
        if (!res.ok) {
          setError(res.error.message);
          return;
        }
        start.done();
        setSheetOpen(false);
        toast.success("Đã bắt đầu chuyến. Chúc bạn đi đường an toàn!");
        if (navigateTo) router.push(navigateTo);
      } catch {
        setError(NETWORK);
      }
    });
  };

  const onClick = () => {
    const declinedHere = readLocalFlag(LOCATION_PROMPT_DECLINED_KEY) === "declined";
    if (!consent.everAnswered && !declinedHere) {
      setError(null);
      setSheetOpen(true);
      return;
    }
    run(false);
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Button
        type="button"
        size="lg"
        className="h-[3.25rem] w-full text-lg"
        onClick={onClick}
        disabled={pending || !online}
        aria-busy={pending}
      >
        {pending ? (
          <Loader2 aria-hidden className="size-5 animate-spin" />
        ) : (
          <Play aria-hidden className="size-5" />
        )}
        Bắt đầu chuyến
      </Button>
      {!online ? <p className="text-sm text-ink-muted">{OFFLINE_HINT}</p> : null}
      {error && !sheetOpen ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <LocationConsentSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        mode="start"
        pending={pending}
        error={sheetOpen ? error : null}
        onAgree={() => run(true)}
        onDecline={() => {
          writeLocalFlag(LOCATION_PROMPT_DECLINED_KEY, "declined");
          run(false);
        }}
      />
    </div>
  );
}
