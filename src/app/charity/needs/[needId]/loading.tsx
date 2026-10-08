import { PageHeaderSkeleton } from "@/components/layout/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton đúng hình màn phương án: tóm tắt nhu cầu + bản đồ + 3 thẻ phương án (DESIGN-SYSTEM §12.4). */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-8">
      <span className="sr-only">Đang tính phương án ghép…</span>
      <PageHeaderSkeleton withAction />
      <div className="grid gap-6 rounded-xl border bg-surface p-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-6 w-40 rounded-full" />
          <Skeleton className="h-12 w-36" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-36 rounded-full" />
            <Skeleton className="h-8 w-36 rounded-full" />
          </div>
          <Skeleton className="h-10 w-full max-w-md" />
        </div>
        <Skeleton className="h-36 rounded-lg" />
      </div>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-72 rounded-xl sm:h-80 lg:h-[26rem]" />
        <div className="grid gap-4 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className={i > 0 ? "max-lg:hidden" : undefined}>
              <div className="flex flex-col gap-3 rounded-xl border bg-surface p-4">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-9 w-32" />
                <div className="grid grid-cols-2 gap-3">
                  <Skeleton className="h-10" />
                  <Skeleton className="h-10" />
                  <Skeleton className="h-10" />
                  <Skeleton className="h-10" />
                </div>
                <Skeleton className="h-24" />
                <Skeleton className="h-11" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
