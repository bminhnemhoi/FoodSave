import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

export type Crumb = { label: string; href?: string };

type PageHeaderProps = {
  title: string;
  description?: React.ReactNode;
  /** Một nút primary + tối đa 2 nút phụ (DESIGN-SYSTEM §10.1). */
  actions?: React.ReactNode;
  /** Breadcrumb chỉ hiện trên desktop. */
  breadcrumb?: Crumb[];
  /** Tabs hoặc nội dung phụ dưới tiêu đề. */
  children?: React.ReactNode;
  className?: string;
};

/** Đầu trang thống nhất cho mọi màn trong app shell (F-85). */
export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
  children,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn("flex flex-col gap-4 pb-6", className)}>
      {breadcrumb && breadcrumb.length > 0 ? (
        <nav aria-label="Đường dẫn" className="hidden md:block">
          <ol className="flex flex-wrap items-center gap-1 text-sm text-ink-subtle">
            {breadcrumb.map((c, i) => (
              <li key={`${c.label}-${i}`} className="flex items-center gap-1">
                {i > 0 ? <ChevronRight aria-hidden className="size-3.5" /> : null}
                {c.href && i < breadcrumb.length - 1 ? (
                  <Link
                    href={c.href}
                    className="rounded-sm underline-offset-4 hover:text-ink hover:underline"
                  >
                    {c.label}
                  </Link>
                ) : (
                  <span aria-current={i === breadcrumb.length - 1 ? "page" : undefined}>{c.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[1.625rem] leading-[2.125rem] font-bold text-balance md:text-[1.875rem] md:leading-[2.375rem]">
            {title}
          </h1>
          {description ? <p className="mt-1.5 max-w-prose text-ink-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </header>
  );
}
