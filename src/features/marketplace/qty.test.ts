import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  defaultQty,
  estimateKg,
  maxRequestable,
  parseQty,
  qtyInputValue,
  qtyStep,
  stepQty,
  validateQty,
} from "./qty";

describe("parseQty", () => {
  it("hiểu dấu phẩy và dấu chấm thập phân", () => {
    expect(parseQty("12")).toBe(12);
    expect(parseQty("2,5")).toBe(2.5);
    expect(parseQty(" 2.25 ")).toBe(2.25);
  });

  it("từ chối chuỗi không phải số", () => {
    expect(parseQty("")).toBeNull();
    expect(parseQty("-3")).toBeNull();
    expect(parseQty("1.000,5")).toBeNull();
    expect(parseQty("abc")).toBeNull();
  });

  it("hiển thị lại bằng dấu phẩy", () => {
    expect(qtyInputValue(2.5)).toBe("2,5");
    expect(qtyInputValue(12)).toBe("12");
  });
});

describe("validateQty", () => {
  it("đơn vị đếm chỉ nhận số nguyên", () => {
    expect(validateQty(2.5, "loaf", 30)).toBe("Số lượng phải là số nguyên với đơn vị ổ.");
    expect(validateQty(3, "loaf", 30)).toBeNull();
  });

  it("kg/lít nhận số lẻ tối đa 3 chữ số", () => {
    expect(validateQty(2.5, "kg", 10)).toBeNull();
    expect(validateQty(2.5, "liter", 10)).toBeNull();
    expect(validateQty(1.2345, "kg", 10)).toBe("Số lượng chỉ có tối đa 3 chữ số thập phân.");
  });

  it("không vượt số còn lại (câu chuẩn §12.1)", () => {
    expect(validateQty(31, "loaf", 30)).toBe("Chỉ còn 30 ổ — vui lòng nhập tối đa 30.");
    expect(validateQty(12.5, "kg", 12.4)).toBe("Chỉ còn 12,4 kg — vui lòng nhập tối đa 12,4.");
  });

  it("bắt buộc và lớn hơn 0", () => {
    expect(validateQty(null, "box", 5)).toBe("Vui lòng nhập số lượng.");
    expect(validateQty(0, "box", 5)).toBe("Số lượng phải lớn hơn 0.");
  });
});

describe("stepQty", () => {
  it("bước 1 cho đơn vị đếm, 0,5 cho kg", () => {
    expect(qtyStep("portion")).toBe(1);
    expect(qtyStep("kg")).toBe(0.5);
    expect(stepQty(3, 1, "portion", 10)).toBe(4);
    expect(stepQty(3, -1, "portion", 10)).toBe(2);
    expect(stepQty(2, 1, "kg", 10)).toBe(2.5);
  });

  it("giữ trong [bước, tối đa]", () => {
    expect(stepQty(10, 1, "portion", 10)).toBe(10);
    expect(stepQty(1, -1, "portion", 10)).toBe(1);
    expect(stepQty(0.5, -1, "kg", 10)).toBe(0.5);
    expect(stepQty(null, 1, "box", 6)).toBe(1);
    expect(stepQty(null, -1, "box", 6)).toBe(6);
  });

  it("giá trị lệch bước làm tròn theo chiều bấm", () => {
    expect(stepQty(2.3, 1, "kg", 10)).toBe(2.5);
    expect(stepQty(2.3, -1, "kg", 10)).toBe(2);
  });

  it("lô kg còn ít hơn một bước vẫn chọn được phần còn lại", () => {
    expect(stepQty(null, 1, "kg", 0.3)).toBe(0.3);
    expect(stepQty(0.3, -1, "kg", 0.3)).toBe(0.3);
  });

  it("thuộc tính: kết quả luôn hợp lệ theo validateQty", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("loaf", "kg", "portion", "liter" as const),
        fc.integer({ min: 1, max: 500 }),
        fc.option(fc.integer({ min: 0, max: 600 }), { nil: null }),
        fc.constantFrom(1 as const, -1 as const),
        (unit, maxInt, cur, dir) => {
          const max = unit === "kg" || unit === "liter" ? maxInt / 4 : maxInt;
          const next = stepQty(cur === null ? null : cur / 2, dir, unit, max);
          expect(validateQty(next, unit, max)).toBeNull();
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe("maxRequestable / defaultQty / estimateKg", () => {
  it("đơn vị đếm làm tròn xuống", () => {
    expect(maxRequestable(7.9, "box")).toBe(7);
    expect(maxRequestable(7.95, "kg")).toBe(7.95);
    expect(maxRequestable(0, "kg")).toBe(0);
    expect(defaultQty(30, "loaf")).toBe(30);
  });

  it("ước tính kg", () => {
    expect(estimateKg(20, 0.12)).toBe(2.4);
    expect(estimateKg(null, 0.12)).toBeNull();
  });
});
