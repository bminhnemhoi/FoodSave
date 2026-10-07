import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton đúng hình khung wizard (DESIGN-SYSTEM §12.4). */
export default function OnboardingStepLoading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-1 flex-col">
      <span className="sr-only">Đang tải hồ sơ…</span>
      <div className="border-b bg-surface">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-8">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-6 px-4 pt-6 sm:px-8 lg:grid-cols-[16.5rem_minmax(0,1fr)] lg:gap-10 lg:pt-10">
        <div className="hidden flex-col gap-3 lg:flex">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-1.5 w-full" />
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 px-2.5 py-2">
              <Skeleton className="size-8 rounded-full" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-6">
          <Skeleton className="h-1.5 w-full lg:hidden" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-full max-w-prose" />
          </div>
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="flex flex-col gap-4 rounded-xl border bg-surface p-4 sm:p-6">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
