/**
 * Nội dung mã QR và mã 6 số bàn giao (SECURITY-PRIVACY C10, PRD US-VOL-07 AC3) — thuần, không IO.
 *
 * QR chỉ chứa **token thô** (32 byte ngẫu nhiên, base64url 43 ký tự), không chứa URL, ID nội bộ hay dữ
 * liệu cá nhân: ảnh chụp lén mã không lộ gì ngoài một chuỗi ngẫu nhiên hết hạn sau 15 phút, và máy quét
 * camera thường không tự mở trang nào. Máy quét của FoodSave vẫn đọc được dạng URL `…/h/<token>` hoặc
 * `…?t=<token>` (C10 bản đầu) để tương thích.
 */

export const HANDOVER_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
export const HANDOVER_CODE_RE = /^\d{6}$/;

/** Chuỗi mã hóa vào QR cho một token. Token sai dạng ⇒ lỗi lập trình (RPC luôn trả 43 ký tự). */
export function qrPayloadForToken(token: string): string {
  if (!HANDOVER_TOKEN_RE.test(token)) throw new Error("Token bàn giao sai định dạng");
  return token;
}

/**
 * Đọc chuỗi máy quét trả về ⇒ token, hoặc `null` nếu không phải mã bàn giao FoodSave.
 * Chấp nhận: token thô; URL có đoạn cuối `/h/<token>`; URL có tham số `t=<token>`.
 */
export function parseScannedPayload(text: string): string | null {
  const s = text.trim();
  if (HANDOVER_TOKEN_RE.test(s)) return s;
  if (!/^https?:\/\//i.test(s)) return null;
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return null;
  }
  const fromQuery = url.searchParams.get("t");
  if (fromQuery && HANDOVER_TOKEN_RE.test(fromQuery)) return fromQuery;
  const m = /\/h\/([^/?#]+)\/?$/.exec(url.pathname);
  return m && HANDOVER_TOKEN_RE.test(m[1]!) ? m[1]! : null;
}

/** Chỉ giữ chữ số, tối đa 6 (dán "482 913" hay "482-913" vẫn được). */
export function normalizeCodeInput(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 6);
}

/** "482913" ⇒ "482 913" (DESIGN-SYSTEM §16.4: nhóm 3-3). */
export function formatHandoverCode(code: string): string {
  const digits = normalizeCodeInput(code);
  return digits.length > 3 ? `${digits.slice(0, 3)} ${digits.slice(3)}` : digits;
}

/** Nhãn cho trình đọc màn hình: đọc từng chữ số ("4 8 2 9 1 3"). */
export function spokenHandoverCode(code: string): string {
  return normalizeCodeInput(code).split("").join(" ");
}
