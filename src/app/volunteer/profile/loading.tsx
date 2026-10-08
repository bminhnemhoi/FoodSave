import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton đúng hình màn Tài khoản: tiêu đề, các nhóm trường, bản đồ khu vực. */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">Đang tải hồ sơ…</span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      {[2, 2, 3].map((rows, i) => (
        <div key={i} className="flex flex-col gap-4 rounded-xl border bg-surface p-4">
          <Skeleton className="h-6 w-40" />
          {i === 2 ? <Skeleton className="h-64 w-full rounded-lg" /> : null}
          {Array.from({ length: rows }, (_, j) => (
            <div key={j} className="flex flex-col gap-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-12 w-full rounded-lg" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
