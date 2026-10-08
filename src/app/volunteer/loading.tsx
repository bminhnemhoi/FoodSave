import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton đúng hình "Hôm nay"/"Chuyến": tiêu đề + các thẻ chuyến với nút lớn (DESIGN-SYSTEM §12.4). */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">Đang tải chuyến của bạn…</span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      {Array.from({ length: 2 }, (_, i) => (
        <div key={i} className="flex flex-col gap-3 rounded-xl border bg-surface p-4">
          <div className="flex justify-between gap-2">
            <Skeleton className="h-7 w-28 rounded-full" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
      ))}
    </div>
  );
}
