import { ListSkeleton, PageHeaderSkeleton } from "@/components/layout/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton đúng hình Kho tặng: bộ lọc + 4 thẻ lô + khung bản đồ (DESIGN-SYSTEM §12.4). */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-4">
      <span className="sr-only">Đang tải kho tặng…</span>
      <PageHeaderSkeleton />
      <div className="flex flex-col gap-3 rounded-lg border bg-bg-sunken p-4">
        <Skeleton className="h-10 w-64" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-9 w-24 rounded-full" />
          <Skeleton className="h-9 w-24 rounded-full" />
          <Skeleton className="h-9 w-24 rounded-full" />
          <Skeleton className="h-9 w-36" />
        </div>
      </div>
      <div className="lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-6">
        <ListSkeleton rows={4} />
        <Skeleton className="hidden h-[calc(100dvh-7.5rem)] min-h-[480px] rounded-lg lg:block" />
      </div>
    </div>
  );
}
