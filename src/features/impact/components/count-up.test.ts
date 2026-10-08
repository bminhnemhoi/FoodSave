import { describe, expect, it } from "vitest";

import { displayCo2e, displayKg, displayMeals } from "@/core/impact";

import { parseViNumber } from "./count-up";

describe("parseViNumber (số đếm lên trên landing)", () => {
  it("đọc đúng số đã định dạng vi-VN và số chữ số thập phân", () => {
    expect(parseViNumber("1.234,5")).toEqual({ n: 1234.5, digits: 1 });
    expect(parseViNumber("12,0")).toEqual({ n: 12, digits: 1 });
    expect(parseViNumber("28")).toEqual({ n: 28, digits: 0 });
    expect(parseViNumber("1.000.000")).toEqual({ n: 1_000_000, digits: 0 });
  });

  it("khớp với mọi giá trị hiển thị của sổ tác động", () => {
    for (const v of [
      displayKg(9.1),
      displayKg(1234.56),
      displayMeals(21.9),
      displayCo2e(18.2),
      displayCo2e(12_345),
    ]) {
      const parsed = parseViNumber(v.value);
      expect(parsed, v.value).not.toBeNull();
      const fmt = new Intl.NumberFormat("vi-VN", {
        minimumFractionDigits: parsed!.digits,
        maximumFractionDigits: parsed!.digits,
      });
      // Giá trị cuối của hiệu ứng đếm phải in ra đúng chuỗi server đã hiển thị
      expect(fmt.format(parsed!.n)).toBe(v.value);
    }
  });

  it("chuỗi lạ ⇒ null (không đếm, giữ nguyên chữ)", () => {
    for (const bad of ["", "—", "1,2,3", "12 kg", "1234,5"]) expect(parseViNumber(bad)).toBeNull();
  });
});
