import { ListSkeleton, PageHeaderSkeleton } from "@/components/layout/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton Chuyến lấy hàng: khối chọn lô + danh sách chuyến. */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">Đang tải chuyến lấy hàng…</span>
      <PageHeaderSkeleton />
      <Skeleton className="h-7 w-72" />
      <div className="flex flex-col gap-3 rounded-lg border bg-surface p-4">
        <Skeleton className="h-6 w-56" />
        <ListSkeleton rows={2} />
        <Skeleton className="h-10 w-52 self-end" />
      </div>
      <Skeleton className="h-7 w-48" />
      <div className="grid gap-3 md:grid-cols-2">
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
      </div>
    </div>
  );
}
