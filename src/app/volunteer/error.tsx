"use client";

import { ErrorState } from "@/components/layout/error-state";

export default function PortalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <ErrorState
      title="Không tải được trang này"
      description="Đã có lỗi phía FoodSave hoặc kết nối mạng chập chờn. Dữ liệu của bạn không bị ảnh hưởng."
      reference={error.digest?.slice(0, 8)}
      onRetry={retry}
    />
  );
}
