import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  /** Một câu hướng dẫn bước tiếp theo — bắt buộc (DESIGN-SYSTEM §12.4). */
  description: React.ReactNode;
  /** CTA (nút/liên kết). Không có CTA thì `description` phải nói rõ việc cần làm. */
  action?: React.ReactNode;
  variant?: "page" | "section" | "inline";
  /** Mức tiêu đề — mặc định h2 (h1 thuộc PageHeader). */
  headingLevel?: 2 | 3;
  className?: string;
};

const VARIANT = {
  page: {
    box: "gap-4 rounded-xl border border-dashed bg-surface px-6 py-14",
    icon: "size-12",
    circle: "size-20",
  },
  section: {
    box: "gap-3 rounded-lg border border-dashed bg-surface px-5 py-10",
    icon: "size-10",
    circle: "size-16",
  },
  inline: { box: "gap-2 py-6", icon: "size-6", circle: "size-11" },
} as const;

/** Trạng thái rỗng: minh hoạ icon màu accent vai trò + tiêu đề + hướng dẫn + CTA (F-85). */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  variant = "page",
  headingLevel = 2,
  className,
}: EmptyStateProps) {
  const v = VARIANT[variant];
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <section className={cn("flex flex-col items-center text-center", v.box, className)}>
      <span
        className={cn("grid place-items-center rounded-full bg-role-accent-soft text-role-accent", v.circle)}
      >
        <Icon aria-hidden className={v.icon} strokeWidth={1.75} />
      </span>
      <Heading className={cn("font-semibold text-balance", variant === "inline" ? "text-base" : "text-lg")}>
        {title}
      </Heading>
      <div className="max-w-prose text-pretty text-ink-muted">{description}</div>
      {action ? <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </section>
  );
}
