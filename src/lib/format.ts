/**
 * Hàm định dạng số theo vi-VN (DESIGN-SYSTEM §16.4). Không gọi toLocaleString() rời rạc trong component.
 */

const coordinateFormat = new Intl.NumberFormat("vi-VN", {
  minimumFractionDigits: 6,
  maximumFractionDigits: 6,
});
const oneDecimal = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

/** Toạ độ 6 chữ số thập phân (~0,1 m): 10,772540. */
export function formatCoordinate(value: number): string {
  return coordinateFormat.format(value);
}

/** Khoảng cách: < 1 km dùng mét làm tròn 10 m ("850 m"), từ 1 km dùng km một chữ số ("3,2 km"). */
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return "—";
  if (meters < 1000) {
    const rounded = Math.round(meters / 10) * 10;
    // 995 m làm tròn thành 1.000 m ⇒ chuyển sang km
    if (rounded < 1000) return `${integer.format(rounded)} m`;
  }
  return `${oneDecimal.format(meters / 1000)} km`;
}

/** Số km cho nhãn bán kính: "5 km", "2,5 km". */
export function formatKm(km: number): string {
  return `${oneDecimal.format(km)} km`;
}
