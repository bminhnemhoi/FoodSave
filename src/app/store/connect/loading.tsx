import { ListSkeleton, PageHeaderSkeleton } from "@/components/layout/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton đúng hình "Nhu cầu gần bạn": bộ lọc danh mục + thẻ nhu cầu + khung bản đồ (DESIGN-SYSTEM §12.4). */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-4">
      <span className="sr-only">Đang tải nhu cầu gần bạn…</span>
      <PageHeaderSkeleton withAction />
      <div className="flex flex-wrap gap-2 rounded-xl border bg-bg-sunken p-4">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-32 rounded-full" />
        ))}
      </div>
      <div className="lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-6">
        <ListSkeleton rows={3} />
        <Skeleton className="hidden h-[calc(100dvh-7.5rem)] min-h-[480px] rounded-xl lg:block" />
      </div>
    </div>
  );
}
