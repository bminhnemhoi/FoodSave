// Giờ Việt Nam và giờ mở cửa cho script seed demo (DATA-MODEL §0 "Thời gian", §4.2, §4.7).
// Asia/Ho_Chi_Minh = UTC+7, không có giờ mùa hè ⇒ dùng độ lệch cố định, không phụ thuộc múi giờ máy chạy.
// Logic khớp `public.site_close_at` / `private.is_open_at`: khoảng [mở, đóng), đóng qua đêm khi
// `closes_next_day`, không khai giờ = mở 24/7.

const VN_OFFSET_MS = 7 * 3_600_000;
const MINUTE = 60_000;
const HOUR = 3_600_000;

export { HOUR, MINUTE };

/** Thành phần lịch (giờ Việt Nam) của một thời điểm. */
export function vnParts(at) {
  const d = new Date(at.getTime() + VN_OFFSET_MS);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth(),
    day: d.getUTCDate(),
    dow: d.getUTCDay(),
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
  };
}

/** Thời điểm của ngày địa phương (year, month, day) + `minutes` phút (có thể > 1440). */
export function vnInstant(year, month, day, minutes) {
  return new Date(Date.UTC(year, month, day, 0, minutes) - VN_OFFSET_MS);
}

/** Ngày địa phương dạng YYYY-MM-DD. */
export function vnDate(at) {
  const p = vnParts(at);
  return `${p.year}-${String(p.month + 1).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** 00:00 giờ Việt Nam của ngày chứa `at`, cộng `addDays` ngày. */
export function vnMidnight(at, addDays = 0) {
  const p = vnParts(at);
  return vnInstant(p.year, p.month, p.day + addDays, 0);
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Các khoảng mở cửa quanh `at` (ngày −1 … +7, như site_close_at). `null` = mở 24/7. */
export function openIntervals(hours, at) {
  if (!hours || hours.length === 0) return null;
  const base = vnParts(at);
  const out = [];
  for (let k = -1; k <= 7; k++) {
    const day = new Date(Date.UTC(base.year, base.month, base.day + k));
    for (const h of hours) {
      if (h.dow !== day.getUTCDay()) continue;
      const y = day.getUTCFullYear();
      const m = day.getUTCMonth();
      const d = day.getUTCDate();
      out.push({
        start: vnInstant(y, m, d, toMinutes(h.opens)),
        end: vnInstant(y, m, d, toMinutes(h.closes) + (h.closes_next_day ? 1440 : 0)),
      });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/**
 * Mốc bắt đầu khung lấy hàng: `at` nếu điểm đang mở và còn ≥ `minOpenMs` trước giờ đóng, ngược lại lần
 * mở cửa kế tiếp. Trả `{ start, close }` (`close = null` khi 24/7) hoặc `null` nếu cả tuần không mở.
 */
export function pickupAnchor(hours, at, minOpenMs = 60 * MINUTE) {
  const intervals = openIntervals(hours, at);
  if (!intervals) return { start: at, close: null };
  for (const iv of intervals) {
    if (iv.end.getTime() - Math.max(at.getTime(), iv.start.getTime()) < minOpenMs) continue;
    if (iv.end > at) return { start: iv.start > at ? iv.start : at, close: iv.end };
  }
  return null;
}

/** Điểm có mở tại `at` không (không khai giờ ⇒ luôn mở). */
export function isOpenAt(hours, at) {
  const intervals = openIntervals(hours, at);
  if (!intervals) return true;
  return intervals.some((iv) => iv.start <= at && at < iv.end);
}

/** Nhãn tươi theo label_rules v1 (ADR-005) — chỉ để in tóm tắt; DB vẫn là nguồn sự thật. */
export function freshnessLabel(deadline, perishability, at) {
  const left = deadline.getTime() - at.getTime();
  if (left <= 0) return "expired";
  const [green, red] =
    perishability === "cooked"
      ? [12 * HOUR, 4 * HOUR]
      : perishability === "fresh"
        ? [72 * HOUR, 24 * HOUR]
        : [168 * HOUR, 72 * HOUR];
  if (left < red) return "red";
  if (left <= green) return "yellow";
  return "green";
}

/** Cả tuần, cùng một khung giờ. */
export function daily(opens, closes, closesNextDay = false) {
  return [0, 1, 2, 3, 4, 5, 6].map((dow) => ({ dow, opens, closes, closes_next_day: closesNextDay }));
}
