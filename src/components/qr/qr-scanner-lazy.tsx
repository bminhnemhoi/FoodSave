"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * Máy quét QR tải động (không SSR): mã ZXing chỉ tải khi người dùng mở máy quét, không làm nặng các trang khác.
 */
export const QrScannerLazy = dynamic(() => import("./qr-scanner"), {
  ssr: false,
  loading: () => (
    <div role="status" className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-4 sm:py-6">
      <span className="sr-only">Đang tải máy quét…</span>
      <Skeleton className="aspect-[3/4] w-full rounded-xl bg-primary-foreground/10 sm:aspect-video" />
      <Skeleton className="mx-auto h-12 w-48 rounded-lg bg-primary-foreground/10" />
    </div>
  ),
});
