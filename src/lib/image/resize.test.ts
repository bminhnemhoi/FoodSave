import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  classifyUpload,
  detectMime,
  extForMime,
  fitWithin,
  formatFileSize,
  IMAGE_MAX_EDGE,
  isPdfSignature,
  KYC_MAX_BYTES,
  MB,
  UPLOAD_MESSAGES,
} from "./resize";

describe("fitWithin", () => {
  it("thu nhỏ cạnh dài về 2000 px, giữ tỷ lệ", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 2000, height: 1500 });
    expect(fitWithin(3000, 6000)).toEqual({ width: 1000, height: 2000 });
  });
  it("không phóng to ảnh nhỏ", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
  it("ảnh rất dẹt vẫn ≥ 1 px", () => {
    expect(fitWithin(100_000, 10)).toEqual({ width: 2000, height: 1 });
  });
  it("kích thước không hợp lệ ⇒ lỗi", () => {
    expect(() => fitWithin(0, 10)).toThrow(RangeError);
  });
  it("property: luôn ≤ maxEdge, tỷ lệ lệch tối đa ~1 px", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20_000 }), fc.integer({ min: 1, max: 20_000 }), (w, h) => {
        const r = fitWithin(w, h);
        const scale = Math.min(1, IMAGE_MAX_EDGE / Math.max(w, h));
        return (
          Math.max(r.width, r.height) <= IMAGE_MAX_EDGE &&
          Math.abs(r.width - w * scale) <= 1 &&
          Math.abs(r.height - h * scale) <= 1
        );
      }),
    );
  });
});

describe("classifyUpload", () => {
  it("nhận PDF ≤ 10 MB và ảnh JPG/PNG/WebP", () => {
    expect(classifyUpload({ type: "application/pdf", name: "gp.pdf", size: 1000 })).toEqual({
      ok: true,
      kind: "pdf",
      mime: "application/pdf",
    });
    expect(classifyUpload({ type: "image/png", name: "a.png", size: 20 * MB })).toMatchObject({
      ok: true,
      kind: "image",
    });
  });
  it("PDF > 10 MB, tệp rỗng, sai loại ⇒ lỗi tiếng Việt", () => {
    expect(classifyUpload({ type: "application/pdf", name: "a.pdf", size: KYC_MAX_BYTES + 1 })).toEqual({
      ok: false,
      error: UPLOAD_MESSAGES.tooLarge,
    });
    expect(classifyUpload({ type: "image/jpeg", name: "a.jpg", size: 0 })).toEqual({
      ok: false,
      error: UPLOAD_MESSAGES.empty,
    });
    expect(classifyUpload({ type: "application/zip", name: "a.zip", size: 10 })).toEqual({
      ok: false,
      error: UPLOAD_MESSAGES.type,
    });
    expect(classifyUpload({ type: "image/heic", name: "a.heic", size: 10 }).ok).toBe(false);
  });
  it("suy MIME từ đuôi khi trình duyệt để trống", () => {
    expect(detectMime({ type: "", name: "GiayPhep.PDF" })).toBe("application/pdf");
    expect(detectMime({ type: "", name: "noext" })).toBe("");
  });
});

describe("isPdfSignature / extForMime / formatFileSize", () => {
  it("chữ ký %PDF-", () => {
    expect(isPdfSignature(new TextEncoder().encode("%PDF-1.7"))).toBe(true);
    expect(isPdfSignature(new TextEncoder().encode("MZ\x90"))).toBe(false);
    expect(isPdfSignature(new Uint8Array())).toBe(false);
  });
  it("đuôi theo MIME", () => {
    expect(extForMime("image/jpeg")).toBe("jpg");
    expect(extForMime("image/webp")).toBe("webp");
    expect(() => extForMime("text/html")).toThrow();
  });
  it("định dạng vi-VN", () => {
    expect(formatFileSize(500)).toBe("500 B");
    expect(formatFileSize(245 * 1024)).toBe("245 KB");
    expect(formatFileSize(1.25 * MB)).toBe("1,3 MB");
  });
});
