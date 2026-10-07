"use client";

import { useEffect } from "react";

import type { PortalRole } from "./nav-config";

/**
 * Đặt `data-role` lên <body> để accent vai trò áp dụng cả cho lớp phủ render qua portal
 * (dropdown, sheet, toast) — DESIGN-SYSTEM §3.4. Khung SSR đã có `data-role` trên wrapper nên không nháy màu.
 */
export function BodyRole({ role }: { role: PortalRole }) {
  useEffect(() => {
    const body = document.body;
    const previous = body.dataset.role;
    body.dataset.role = role;
    return () => {
      if (previous) body.dataset.role = previous;
      else delete body.dataset.role;
    };
  }, [role]);
  return null;
}
