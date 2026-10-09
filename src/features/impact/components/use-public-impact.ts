"use client";

import { useEffect, useState } from "react";

import type { PublicImpact } from "../queries";

const UNAVAILABLE: PublicImpact = { status: "unavailable" };

function isPublicImpact(v: unknown): v is PublicImpact {
  if (!v || typeof v !== "object") return false;
  const o = v as { status?: unknown; totals?: { kg?: unknown } };
  if (o.status === "unavailable") return true;
  return o.status === "ok" && typeof o.totals?.kg === "number";
}

let inflight: Promise<PublicImpact> | null = null;

/**
 * Một request cho mỗi lần mở trang (thẻ hero + khối tác động mount cùng lúc nên dùng chung); xong thì bỏ để
 * lần quay lại trang chủ (điều hướng phía client) lấy số mới. Lỗi mạng/định dạng ⇒ "unavailable".
 */
function loadPublicImpact(): Promise<PublicImpact> {
  inflight ??= fetch("/api/public-impact", { cache: "no-store", headers: { Accept: "application/json" } })
    .then((res) => res.json())
    .then((data: unknown) => (isPublicImpact(data) ? data : UNAVAILABLE))
    .catch(() => UNAVAILABLE)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/**
 * Số tác động công khai cho landing tĩnh (route `/api/public-impact`, Data Cache thẻ `public-impact`).
 * `null` = đang tải ⇒ component hiện skeleton đúng hình. Không có JS ⇒ chỉ có skeleton + câu `<noscript>`.
 */
export function usePublicImpact(): PublicImpact | null {
  const [impact, setImpact] = useState<PublicImpact | null>(null);
  useEffect(() => {
    let alive = true;
    void loadPublicImpact().then((data) => {
      if (alive) setImpact(data);
    });
    return () => {
      alive = false;
    };
  }, []);
  return impact;
}
