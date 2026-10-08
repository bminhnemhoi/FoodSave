"use client";

import { useId, useState } from "react";

import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { FieldErrorText } from "@/features/onboarding/components/fields";

const OTHER = "__other__";

/**
 * Lý do bắt buộc cho thao tác có hệ quả (DESIGN-SYSTEM §12.5): chọn một lý do soạn sẵn hoặc "Khác" + tự
 * nhập. Trả về chuỗi lý do cuối cùng (rỗng khi chưa chọn) qua `onChange`.
 */
export function ReasonPicker({
  legend,
  presets,
  error,
  onChange,
  maxLength = 500,
}: {
  legend: string;
  presets: readonly string[];
  error?: string | null;
  onChange: (reason: string) => void;
  maxLength?: number;
}) {
  const id = useId();
  const [choice, setChoice] = useState<string>("");
  const [other, setOther] = useState("");
  const errorId = `${id}-reason`;

  return (
    <fieldset className="flex flex-col gap-2.5" aria-describedby={error ? `${errorId}-error` : undefined}>
      <legend className="mb-1 text-sm font-medium">
        {legend}{" "}
        <span aria-hidden className="text-danger">
          *
        </span>
      </legend>
      <RadioGroup
        value={choice}
        onValueChange={(v) => {
          setChoice(v);
          onChange(v === OTHER ? other.trim() : v);
        }}
        aria-invalid={error ? true : undefined}
        className="gap-2"
      >
        {[...presets, OTHER].map((p, i) => (
          <label
            key={p}
            htmlFor={`${id}-${i}`}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border bg-surface px-3 py-2 text-sm has-[[aria-checked=true]]:border-primary has-[[aria-checked=true]]:bg-primary-soft"
          >
            <RadioGroupItem id={`${id}-${i}`} value={p} />
            <span>{p === OTHER ? "Lý do khác" : p}</span>
          </label>
        ))}
      </RadioGroup>
      {choice === OTHER ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-other`}>Nhập lý do</Label>
          <Textarea
            id={`${id}-other`}
            rows={2}
            maxLength={maxLength}
            value={other}
            autoFocus
            aria-invalid={error ? true : undefined}
            onChange={(e) => {
              setOther(e.target.value);
              onChange(e.target.value.trim());
            }}
            className="min-h-16 bg-surface"
          />
        </div>
      ) : null}
      {error ? <FieldErrorText id={errorId}>{error}</FieldErrorText> : null}
    </fieldset>
  );
}
