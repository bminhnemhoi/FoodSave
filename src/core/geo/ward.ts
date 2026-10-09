/**
 * Tên phường/xã/đặc khu đầy đủ cho `sites.ward` (DATA-MODEL §2.1; DESIGN-SYSTEM §16.4: "Phường Bến Thành").
 * Goong trả tên trần ("Chợ Quán") sau sắp xếp đơn vị hành chính 01/7/2025 ⇒ thêm tiền tố.
 * TP.HCM sau sáp nhập có 168 đơn vị cấp xã: 113 phường, 54 xã, 1 đặc khu (Côn Đảo — ngoài vùng phục vụ,
 * DATA-MODEL §2.6 `service_area_bbox`). Tên không thuộc danh sách xã/đặc khu dưới đây là phường.
 * Thuần, không IO (UAT 09/10 C3).
 */

/** 54 xã của TP.HCM từ 01/7/2025 (Nghị quyết 1685/NQ-UBTVQH15). */
const HCMC_COMMUNES = [
  // TP.HCM cũ: Củ Chi, Hóc Môn, Bình Chánh, Nhà Bè, Cần Giờ
  "An Nhơn Tây",
  "Thái Mỹ",
  "Nhuận Đức",
  "Tân An Hội",
  "Củ Chi",
  "Phú Hòa Đông",
  "Bình Mỹ",
  "Đông Thạnh",
  "Hóc Môn",
  "Xuân Thới Sơn",
  "Bà Điểm",
  "Tân Nhựt",
  "Vĩnh Lộc",
  "Tân Vĩnh Lộc",
  "Bình Lợi",
  "Bình Hưng",
  "Hưng Long",
  "Bình Chánh",
  "Nhà Bè",
  "Hiệp Phước",
  "Bình Khánh",
  "An Thới Đông",
  "Cần Giờ",
  "Thạnh An",
  // Bình Dương cũ
  "Thường Tân",
  "Bắc Tân Uyên",
  "Phú Giáo",
  "Phước Hòa",
  "Phước Thành",
  "An Long",
  "Trừ Văn Thố",
  "Bàu Bàng",
  "Long Hòa",
  "Thanh An",
  "Dầu Tiếng",
  "Minh Thạnh",
  // Bà Rịa – Vũng Tàu cũ
  "Ngãi Giao",
  "Bình Giã",
  "Kim Long",
  "Châu Đức",
  "Xuân Sơn",
  "Nghĩa Thành",
  "Hồ Tràm",
  "Xuyên Mộc",
  "Hòa Hội",
  "Bàu Lâm",
  "Hòa Hiệp",
  "Bình Châu",
  "Long Hải",
  "Long Điền",
  "Phước Hải",
  "Đất Đỏ",
  "Châu Pha",
  "Long Sơn",
] as const;

const SPECIAL_ZONES = ["Côn Đảo"] as const;

/** Khóa so sánh: bỏ dấu (kể cả kiểu bỏ dấu "Hoà"/"Hòa"), chữ thường, gộp khoảng trắng. */
function key(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const COMMUNE_KEYS = new Set<string>(HCMC_COMMUNES.map(key));
const SPECIAL_ZONE_KEYS = new Set<string>(SPECIAL_ZONES.map(key));

const PREFIXES: { re: RegExp; label: string }[] = [
  { re: /^(phường|phuong|p\.)\s*/iu, label: "Phường" },
  { re: /^(xã|xa|x\.)\s+/iu, label: "Xã" },
  { re: /^(đặc khu|dac khu)\s+/iu, label: "Đặc khu" },
  { re: /^(thị trấn|thi tran|tt\.)\s*/iu, label: "Thị trấn" },
];

/**
 * "Chợ Quán" ⇒ "Phường Chợ Quán"; "Hiệp Phước" ⇒ "Xã Hiệp Phước"; "Côn Đảo" ⇒ "Đặc khu Côn Đảo";
 * tên đã có tiền tố ("phường bến thành", "P. Sài Gòn") ⇒ chuẩn hóa chữ hoa tiền tố. Rỗng ⇒ null.
 */
export function normalizeWardName(raw: string | null | undefined): string | null {
  const name = (raw ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
  if (!name) return null;
  for (const p of PREFIXES) {
    const m = p.re.exec(name);
    if (m) {
      const rest = name.slice(m[0].length).trim();
      return rest ? `${p.label} ${rest}` : name;
    }
  }
  const k = key(name);
  if (SPECIAL_ZONE_KEYS.has(k)) return `Đặc khu ${name}`;
  if (COMMUNE_KEYS.has(k)) return `Xã ${name}`;
  return `Phường ${name}`;
}
