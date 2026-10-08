"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { formatClock } from "../present";

/**
 * Tự tải lại dữ liệu trang (Server Component) mỗi `intervalMs` khi tab đang hiển thị, và ngay khi người dùng
 * quay lại tab — để trạng thái do cửa hàng đổi (xác nhận, từ chối, bàn giao) hiện mà không cần F5.
 * Hiện "Cập nhật lúc hh:mm:ss" + nút làm mới thủ công (DESIGN-SYSTEM §12.2).
 */
export function AutoRefresh({
  serverNow,
  intervalMs = 30_000,
  className,
}: {
  serverNow: number;
  intervalMs?: number;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") startTransition(() => router.refresh());
    };
    const timer = setInterval(refresh, intervalMs);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [intervalMs, router]);

  return (
    <p className={cn("flex items-center gap-2 text-xs text-ink-subtle", className)}>
      <span className="tabular-nums" suppressHydrationWarning>
        Cập nhật lúc {formatClock(new Date(serverNow))}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-11 px-2 text-xs md:h-8"
        onClick={() => startTransition(() => router.refresh())}
        disabled={pending}
        aria-busy={pending || undefined}
      >
        <RefreshCw aria-hidden className={cn("size-3.5", pending && "animate-spin")} />
        Làm mới
      </Button>
    </p>
  );
}
