import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Skeleton đúng hình các khối chuẩn (DESIGN-SYSTEM §12.4: không spinner toàn trang). */

export function PageHeaderSkeleton({ withAction = false }: { withAction?: boolean }) {
  return (
    <div className="flex flex-col gap-3 pb-6 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex w-full max-w-xl flex-col gap-2.5">
        <Skeleton className="h-4 w-40 max-md:hidden" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-full" />
      </div>
      {withAction ? <Skeleton className="h-10 w-36 shrink-0 rounded-lg" /> : null}
    </div>
  );
}

export function CardGridSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2 md:gap-4 xl:grid-cols-4", className)}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col gap-3 rounded-lg border bg-surface p-4">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-3 w-full" />
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <ul className={cn("flex flex-col gap-3", className)}>
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex items-center gap-4 rounded-lg border bg-surface p-4">
          <Skeleton className="size-12 shrink-0 rounded-md" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </li>
      ))}
    </ul>
  );
}

export function MapSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn("h-72 w-full rounded-lg", className)} />;
}

/** Skeleton mặc định cho một trang trong cổng: đầu trang + lưới thẻ + danh sách. */
export function PortalPageSkeleton() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">Đang tải nội dung…</span>
      <PageHeaderSkeleton />
      <CardGridSkeleton />
      <ListSkeleton rows={3} />
    </div>
  );
}
