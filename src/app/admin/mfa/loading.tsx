import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10 sm:px-8"
    >
      <span className="sr-only">Đang tải trang xác thực…</span>
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-5 w-full max-w-prose" />
      <Skeleton className="h-28 w-full rounded-xl" />
      <Skeleton className="h-56 w-full rounded-xl" />
    </div>
  );
}
