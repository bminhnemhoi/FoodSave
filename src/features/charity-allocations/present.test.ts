import { describe, expect, it } from "vitest";

import {
  formatClock,
  formatDayLabel,
  formatDayTime,
  formatMinutes,
  formatWindow,
  parseTstzRange,
  spanRanges,
  startOfVnMonth,
  vnMonthLabel,
} from "./present";

// 08/10/2026 10:00 giờ Việt Nam (thứ Năm)
const NOW = new Date("2026-10-08T03:00:00Z");

describe("formatClock / formatDayLabel / formatDayTime", () => {
  it("giờ 24h theo giờ Việt Nam", () => {
    expect(formatClock("2026-10-08T14:00:00Z")).toBe("21:00");
    expect(formatClock("bad")).toBe("—");
  });

  it("ngày tương đối", () => {
    expect(formatDayLabel("2026-10-08T16:59:00Z", NOW)).toBe("hôm nay"); // 23:59 VN
    expect(formatDayLabel("2026-10-08T17:00:00Z", NOW)).toBe("ngày mai"); // 00:00 VN 09/10
    expect(formatDayLabel("2026-10-07T05:00:00Z", NOW)).toBe("hôm qua");
    expect(formatDayLabel("2026-10-10T01:30:00Z", NOW)).toBe("thứ Bảy, 10/10");
    expect(formatDayLabel("2027-01-03T01:30:00Z", NOW)).toBe("Chủ nhật, 03/01/2027");
  });

  it("giờ + ngày", () => {
    expect(formatDayTime("2026-10-08T14:00:00Z", NOW)).toBe("21:00 hôm nay");
    expect(formatDayTime("2026-10-10T01:30:00Z", NOW)).toBe("08:30 thứ Bảy, 10/10");
  });
});

describe("parseTstzRange / formatWindow / spanRanges", () => {
  it("đọc tstzrange của PostgREST", () => {
    const r = parseTstzRange('["2026-10-08 10:00:00+00","2026-10-08 13:30:00.5+00")');
    expect(r?.start.toISOString()).toBe("2026-10-08T10:00:00.000Z");
    expect(r?.end.toISOString()).toBe("2026-10-08T13:30:00.500Z");
    expect(parseTstzRange("[2026-10-08 10:00:00+07,2026-10-08 12:00:00+07)")?.start.toISOString()).toBe(
      "2026-10-08T03:00:00.000Z",
    );
  });

  it("từ chối range rỗng / vô hạn / sai", () => {
    expect(parseTstzRange(null)).toBeNull();
    expect(parseTstzRange("empty")).toBeNull();
    expect(parseTstzRange('["2026-10-08 10:00:00+00",)')).toBeNull();
    expect(parseTstzRange('["x","y")')).toBeNull();
  });

  it("khung giờ trong ngày và qua đêm", () => {
    expect(
      formatWindow({ start: new Date("2026-10-08T10:00:00Z"), end: new Date("2026-10-08T14:00:00Z") }, NOW),
    ).toBe("17:00–21:00 hôm nay");
    expect(
      formatWindow({ start: new Date("2026-10-08T15:00:00Z"), end: new Date("2026-10-08T19:00:00Z") }, NOW),
    ).toBe("22:00 hôm nay – 02:00 ngày mai");
    expect(formatWindow(null, NOW)).toBe("—");
  });

  it("bao nhiều khung giờ", () => {
    const span = spanRanges([
      { start: new Date("2026-10-08T10:00:00Z"), end: new Date("2026-10-08T12:00:00Z") },
      null,
      { start: new Date("2026-10-08T09:00:00Z"), end: new Date("2026-10-08T11:00:00Z") },
    ]);
    expect(span?.start.toISOString()).toBe("2026-10-08T09:00:00.000Z");
    expect(span?.end.toISOString()).toBe("2026-10-08T12:00:00.000Z");
    expect(spanRanges([null])).toBeNull();
  });
});

describe("formatMinutes / tháng", () => {
  it("thời lượng", () => {
    expect(formatMinutes(14)).toBe("14 phút");
    expect(formatMinutes(80)).toBe("1 giờ 20 phút");
    expect(formatMinutes(120)).toBe("2 giờ");
    expect(formatMinutes(-1)).toBe("—");
  });

  it("đầu tháng theo giờ Việt Nam", () => {
    // 31/10 20:00 UTC = 01/11 03:00 giờ VN ⇒ tháng 11
    expect(startOfVnMonth(new Date("2026-10-31T20:00:00Z"))).toBe("2026-11-01T00:00:00+07:00");
    expect(vnMonthLabel(NOW)).toBe("tháng 10/2026");
  });
});
