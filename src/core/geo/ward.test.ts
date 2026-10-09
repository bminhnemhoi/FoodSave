import { describe, expect, it } from "vitest";

import { normalizeWardName } from "./ward";

describe("normalizeWardName — tiền tố phường/xã/đặc khu (UAT 09/10 C3)", () => {
  it("tên trần của Goong là phường ⇒ thêm “Phường”", () => {
    expect(normalizeWardName("Chợ Quán")).toBe("Phường Chợ Quán");
    expect(normalizeWardName("Bến Thành")).toBe("Phường Bến Thành");
    expect(normalizeWardName("  Sài   Gòn ")).toBe("Phường Sài Gòn");
  });

  it("tên trần là xã của TP.HCM ⇒ “Xã”, kể cả kiểu bỏ dấu khác (Hoà/Hòa) hay chữ thường", () => {
    expect(normalizeWardName("Hiệp Phước")).toBe("Xã Hiệp Phước");
    expect(normalizeWardName("Củ Chi")).toBe("Xã Củ Chi");
    expect(normalizeWardName("Phú Hoà Đông")).toBe("Xã Phú Hoà Đông");
    expect(normalizeWardName("long sơn")).toBe("Xã long sơn");
  });

  it("đặc khu Côn Đảo", () => {
    expect(normalizeWardName("Côn Đảo")).toBe("Đặc khu Côn Đảo");
  });

  it("đã có tiền tố ⇒ giữ, chuẩn hóa chữ hoa (không thêm lần nữa)", () => {
    expect(normalizeWardName("Phường Bến Thành")).toBe("Phường Bến Thành");
    expect(normalizeWardName("phường bến thành")).toBe("Phường bến thành");
    expect(normalizeWardName("P. Sài Gòn")).toBe("Phường Sài Gòn");
    expect(normalizeWardName("Xã Hiệp Phước")).toBe("Xã Hiệp Phước");
    expect(normalizeWardName("xa Bình Chánh")).toBe("Xã Bình Chánh");
    expect(normalizeWardName("Đặc khu Côn Đảo")).toBe("Đặc khu Côn Đảo");
    expect(normalizeWardName("Thị trấn Cần Thạnh")).toBe("Thị trấn Cần Thạnh");
    expect(normalizeWardName("Phường")).toBe("Phường");
  });

  it("chuẩn hóa Unicode tổ hợp (NFD) về NFC", () => {
    expect(normalizeWardName("Chợ Quán".normalize("NFD"))).toBe("Phường Chợ Quán");
  });

  it("rỗng ⇒ null", () => {
    expect(normalizeWardName(undefined)).toBeNull();
    expect(normalizeWardName(null)).toBeNull();
    expect(normalizeWardName("   ")).toBeNull();
  });
});
