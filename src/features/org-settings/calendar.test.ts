import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  addDays,
  addMonths,
  compareMonths,
  dayOfWeek,
  formatDayLabel,
  formatShortDate,
  isClosureDateAllowed,
  isIsoDate,
  lastClosureDate,
  monthGrid,
  monthLabel,
  yearMonthOf,
} from "./calendar";

describe("lịch ngày nghỉ", () => {
  it("ngày hợp lệ", () => {
    expect(isIsoDate("2026-11-20")).toBe(true);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2027-02-29")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("20/11/2026")).toBe(false);
  });

  it("cộng ngày qua tháng/năm", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("cộng tháng", () => {
    expect(addMonths({ year: 2026, month: 11 }, 2)).toEqual({ year: 2027, month: 1 });
    expect(addMonths({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(compareMonths({ year: 2026, month: 10 }, { year: 2026, month: 11 })).toBeLessThan(0);
    expect(yearMonthOf("2026-10-08")).toEqual({ year: 2026, month: 10 });
  });

  it("thứ trong tuần (0 = Chủ nhật) và nhãn tiếng Việt", () => {
    expect(dayOfWeek("2026-10-08")).toBe(4); // Thứ Năm
    expect(formatDayLabel("2026-11-20")).toBe("Thứ Sáu, 20/11/2026");
    expect(formatDayLabel("2026-11-22")).toBe("Chủ nhật, 22/11/2026");
    expect(formatShortDate("2026-11-20")).toBe("20/11/2026");
    expect(monthLabel({ year: 2026, month: 11 })).toBe("Tháng 11/2026");
  });

  it("lưới tháng bắt đầu Thứ Hai, đủ tuần", () => {
    const grid = monthGrid({ year: 2026, month: 10 }); // 01/10/2026 là Thứ Năm
    expect(grid[0]).toEqual([null, null, null, "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(grid.at(-1)).toEqual([
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
      null,
    ]);
    expect(grid.every((w) => w.length === 7)).toBe(true);
  });

  it("mỗi ngày của tháng xuất hiện đúng một lần, đúng cột thứ (property)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2000, max: 2100 }), fc.integer({ min: 1, max: 12 }), (year, month) => {
        const grid = monthGrid({ year, month });
        const days = grid.flat().filter((d): d is string => d !== null);
        expect(new Set(days).size).toBe(days.length);
        expect(days[0]).toBe(`${year}-${String(month).padStart(2, "0")}-01`);
        grid.forEach((week) =>
          week.forEach((d, col) => {
            if (d) expect((dayOfWeek(d) + 6) % 7).toBe(col);
          }),
        );
      }),
    );
  });

  it("ngày nghỉ chỉ từ hôm nay tới 12 tháng tới", () => {
    const today = "2026-10-08";
    expect(lastClosureDate(today)).toBe("2027-10-07");
    expect(lastClosureDate("2028-01-31")).toBe("2029-01-30");
    expect(isClosureDateAllowed("2026-10-08", today)).toBe(true);
    expect(isClosureDateAllowed("2026-10-07", today)).toBe(false);
    expect(isClosureDateAllowed("2027-10-07", today)).toBe(true);
    expect(isClosureDateAllowed("2027-10-08", today)).toBe(false);
    expect(isClosureDateAllowed("2026-02-30", today)).toBe(false);
  });
});
