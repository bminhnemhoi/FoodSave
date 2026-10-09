"use client";

import { Loader2, ShieldCheck } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { verifyRepresentativeAction } from "../actions";
import type { VerifyMethod } from "../schemas";

const METHOD_LABEL: Record<VerifyMethod, string> = {
  manual_document: "Đối chiếu giấy tờ",
  video_call: "Đối chiếu qua gọi video",
};

/**
 * Admin đối chiếu CCCD (giấy tờ hoặc gọi video — không chụp màn hình) với 4 số cuối đã khai (SECURITY-PRIVACY C6,
 * phương án thủ công của F-13). Chỉ nhập/lưu 4 số cuối; số khác với số đã khai ⇒ cảnh báo trước khi ghi đè.
 */
export function VerifyIdForm({ orgId, declaredLast4 }: { orgId: string; declaredLast4: string | null }) {
  const id = useId();
  const [value, setValue] = useState("");
  const [method, setMethod] = useState<VerifyMethod>("manual_document");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = value.trim();
    if (!/^[0-9]{4}$/.test(v)) {
      setError("Vui lòng nhập đúng 4 số cuối trên CCCD.");
      return;
    }
    if (declaredLast4 && v !== declaredLast4) {
      setError(
        `4 số cuối trên giấy tờ (${v}) khác với số đã khai (${declaredLast4}). Hãy yêu cầu bổ sung thay vì xác minh.`,
      );
      return;
    }
    setError(undefined);
    startTransition(async () => {
      const res = await verifyRepresentativeAction({ orgId, last4: v, method }).catch(() => null);
      if (res?.ok) {
        toast.success("Đã ghi nhận xác minh CCCD người đại diện.");
        setValue("");
      } else {
        setError(res?.fieldErrors?.last4 ?? res?.message ?? "Chưa lưu được. Vui lòng thử lại.");
      }
    });
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor={`${id}-last4`}>Đối chiếu 4 số cuối CCCD trên giấy tờ</FieldLabel>
        <div className="flex flex-wrap gap-2">
          <Input
            id={`${id}-last4`}
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/\D/g, "").slice(0, 4))}
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            className="w-28 tabular-nums"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : `${id}-hint`}
          />
          <Button type="submit" variant="outline" className="min-h-11 md:min-h-10" disabled={pending}>
            {pending ? <Loader2 aria-hidden className="animate-spin" /> : <ShieldCheck aria-hidden />}
            Xác nhận đã đối chiếu
          </Button>
        </div>
        {error ? (
          <FieldError id={`${id}-error`}>{error}</FieldError>
        ) : (
          <p id={`${id}-hint`} className="text-sm text-ink-subtle">
            Chỉ nhập 4 số cuối. Không chụp hay lưu ảnh CCCD, kể cả khi đối chiếu qua gọi video.
          </p>
        )}
      </Field>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-sm font-medium">Cách đối chiếu</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {(Object.keys(METHOD_LABEL) as VerifyMethod[]).map((m) => (
            <label
              key={m}
              className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm md:min-h-9"
            >
              <input
                type="radio"
                name={`${id}-method`}
                value={m}
                checked={method === m}
                onChange={() => setMethod(m)}
                className="size-4 accent-primary"
              />
              {METHOD_LABEL[m]}
            </label>
          ))}
        </div>
      </fieldset>
    </form>
  );
}
