/**
 * Trình bày thời gian cho cổng Tổ chức (DESIGN-SYSTEM §12.8, §16.4): giờ 24h theo Asia/Ho_Chi_Minh,
 * "21:00 hôm nay", "08:30 thứ Bảy, 15/11", khung giờ lấy "17:00–21:00 hôm nay", "~14 phút".
 * Thuần, không IO; server (UTC) và client cho cùng kết quả.
 */

const VN_TZ = "Asia/Ho_Chi_Minh";

const parts = new Intl.DateTimeFormat("en-GB", {
  timeZone: VN_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
  hourCycle: "h23",
});

const WEEKDAY_VI: Record<string, string> = {
  Mon: "thứ Hai",
  Tue: "thứ Ba",
  Wed: "thứ Tư",
  Thu: "thứ Năm",
  Fri: "thứ Sáu",
  Sat: "thứ Bảy",
  Sun: "Chủ nhật",
};

type VnParts = { day: string; month: string; year: string; time: string; weekday: string; key: string };

function vn(d: Date): VnParts {
  const p = Object.fromEntries(parts.formatToParts(d).map((x) => [x.type, x.value]));
  return {
    day: p.day!,
    month: p.month!,
    year: p.year!,
    time: `${p.hour}:${p.minute}`,
    weekday: WEEKDAY_VI[p.weekday!] ?? "",
    key: `${p.year}-${p.month}-${p.day}`,
  };
}

function toDate(value: string | Date): Date | null {
  const d = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "21:00" theo giờ Việt Nam. */
export function formatClock(value: string | Date): string {
  const d = toDate(value);
  return d ? vn(d).time : "—";
}

/** Nhãn ngày tương đối: "hôm nay", "ngày mai", "hôm qua", hoặc "thứ Bảy, 15/11" (thêm năm nếu khác năm). */
export function formatDayLabel(value: string | Date, now: Date = new Date()): string {
  const d = toDate(value);
  if (!d) return "—";
  const that = vn(d);
  const DAY = 86_400_000;
  if (that.key === vn(now).key) return "hôm nay";
  if (that.key === vn(new Date(now.getTime() + DAY)).key) return "ngày mai";
  if (that.key === vn(new Date(now.getTime() - DAY)).key) return "hôm qua";
  const base = `${that.weekday}, ${that.day}/${that.month}`;
  return that.year === vn(now).year ? base : `${base}/${that.year}`;
}

/** "21:00 hôm nay" · "08:30 thứ Bảy, 15/11". */
export function formatDayTime(value: string | Date, now: Date = new Date()): string {
  const d = toDate(value);
  if (!d) return "—";
  return `${vn(d).time} ${formatDayLabel(d, now)}`;
}

export type TimeRange = { start: Date; end: Date };

/**
 * Đọc `tstzrange` do PostgREST trả về, ví dụ `["2026-10-08 10:00:00+00","2026-10-08 13:00:00+00")`.
 * Không đọc được hoặc vô hạn ⇒ null.
 */
export function parseTstzRange(raw: string | null | undefined): TimeRange | null {
  if (!raw) return null;
  const m = /^[[(]\s*"?([^",]*)"?\s*,\s*"?([^",]*)"?\s*[\])]$/.exec(raw.trim());
  if (!m || !m[1] || !m[2]) return null;
  const iso = (s: string) =>
    s
      .trim()
      .replace(" ", "T")
      .replace(/([+-]\d{2})$/, "$1:00");
  const start = new Date(iso(m[1]));
  const end = new Date(iso(m[2]));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return { start, end };
}

/** Khung giờ lấy: "17:00–21:00 hôm nay" (cùng ngày) hoặc "22:00 hôm nay – 02:00 ngày mai". */
export function formatWindow(range: TimeRange | null, now: Date = new Date()): string {
  if (!range) return "—";
  const a = vn(range.start);
  const b = vn(range.end);
  if (a.key === b.key) return `${a.time}–${b.time} ${formatDayLabel(range.start, now)}`;
  return `${formatDayTime(range.start, now)} – ${formatDayTime(range.end, now)}`;
}

/** Thời lượng: "14 phút", "1 giờ 20 phút", "2 giờ". */
export function formatMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) return "—";
  const total = Math.round(minutes);
  if (total < 60) return `${total} phút`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h} giờ ${m} phút` : `${h} giờ`;
}

/** Bao các khung giờ (nhiều lô tại một điểm dừng): từ mốc sớm nhất tới mốc muộn nhất. */
export function spanRanges(ranges: readonly (TimeRange | null)[]): TimeRange | null {
  const valid = ranges.filter((r): r is TimeRange => r !== null);
  if (valid.length === 0) return null;
  return {
    start: new Date(Math.min(...valid.map((r) => r.start.getTime()))),
    end: new Date(Math.max(...valid.map((r) => r.end.getTime()))),
  };
}

/** Mốc đầu tháng hiện tại theo giờ Việt Nam (ISO, có offset) — cho KPI "tháng này". */
export function startOfVnMonth(now: Date = new Date()): string {
  const p = vn(now);
  return `${p.year}-${p.month}-01T00:00:00+07:00`;
}

/** "tháng 10/2026". */
export function vnMonthLabel(now: Date = new Date()): string {
  const p = vn(now);
  return `tháng ${Number(p.month)}/${p.year}`;
}
