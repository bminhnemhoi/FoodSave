/**
 * Ngày giờ của form lô tặng theo giờ Việt Nam (Asia/Ho_Chi_Minh, UTC+7, không có giờ mùa hè) — thuần,
 * có unit test. Client không tự đổi múi giờ: ngày "YYYY-MM-DD" + giờ "HH:mm" luôn được hiểu là giờ VN và
 * gửi lên RPC dạng ISO có offset `+07:00` (DATA-MODEL §4.3).
 */

export const VN_OFFSET = "+07:00";
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const WEEKDAY = ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"] as const;

const pad = (n: number) => String(n).padStart(2, "0");

/** Dịch thời điểm sang "đồng hồ VN" (đọc bằng getUTC*). */
function vnClock(d: Date): Date {
  return new Date(d.getTime() + VN_OFFSET_MS);
}

/** "YYYY-MM-DD" theo giờ VN. */
export function vnDateKey(d: Date): string {
  const c = vnClock(d);
  return `${c.getUTCFullYear()}-${pad(c.getUTCMonth() + 1)}-${pad(c.getUTCDate())}`;
}

/** "HH:mm" (24 giờ) theo giờ VN. */
export function vnTime(d: Date): string {
  const c = vnClock(d);
  return `${pad(c.getUTCHours())}:${pad(c.getUTCMinutes())}`;
}

export function isDateKey(v: string): boolean {
  if (!DATE_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export function isTime24(v: string): boolean {
  return TIME_RE.test(v);
}

/** ISO có offset VN: "2026-10-08T21:00:00+07:00". */
export function vnIso(date: string, time: string): string {
  return `${date}T${time}:00${VN_OFFSET}`;
}

/** Ngày + giờ VN ⇒ Date; sai định dạng ⇒ null. */
export function parseVnDateTime(date: string, time: string): Date | null {
  if (!isDateKey(date) || !isTime24(time)) return null;
  return new Date(vnIso(date, time));
}

/** Cộng n ngày vào "YYYY-MM-DD". */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Làm tròn lên tới mốc `stepMinutes` kế tiếp (đã đúng mốc thì giữ nguyên, bỏ giây). */
export function roundUpToStep(d: Date, stepMinutes: number): Date {
  const step = stepMinutes * 60_000;
  return new Date(Math.ceil(d.getTime() / step) * step);
}

/**
 * `tstzrange` do PostgREST trả về, ví dụ `["2026-10-08 10:00:00+00","2026-10-08 12:00:00+00")`.
 * Trả mốc đầu/cuối; chuỗi lạ ⇒ null.
 */
export function parseTstzRange(text: string | null | undefined): { start: Date; end: Date } | null {
  if (!text) return null;
  const m = /^[[(]"?([^",]+)"?,"?([^",]+)"?[\])]$/.exec(text.trim());
  if (!m) return null;
  const norm = (s: string) => {
    // "2026-10-08 10:00:00+00" ⇒ "2026-10-08T10:00:00+00:00"
    let v = s.trim().replace(" ", "T");
    if (/[+-]\d{2}$/.test(v)) v = `${v}:00`;
    return new Date(v);
  };
  const start = norm(m[1]!);
  const end = norm(m[2]!);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return { start, end };
}

/**
 * Thời điểm tuyệt đối cho hạn (DESIGN-SYSTEM §12.8): "21:00 hôm nay", "08:30 ngày mai",
 * "23:59 hôm qua", "08:30 Thứ Bảy, 15/11" (khác năm thì thêm năm).
 */
export function formatDeadline(at: Date, now: Date = new Date()): string {
  const time = vnTime(at);
  const day = vnDateKey(at);
  const today = vnDateKey(now);
  if (day === today) return `${time} hôm nay`;
  if (day === addDays(today, 1)) return `${time} ngày mai`;
  if (day === addDays(today, -1)) return `${time} hôm qua`;
  const c = vnClock(at);
  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  const date = `${pad(c.getUTCDate())}/${pad(c.getUTCMonth() + 1)}${sameYear ? "" : `/${c.getUTCFullYear()}`}`;
  return `${time} ${WEEKDAY[c.getUTCDay()]}, ${date}`;
}

/** Khung giờ: "17:00–21:00 hôm nay" (cùng ngày) hoặc "22:00 hôm nay – 01:00 ngày mai". */
export function formatWindow(start: Date, end: Date, now: Date = new Date()): string {
  if (vnDateKey(start) === vnDateKey(end)) {
    const tail = formatDeadline(end, now);
    return `${vnTime(start)}–${tail}`;
  }
  return `${formatDeadline(start, now)} – ${formatDeadline(end, now)}`;
}
