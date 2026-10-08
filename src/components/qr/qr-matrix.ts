import { create } from "qrcode";

/**
 * Ma trận QR → đường SVG (một `<path>` duy nhất, mỗi đoạn là một dãy module tối liên tiếp trên một hàng).
 * Không IO, không DOM — test được bằng Vitest (giải mã ngược bằng @zxing/library).
 *
 * Mức sửa lỗi mặc định Q (25%): token 43 ký tự ⇒ phiên bản 4 (33 × 33), đủ chịu lóa đèn và màn hình
 * điện thoại bị xước mà module vẫn đủ lớn khi QR rộng ≥ 260 px (DESIGN-SYSTEM §11.2 `QrHandover`).
 */

export const QR_QUIET_ZONE = 4;

export type QrErrorCorrection = "M" | "Q";

export type QrMatrix = {
  /** Số module mỗi cạnh (không gồm vùng yên tĩnh). */
  size: number;
  /** 1 = module tối, theo hàng. */
  data: Uint8Array;
};

export function qrMatrix(value: string, errorCorrection: QrErrorCorrection = "Q"): QrMatrix {
  const qr = create(value, { errorCorrectionLevel: errorCorrection });
  return { size: qr.modules.size, data: Uint8Array.from(qr.modules.data) };
}

/** `d` của path (toạ độ đã cộng vùng yên tĩnh) và cạnh viewBox (= size + 2 × vùng yên tĩnh). */
export function qrSvgPath(matrix: QrMatrix, quietZone = QR_QUIET_ZONE): { d: string; viewBoxSize: number } {
  const { size, data } = matrix;
  const parts: string[] = [];
  for (let r = 0; r < size; r++) {
    let c = 0;
    while (c < size) {
      if (!data[r * size + c]) {
        c++;
        continue;
      }
      const start = c;
      while (c < size && data[r * size + c]) c++;
      const len = c - start;
      parts.push(`M${start + quietZone} ${r + quietZone}h${len}v1h-${len}z`);
    }
  }
  return { d: parts.join(""), viewBoxSize: size + 2 * quietZone };
}

/** Dựng lại ma trận (gồm vùng yên tĩnh) từ `d` — dùng trong test để chắc SVG đúng như ma trận gốc. */
export function matrixFromSvgPath(d: string, viewBoxSize: number): Uint8Array {
  const out = new Uint8Array(viewBoxSize * viewBoxSize);
  for (const m of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
    const x = Number(m[1]);
    const y = Number(m[2]);
    const len = Number(m[3]);
    for (let i = 0; i < len; i++) out[y * viewBoxSize + x + i] = 1;
  }
  return out;
}
