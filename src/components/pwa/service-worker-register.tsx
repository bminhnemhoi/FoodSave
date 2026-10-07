"use client";

import { useEffect } from "react";

/** Đăng ký service worker ở production (ADR-013). Dev bỏ qua để không cache nhầm khi hot-reload. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch((err) => {
      console.warn("Không đăng ký được service worker", err);
    });
  }, []);
  return null;
}
