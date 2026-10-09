import { ChevronLeft, ChevronRight, FlaskConical, RefreshCw, RotateCcw } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

/** Thành phần trình bày dùng chung của bảng điều khiển Admin (Server Component, không trạng thái). */

const focusRing = "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";

/** Nút lọc dạng chip (liên kết GET). Chip đang áp dụng có `aria-current` + chữ ẩn cho trình đọc màn hình. */
export function ChipLink({
  href,
  active,
  children,
  count,
  className,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
  count?: number;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium whitespace-nowrap transition-colors",
        focusRing,
        active
          ? "border-role-accent bg-role-accent-soft text-ink"
          : "border-border-strong/40 bg-surface text-ink-muted hover:text-ink",
        className,
      )}
    >
      {children}
      {count !== undefined ? (
        <span
          className={cn(
            "min-w-6 rounded-full px-1.5 py-0.5 text-center text-xs font-semibold tabular-nums",
            count > 0 ? "bg-ink text-surface" : "bg-bg-sunken text-ink-muted",
          )}
        >
          <span className="sr-only">: </span>
          {count}
        </span>
      ) : null}
      {active ? <span className="sr-only">(đang áp dụng)</span> : null}
    </Link>
  );
}

/** Hàng chip cuộn ngang trên mobile (không làm trang cuộn ngang). */
export function ChipRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="flex w-max gap-2 sm:w-auto sm:flex-wrap">{children}</div>
    </nav>
  );
}

/** Nhãn "Dữ liệu demo" cạnh dòng thuộc tổ chức demo (CLAUDE.md: số liệu demo luôn gắn nhãn). */
export function DemoBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-full bg-brand-yellow-soft px-2 py-0.5 text-xs font-medium whitespace-nowrap text-ink",
        className,
      )}
    >
      <FlaskConical aria-hidden className="size-3.5" />
      Dữ liệu demo
    </span>
  );
}

/** Chọn phạm vi dữ liệu: chỉ dữ liệu thật (mặc định) hoặc gồm cả dữ liệu demo. */
export function DemoScope({ demo, realHref, allHref }: { demo: boolean; realHref: string; allHref: string }) {
  return (
    <ChipRow label="Phạm vi dữ liệu">
      <ChipLink href={realHref} active={!demo}>
        Chỉ dữ liệu thật
      </ChipLink>
      <ChipLink href={allHref} active={demo}>
        <FlaskConical aria-hidden className="size-4" />
        Gồm dữ liệu demo
      </ChipLink>
    </ChipRow>
  );
}

const timeFormat = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** Dòng kết quả: tổng số, cách sắp xếp, "Xóa lọc", "Cập nhật lúc hh:mm:ss" + "Làm mới" (DESIGN-SYSTEM §12.2). */
export function ResultBar({
  total,
  unit,
  sortNote,
  clearHref,
  refreshHref,
  at,
}: {
  total: number;
  unit: string;
  sortNote: string;
  clearHref: string | null;
  refreshHref: string;
  at: Date;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm text-ink-muted">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1" aria-live="polite">
        <span>
          <strong className="font-semibold text-ink tabular-nums">{total}</strong> {unit} · {sortNote}
        </span>
        {clearHref ? (
          <Link
            href={clearHref}
            className="inline-flex min-h-6 items-center gap-1 font-medium text-primary underline underline-offset-4"
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Xóa lọc
          </Link>
        ) : null}
      </p>
      <p className="flex items-center gap-3">
        <span className="tabular-nums">Cập nhật lúc {timeFormat.format(at)}</span>
        <Link
          href={refreshHref}
          prefetch={false}
          className={cn(
            "inline-flex min-h-10 items-center gap-1.5 rounded-lg border bg-surface px-3 font-medium text-ink hover:bg-bg-sunken",
            focusRing,
          )}
        >
          <RefreshCw aria-hidden className="size-4" />
          Làm mới
        </Link>
      </p>
    </div>
  );
}

/** Phân trang trước/sau (range 50 dòng/trang). */
export function ListPagination({
  page,
  total,
  pageSize,
  hrefFor,
}: {
  page: number;
  total: number;
  pageSize: number;
  hrefFor: (page: number) => string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1 && page <= 1) return null;
  const current = Math.min(page, pages);
  const linkCls = cn(
    "inline-flex min-h-11 items-center gap-1 rounded-lg border bg-surface px-3 text-sm font-medium hover:bg-bg-sunken",
    focusRing,
  );
  return (
    <nav aria-label="Phân trang" className="flex items-center justify-between gap-3 pt-2">
      {current > 1 ? (
        <Link href={hrefFor(current - 1)} className={linkCls} rel="prev">
          <ChevronLeft aria-hidden className="size-4" />
          Trang trước
        </Link>
      ) : (
        <span aria-hidden className="w-24" />
      )}
      <p className="text-sm text-ink-muted tabular-nums">
        Trang {current}/{pages}
      </p>
      {current < pages ? (
        <Link href={hrefFor(current + 1)} className={linkCls} rel="next">
          Trang sau
          <ChevronRight aria-hidden className="size-4" />
        </Link>
      ) : (
        <span aria-hidden className="w-24" />
      )}
    </nav>
  );
}

/** Ô thông tin nhỏ trong thẻ mobile / trang chi tiết. */
export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5", className)}>
      <dt className="text-xs text-ink-subtle">{label}</dt>
      <dd className="min-w-0 text-sm break-words text-ink">{children}</dd>
    </div>
  );
}
