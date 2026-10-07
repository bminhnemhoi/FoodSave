import { describe, expect, it } from "vitest";

import { formatCoordinate, formatDistance, formatKm } from "./format";

describe("format vi-VN", () => {
  it("toạ độ có 6 chữ số thập phân, dấu phẩy thập phân", () => {
    expect(formatCoordinate(10.77254)).toBe("10,772540");
    expect(formatCoordinate(106.6979812)).toBe("106,697981");
  });

  it("khoảng cách dưới 1 km dùng mét làm tròn 10 m", () => {
    expect(formatDistance(0)).toBe("0 m");
    expect(formatDistance(846)).toBe("850 m");
    expect(formatDistance(994)).toBe("990 m");
  });

  it("từ 1 km dùng km một chữ số thập phân", () => {
    expect(formatDistance(996)).toBe("1 km");
    expect(formatDistance(3240)).toBe("3,2 km");
    expect(formatDistance(12_500)).toBe("12,5 km");
  });

  it("giá trị không hợp lệ hiển thị gạch ngang", () => {
    expect(formatDistance(Number.NaN)).toBe("—");
    expect(formatDistance(-5)).toBe("—");
  });

  it("bán kính km", () => {
    expect(formatKm(5)).toBe("5 km");
    expect(formatKm(2.5)).toBe("2,5 km");
  });
});
