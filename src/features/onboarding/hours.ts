import { WEEKDAYS, weekdayLabel, type OrgKind } from "./options";

/**
 * Giờ mở cửa (cửa hàng) / giờ nhận hàng (tổ chức) cho wizard — thuần, không IO, có unit test.
 * Mô hình UI: mỗi thứ một khung giờ; `closesNextDay` = đóng sau nửa đêm (DATA-MODEL §2.1 `site_hours`).
 * Kiểm tra chồng lấn giống RPC `set_site_hours` (kể cả khung qua đêm và vòng Thứ Bảy → Chủ nhật).
 */

export type DayHours = {
  dow: number;
  open: boolean;
  opens: string;
  closes: string;
  closesNextDay: boolean;
};

export type HoursValue = { alwaysOpen: boolean; days: DayHours[] };

/** Dòng gửi lên `set_site_hours` / đọc từ `site_hours`. */
export type HoursRow = { dow: number; opens: string; closes: string; closes_next_day: boolean };

export type HoursErrors = { form?: string; days: Partial<Record<number, string>> };

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY = 24 * 60;
const WEEK = 7 * DAY;

export const HOURS_MESSAGES = {
  format: "Vui lòng nhập giờ theo dạng HH:mm, ví dụ 07:30.",
  order: "Giờ kết thúc phải sau giờ bắt đầu, hoặc chọn “Qua nửa đêm”.",
  overnight: "Khi qua nửa đêm, giờ kết thúc phải sớm hơn giờ bắt đầu (ví dụ 18:00 → 02:00).",
  noDay: "Chọn ít nhất một ngày, hoặc chọn mở cả ngày, mọi ngày (24/7).",
  overlap: (day: string, other: string) => `Khung giờ ${day} chồng lên khung giờ ${other}.`,
} as const;

const DEFAULT_TIMES: Record<OrgKind, { opens: string; closes: string }> = {
  store: { opens: "07:00", closes: "21:00" },
  charity: { opens: "08:00", closes: "17:00" },
};

export function defaultHours(kind: OrgKind): HoursValue {
  const t = DEFAULT_TIMES[kind];
  return {
    alwaysOpen: false,
    days: WEEKDAYS.map(({ dow }) => ({
      dow,
      open: true,
      opens: t.opens,
      closes: t.closes,
      closesNextDay: false,
    })),
  };
}

/** "07:00:00" → "07:00". */
export function toHHMM(t: string): string {
  return t.slice(0, 5);
}

/**
 * Dựng giá trị editor từ DB. Điểm đã có mà không có dòng nào = mở 24/7 (DATA-MODEL §2.1);
 * điểm chưa tạo ⇒ lịch mặc định. Nhiều khung trong một ngày (không tạo từ wizard) ⇒ lấy khung sớm nhất.
 */
export function hoursFromRows(rows: readonly HoursRow[], siteExists: boolean, kind: OrgKind): HoursValue {
  const base = defaultHours(kind);
  if (rows.length === 0) return siteExists ? { ...base, alwaysOpen: true } : base;
  return {
    alwaysOpen: false,
    days: base.days.map((d) => {
      const first = rows
        .filter((r) => r.dow === d.dow)
        .sort((a, b) => toHHMM(a.opens).localeCompare(toHHMM(b.opens)))[0];
      return first
        ? {
            dow: d.dow,
            open: true,
            opens: toHHMM(first.opens),
            closes: toHHMM(first.closes),
            closesNextDay: first.closes_next_day,
          }
        : { ...d, open: false };
    }),
  };
}

/** Giá trị gửi `set_site_hours`: `[]` = 24/7. */
export function hoursToRows(v: HoursValue): HoursRow[] {
  if (v.alwaysOpen) return [];
  return v.days
    .filter((d) => d.open)
    .map((d) => ({ dow: d.dow, opens: d.opens, closes: d.closes, closes_next_day: d.closesNextDay }));
}

function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h! * 60 + m!;
}

/** Khoảng [bắt đầu, kết thúc) tính theo phút trong tuần (Chủ nhật 00:00 = 0). */
function interval(d: DayHours): [number, number] {
  const s = d.dow * DAY + toMinutes(d.opens);
  const e = d.dow * DAY + toMinutes(d.closes) + (d.closesNextDay ? DAY : 0);
  return [s, e];
}

function overlaps(a: [number, number], b: [number, number]): boolean {
  return a[0] < b[1] && b[0] < a[1];
}

/** Lỗi theo từng thứ (key = dow) hoặc lỗi chung; `null` khi hợp lệ. */
export function validateHours(v: HoursValue): HoursErrors | null {
  if (v.alwaysOpen) return null;
  const errors: HoursErrors = { days: {} };
  const open = v.days.filter((d) => d.open);
  if (open.length === 0) errors.form = HOURS_MESSAGES.noDay;

  const valid: DayHours[] = [];
  for (const d of open) {
    if (!TIME_RE.test(d.opens) || !TIME_RE.test(d.closes)) {
      errors.days[d.dow] = HOURS_MESSAGES.format;
      continue;
    }
    const o = toMinutes(d.opens);
    const c = toMinutes(d.closes);
    if (!d.closesNextDay && c <= o) {
      errors.days[d.dow] = HOURS_MESSAGES.order;
      continue;
    }
    if (d.closesNextDay && c > o) {
      errors.days[d.dow] = HOURS_MESSAGES.overnight;
      continue;
    }
    valid.push(d);
  }

  // Chồng lấn: so cả bản dời một tuần để khung qua đêm Thứ Bảy va với sáng Chủ nhật
  for (let i = 0; i < valid.length; i++) {
    for (let j = i + 1; j < valid.length; j++) {
      const a = interval(valid[i]!);
      const b = interval(valid[j]!);
      const shiftedA: [number, number] = [a[0] + WEEK, a[1] + WEEK];
      const shiftedB: [number, number] = [b[0] + WEEK, b[1] + WEEK];
      if (overlaps(a, b) || overlaps(shiftedA, b) || overlaps(a, shiftedB)) {
        // Báo lỗi ở ngày bị khung qua đêm của ngày kia đè lên
        const [victim, culprit] = valid[i]!.closesNextDay ? [valid[j]!, valid[i]!] : [valid[i]!, valid[j]!];
        errors.days[victim.dow] ??= HOURS_MESSAGES.overlap(
          weekdayLabel(victim.dow),
          weekdayLabel(culprit.dow),
        );
      }
    }
  }

  return errors.form || Object.keys(errors.days).length > 0 ? errors : null;
}

function rangeText(d: DayHours): string {
  return `${d.opens}–${d.closes}${d.closesNextDay ? " (hôm sau)" : ""}`;
}

/**
 * Tóm tắt cho bước xem lại, gộp các ngày liền nhau cùng giờ:
 * ["Thứ Hai – Thứ Sáu: 07:00–21:00", "Thứ Bảy: 08:00–02:00 (hôm sau)", "Chủ nhật: nghỉ"].
 */
export function summarizeHours(v: HoursValue): string[] {
  if (v.alwaysOpen) return ["Mở cả ngày, mọi ngày (24/7)"];
  const groups: { from: DayHours; to: DayHours; text: string }[] = [];
  for (const d of v.days) {
    const text = d.open ? rangeText(d) : "nghỉ";
    const last = groups.at(-1);
    if (last && last.text === text) last.to = d;
    else groups.push({ from: d, to: d, text });
  }
  return groups.map((g) =>
    g.from.dow === g.to.dow
      ? `${weekdayLabel(g.from.dow)}: ${g.text}`
      : `${weekdayLabel(g.from.dow)} – ${weekdayLabel(g.to.dow)}: ${g.text}`,
  );
}
