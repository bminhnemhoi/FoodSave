"use client";

import { CircleAlert } from "lucide-react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** aria-describedby cho ô nhập có gợi ý và/hoặc lỗi. */
export function describedBy(id: string, hint?: React.ReactNode, error?: string | null): string | undefined {
  return (
    [error ? `${id}-error` : null, hint && !error ? `${id}-hint` : null].filter(Boolean).join(" ") ||
    undefined
  );
}

export function RequiredMark({ required }: { required?: boolean }) {
  return required ? (
    <span aria-hidden className="text-danger">
      *
    </span>
  ) : (
    <span className="font-normal text-ink-subtle">(không bắt buộc)</span>
  );
}

export function FieldHint({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={`${id}-hint`} className="text-sm text-ink-subtle">
      {children}
    </p>
  );
}

export function FieldErrorText({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={`${id}-error`} className="flex items-start gap-1.5 text-sm text-danger">
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/** Khung một trường: nhãn (dấu * bắt buộc), ô nhập, gợi ý hoặc lỗi (DESIGN-SYSTEM §12.1). */
export function FormField({
  id,
  label,
  required,
  hint,
  error,
  className,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: React.ReactNode;
  error?: string | null;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)} data-invalid={error ? true : undefined}>
      <Label htmlFor={id} className="flex-wrap leading-snug">
        {label} <RequiredMark required={required} />
      </Label>
      {children}
      {error ? (
        <FieldErrorText id={id}>{error}</FieldErrorText>
      ) : hint ? (
        <FieldHint id={id}>{hint}</FieldHint>
      ) : null}
    </div>
  );
}

/** Tóm tắt lỗi đầu form khi có từ 2 lỗi (DESIGN-SYSTEM §12.1). */
export function ErrorSummary({ errors }: { errors: { id: string; message: string }[] }) {
  if (errors.length < 2) return null;
  return (
    <div role="alert" className="flex gap-3 rounded-lg border border-danger/30 bg-danger-soft p-4 text-sm">
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-danger" />
      <div className="min-w-0">
        <p className="font-semibold text-danger">Có {errors.length} mục cần sửa:</p>
        <ul className="mt-1.5 list-disc pl-5 text-ink">
          {errors.map((e) => (
            <li key={e.id}>
              <a href={`#${e.id}`} className="underline underline-offset-4">
                {e.message}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Tiêu đề nhóm trường trong một bước. */
export function Section({
  title,
  description,
  children,
  className,
  headingId,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  headingId?: string;
}) {
  return (
    <section
      aria-labelledby={headingId}
      className={cn("flex flex-col gap-5 rounded-xl border bg-surface p-4 sm:p-6", className)}
    >
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="text-lg font-semibold">
          {title}
        </h2>
        {description ? <p className="text-sm text-ink-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
