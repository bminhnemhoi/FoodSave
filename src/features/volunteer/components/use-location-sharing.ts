"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { createClient } from "@/lib/supabase/client";

import { isConsentRequired } from "../errors";
import {
  accuracyForRpc,
  INITIAL_THROTTLE,
  LOCATION_RETRY_MS,
  nextSend,
  retryAfterMs,
  roundCoord,
  type ThrottleState,
} from "../location-throttle";

export type SharingStatus =
  /** Không chia sẻ (chưa đồng ý, đã dừng, chuyến không chạy). */
  | "off"
  /** Đang chờ điện thoại trả vị trí đầu tiên. */
  | "waiting"
  /** Đã gửi thành công ít nhất một lần trong lượt mở trang này. */
  | "sharing"
  /** Màn hình bị ẩn/khóa ⇒ tạm ngừng (gửi lại khi mở lại). */
  | "hidden"
  /** Người dùng chặn quyền vị trí cho trang. */
  | "denied"
  /** Điện thoại không lấy được vị trí. */
  | "unavailable"
  /** Trình duyệt không có Geolocation API. */
  | "unsupported"
  /** Lỗi mạng ⇒ đang chờ thử lại. */
  | "retrying";

export type MyPosition = { lat: number; lng: number; accuracyM: number | null };

type Options = {
  pickupId: string;
  /** Chuyến `in_progress` + đồng ý còn hiệu lực + người dùng không bấm "Dừng". */
  enabled: boolean;
  onEtas: (etas: Record<string, string>) => void;
  /** Máy chủ từ chối hẳn (hết đồng ý / chuyến không còn chạy) ⇒ trang tải lại trạng thái. */
  onStopped: (cause: "consent" | "trip") => void;
};

const noopSubscribe = () => () => {};

function subscribeVisibility(cb: () => void) {
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
}

/**
 * Gửi vị trí trong chuyến (PRD US-VOL-12; SECURITY-PRIVACY C9): chỉ khi `enabled` và trang đang hiển thị;
 * `watchPosition` tiết kiệm pin (không bật độ chính xác cao, nhận vị trí cũ ≤ 30 giây); tối đa 1 điểm / 30 giây
 * (`nextSend`), tôn trọng `hint` của PT429; toạ độ làm tròn 4 chữ số trước khi gửi. Ẩn trang, rời trang hay tắt
 * ⇒ `clearWatch` và xóa vị trí khỏi bộ nhớ. Không lưu toạ độ ở bất kỳ đâu ngoài state của hook này.
 */
export function useLocationSharing({ pickupId, enabled, onEtas, onStopped }: Options) {
  // Máy chủ coi như có Geolocation + trang đang hiện (HTML khớp lần hydrate đầu); trình duyệt trả giá trị thật
  const supported = useSyncExternalStore(
    noopSubscribe,
    () => "geolocation" in navigator,
    () => true,
  );
  const visible = useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState === "visible",
    () => true,
  );
  const [status, setStatus] = useState<SharingStatus>("waiting");
  const [position, setPosition] = useState<MyPosition | null>(null);
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);
  const callbacks = useRef({ onEtas, onStopped });
  useEffect(() => {
    callbacks.current = { onEtas, onStopped };
  }, [onEtas, onStopped]);

  const active = enabled && supported && visible;

  useEffect(() => {
    // Không hoạt động ⇒ lần chạy trước đã dọn (clearWatch + xóa vị trí)
    if (!active) return;

    const supabase = createClient();
    const throttle: ThrottleState = { ...INITIAL_THROTTLE };
    let latest: GeolocationPosition | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const halt = (cause: "consent" | "trip") => {
      disposed = true;
      navigator.geolocation.clearWatch(watchId);
      if (timer) clearTimeout(timer);
      latest = null;
      setPosition(null);
      callbacks.current.onStopped(cause);
    };

    const send = async () => {
      if (!latest) return;
      const { latitude, longitude, accuracy } = latest.coords;
      throttle.inFlight = true;
      const { data, error } = await supabase.rpc("update_pickup_progress", {
        p_pickup_id: pickupId,
        p_lat: roundCoord(latitude),
        p_lng: roundCoord(longitude),
        // RPC nhận null (không rõ độ chính xác) dù kiểu sinh ra là number
        p_accuracy_m: accuracyForRpc(accuracy) as number,
      });
      throttle.inFlight = false;
      if (disposed) return;
      if (!error) {
        throttle.lastSentAt = Date.now();
        throttle.blockedUntil = null;
        setLastSentAt(throttle.lastSentAt);
        setStatus("sharing");
        const etas: Record<string, string> = {};
        const list = (data as { etas?: { stop_id: string; eta: string }[] } | null)?.etas ?? [];
        for (const e of list) etas[e.stop_id] = e.eta;
        callbacks.current.onEtas(etas);
        schedule();
        return;
      }
      if (error.code === "PT429") {
        throttle.blockedUntil = Date.now() + retryAfterMs(error.hint);
        schedule();
        return;
      }
      if (isConsentRequired(error)) return halt("consent");
      if (error.code === "PT409" || error.code === "PT403" || error.code === "PT404") return halt("trip");
      // Mạng chập chờn / lỗi máy chủ: chờ một nhịp rồi thử lại, không dồn dập
      throttle.blockedUntil = Date.now() + LOCATION_RETRY_MS;
      setStatus("retrying");
      schedule();
    };

    function schedule() {
      if (disposed || !latest || timer) return;
      const d = nextSend(throttle, Date.now());
      if (d.action === "send") void send();
      else if (d.action === "wait")
        timer = setTimeout(() => {
          timer = null;
          schedule();
        }, d.ms);
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (disposed) return;
        latest = pos;
        setPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
        });
        schedule();
      },
      (err) => {
        if (disposed) return;
        if (err.code === 1) {
          disposed = true;
          navigator.geolocation.clearWatch(watchId);
          setStatus("denied");
        } else setStatus("unavailable");
      },
      { enableHighAccuracy: false, maximumAge: 30_000, timeout: 60_000 },
    );

    return () => {
      disposed = true;
      navigator.geolocation.clearWatch(watchId);
      if (timer) clearTimeout(timer);
      latest = null;
      // Vị trí rời bộ nhớ ngay khi ẩn trang / dừng / rời trang; lần bật sau bắt đầu lại từ "đang lấy vị trí"
      setPosition(null);
      setStatus("waiting");
    };
  }, [active, pickupId]);

  const result: { status: SharingStatus; position: MyPosition | null; lastSentAt: number | null } = {
    status: !enabled ? "off" : !supported ? "unsupported" : !visible ? "hidden" : status,
    position: active ? position : null,
    lastSentAt,
  };
  return result;
}
