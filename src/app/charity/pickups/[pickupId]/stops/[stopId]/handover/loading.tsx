import { PageHeaderSkeleton } from "@/components/layout/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton đúng hình màn mã bàn giao: đầu trang, danh sách hàng, nút lớn. */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <span className="sr-only">Đang tải điểm dừng…</span>
      <PageHeaderSkeleton />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-48" />
        <div className="flex flex-col divide-y rounded-lg border bg-surface">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex justify-between gap-4 px-4 py-3">
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-5 w-16" />
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-3 rounded-xl border bg-surface p-5">
        <Skeleton className="h-14 w-full rounded-lg sm:w-64" />
        <Skeleton className="h-4 w-full" />
      </div>
    </div>
  );
}
