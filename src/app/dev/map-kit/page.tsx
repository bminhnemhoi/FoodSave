import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { clientEnv } from "@/lib/env.client";

import { MapKitDemo } from "./demo";

export const metadata: Metadata = { title: "Bộ bản đồ", robots: { index: false } };

/**
 * C1: trang thử bộ bản đồ dùng chung (src/components/map/kit) — mọi loại marker, chú giải, thẻ thông tin trên nền
 * đã phối màu. Dùng để rà thiết kế và cho E2E kiểm nhãn Hoàng Sa/Trường Sa. Không có ở production.
 */
export default function MapKitPage() {
  if (clientEnv.NEXT_PUBLIC_APP_ENV === "production") notFound();
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-8">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-semibold tracking-wide text-primary uppercase">Trang thử · dev</p>
        <h1 className="text-[1.75rem] leading-tight font-bold">Bộ bản đồ dùng chung</h1>
        <p className="max-w-prose text-ink-muted">
          Marker minh họa, chú giải, thẻ thông tin và nền bản đồ đã phối màu (DESIGN-SYSTEM §13). Dữ liệu minh
          họa, tên hư cấu.
        </p>
      </header>
      <MapKitDemo />
    </main>
  );
}
