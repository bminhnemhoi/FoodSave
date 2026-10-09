import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { clientEnv } from "@/lib/env.client";

import { MapScreensDemo } from "./demo";

export const metadata: Metadata = { title: "Bản đồ các màn", robots: { index: false } };

/** C1: 5 bản đồ chính với dữ liệu minh họa (tên hư cấu) — rà giao diện không cần đăng nhập/DB. Không có ở production. */
export default function MapScreensPage() {
  if (clientEnv.NEXT_PUBLIC_APP_ENV === "production") notFound();
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-8">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-semibold tracking-wide text-primary uppercase">Trang thử · dev</p>
        <h1 className="text-[1.75rem] leading-tight font-bold">Bản đồ các màn (dữ liệu minh họa)</h1>
      </header>
      <MapScreensDemo />
    </main>
  );
}
