import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton đúng hình màn chuyến: đầu trang, thẻ điểm kế tiếp, bản đồ nhỏ, lộ trình. */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-5">
      <span className="sr-only">Đang tải chuyến…</span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-6 w-40 rounded-full" />
      </div>
      <div className="flex flex-col gap-4 rounded-2xl border-2 bg-surface p-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-[3.25rem] w-full rounded-lg" />
        <Skeleton className="h-12 w-full rounded-lg" />
      </div>
      <Skeleton className="h-60 w-full rounded-xl" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
