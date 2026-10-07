import { WifiOff } from "lucide-react";
import type { Metadata } from "next";

import { Wordmark } from "@/components/brand/wordmark";

export const metadata: Metadata = { title: "Mất kết nối", robots: { index: false } };

/** Trang dự phòng do service worker trả về khi mất mạng (tĩnh, được cache sẵn). */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <Wordmark className="text-xl" />
      <WifiOff aria-hidden className="mt-6 size-10 text-ink-subtle" />
      <h1 className="text-2xl font-bold">Bạn đang ngoại tuyến</h1>
      <p className="text-ink-muted">
        Không kết nối được tới FoodSave. Kiểm tra mạng di động hoặc Wi-Fi rồi thử lại. Thao tác chưa gửi sẽ
        không bị mất khi bạn tải lại trang.
      </p>
      <a
        href="."
        className="mt-2 inline-flex h-11 items-center rounded-md bg-primary px-5 font-medium text-primary-foreground"
      >
        Thử lại
      </a>
    </main>
  );
}
