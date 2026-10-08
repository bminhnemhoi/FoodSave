import { BinaryBitmap, HybridBinarizer, QRCodeReader, RGBLuminanceSource } from "@zxing/library";
import { describe, expect, it } from "vitest";

import { matrixFromSvgPath, qrMatrix, qrSvgPath, QR_QUIET_ZONE } from "./qr-matrix";

const TOKEN = "q3J8sR0vYd2LmXcT7wKpZ1aBn9EuHfG4iO5yV6tQ-_s"; // 43 ký tự base64url như RPC trả về

/** Vẽ ma trận (gồm vùng yên tĩnh) thành ảnh xám rồi giải mã bằng ZXing — đúng như máy quét thật. */
function decode(modules: Uint8Array, side: number, scale = 4): string {
  const w = side * scale;
  const lum = new Uint8ClampedArray(w * w);
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      lum[y * w + x] = modules[Math.floor(y / scale) * side + Math.floor(x / scale)] ? 0 : 255;
    }
  }
  const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(lum, w, w)));
  return new QRCodeReader().decode(bitmap).getText();
}

describe("QR bàn giao", () => {
  it("token 43 ký tự, mức Q ⇒ phiên bản 4 (33 module), vùng yên tĩnh 4 module", () => {
    const m = qrMatrix(TOKEN, "Q");
    expect(m.size).toBe(33);
    const { viewBoxSize } = qrSvgPath(m);
    expect(viewBoxSize).toBe(33 + 2 * QR_QUIET_ZONE);
  });

  it("mức Q không làm QR lớn hơn mức M với token 43 ký tự (cả hai đều phiên bản 4)", () => {
    expect(qrMatrix(TOKEN, "M").size).toBe(qrMatrix(TOKEN, "Q").size);
  });

  it("path SVG dựng lại đúng ma trận và giải mã ra đúng token", () => {
    const m = qrMatrix(TOKEN);
    const { d, viewBoxSize } = qrSvgPath(m);
    const rebuilt = matrixFromSvgPath(d, viewBoxSize);

    // từng module khớp ma trận gốc; vùng yên tĩnh trắng hoàn toàn
    for (let r = 0; r < viewBoxSize; r++) {
      for (let c = 0; c < viewBoxSize; c++) {
        const inside =
          r >= QR_QUIET_ZONE &&
          c >= QR_QUIET_ZONE &&
          r < QR_QUIET_ZONE + m.size &&
          c < QR_QUIET_ZONE + m.size;
        const expected = inside ? m.data[(r - QR_QUIET_ZONE) * m.size + (c - QR_QUIET_ZONE)] : 0;
        expect(rebuilt[r * viewBoxSize + c], `module ${r},${c}`).toBe(expected);
      }
    }
    expect(decode(rebuilt, viewBoxSize)).toBe(TOKEN);
  });
});
