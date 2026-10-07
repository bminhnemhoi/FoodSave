"use client";

import { CopyCheck, Moon } from "lucide-react";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import type { DayHours, HoursErrors, HoursValue } from "../../hours";
import { weekdayLabel } from "../../options";
import { FieldErrorText } from "../fields";

/**
 * Bảng giờ theo thứ (P1-06): mỗi ngày một khung, hỗ trợ "Qua nửa đêm" (`closes_next_day`), chế độ 24/7.
 * Giờ hiểu theo giờ Việt Nam (Asia/Ho_Chi_Minh).
 */
export function HoursEditor({
  value,
  onChange,
  errors,
  openLabel,
}: {
  value: HoursValue;
  onChange: (next: HoursValue) => void;
  errors: HoursErrors | null;
  /** "Mở cửa" (cửa hàng) / "Nhận hàng" (tổ chức). */
  openLabel: string;
}) {
  const uid = useId();

  function updateDay(dow: number, patch: Partial<DayHours>) {
    onChange({ ...value, days: value.days.map((d) => (d.dow === dow ? { ...d, ...patch } : d)) });
  }

  function copyFirstToAll() {
    const first = value.days.find((d) => d.open) ?? value.days[0]!;
    onChange({
      ...value,
      days: value.days.map((d) => ({
        ...d,
        open: true,
        opens: first.opens,
        closes: first.closes,
        closesNextDay: first.closesNextDay,
      })),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Checkbox
          id={`${uid}-always`}
          checked={value.alwaysOpen}
          onCheckedChange={(v) => onChange({ ...value, alwaysOpen: v === true })}
        />
        <Label htmlFor={`${uid}-always`} className="min-h-11 font-normal text-ink sm:min-h-0">
          Mở cả ngày, mọi ngày (24/7)
        </Label>
      </div>

      {value.alwaysOpen ? (
        <p className="text-sm text-ink-muted">
          FoodSave coi điểm này lúc nào cũng {openLabel.toLowerCase()} được. Bỏ chọn để khai giờ theo từng
          ngày.
        </p>
      ) : (
        <>
          <ul className="flex flex-col divide-y rounded-lg border bg-surface">
            {value.days.map((d) => {
              const day = weekdayLabel(d.dow);
              const error = errors?.days[d.dow];
              const errId = `${uid}-day-${d.dow}`;
              return (
                <li key={d.dow} className="flex flex-col gap-2 px-3 py-3 sm:px-4">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 sm:grid-cols-[8rem_auto_minmax(0,1fr)]">
                    <div className="flex items-center gap-3">
                      <Checkbox
                        id={`${uid}-open-${d.dow}`}
                        checked={d.open}
                        onCheckedChange={(v) => updateDay(d.dow, { open: v === true })}
                        aria-label={`${day}: ${openLabel.toLowerCase()}`}
                      />
                      <Label htmlFor={`${uid}-open-${d.dow}`} className="min-h-11 font-medium sm:min-h-0">
                        {day}
                      </Label>
                    </div>
                    {d.open ? (
                      <>
                        <div className="order-3 col-span-2 flex items-center gap-2 sm:order-none sm:col-span-1">
                          <Input
                            type="time"
                            value={d.opens}
                            onChange={(e) => updateDay(d.dow, { opens: e.target.value })}
                            aria-label={`${day}: giờ bắt đầu`}
                            aria-invalid={error ? true : undefined}
                            aria-describedby={error ? `${errId}-error` : undefined}
                            className="min-w-0 flex-1 tabular-nums sm:w-36 sm:flex-none"
                          />
                          <span aria-hidden className="text-ink-subtle">
                            –
                          </span>
                          <Input
                            type="time"
                            value={d.closes}
                            onChange={(e) => updateDay(d.dow, { closes: e.target.value })}
                            aria-label={`${day}: giờ kết thúc`}
                            aria-invalid={error ? true : undefined}
                            aria-describedby={error ? `${errId}-error` : undefined}
                            className="min-w-0 flex-1 tabular-nums sm:w-36 sm:flex-none"
                          />
                        </div>
                        <div className="flex items-center gap-2 justify-self-end sm:justify-self-start">
                          <Checkbox
                            id={`${uid}-night-${d.dow}`}
                            checked={d.closesNextDay}
                            onCheckedChange={(v) => updateDay(d.dow, { closesNextDay: v === true })}
                            aria-label={`${day}: qua nửa đêm`}
                          />
                          <Label
                            htmlFor={`${uid}-night-${d.dow}`}
                            className="min-h-11 font-normal text-ink-muted sm:min-h-0"
                          >
                            <Moon aria-hidden className="size-4" />
                            Qua nửa đêm
                          </Label>
                        </div>
                      </>
                    ) : (
                      <span className="text-sm text-ink-subtle sm:col-span-2">Nghỉ</span>
                    )}
                  </div>
                  {error ? <FieldErrorText id={errId}>{error}</FieldErrorText> : null}
                </li>
              );
            })}
          </ul>
          {errors?.form ? <FieldErrorText id={`${uid}-form`}>{errors.form}</FieldErrorText> : null}
          <div>
            <Button type="button" variant="outline" className={cn("min-h-11")} onClick={copyFirstToAll}>
              <CopyCheck aria-hidden />
              Dùng giờ ngày đầu cho cả tuần
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
