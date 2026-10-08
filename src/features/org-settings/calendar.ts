/**
 * Lịch ngày nghỉ (`site_closures.closed_on` — ngày địa phương Asia/Ho_Chi_Minh). Thuần, không IO, có unit test.
 * Ngày luôn ở dạng chuỗi "YYYY-MM-DD" và tính bằng lịch UTC (không phụ thuộc múi giờ máy chạy):
 * "hôm nay" do server tính theo giờ Việt Nam rồi truyền xuống.
 */

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type YearMonth = { year: number; month: number }; // month 1–12

const WEEKDAY_NAMES = ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"] as const;

/** Tiêu đề cột lịch, tuần bắt đầu Thứ Hai. */
export const WEEK_HEADER = [
  { short: "T2", long: "Thứ Hai" },
  { short: "T3", long: "Thứ Ba" },
  { short: "T4", long: "Thứ Tư" },
  { short: "T5", long: "Thứ Năm" },
  { short: "T6", long: "Thứ Sáu" },
  { short: "T7", long: "Thứ Bảy" },
  { short: "CN", long: "Chủ nhật" },
] as const;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toUtc(iso: string): Date | null {
  const m = ISO_RE.exec(iso);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === iso ? d : null;
}

function fromUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Chuỗi "YYYY-MM-DD" có phải ngày có thật. */
export function isIsoDate(value: string): boolean {
  return toUtc(value) !== null;
}

export function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function addDays(iso: string, days: number): string {
  const d = toUtc(iso);
  if (!d) throw new Error(`Ngày không hợp lệ: ${iso}`);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

export function yearMonthOf(iso: string): YearMonth {
  return { year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)) };
}

export function addMonths(ym: YearMonth, n: number): YearMonth {
  const index = ym.year * 12 + (ym.month - 1) + n;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** So sánh tháng: âm/0/dương. */
export function compareMonths(a: YearMonth, b: YearMonth): number {
  return a.year * 12 + a.month - (b.year * 12 + b.month);
}

function daysInMonth(ym: YearMonth): number {
  return new Date(Date.UTC(ym.year, ym.month, 0)).getUTCDate();
}

/** Thứ trong tuần kiểu `extract(dow)`: 0 = Chủ nhật. */
export function dayOfWeek(iso: string): number {
  const d = toUtc(iso);
  if (!d) throw new Error(`Ngày không hợp lệ: ${iso}`);
  return d.getUTCDay();
}

/** Lưới tháng theo tuần (Thứ Hai → Chủ nhật); ô ngoài tháng là `null`. */
export function monthGrid(ym: YearMonth): (string | null)[][] {
  const first = isoDate(ym.year, ym.month, 1);
  const lead = (dayOfWeek(first) + 6) % 7; // số ô trống trước ngày 1 (tuần bắt đầu Thứ Hai)
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= daysInMonth(ym); day++) cells.push(isoDate(ym.year, ym.month, day));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** "Tháng 11/2026". */
export function monthLabel(ym: YearMonth): string {
  return `Tháng ${ym.month}/${ym.year}`;
}

/** "Thứ Sáu, 20/11/2026" (DESIGN-SYSTEM §16.4 "Ngày + thứ"). */
export function formatDayLabel(iso: string): string {
  const name = WEEKDAY_NAMES[dayOfWeek(iso)]!;
  return `${name}, ${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/** "20/11/2026". */
export function formatShortDate(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/** Số tháng tối đa có thể khai ngày nghỉ trước (khớp kiểm tra phía server). */
export const CLOSURE_MAX_MONTHS_AHEAD = 12;

/** Ngày cuối cùng được phép khai ngày nghỉ: hôm nay + 12 tháng (trừ 1 ngày) — vd. 08/10/2026 → 07/10/2027. */
export function lastClosureDate(today: string): string {
  const ym = addMonths(yearMonthOf(today), CLOSURE_MAX_MONTHS_AHEAD);
  const day = Math.min(Number(today.slice(8, 10)), daysInMonth(ym));
  return addDays(isoDate(ym.year, ym.month, day), -1);
}

/** Ngày nghỉ hợp lệ để thêm: có thật, từ hôm nay tới hết 12 tháng tới. */
export function isClosureDateAllowed(iso: string, today: string): boolean {
  return isIsoDate(iso) && iso >= today && iso <= lastClosureDate(today);
}
