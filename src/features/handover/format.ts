/**
 * Định dạng thời gian cho màn bàn giao (giờ 24h, Asia/Ho_Chi_Minh — DESIGN-SYSTEM §16.4) và đọc kiểu dữ
 * liệu Postgres mà PostgREST trả dạng chuỗi (timestamptz trong `detail` lỗi, tstzrange). Thuần, có test.
 */

const clockFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Ho_Chi_Minh",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const dayFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Ho_Chi_Minh",
  day: "2-digit",
  month: "2-digit",
});

/** "14:32" theo giờ Việt Nam. */
export function formatClock(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? "—" : clockFormat.format(d);
}

/** "14:00–17:00, 08/10" (khung giờ lấy hàng). */
export function formatWindow(start: Date, end: Date): string {
  return `${formatClock(start)}–${formatClock(end)}, ${dayFormat.format(start)}`;
}

/**
 * Chuỗi timestamptz của Postgres ("2026-10-08 02:15:30.123456+00", "…+07:00", ISO) ⇒ Date; sai ⇒ null.
 */
export function parsePgTimestamp(text: string | null | undefined): Date | null {
  if (!text) return null;
  let s = text.trim().replace(" ", "T");
  // "+00" / "-05" (không có phút) ⇒ "+00:00"
  s = s.replace(/([+-]\d{2})$/, "$1:00");
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** tstzrange dạng chuỗi của PostgREST: `["2026-10-08 02:00:00+00","2026-10-08 05:00:00+00")`. */
export function parseTstzRange(text: string | null | undefined): { start: Date; end: Date } | null {
  if (!text) return null;
  const m = /^[[(]"?([^",]+)"?,"?([^")\]]+)"?[)\]]$/.exec(text.trim());
  if (!m) return null;
  const start = parsePgTimestamp(m[1]);
  const end = parsePgTimestamp(m[2]);
  return start && end ? { start, end } : null;
}
