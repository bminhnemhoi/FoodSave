"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { ErrorState } from "@/components/layout/error-state";

/** Trạng thái lỗi cho trang Server Component: "Thử lại" = tải lại dữ liệu trang (router.refresh). */
export function RefreshError({
  title,
  description,
  variant = "section",
}: {
  title: string;
  description: string;
  variant?: "page" | "section";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <ErrorState
      variant={variant}
      title={title}
      description={description}
      onRetry={pending ? undefined : () => startTransition(() => router.refresh())}
    />
  );
}
