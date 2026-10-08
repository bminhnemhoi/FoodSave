import { PageHeaderSkeleton } from "@/components/layout/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton đúng hình "Lô tặng": đầu trang + tab + thẻ lô (DESIGN-SYSTEM §12.4). */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-4">
      <span className="sr-only">Đang tải danh sách lô…</span>
      <PageHeaderSkeleton withAction />
      <div className="flex gap-2 border-b pb-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-8 w-28 rounded-md" />
        ))}
      </div>
      <ul className="grid gap-3 md:gap-4 xl:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <li key={i} className="flex gap-4 rounded-xl border bg-surface p-4">
            <Skeleton className="size-16 shrink-0 rounded-lg sm:size-[4.5rem]" />
            <div className="flex flex-1 flex-col gap-3">
              <div className="flex justify-between gap-3">
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
                <Skeleton className="h-6 w-24 rounded-full" />
              </div>
              <Skeleton className="h-2 w-full rounded-full" />
              <Skeleton className="h-3 w-3/4" />
              <div className="flex justify-end gap-2">
                <Skeleton className="h-10 w-20 rounded-lg" />
                <Skeleton className="size-11 rounded-lg" />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
