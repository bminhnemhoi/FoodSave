/**
 * Giờ trong ngày dạng 24 giờ "HH:mm" (DESIGN-SYSTEM §16.4) — thuần, không IO, có unit test.
 * Dùng cho ô nhập giờ tự viết (`TimeInput`) thay `<input type="time">`: ô native hiển thị theo
 * locale của hệ điều hành (có máy hiện "07:30 SA/CH"), còn FoodSave luôn hiển thị 24 giờ.
 */

export const TIME_24H_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const MINUTES_PER_DAY = 24 * 60;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function fromMinutes(total: number): string {
  const t = ((total % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${pad2(Math.floor(t / 60))}:${pad2(t % 60)}`;
}

/**
 * Hiểu giờ người dùng gõ và chuẩn hóa về "HH:mm"; không hiểu được ⇒ `null`.
 * "7" → 07:00 · "730" / "0730" → 07:30 · "7:30" / "7h30" / "7.30" → 07:30 · "18h" → 18:00.
 * Phút phải đủ 2 chữ số khi có dấu phân cách ("7:3" ⇒ null) để không đoán sai ý người dùng.
 */
export function parseTime24(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (s === "") return null;

  let h: number;
  let m: number;
  const sep = /^(\d{1,2})(?:[:h.](\d{2})?)?$/.exec(s);
  if (sep) {
    h = Number(sep[1]);
    m = sep[2] ? Number(sep[2]) : 0;
  } else if (/^\d{3,4}$/.test(s)) {
    h = Number(s.slice(0, -2));
    m = Number(s.slice(-2));
  } else {
    return null;
  }
  if (h > 23 || m > 59) return null;
  return `${pad2(h)}:${pad2(m)}`;
}

/**
 * Lọc ký tự trong lúc gõ: chỉ giữ chữ số và một dấu ":" ("h", "." được hiểu là ":"), tối đa 5 ký tự.
 * Gõ liền 4 chữ số thì tự chèn dấu ":" ("1830" → "18:30") — bàn phím số trên điện thoại không có ":".
 */
export function maskTimeTyping(raw: string): string {
  let s = raw.replace(/[h.]/gi, ":").replace(/[^\d:]/g, "");
  const colon = s.indexOf(":");
  if (colon !== -1) s = s.slice(0, colon + 1) + s.slice(colon + 1).replace(/:/g, "");
  else if (s.length >= 4) s = `${s.slice(0, 2)}:${s.slice(2, 4)}`;
  return s.slice(0, 5);
}

/**
 * Tăng/giảm theo bước (mặc định 15 phút) cho phím ↑/↓, quay vòng trong ngày.
 * Giờ lệch bước được làm tròn tới mốc kế tiếp theo chiều bấm (07:10 ↑ → 07:15, 07:10 ↓ → 07:00).
 * Ô đang trống hoặc sai ⇒ bắt đầu từ 00:00.
 */
export function stepTime(value: string, direction: 1 | -1, step = 15): string {
  const parsed = parseTime24(value);
  if (!parsed) return fromMinutes(0);
  const [h, m] = parsed.split(":").map(Number);
  const total = h! * 60 + m!;
  const aligned = total % step === 0;
  const next =
    direction === 1
      ? aligned
        ? total + step
        : Math.ceil(total / step) * step
      : aligned
        ? total - step
        : Math.floor(total / step) * step;
  return fromMinutes(next);
}
