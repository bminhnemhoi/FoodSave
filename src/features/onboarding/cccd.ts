/**
 * Số CCCD người đại diện (B2) — thuần TypeScript, không IO, chạy cả trình duyệt lẫn server.
 *
 * Căn cứ NĐ 356/2025: **ảnh** thẻ căn cước là dữ liệu cá nhân nhạy cảm (Điều 4), còn **số** định danh là dữ
 * liệu cơ bản (Điều 3). Vì vậy FoodSave không bao giờ thu ảnh CCCD: chủ tổ chức nhập 12 số, hoặc quét mã QR
 * in trên CCCD gắn chip — mã được đọc ngay trên máy, chỉ giữ số + họ tên, mọi trường khác bị bỏ ngay.
 *
 * Danh sách mã tỉnh (3 số đầu = nơi đăng ký khai sinh, Thông tư 59/2021/TT-BCA) giữ đồng bộ với
 * `private.cccd_province_valid` (migration 20261009120200_representative_ids). Số CCCD không đổi sau sáp nhập
 * tỉnh 2025 nên vẫn dùng đủ 63 mã cũ.
 */

export const CCCD_PROVINCE_CODES: ReadonlySet<string> = new Set([
  "001",
  "002",
  "004",
  "006",
  "008",
  "010",
  "011",
  "012",
  "014",
  "015",
  "017",
  "019",
  "020",
  "022",
  "024",
  "025",
  "026",
  "027",
  "030",
  "031",
  "033",
  "034",
  "035",
  "036",
  "037",
  "038",
  "040",
  "042",
  "044",
  "045",
  "046",
  "048",
  "049",
  "051",
  "052",
  "054",
  "056",
  "058",
  "060",
  "062",
  "064",
  "066",
  "067",
  "068",
  "070",
  "072",
  "074",
  "075",
  "077",
  "079",
  "080",
  "082",
  "083",
  "084",
  "086",
  "087",
  "089",
  "091",
  "092",
  "093",
  "094",
  "095",
  "096",
]);

export const CCCD_MESSAGES = {
  length: "Số CCCD gồm đúng 12 chữ số.",
  digits: "Số CCCD chỉ gồm chữ số.",
  province: "3 số đầu của CCCD không phải mã tỉnh hợp lệ (001–096). Hãy kiểm tra lại.",
  qrFormat:
    "Mã QR này không phải mã trên CCCD gắn chip. Hãy quét mã QR ở mặt trước thẻ, hoặc nhập số bằng tay.",
  qrNumber: "Mã QR đọc được nhưng số CCCD trong đó không hợp lệ. Hãy nhập số bằng tay.",
  qrName: "Mã QR không có họ tên. Hãy quét lại hoặc nhập số bằng tay.",
} as const;

export type CccdError = keyof typeof CCCD_MESSAGES;

/** Bỏ khoảng trắng, dấu chấm, gạch nối mà người dùng hay gõ kèm ("079 123 456 789"). */
export function normalizeCccd(raw: string): string {
  return raw.replace(/[\s.\-]/g, "");
}

/** Kiểm số CCCD 12 chữ số với mã tỉnh hợp lệ. */
export function validateCccd(raw: string): { ok: true; value: string } | { ok: false; error: CccdError } {
  const v = normalizeCccd(raw);
  if (!/^\d*$/.test(v)) return { ok: false, error: "digits" };
  if (v.length !== 12) return { ok: false, error: "length" };
  if (!CCCD_PROVINCE_CODES.has(v.slice(0, 3))) return { ok: false, error: "province" };
  return { ok: true, value: v };
}

/** "079123451234" ⇒ "079*****1234" (dạng duy nhất chủ tổ chức thấy sau khi lưu). */
export function maskCccd(value: string): string {
  const v = normalizeCccd(value);
  return /^\d{12}$/.test(v) ? `${v.slice(0, 3)}*****${v.slice(-4)}` : "";
}

// ---------------------------------------------------------------------------
// Mã QR trên CCCD gắn chip
// ---------------------------------------------------------------------------

/**
 * Định dạng: `số CCCD|số CMND cũ|Họ tên|ngày sinh ddmmyyyy|giới tính|địa chỉ|ngày cấp ddmmyyyy` (số CMND cũ có
 * thể trống; thẻ mới có thể thêm trường ở cuối). Trả về CHỈ số + họ tên; ngày sinh, giới tính, địa chỉ, ngày
 * cấp không bao giờ rời hàm này.
 */
export type CccdQrResult = { ok: true; idNumber: string; fullName: string } | { ok: false; error: CccdError };

const QR_MIN_FIELDS = 7;

export function parseCccdQr(raw: string): CccdQrResult {
  const text = raw.replace(/^﻿/, "").trim();
  const fields = text.split("|");
  if (fields.length < QR_MIN_FIELDS) return { ok: false, error: "qrFormat" };
  // Trường ngày sinh phải là 8 chữ số — phân biệt với chuỗi bất kỳ có dấu "|"
  if (!/^\d{8}$/.test((fields[3] ?? "").trim())) return { ok: false, error: "qrFormat" };

  const number = validateCccd((fields[0] ?? "").trim());
  if (!number.ok) return { ok: false, error: "qrNumber" };

  const fullName = normalizeSpaces((fields[2] ?? "").normalize("NFC"));
  if (fullName === "" || /\d/.test(fullName)) return { ok: false, error: "qrName" };

  return { ok: true, idNumber: number.value, fullName };
}

// ---------------------------------------------------------------------------
// So khớp họ tên với "Người đại diện" đã khai
// ---------------------------------------------------------------------------

function normalizeSpaces(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

/** NFC, cắt khoảng trắng, gộp khoảng trắng, chữ thường (tiếng Việt). */
export function normalizePersonName(name: string): string {
  return normalizeSpaces(name.normalize("NFC")).toLocaleLowerCase("vi");
}

/** Bỏ dấu tiếng Việt (kể cả đ/Đ) để so khi một bên gõ không dấu. */
export function stripVietnameseDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").normalize("NFC");
}

/**
 * `exact` = trùng sau chuẩn hóa; `no_diacritics` = chỉ trùng khi bỏ dấu (ví dụ "Nguyen Van A");
 * `mismatch` = khác; `missing` = thiếu một trong hai tên.
 */
export type NameMatch = "exact" | "no_diacritics" | "mismatch" | "missing";

export function compareNames(a: string | null | undefined, b: string | null | undefined): NameMatch {
  const x = normalizePersonName(a ?? "");
  const y = normalizePersonName(b ?? "");
  if (x === "" || y === "") return "missing";
  if (x === y) return "exact";
  return stripVietnameseDiacritics(x) === stripVietnameseDiacritics(y) ? "no_diacritics" : "mismatch";
}

export function namesMatch(m: NameMatch): boolean {
  return m === "exact" || m === "no_diacritics";
}
