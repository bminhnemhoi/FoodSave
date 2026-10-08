"use client";

import { Loader2, MapPinCheck, Navigation, RotateCw } from "lucide-react";
import { useEffect, useReducer, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { formatDistance } from "@/lib/format";

import { checkInStop } from "../actions";
import {
  checkInIntentKey,
  checkInReducer,
  GEO_PROBLEM_MESSAGE,
  INITIAL_CHECK_IN,
  type CheckInState,
} from "../geolocation";
import { useIntentId, useOnline } from "../hooks";
import { NO_LOCATION_REASONS, OUTSIDE_FENCE_REASONS } from "../labels";
import { BottomSheet } from "./bottom-sheet";
import { EMPTY_REASON, ReasonPicker, resolveReason, type ReasonValue } from "./reason-picker";

const NETWORK = "Không có kết nối mạng nên chưa gửi được check-in. Bấm “Thử lại” khi có sóng.";

/**
 * "Tôi đã tới" (PRD US-VOL-06; DATA-MODEL §8.5 `check_in_stop`): lấy vị trí một lần ngay lúc bấm (không theo
 * dõi liên tục, không cần đồng ý `location_trip` — US-VOL-02 AC3) ⇒ máy chủ so geofence 100 m với toạ độ chính
 * xác của điểm. Ngoài vùng ⇒ hỏi lý do rồi check-in thủ công; không có vị trí ⇒ check-in kèm cờ "chưa xác minh".
 */
export function CheckInControl({
  pickupId,
  stopId,
  placeName,
  disabledReason,
}: {
  pickupId: string;
  stopId: string;
  placeName: string;
  /** Có giá trị ⇒ khóa nút và hiện lý do (ví dụ chuyến chưa bắt đầu). */
  disabledReason?: string | null;
}) {
  const online = useOnline();
  const intent = useIntentId();
  const [state, dispatch] = useReducer(checkInReducer, INITIAL_CHECK_IN);
  const [reason, setReason] = useState<ReasonValue>(EMPTY_REASON);
  const [reasonError, setReasonError] = useState<string | null>(null);

  // Gửi RPC mỗi khi máy trạng thái vào bước "submitting" (một lần cho mỗi lần vào bước)
  useEffect(() => {
    if (state.step !== "submitting") return;
    let cancelled = false;
    const clientOpId = intent.idFor(checkInIntentKey(stopId, state));
    checkInStop({
      pickupId,
      stopId,
      position: state.fix ? { lat: state.fix.lat, lng: state.fix.lng } : null,
      reason: state.reason,
      clientOpId,
    })
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          dispatch({ type: "failed", message: res.error.message });
          return;
        }
        if (res.data.arrived) {
          intent.done();
          toast.success(
            res.data.check === "geofence"
              ? `Đã check-in tại ${placeName}.`
              : `Đã check-in tại ${placeName} (điều phối viên thấy đây là check-in thủ công).`,
          );
        }
        dispatch({ type: "server", result: res.data });
      })
      .catch(() => {
        if (!cancelled) dispatch({ type: "failed", message: NETWORK });
      });
    return () => {
      cancelled = true;
    };
    // state là khóa: mỗi lần vào "submitting" là một lượt gửi
  }, [state, pickupId, stopId, placeName, intent]);

  const start = () => {
    setReason(EMPTY_REASON);
    setReasonError(null);
    const supported = typeof navigator !== "undefined" && "geolocation" in navigator;
    dispatch({ type: "start", supported });
    if (!supported) return;
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        dispatch({
          type: "geo_fix",
          fix: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracyM: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
          },
        }),
      (err) => dispatch({ type: "geo_error", code: err.code }),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 10_000 },
    );
  };

  const submitReason = () => {
    const text = resolveReason(reason);
    if (!text) {
      setReasonError("Vui lòng chọn hoặc ghi lý do.");
      return;
    }
    setReasonError(null);
    dispatch({ type: "submit_reason", reason: text });
  };

  const busy = state.step === "locating" || state.step === "submitting";
  const sheet = sheetOf(state);

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        size="lg"
        className="h-[3.25rem] w-full text-lg"
        onClick={start}
        disabled={busy || !online || !!disabledReason}
        aria-busy={busy}
        data-check-in
      >
        {busy ? (
          <Loader2 aria-hidden className="size-5 animate-spin" />
        ) : (
          <MapPinCheck aria-hidden className="size-5" />
        )}
        {state.step === "locating" ? "Đang lấy vị trí…" : "Tôi đã tới"}
      </Button>
      {disabledReason ? <p className="text-sm text-ink-muted">{disabledReason}</p> : null}
      {state.step === "error" && !sheet.open ? (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger"
        >
          <p>{state.message}</p>
          <Button
            type="button"
            variant="outline"
            className="h-11 w-fit bg-surface"
            onClick={() => dispatch({ type: "retry" })}
            disabled={!online}
          >
            <RotateCw aria-hidden />
            Thử lại
          </Button>
        </div>
      ) : null}

      <BottomSheet
        open={sheet.open}
        onOpenChange={(open) => {
          if (!open) dispatch({ type: "cancel" });
        }}
        title={sheet.title}
        description={sheet.description}
        footer={
          <>
            {state.step === "error" ? (
              <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
                {state.message}
              </p>
            ) : null}
            <Button
              type="button"
              size="lg"
              className="h-[3.25rem] w-full text-base"
              onClick={state.step === "error" ? () => dispatch({ type: "retry" }) : submitReason}
              disabled={busy || !online}
              aria-busy={busy}
            >
              {busy ? <Loader2 aria-hidden className="animate-spin" /> : <MapPinCheck aria-hidden />}
              {state.step === "error" ? "Thử lại" : "Check-in thủ công"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-12 w-full text-base"
              onClick={() => dispatch({ type: "cancel" })}
              disabled={state.step === "submitting"}
            >
              <Navigation aria-hidden />
              Chưa tới, quay lại
            </Button>
          </>
        }
      >
        {sheet.cause ? (
          <ReasonPicker
            legend="Lý do check-in thủ công"
            options={sheet.cause === "outside_fence" ? OUTSIDE_FENCE_REASONS : NO_LOCATION_REASONS}
            value={reason}
            onChange={(v) => {
              setReason(v);
              setReasonError(null);
            }}
            maxLength={200}
            error={reasonError}
            disabled={busy}
          />
        ) : null}
      </BottomSheet>
    </div>
  );

  function sheetOf(s: CheckInState): {
    open: boolean;
    title: string;
    description?: string;
    cause: "outside_fence" | "no_location" | null;
  } {
    const attempt = s.step === "submitting" || s.step === "error" ? s : null;
    if (s.step === "needs_reason" && s.cause === "outside_fence")
      return {
        open: true,
        title: "Bạn chưa ở gần điểm này",
        description: `Vị trí điện thoại cách ${placeName} khoảng ${
          s.distanceM !== null ? formatDistance(s.distanceM) : "hơn 100 m"
        } (cần trong 100 m). Nếu bạn đã tới nơi, chọn lý do để check-in thủ công — điều phối viên sẽ thấy cờ “thủ công”.`,
        cause: "outside_fence",
      };
    if (s.step === "needs_reason")
      return {
        open: true,
        title: "Không lấy được vị trí",
        description: GEO_PROBLEM_MESSAGE[s.problem],
        cause: "no_location",
      };
    // Đang gửi / lỗi khi gửi kèm lý do: giữ sheet mở để thấy kết quả
    if (attempt && attempt.reason)
      return {
        open: true,
        title: "Check-in thủ công",
        description: attempt.fix ? "Đang gửi kèm lý do bạn chọn." : "Check-in chưa xác minh vị trí.",
        cause: attempt.fix ? "outside_fence" : "no_location",
      };
    return { open: false, title: "Check-in", cause: null };
  }
}
