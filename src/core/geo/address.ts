/**
 * Tách "số nhà, đường" khỏi địa chỉ đầy đủ do geocode trả về, khi phường/xã và tỉnh/thành
 * đã được lưu ở trường riêng (sites.address_line, ward, city — DESIGN-SYSTEM §16.4).
 * Ví dụ: "135 Nam Kỳ Khởi Nghĩa, Bến Thành, Hồ Chí Minh" → "135 Nam Kỳ Khởi Nghĩa".
 */

const ADMIN_PREFIX = /^(phường|phuong|xã|xa|thị trấn|đặc khu|p\.|x\.|tp\.?|thành phố|tỉnh)\s*/iu;

function normalize(part: string): string {
  return part.trim().toLocaleLowerCase("vi").replace(ADMIN_PREFIX, "").replace(/\s+/g, " ").trim();
}

export function streetPart(label: string, ward?: string | null, city?: string | null): string {
  const parts = label
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const drop = new Set([ward, city].filter((v): v is string => !!v && !!v.trim()).map(normalize));
  // Bỏ các phần cuối trùng phường/xã hoặc tỉnh/thành, giữ nguyên phần đầu
  while (parts.length > 1 && drop.has(normalize(parts[parts.length - 1]!))) parts.pop();
  const street = parts.join(", ");
  return street || label.trim();
}

/** Địa chỉ hiển thị đầy đủ: "45 Nguyễn Huệ, Phường Sài Gòn, Hồ Chí Minh". */
export function formatAddress(addressLine: string, ward?: string | null, city?: string | null): string {
  return [addressLine, ward, city]
    .map((p) => p?.trim())
    .filter((p): p is string => !!p)
    .join(", ");
}
