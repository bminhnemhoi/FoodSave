import { CardGridSkeleton, ListSkeleton, PageHeaderSkeleton } from "@/components/layout/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton đúng hình các màn bảng điều khiển Admin (DESIGN-SYSTEM §12.4). */
export function ConsoleListSkeleton({
  label,
  kpis = 0,
  chips = 6,
}: {
  label: string;
  kpis?: number;
  chips?: number;
}) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">{label}</span>
      <PageHeaderSkeleton />
      {kpis > 0 ? <CardGridSkeleton count={kpis} className="md:grid-cols-3 xl:grid-cols-3" /> : null}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: chips }, (_, i) => (
            <Skeleton key={i} className="h-10 w-24 rounded-full" />
          ))}
        </div>
        <Skeleton className="h-10 w-full rounded-lg sm:w-96" />
      </div>
      <ListSkeleton rows={6} />
    </div>
  );
}
