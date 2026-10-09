import { describe, expect, it } from "vitest";

import {
  CCCD_PROVINCE_CODES,
  compareNames,
  maskCccd,
  namesMatch,
  normalizePersonName,
  parseCccdQr,
  stripVietnameseDiacritics,
  validateCccd,
} from "./cccd";

const QR_OK =
  "079095001234|025123456|Nguyễn Thị Hồng Nhung|15081995|Nữ|12 Lê Lợi, Phường Bến Thành, TP. Hồ Chí Minh|20042021";

describe("validateCccd", () => {
  it("12 chữ số với mã tỉnh hợp lệ; bỏ khoảng trắng/dấu chấm/gạch", () => {
    expect(validateCccd("079095001234")).toEqual({ ok: true, value: "079095001234" });
    expect(validateCccd(" 079 095.001-234 ")).toEqual({ ok: true, value: "079095001234" });
    expect(validateCccd("001095001234").ok).toBe(true);
    expect(validateCccd("096095001234").ok).toBe(true);
  });

  it("sai độ dài, có chữ, mã tỉnh không tồn tại", () => {
    expect(validateCccd("07909500123")).toEqual({ ok: false, error: "length" });
    expect(validateCccd("0790950012345")).toEqual({ ok: false, error: "length" });
    expect(validateCccd("")).toEqual({ ok: false, error: "length" });
    expect(validateCccd("07909500123a")).toEqual({ ok: false, error: "digits" });
    expect(validateCccd("099095001234")).toEqual({ ok: false, error: "province" });
    expect(validateCccd("003095001234")).toEqual({ ok: false, error: "province" });
    expect(validateCccd("000095001234")).toEqual({ ok: false, error: "province" });
  });

  it("đủ 63 mã tỉnh trong khoảng 001–096 (khớp private.cccd_province_valid)", () => {
    expect(CCCD_PROVINCE_CODES.size).toBe(63);
    for (const c of CCCD_PROVINCE_CODES) {
      expect(c).toMatch(/^0\d{2}$/);
      expect(Number(c)).toBeGreaterThanOrEqual(1);
      expect(Number(c)).toBeLessThanOrEqual(96);
    }
  });
});

describe("maskCccd", () => {
  it("chỉ giữ mã tỉnh và 4 số cuối", () => {
    expect(maskCccd("079095001234")).toBe("079*****1234");
    expect(maskCccd("123")).toBe("");
  });
});

describe("parseCccdQr", () => {
  it("chuỗi hợp lệ ⇒ chỉ số + họ tên (không trả ngày sinh, địa chỉ…)", () => {
    const r = parseCccdQr(QR_OK);
    expect(r).toEqual({ ok: true, idNumber: "079095001234", fullName: "Nguyễn Thị Hồng Nhung" });
    expect(Object.keys(r).sort()).toEqual(["fullName", "idNumber", "ok"]);
    expect(JSON.stringify(r)).not.toMatch(/15081995|Lê Lợi|Nữ|20042021|025123456/);
  });

  it("số CMND cũ trống vẫn hợp lệ", () => {
    expect(parseCccdQr("001095001234||Trần Văn Bình|01011990|Nam|Hà Nội|01012022")).toMatchObject({
      ok: true,
      idNumber: "001095001234",
      fullName: "Trần Văn Bình",
    });
  });

  it("dấu phân cách thừa ở cuối / trường thêm của thẻ mới, BOM và xuống dòng", () => {
    expect(parseCccdQr(`${QR_OK}|`).ok).toBe(true);
    expect(parseCccdQr(`${QR_OK}||31122045`).ok).toBe(true);
    expect(parseCccdQr(`﻿${QR_OK}\r\n`).ok).toBe(true);
  });

  it("thiếu trường ⇒ không phải mã CCCD", () => {
    expect(parseCccdQr("079095001234")).toEqual({ ok: false, error: "qrFormat" });
    expect(parseCccdQr("079095001234|025123456|Nguyễn Văn A|15081995|Nam|Địa chỉ")).toEqual({
      ok: false,
      error: "qrFormat",
    });
    expect(parseCccdQr("https://foodsave.vn/h/abc")).toEqual({ ok: false, error: "qrFormat" });
    expect(parseCccdQr("")).toEqual({ ok: false, error: "qrFormat" });
  });

  it("dấu phân cách thừa ở giữa làm lệch trường ⇒ từ chối, không đoán", () => {
    expect(parseCccdQr("079095001234||025123456|Nguyễn Văn A|15081995|Nam|Địa chỉ|01012022")).toEqual({
      ok: false,
      error: "qrFormat",
    });
  });

  it("số sai độ dài hoặc sai mã tỉnh trong QR", () => {
    expect(parseCccdQr("07909500123|x|Nguyễn Văn A|15081995|Nam|Địa chỉ|01012022")).toEqual({
      ok: false,
      error: "qrNumber",
    });
    expect(parseCccdQr("099095001234|x|Nguyễn Văn A|15081995|Nam|Địa chỉ|01012022")).toEqual({
      ok: false,
      error: "qrNumber",
    });
  });

  it("thiếu họ tên", () => {
    expect(parseCccdQr("079095001234|x|   |15081995|Nam|Địa chỉ|01012022")).toEqual({
      ok: false,
      error: "qrName",
    });
  });

  it("họ tên dạng tổ hợp (NFD) được chuẩn hóa về NFC, gộp khoảng trắng", () => {
    const nfd = "Nguyễn  Thị   Hồng Nhung".normalize("NFD");
    const r = parseCccdQr(`079095001234||${nfd}|15081995|Nữ|Địa chỉ|20042021`);
    expect(r).toMatchObject({ ok: true, fullName: "Nguyễn Thị Hồng Nhung" });
    if (r.ok) expect(r.fullName).toBe(r.fullName.normalize("NFC"));
  });
});

describe("compareNames", () => {
  it("khớp không phân biệt hoa thường, khoảng trắng, NFC/NFD", () => {
    expect(compareNames("NGUYỄN THỊ HỒNG NHUNG", "  nguyễn thị  hồng nhung ")).toBe("exact");
    expect(compareNames("Nguyễn Thị Hồng Nhung".normalize("NFD"), "Nguyễn Thị Hồng Nhung")).toBe("exact");
  });

  it("chỉ khớp khi bỏ dấu (kể cả đ)", () => {
    expect(compareNames("Nguyen Thi Hong Nhung", "Nguyễn Thị Hồng Nhung")).toBe("no_diacritics");
    expect(compareNames("Dang Van Duc", "Đặng Văn Đức")).toBe("no_diacritics");
    expect(namesMatch("no_diacritics")).toBe(true);
  });

  it("khác người / thiếu tên", () => {
    expect(compareNames("Nguyễn Văn A", "Nguyễn Văn B")).toBe("mismatch");
    expect(namesMatch("mismatch")).toBe(false);
    expect(compareNames("", "Nguyễn Văn A")).toBe("missing");
    expect(compareNames(null, undefined)).toBe("missing");
  });

  it("hàm phụ chuẩn hóa", () => {
    expect(normalizePersonName("  Lê   MINH ")).toBe("lê minh");
    expect(stripVietnameseDiacritics("Đỗ Thị Ánh")).toBe("Do Thi Anh");
  });
});
