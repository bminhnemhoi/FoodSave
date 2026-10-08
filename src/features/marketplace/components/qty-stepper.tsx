"use client";

import { Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UNIT_LABEL, type UnitCode } from "@/features/catalog/labels";

import { isContinuous, maxRequestable, parseQty, qtyInputValue, stepQty } from "../qty";

type QtyStepperProps = {
  id: string;
  value: string;
  onChange: (raw: string) => void;
  unit: UnitCode;
  max: number;
  invalid: boolean;
  describedBy?: string;
  disabled?: boolean;
};

/**
 * Ô số lượng có nút −/+ 44 px (DESIGN-SYSTEM §11.2 QuantityInput): đơn vị đếm chỉ số nguyên, kg/lít bước 0,5.
 * Người dùng vẫn gõ được trực tiếp (bàn phím số trên điện thoại); kiểm lỗi hiển thị bên dưới.
 */
export function QtyStepper({
  id,
  value,
  onChange,
  unit,
  max,
  invalid,
  describedBy,
  disabled,
}: QtyStepperProps) {
  const current = parseQty(value);
  const upper = maxRequestable(max, unit);
  const unitLabel = UNIT_LABEL[unit];

  return (
    <div className="flex items-stretch gap-2">
      <Button
        type="button"
        variant="outline"
        size="icon-lg"
        aria-label={`Bớt 1 bước (${unitLabel})`}
        aria-controls={id}
        disabled={disabled || (current !== null && current <= Math.min(isContinuous(unit) ? 0.5 : 1, upper))}
        onClick={() => onChange(qtyInputValue(stepQty(current, -1, unit, max)))}
      >
        <Minus aria-hidden />
      </Button>
      <div className="relative flex-1">
        <Input
          id={id}
          inputMode={isContinuous(unit) ? "decimal" : "numeric"}
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          disabled={disabled}
          className="h-11 pr-14 text-center text-base font-semibold tabular-nums"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-ink-muted"
        >
          {unitLabel}
        </span>
      </div>
      <Button
        type="button"
        variant="outline"
        size="icon-lg"
        aria-label={`Thêm 1 bước (${unitLabel})`}
        aria-controls={id}
        disabled={disabled || (current !== null && current >= upper)}
        onClick={() => onChange(qtyInputValue(stepQty(current, 1, unit, max)))}
      >
        <Plus aria-hidden />
      </Button>
    </div>
  );
}
