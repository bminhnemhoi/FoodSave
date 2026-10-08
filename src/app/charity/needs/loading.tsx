import { PageHeaderSkeleton } from "@/components/layout/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton đúng hình danh sách nhu cầu: đầu trang + thẻ có thanh tiến độ (DESIGN-SYSTEM §12.4). */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-4">
      <span className="sr-only">Đang tải nhu cầu…</span>
      <PageHeaderSkeleton withAction />
      <Skeleton className="h-6 w-40" />
      <div className="grid gap-4 xl:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex flex-col gap-4 rounded-xl border bg-surface p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-6 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
              </div>
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
            <Skeleton className="h-2 w-full rounded-full" />
            <div className="flex justify-between gap-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-9 w-40" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
