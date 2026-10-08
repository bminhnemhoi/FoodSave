import { describe, expect, it } from "vitest";

import {
  addDays,
  formatDeadline,
  formatWindow,
  isDateKey,
  parseTstzRange,
  parseVnDateTime,
  roundUpToStep,
  vnDateKey,
  vnIso,
  vnTime,
} from "./datetime";

const NOW = new Date("2026-10-08T08:00:00Z"); // 15:00 thứ Năm 08/10/2026 giờ VN

describe("ngày giờ Việt Nam", () => {
  it("vnDateKey/vnTime đọc theo UTC+7 (qua nửa đêm)", () => {
    const late = new Date("2026-10-08T17:30:00Z"); // 00:30 ngày 09/10 giờ VN
    expect(vnDateKey(late)).toBe("2026-10-09");
    expect(vnTime(late)).toBe("00:30");
  });

  it("vnIso có offset +07:00 và parseVnDateTime khớp", () => {
    expect(vnIso("2026-10-08", "21:00")).toBe("2026-10-08T21:00:00+07:00");
    expect(parseVnDateTime("2026-10-08", "21:00")?.toISOString()).toBe("2026-10-08T14:00:00.000Z");
    expect(parseVnDateTime("2026-02-30", "21:00")).toBeNull();
    expect(parseVnDateTime("2026-10-08", "24:00")).toBeNull();
  });

  it("isDateKey và addDays (qua tháng/năm)", () => {
    expect(isDateKey("2026-10-08")).toBe(true);
    expect(isDateKey("08/10/2026")).toBe(false);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("roundUpToStep giữ nguyên khi đã đúng mốc", () => {
    expect(roundUpToStep(new Date("2026-10-08T08:07:12Z"), 15).toISOString()).toBe(
      "2026-10-08T08:15:00.000Z",
    );
    expect(roundUpToStep(new Date("2026-10-08T08:15:00Z"), 15).toISOString()).toBe(
      "2026-10-08T08:15:00.000Z",
    );
  });
});

describe("parseTstzRange", () => {
  it("đọc định dạng PostgREST", () => {
    const r = parseTstzRange('["2026-10-08 10:00:00+00","2026-10-08 12:30:00+00")');
    expect(r?.start.toISOString()).toBe("2026-10-08T10:00:00.000Z");
    expect(r?.end.toISOString()).toBe("2026-10-08T12:30:00.000Z");
  });

  it("đọc offset có phút và không có ngoặc kép", () => {
    const r = parseTstzRange("[2026-10-08 17:00:00+07:00,2026-10-08 21:00:00+07:00)");
    expect(r?.start.toISOString()).toBe("2026-10-08T10:00:00.000Z");
    expect(r?.end.toISOString()).toBe("2026-10-08T14:00:00.000Z");
  });

  it("chuỗi lạ ⇒ null", () => {
    expect(parseTstzRange(null)).toBeNull();
    expect(parseTstzRange("empty")).toBeNull();
    expect(parseTstzRange('["abc","def")')).toBeNull();
  });
});

describe("formatDeadline (DESIGN-SYSTEM §12.8)", () => {
  it("hôm nay / ngày mai / hôm qua", () => {
    expect(formatDeadline(new Date("2026-10-08T14:00:00Z"), NOW)).toBe("21:00 hôm nay");
    expect(formatDeadline(new Date("2026-10-09T01:30:00Z"), NOW)).toBe("08:30 ngày mai");
    expect(formatDeadline(new Date("2026-10-07T16:59:00Z"), NOW)).toBe("23:59 hôm qua");
  });

  it("ngày khác: thứ + ngày/tháng; khác năm thêm năm", () => {
    expect(formatDeadline(new Date("2026-11-15T01:30:00Z"), NOW)).toBe("08:30 Chủ nhật, 15/11");
    expect(formatDeadline(new Date("2027-01-02T01:30:00Z"), NOW)).toBe("08:30 Thứ Bảy, 02/01/2027");
  });

  it("formatWindow cùng ngày và qua ngày", () => {
    expect(formatWindow(new Date("2026-10-08T10:00:00Z"), new Date("2026-10-08T14:00:00Z"), NOW)).toBe(
      "17:00–21:00 hôm nay",
    );
    expect(formatWindow(new Date("2026-10-08T15:00:00Z"), new Date("2026-10-08T18:00:00Z"), NOW)).toBe(
      "22:00 hôm nay – 01:00 ngày mai",
    );
  });
});
