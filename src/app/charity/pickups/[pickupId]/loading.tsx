import { ListSkeleton, PageHeaderSkeleton } from "@/components/layout/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton chi tiết chuyến: 4 ô số liệu + danh sách điểm dừng + khung bản đồ. */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">Đang tải chuyến…</span>
      <PageHeaderSkeleton />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
      <div className="flex flex-col-reverse gap-6 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <ListSkeleton rows={3} />
        <Skeleton className="h-72 rounded-lg lg:h-[calc(100dvh-7.5rem)]" />
      </div>
    </div>
  );
}
