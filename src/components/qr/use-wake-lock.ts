"use client";

import { useEffect, useState } from "react";

export type WakeLockState = "unsupported" | "pending" | "on" | "off";

/**
 * Giữ màn hình sáng khi đang hiện mã bàn giao (Screen Wake Lock API — PRD US-VOL-07 AC1, NFR-OFF).
 * Trình duyệt tự nhả khóa khi tab bị ẩn ⇒ xin lại khi tab hiện lại. Chỉ dùng trong component render
 * phía client (màn mã bàn giao chỉ mở sau thao tác của người dùng).
 */
export function useWakeLock(enabled: boolean): WakeLockState {
  const [supported] = useState(() => typeof navigator !== "undefined" && "wakeLock" in navigator);
  const [state, setState] = useState<Exclude<WakeLockState, "unsupported">>("pending");

  useEffect(() => {
    if (!enabled || !supported) return;
    let sentinel: WakeLockSentinel | null = null;
    let disposed = false;

    const acquire = async () => {
      try {
        const s = await navigator.wakeLock.request("screen");
        if (disposed) {
          void s.release();
          return;
        }
        sentinel = s;
        setState("on");
        s.addEventListener("release", () => {
          if (!disposed) setState("off");
        });
      } catch {
        // Bị từ chối (chế độ tiết kiệm pin, tab không hiển thị…) — vẫn hiện mã bình thường
        if (!disposed) setState("off");
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible" && (!sentinel || sentinel.released)) void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void sentinel?.release().catch(() => undefined);
    };
  }, [enabled, supported]);

  if (!supported) return "unsupported";
  return enabled ? state : "off";
}
