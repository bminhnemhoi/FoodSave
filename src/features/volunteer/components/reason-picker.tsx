"use client";

import { CircleAlert } from "lucide-react";
import { useId } from "react";

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { OTHER_REASON } from "../labels";

export type ReasonValue = { choice: string; other: string };

export const EMPTY_REASON: ReasonValue = { choice: "", other: "" };

/** Lý do cuối cùng gửi RPC: lựa chọn có sẵn, hoặc chữ ghi ở "Khác" (rỗng ⇒ ""). */
export function resolveReason(v: ReasonValue): string {
  if (v.choice === OTHER_REASON) return v.other.trim();
  return v.choice;
}

type ReasonPickerProps = {
  legend: string;
  options: readonly string[];
  value: ReasonValue;
  onChange: (v: ReasonValue) => void;
  /** Giới hạn ký tự của RPC (200 hoặc 300). */
  maxLength: number;
  error?: string | null;
  disabled?: boolean;
};

/**
 * Chọn lý do (DESIGN-SYSTEM §12.5: select + ô "Khác"): ô chọn cao ≥ 48 px để bấm một tay ngoài đường, "Khác" mở
 * ô ghi rõ. Lỗi gắn với nhóm qua `aria-describedby`.
 */
export function ReasonPicker({
  legend,
  options,
  value,
  onChange,
  maxLength,
  error,
  disabled,
}: ReasonPickerProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const otherId = `${id}-other`;
  const all = [...options, OTHER_REASON];
  return (
    <fieldset className="flex flex-col gap-3" aria-describedby={error ? errorId : undefined}>
      <legend className="mb-1 font-medium text-ink">{legend}</legend>
      <RadioGroup
        value={value.choice}
        onValueChange={(choice) => onChange({ ...value, choice })}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        className="grid gap-2"
      >
        {all.map((o) => (
          <label
            key={o}
            className={cn(
              "flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border bg-surface px-3 py-2.5 text-ink",
              "has-[[aria-checked=true]]:border-role-accent has-[[aria-checked=true]]:bg-role-accent-soft",
            )}
          >
            <RadioGroupItem value={o} />
            <span>{o}</span>
          </label>
        ))}
      </RadioGroup>
      {value.choice === OTHER_REASON ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={otherId} className="text-sm font-medium text-ink">
            Ghi rõ lý do
          </label>
          <Textarea
            id={otherId}
            rows={2}
            maxLength={maxLength}
            value={value.other}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, other: e.target.value })}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className="min-h-20 bg-surface text-base"
          />
          <p className="text-right text-xs text-ink-subtle tabular-nums">
            {value.other.length}/{maxLength}
          </p>
        </div>
      ) : null}
      {error ? (
        <p id={errorId} className="flex items-start gap-1.5 text-sm text-danger">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
    </fieldset>
  );
}
