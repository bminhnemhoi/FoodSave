"use client";

import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";

import { newUuid } from "@/lib/hash";

import { intentIdFor, type IntentSlot } from "./intent";

/**
 * `client_op_id` ổn định cho một ý định: `idFor(key)` trả cùng id khi khóa không đổi; `done()` sau khi thành
 * công để lần sau là ý định mới.
 */
export function useIntentId() {
  const slot = useRef<IntentSlot>(null);
  const idFor = useCallback((key: string) => {
    slot.current = intentIdFor(slot.current, key, newUuid);
    return slot.current.id;
  }, []);
  const done = useCallback(() => {
    slot.current = null;
  }, []);
  return useMemo(() => ({ idFor, done }), [idFor, done]);
}

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/** Trạng thái mạng (server luôn coi là có mạng để HTML khớp lần hydrate đầu). */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

/** Đang chạy như ứng dụng đã cài (PWA) ⇒ nguồn đồng ý `pwa`, ngược lại `web`. */
export function consentSource(): "web" | "pwa" {
  if (typeof window === "undefined") return "web";
  return window.matchMedia?.("(display-mode: standalone)").matches ? "pwa" : "web";
}

/** Đọc/ghi lựa chọn giao diện trên máy (không bao giờ là toạ độ). Trình duyệt chặn bộ nhớ ⇒ bỏ qua. */
export function readLocalFlag(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocalFlag(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // bộ nhớ trình duyệt bị tắt: lần sau chỉ hỏi lại, không ảnh hưởng chức năng
  }
}
