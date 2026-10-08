import { describe, expect, it } from "vitest";

import {
  formatDecimal,
  formatBytes,
  formatCoordinate,
  formatDate,
  formatDateTime,
  formatDistance,
  formatKm,
  formatRelativeTime,
} from "./format";

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

describe("ngày giờ theo Asia/Ho_Chi_Minh", () => {
  it("đổi từ UTC sang giờ Việt Nam (UTC+7), dd/mm/yyyy và 24 giờ", () => {
    expect(formatDate("2026-10-07T18:30:00Z")).toBe("08/10/2026");
    expect(formatDateTime("2026-10-07T18:30:00Z")).toBe("08/10/2026 01:30");
    expect(formatDateTime("2026-10-07T07:05:00Z")).toBe("07/10/2026 14:05");
  });

  it("giá trị không hợp lệ hiển thị gạch ngang", () => {
    expect(formatDate("không phải ngày")).toBe("—");
    expect(formatDateTime("x")).toBe("—");
    expect(formatRelativeTime("x")).toBe("—");
  });

  it("thời gian tương đối", () => {
    const now = new Date("2026-10-08T05:00:00Z"); // 12:00 ngày 08/10 giờ VN
    expect(formatRelativeTime("2026-10-08T04:59:30Z", now)).toBe("vừa xong");
    expect(formatRelativeTime("2026-10-08T04:55:00Z", now)).toBe("5 phút trước");
    expect(formatRelativeTime("2026-10-08T02:00:00Z", now)).toBe("3 giờ trước");
    expect(formatRelativeTime("2026-10-07T12:20:00Z", now)).toBe("hôm qua lúc 19:20");
    expect(formatRelativeTime("2026-10-04T05:00:00Z", now)).toBe("4 ngày trước");
    expect(formatRelativeTime("2026-09-20T05:00:00Z", now)).toBe("20/09/2026");
  });
});

describe("dung lượng tệp", () => {
  it("B, KB, MB theo vi-VN", () => {
    expect(formatBytes(850)).toBe("850 B");
    expect(formatBytes(120 * 1024)).toBe("120 KB");
    expect(formatBytes(1.25 * 1024 * 1024)).toBe("1,3 MB");
    expect(formatBytes(-1)).toBe("—");
  });
});

describe("số thập phân", () => {
  it("tối đa 1 chữ số, dấu phẩy thập phân, dấu chấm nghìn", () => {
    expect(formatDecimal(50)).toBe("50");
    expect(formatDecimal(62.5)).toBe("62,5");
    expect(formatDecimal(1234.56)).toBe("1.234,6");
    expect(formatDecimal(Number.NaN)).toBe("—");
  });
});
