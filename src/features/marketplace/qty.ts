import { CONTINUOUS_UNITS, UNIT_LABEL, type UnitCode } from "@/features/catalog/labels";

/**
 * Quy tắc ô số lượng "Xin nhận" (DESIGN-SYSTEM §11.2 QuantityInput, §12.1; DATA-MODEL §4.1):
 * đơn vị đếm (ổ, hộp, suất…) chỉ nhận số nguyên; kg/lít cho phép số lẻ tối đa 3 chữ số thập phân.
 * Thuần, không IO — kiểm ở client trước khi gọi RPC (RPC vẫn kiểm lại).
 */

const EPS = 1e-9;
const numberFormat = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 3 });

export function isContinuous(unit: UnitCode): boolean {
  return CONTINUOUS_UNITS.has(unit);
}

/** Bước của nút −/+: 1 với đơn vị đếm, 0,5 với kg/lít. */
export function qtyStep(unit: UnitCode): number {
  return isContinuous(unit) ? 0.5 : 1;
}

/** Làm tròn 3 chữ số thập phân (numeric(12,3)) để tránh lỗi cộng dồn số thực. */
export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Đọc số người dùng gõ theo kiểu vi-VN ("2,5") hoặc "2.5"; không đọc được ⇒ null. */
export function parseQty(raw: string): number | null {
  const s = raw.trim().replace(/\s+/g, "");
  if (s === "") return null;
  if (!/^\d+([.,]\d+)?$/.test(s)) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Hiển thị số trong ô nhập: dấu phẩy thập phân, không phân cách nghìn. */
export function qtyInputValue(n: number): string {
  return String(round3(n)).replace(".", ",");
}

/** Thông điệp lỗi chuẩn (§12.1) hoặc null khi hợp lệ. */
export function validateQty(qty: number | null, unit: UnitCode, max: number): string | null {
  const unitLabel = UNIT_LABEL[unit];
  if (qty === null) return "Vui lòng nhập số lượng.";
  if (!(qty > 0)) return "Số lượng phải lớn hơn 0.";
  if (!isContinuous(unit) && Math.abs(qty - Math.round(qty)) > EPS)
    return `Số lượng phải là số nguyên với đơn vị ${unitLabel}.`;
  if (Math.abs(qty - round3(qty)) > EPS) return "Số lượng chỉ có tối đa 3 chữ số thập phân.";
  if (qty > max + EPS) {
    const n = numberFormat.format(max);
    return `Chỉ còn ${n} ${unitLabel} — vui lòng nhập tối đa ${n}.`;
  }
  return null;
}

/** Số tối đa được xin: đơn vị đếm làm tròn xuống số nguyên (phòng dữ liệu lẻ). */
export function maxRequestable(available: number, unit: UnitCode): number {
  if (!Number.isFinite(available) || available <= 0) return 0;
  return isContinuous(unit) ? round3(available) : Math.floor(available + EPS);
}

/**
 * Bấm −/+ : đi theo bước của đơn vị, giữ trong [bước nhỏ nhất, tối đa]. Giá trị lệch bước được làm tròn
 * tới mốc kế tiếp theo chiều bấm (2,3 kg + → 2,5 kg).
 */
export function stepQty(current: number | null, direction: 1 | -1, unit: UnitCode, max: number): number {
  const step = qtyStep(unit);
  const upper = maxRequestable(max, unit);
  const min = Math.min(step, upper);
  if (current === null || !Number.isFinite(current)) return direction === 1 ? min : upper;
  const aligned = Math.abs(current / step - Math.round(current / step)) < EPS;
  const next =
    direction === 1
      ? aligned
        ? current + step
        : Math.ceil(current / step) * step
      : aligned
        ? current - step
        : Math.floor(current / step) * step;
  return round3(Math.min(upper, Math.max(min, next)));
}

/** Mặc định mở hộp thoại: nhận hết phần còn lại (người dùng giảm nếu cần). */
export function defaultQty(available: number, unit: UnitCode): number {
  return maxRequestable(available, unit);
}

/** Khối lượng ước tính (kg) = số lượng × kg/đơn vị. */
export function estimateKg(qty: number | null, unitWeightKg: number): number | null {
  if (qty === null || !Number.isFinite(qty) || !Number.isFinite(unitWeightKg)) return null;
  return round3(qty * unitWeightKg);
}
