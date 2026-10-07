"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ErrorStateProps = {
  title?: string;
  description?: React.ReactNode;
  /** Mã tham chiếu ngắn (digest của Next) để người dùng gửi cho FoodSave. */
  reference?: string;
  onRetry?: () => void;
  variant?: "page" | "section";
  className?: string;
};

/** Trạng thái lỗi: nguyên nhân dễ hiểu + "Thử lại" + mã tham chiếu (DESIGN-SYSTEM §12.4). */
export function ErrorState({
  title = "Không tải được nội dung",
  description = "Đã có lỗi phía FoodSave hoặc kết nối mạng chập chờn. Vui lòng thử lại.",
  reference,
  onRetry,
  variant = "page",
  className,
}: ErrorStateProps) {
  return (
    <section
      role="alert"
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl border border-danger/30 bg-danger-soft text-center",
        variant === "page" ? "px-6 py-14" : "px-5 py-8",
        className,
      )}
    >
      <TriangleAlert aria-hidden className="size-10 text-danger" strokeWidth={1.75} />
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="max-w-prose text-ink-muted">{description}</div>
      {reference ? (
        <p className="text-sm text-ink-muted">
          Nếu vẫn lỗi, gửi mã{" "}
          <span className="font-semibold tracking-wider text-ink tabular-nums">{reference}</span> cho
          FoodSave.
        </p>
      ) : null}
      {onRetry ? (
        <Button type="button" onClick={onRetry} className="mt-2">
          <RotateCcw aria-hidden />
          Thử lại
        </Button>
      ) : null}
    </section>
  );
}
