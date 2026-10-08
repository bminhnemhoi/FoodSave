"use client";

import { CircleAlert, Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { displayKg, kgFromQty } from "@/core/impact";
import { CONTINUOUS_UNITS, formatQty, UNIT_LABEL } from "@/features/catalog/labels";
import { cn } from "@/lib/utils";

import { SHORTFALL_REASON_HINT, SHORTFALL_REASON_LABEL, type ShortfallReason } from "../labels";
import { NOTE_MAX, parseQtyInput, qtyToInput, type LineDraft, type LineError, type LineSpec } from "../lines";

type LineEditorProps = {
  specs: readonly LineSpec[];
  drafts: readonly LineDraft[];
  onChange: (drafts: LineDraft[]) => void;
  errors?: Record<string, LineError>;
  /** Lỗi từ server gắn theo dòng (`fieldErrors["line:<id>"]`). */
  serverErrors?: Record<string, string>;
  allowedReasons: readonly ShortfallReason[];
  /** "Số thực giao" (cửa hàng) / "Số mang đi" (người mang hàng). */
  qtyLabel: string;
  /** Ghi chú phụ cho từng dòng (vd. đề xuất của người mang hàng). */
  lineNote?: (spec: LineSpec) => React.ReactNode;
  disabled?: boolean;
  idPrefix: string;
};

/**
 * Đối soát từng dòng (DESIGN-SYSTEM §11.2 `HandoverLineReconcile`, PRD US-STO-18): số đặt, ô số thực giao có
 * nút −/+ (44 px), lý do bắt buộc khi thiếu (kèm hệ quả), ghi chú bắt buộc khi từ chối vì chất lượng,
 * kg ước tính. Lỗi gắn `aria-describedby` vào đúng trường.
 */
export function LineEditor({
  specs,
  drafts,
  onChange,
  errors = {},
  serverErrors = {},
  allowedReasons,
  qtyLabel,
  lineNote,
  disabled = false,
  idPrefix,
}: LineEditorProps) {
  const byId = new Map(drafts.map((d) => [d.allocationId, d]));

  const update = (id: string, patch: Partial<LineDraft>) =>
    onChange(drafts.map((d) => (d.allocationId === id ? { ...d, ...patch } : d)));

  return (
    <ul className="flex flex-col gap-3">
      {specs.map((spec) => {
        const draft = byId.get(spec.allocationId);
        if (!draft) return null;
        const id = `${idPrefix}-${spec.allocationId}`;
        const err = errors[spec.allocationId] ?? {};
        const serverErr = serverErrors[`line:${spec.allocationId}`];
        const qty = parseQtyInput(draft.qty);
        const short = qty !== null && qty < spec.expectedQty;
        const step = CONTINUOUS_UNITS.has(spec.unit) ? 0.5 : 1;
        const unit = UNIT_LABEL[spec.unit];
        const setQty = (n: number) => {
          const clamped = Math.min(spec.expectedQty, Math.max(0, Math.round(n * 1000) / 1000));
          update(spec.allocationId, { qty: qtyToInput(clamped) });
        };
        const qtyErrorId = `${id}-qty-error`;
        const reasonErrorId = `${id}-reason-error`;
        const noteErrorId = `${id}-note-error`;

        return (
          <li
            key={spec.allocationId}
            className="rounded-lg border bg-surface p-4"
            data-line={spec.allocationId}
          >
            <fieldset className="flex flex-col gap-3" disabled={disabled}>
              <legend className="sr-only">{spec.title}</legend>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="font-semibold text-ink" aria-hidden>
                  {spec.title}
                </p>
                <p className="text-sm text-ink-muted tabular-nums">
                  Đã đặt{" "}
                  <span className="font-semibold text-ink">{formatQty(spec.expectedQty, spec.unit)}</span>
                </p>
              </div>
              {lineNote ? <div className="text-sm text-ink-muted">{lineNote(spec)}</div> : null}

              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-qty`}>
                  {qtyLabel} ({unit})
                </Label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-lg"
                    onClick={() => setQty((qty ?? spec.expectedQty) - step)}
                    disabled={disabled || (qty ?? 0) <= 0}
                    aria-label={`Bớt ${step} ${unit}`}
                  >
                    <Minus aria-hidden />
                  </Button>
                  <Input
                    id={`${id}-qty`}
                    inputMode={CONTINUOUS_UNITS.has(spec.unit) ? "decimal" : "numeric"}
                    autoComplete="off"
                    value={draft.qty}
                    onChange={(e) => update(spec.allocationId, { qty: e.target.value })}
                    aria-invalid={err.qty || serverErr ? true : undefined}
                    aria-describedby={err.qty || serverErr ? qtyErrorId : `${id}-kg`}
                    className="h-11 w-28 text-center text-lg font-semibold tabular-nums md:h-11 md:text-lg"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-lg"
                    onClick={() => setQty((qty ?? 0) + step)}
                    disabled={disabled || (qty ?? 0) >= spec.expectedQty}
                    aria-label={`Thêm ${step} ${unit}`}
                  >
                    <Plus aria-hidden />
                  </Button>
                  <span id={`${id}-kg`} className="text-sm text-ink-muted tabular-nums">
                    {qty !== null && qty <= spec.expectedQty
                      ? `≈ ${displayKg(kgFromQty(qty, spec.unitWeightKg)).text}`
                      : null}
                  </span>
                </div>
                {err.qty || serverErr ? (
                  <p id={qtyErrorId} className="flex items-start gap-1.5 text-sm text-danger">
                    <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                    {err.qty ?? serverErr}
                  </p>
                ) : null}
              </div>

              {short ? (
                <div className="flex flex-col gap-3 rounded-md bg-warning-soft/60 p-3">
                  <fieldset className="flex flex-col gap-2">
                    <legend className="mb-1 text-sm font-semibold text-ink">
                      Lý do thiếu{" "}
                      {formatQty(Math.round((spec.expectedQty - (qty ?? 0)) * 1000) / 1000, spec.unit)}
                    </legend>
                    <RadioGroup
                      value={draft.reason}
                      onValueChange={(v) => update(spec.allocationId, { reason: v as ShortfallReason })}
                      aria-invalid={err.reason ? true : undefined}
                      aria-describedby={err.reason ? reasonErrorId : undefined}
                      className="gap-1"
                    >
                      {allowedReasons.map((r) => (
                        <Label
                          key={r}
                          htmlFor={`${id}-reason-${r}`}
                          className={cn(
                            "flex min-h-11 cursor-pointer items-start gap-3 rounded-md border bg-surface px-3 py-2.5 font-normal",
                            draft.reason === r && "border-primary bg-primary-soft",
                          )}
                        >
                          <RadioGroupItem id={`${id}-reason-${r}`} value={r} className="mt-1" />
                          <span className="flex flex-col">
                            <span className="font-medium text-ink">{SHORTFALL_REASON_LABEL[r]}</span>
                            <span className="text-xs text-ink-muted">{SHORTFALL_REASON_HINT[r]}</span>
                          </span>
                        </Label>
                      ))}
                    </RadioGroup>
                    {err.reason ? (
                      <p id={reasonErrorId} className="flex items-start gap-1.5 text-sm text-danger">
                        <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                        {err.reason}
                      </p>
                    ) : null}
                  </fieldset>

                  {draft.reason === "quality_reject" || draft.note ? (
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`${id}-note`}>
                        Mô tả ngắn{draft.reason === "quality_reject" ? " (bắt buộc)" : " (không bắt buộc)"}
                      </Label>
                      <Textarea
                        id={`${id}-note`}
                        value={draft.note}
                        maxLength={NOTE_MAX}
                        rows={2}
                        placeholder="Ví dụ: 3 hộp sữa bị móp, phồng nắp"
                        onChange={(e) => update(spec.allocationId, { note: e.target.value })}
                        aria-invalid={err.note ? true : undefined}
                        aria-describedby={err.note ? noteErrorId : undefined}
                      />
                      {err.note ? (
                        <p id={noteErrorId} className="flex items-start gap-1.5 text-sm text-danger">
                          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                          {err.note}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </fieldset>
          </li>
        );
      })}
    </ul>
  );
}
