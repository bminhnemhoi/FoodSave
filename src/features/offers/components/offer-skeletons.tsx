import { PageHeaderSkeleton } from "@/components/layout/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton đúng hình form đăng/sửa lô: các khối form bên trái, thẻ xem trước bên phải (DESIGN-SYSTEM §12.4). */
export function OfferFormSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <PageHeaderSkeleton />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex flex-col gap-6">
          {[3, 4, 2, 3].map((rows, i) => (
            <div key={i} className="flex flex-col gap-4 rounded-xl border bg-surface p-4 sm:p-6">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3 w-2/3" />
              {Array.from({ length: rows }, (_, j) => (
                <Skeleton key={j} className="h-10 w-full rounded-lg" />
              ))}
            </div>
          ))}
        </div>
        <div className="flex h-fit flex-col gap-4 rounded-xl border bg-surface p-5">
          <Skeleton className="h-4 w-24" />
          <div className="flex gap-3">
            <Skeleton className="size-16 rounded-lg" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
    </div>
  );
}

/** Skeleton trang chi tiết lô: thẻ tóm tắt + danh sách yêu cầu. */
export function OfferDetailSkeleton() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">Đang tải lô tặng…</span>
      <PageHeaderSkeleton withAction />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="flex flex-col gap-4 rounded-xl border bg-surface p-5">
          <div className="flex gap-4">
            <Skeleton className="size-24 rounded-lg" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-6 w-32 rounded-full" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-28 w-full" />
        </div>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-6 w-48" />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
