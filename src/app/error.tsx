"use client";

import { ErrorState } from "@/components/layout/error-state";

/** Lỗi không lường trước trong mọi route dưới root layout (kể cả layout của cổng). */
export default function RootError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 py-10 sm:px-8">
      <ErrorState
        title="Đã có lỗi phía FoodSave"
        description="Vui lòng thử lại. Dữ liệu bạn đã lưu không bị ảnh hưởng."
        reference={error.digest?.slice(0, 8)}
        onRetry={retry}
      />
    </main>
  );
}
