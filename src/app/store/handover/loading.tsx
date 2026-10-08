import { PageHeaderSkeleton } from "@/components/layout/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton đúng hình màn bàn giao: khối quét, danh sách lượt đang chờ. */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-8">
      <span className="sr-only">Đang tải lượt bàn giao…</span>
      <PageHeaderSkeleton />
      <div className="flex flex-col gap-4 rounded-xl border bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Skeleton className="size-14 rounded-xl" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <Skeleton className="h-14 w-full rounded-lg sm:w-48" />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="flex flex-col gap-3 rounded-lg border bg-surface p-4">
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-11 w-36 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
