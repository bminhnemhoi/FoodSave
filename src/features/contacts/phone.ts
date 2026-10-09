/**
 * Hiển thị và liên kết gọi cho số điện thoại Việt Nam đã chuẩn hóa (hotline `org_contacts`, SĐT tình nguyện viên).
 * Thuần, không IO.
 */

/** "0901234567" ⇒ "0901 234 567"; "02838234567" ⇒ "028 3823 4567"; "19001234" ⇒ "1900 1234". */
export function formatPhone(raw: string): string {
  const d = raw.replace(/[^\d+]/g, "");
  if (/^0\d{9}$/.test(d)) return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
  if (/^02\d{9}$/.test(d)) return `${d.slice(0, 3)} ${d.slice(3, 7)} ${d.slice(7)}`;
  if (/^1[89]00\d{4,6}$/.test(d)) return `${d.slice(0, 4)} ${d.slice(4)}`;
  return raw;
}

/** Liên kết `tel:` (chỉ chữ số và dấu +). */
export function telHref(raw: string): string {
  return `tel:${raw.replace(/[^\d+]/g, "")}`;
}

export function mailtoHref(email: string, subject?: string): string {
  return `mailto:${email}${subject ? `?subject=${encodeURIComponent(subject)}` : ""}`;
}
