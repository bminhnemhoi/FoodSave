"use client";

import { CalendarOff, CalendarX2, ChevronLeft, ChevronRight, Loader2, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { addClosure, removeClosure } from "../actions";
import {
  addDays,
  addMonths,
  compareMonths,
  dayOfWeek,
  formatDayLabel,
  isoDate,
  lastClosureDate,
  monthGrid,
  monthLabel,
  WEEK_HEADER,
  yearMonthOf,
  type YearMonth,
} from "../calendar";
import { CLOSURE_REASON_MAX } from "../schemas";

export type Closure = { date: string; reason: string | null };

const NETWORK_ERROR = "Không có kết nối mạng. Dữ liệu của bạn vẫn còn — hãy thử lại khi có mạng.";

/**
 * Lịch ngày nghỉ của một điểm (F-08, US-STO-05 AC2, US-CHA-34 AC3): chọn ngày trên lịch tháng
 * (bàn phím: mũi tên, Home/End, PageUp/PageDown) rồi đánh dấu nghỉ kèm ghi chú, hoặc bỏ nghỉ.
 * Ghi thẳng `site_closures` (RLS: owner/manager tổ chức đã duyệt). Ngày theo giờ Việt Nam; chỉ từ hôm
 * nay tới 12 tháng tới. Danh sách bên dưới là cách thay thế không cần lịch.
 */
export function ClosuresCalendar({
  siteId,
  siteName,
  closures,
  today,
  canEdit,
}: {
  siteId: string;
  siteName: string;
  closures: Closure[];
  today: string;
  canEdit: boolean;
}) {
  const uid = useId();
  const closed = new Map(closures.map((c) => [c.date, c.reason]));
  const last = lastClosureDate(today);
  const minMonth = yearMonthOf(today);
  const maxMonth = yearMonthOf(last);

  const [month, setMonth] = useState<YearMonth>(minMonth);
  const [selected, setSelected] = useState<string | null>(null);
  const [focusDate, setFocusDate] = useState<string>(today);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [busyDate, setBusyDate] = useState<string | null>(null);
  const gridRef = useRef<HTMLTableElement>(null);
  const focusAfterRender = useRef(false);

  const inRange = (d: string) => d >= today && d <= last;
  // Ô được Tab vào: ngày đang focus nếu thuộc tháng đang xem, nếu không thì ngày hợp lệ đầu tiên của tháng
  const firstOfMonth = isoDate(month.year, month.month, 1);
  const tabbable =
    compareMonths(yearMonthOf(focusDate), month) === 0
      ? focusDate
      : firstOfMonth < today
        ? today
        : firstOfMonth;

  useEffect(() => {
    if (!focusAfterRender.current) return;
    focusAfterRender.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`button[data-date="${focusDate}"]`)?.focus();
  }, [focusDate, month]);

  function moveFocus(target: string) {
    const clamped = target < today ? today : target > last ? last : target;
    setFocusDate(clamped);
    const ym = yearMonthOf(clamped);
    if (compareMonths(ym, month) !== 0) setMonth(ym);
    focusAfterRender.current = true;
  }

  function onGridKey(e: React.KeyboardEvent<HTMLButtonElement>, date: string) {
    const col = (dayOfWeek(date) + 6) % 7; // 0 = Thứ Hai
    const moves: Record<string, () => string> = {
      ArrowLeft: () => addDays(date, -1),
      ArrowRight: () => addDays(date, 1),
      ArrowUp: () => addDays(date, -7),
      ArrowDown: () => addDays(date, 7),
      Home: () => addDays(date, -col),
      End: () => addDays(date, 6 - col),
      PageUp: () => shiftMonth(date, -1),
      PageDown: () => shiftMonth(date, 1),
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    moveFocus(move());
  }

  function shiftMonth(date: string, n: number): string {
    const ym = addMonths(yearMonthOf(date), n);
    const day = Number(date.slice(8, 10));
    const lastDay = new Date(Date.UTC(ym.year, ym.month, 0)).getUTCDate();
    return isoDate(ym.year, ym.month, Math.min(day, lastDay));
  }

  function select(date: string) {
    setSelected(date);
    setFocusDate(date);
    setNote(closed.get(date) ?? "");
    setError(null);
  }

  function mark(date: string) {
    setError(null);
    setBusyDate(date);
    startTransition(async () => {
      try {
        const res = await addClosure({ siteId, date, reason: note });
        if (!res.ok) {
          setError(res.error.fieldErrors?.reason ?? res.error.fieldErrors?.date ?? res.error.message);
          return;
        }
        toast.success(`Đã đánh dấu nghỉ ${formatDayLabel(date)}.`);
      } catch {
        setError(NETWORK_ERROR);
      } finally {
        setBusyDate(null);
      }
    });
  }

  function unmark(date: string) {
    setError(null);
    setBusyDate(date);
    startTransition(async () => {
      try {
        const res = await removeClosure({ siteId, date });
        if (!res.ok) {
          setError(res.error.message);
          return;
        }
        toast.success(`Đã bỏ ngày nghỉ ${formatDayLabel(date)}.`);
        if (selected === date) setNote("");
      } catch {
        setError(NETWORK_ERROR);
      } finally {
        setBusyDate(null);
      }
    });
  }

  const upcoming = [...closures].sort((a, b) => a.date.localeCompare(b.date));
  const titleId = `${uid}-month`;

  const list = (
    <section aria-labelledby={`${uid}-list`} className="flex flex-col gap-2">
      <h4 id={`${uid}-list`} className="text-sm font-semibold">
        Ngày nghỉ sắp tới ({upcoming.length})
      </h4>
      {upcoming.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <CalendarOff aria-hidden className="size-4 shrink-0" />
          Chưa có ngày nghỉ nào sắp tới{canEdit ? " — chọn một ngày trên lịch để thêm." : "."}
        </p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border bg-surface">
          {upcoming.map((c) => (
            <li key={c.date} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="flex min-w-0 flex-col">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <CalendarX2 aria-hidden className="size-4 shrink-0 text-danger" />
                  {formatDayLabel(c.date)}
                </span>
                {c.reason ? <span className="text-sm break-words text-ink-muted">{c.reason}</span> : null}
              </span>
              {canEdit ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-11 shrink-0"
                  disabled={pending}
                  onClick={() => unmark(c.date)}
                  aria-label={`Bỏ ngày nghỉ ${formatDayLabel(c.date)}`}
                >
                  {busyDate === c.date ? (
                    <Loader2 aria-hidden className="animate-spin" />
                  ) : (
                    <Trash2 aria-hidden />
                  )}
                  Bỏ
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  if (!canEdit) return list;

  const weeks = monthGrid(month);
  const selectedClosed = selected ? closed.has(selected) : false;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-11"
            onClick={() => setMonth((m) => addMonths(m, -1))}
            disabled={compareMonths(month, minMonth) <= 0}
            aria-label="Tháng trước"
          >
            <ChevronLeft aria-hidden />
          </Button>
          <p id={titleId} aria-live="polite" className="font-semibold">
            {monthLabel(month)}
          </p>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-11"
            onClick={() => setMonth((m) => addMonths(m, 1))}
            disabled={compareMonths(month, maxMonth) >= 0}
            aria-label="Tháng sau"
          >
            <ChevronRight aria-hidden />
          </Button>
        </div>
        <table
          ref={gridRef}
          role="grid"
          aria-labelledby={titleId}
          aria-describedby={`${uid}-help`}
          className="w-full table-fixed border-collapse"
        >
          <thead>
            <tr>
              {WEEK_HEADER.map((h) => (
                <th
                  key={h.short}
                  scope="col"
                  abbr={h.long}
                  className="pb-1 text-xs font-medium text-ink-subtle"
                >
                  {h.short}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week, wi) => (
              <tr key={wi}>
                {week.map((date, di) => {
                  if (!date) return <td key={`e${di}`} />;
                  const isClosed = closed.has(date);
                  const isSelected = selected === date;
                  const enabled = inRange(date);
                  const reason = closed.get(date);
                  const label = `${formatDayLabel(date)}${isClosed ? `, ngày nghỉ${reason ? `: ${reason}` : ""}` : ""}${date === today ? ", hôm nay" : ""}`;
                  return (
                    <td key={date} role="gridcell" aria-selected={isSelected} className="p-0.5">
                      <button
                        type="button"
                        data-date={date}
                        tabIndex={date === tabbable ? 0 : -1}
                        disabled={!enabled}
                        aria-label={label}
                        onClick={() => select(date)}
                        onKeyDown={(e) => onGridKey(e, date)}
                        className={cn(
                          "flex h-12 w-full flex-col items-center justify-center rounded-md border text-sm tabular-nums transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40",
                          isClosed
                            ? "border-danger/40 bg-danger-soft font-semibold text-danger"
                            : "border-transparent hover:bg-bg-sunken",
                          isSelected && "ring-2 ring-primary ring-offset-1",
                          date === today &&
                            !isClosed &&
                            "font-bold text-primary underline underline-offset-4",
                        )}
                      >
                        <span aria-hidden>{Number(date.slice(8, 10))}</span>
                        {isClosed ? (
                          <span aria-hidden className="text-[0.625rem] leading-none font-medium">
                            Nghỉ
                          </span>
                        ) : null}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p id={`${uid}-help`} className="text-xs text-ink-subtle">
          Dùng phím mũi tên để di chuyển giữa các ngày, Enter để chọn. Ngày tô đỏ là ngày nghỉ của {siteName}.
        </p>
      </div>

      <div className="flex flex-col gap-5">
        <div aria-live="polite" className="flex flex-col gap-3 rounded-lg border bg-bg p-4">
          {!selected ? (
            <p className="text-sm text-ink-muted">
              Chọn một ngày trên lịch để đánh dấu nghỉ hoặc bỏ nghỉ. Ngày nghỉ được tính là đóng cửa cả ngày.
            </p>
          ) : selectedClosed ? (
            <>
              <p className="font-medium">
                {formatDayLabel(selected)} — <span className="text-danger">đang nghỉ</span>
              </p>
              <div className="flex flex-col gap-2">
                <Label htmlFor={`${uid}-note`}>Ghi chú (không bắt buộc)</Label>
                <Input
                  id={`${uid}-note`}
                  value={note}
                  maxLength={CLOSURE_REASON_MAX}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  disabled={pending}
                  onClick={() => mark(selected)}
                >
                  {busyDate === selected && pending ? <Loader2 aria-hidden className="animate-spin" /> : null}
                  Lưu ghi chú
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-11"
                  disabled={pending}
                  onClick={() => unmark(selected)}
                >
                  <Trash2 aria-hidden />
                  Bỏ ngày nghỉ
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="font-medium">{formatDayLabel(selected)}</p>
              <div className="flex flex-col gap-2">
                <Label htmlFor={`${uid}-note`}>Ghi chú (không bắt buộc)</Label>
                <Input
                  id={`${uid}-note`}
                  value={note}
                  maxLength={CLOSURE_REASON_MAX}
                  placeholder="Ví dụ: Nghỉ lễ, sửa bếp"
                  aria-describedby={`${uid}-note-hint`}
                  onChange={(e) => setNote(e.target.value)}
                />
                <p id={`${uid}-note-hint`} className="text-xs text-ink-subtle">
                  Tối đa {CLOSURE_REASON_MAX} ký tự. Ghi chú hiển thị công khai cùng lịch của điểm — không ghi
                  thông tin cá nhân.
                </p>
              </div>
              <div>
                <Button type="button" className="min-h-11" disabled={pending} onClick={() => mark(selected)}>
                  {busyDate === selected && pending ? (
                    <Loader2 aria-hidden className="animate-spin" />
                  ) : (
                    <CalendarX2 aria-hidden />
                  )}
                  Đánh dấu ngày nghỉ
                </Button>
              </div>
            </>
          )}
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
        </div>
        {list}
      </div>
    </div>
  );
}
