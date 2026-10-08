import { PageHeaderSkeleton } from "@/components/layout/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton Nhận hàng: khối quét + lưới lượt chờ nhận. */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">Đang tải lượt giao về…</span>
      <PageHeaderSkeleton />
      <Skeleton className="h-28 rounded-xl" />
      <Skeleton className="h-7 w-48" />
      <div className="grid gap-3 lg:grid-cols-2">
        <Skeleton className="h-48 rounded-lg" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
    </div>
  );
}
