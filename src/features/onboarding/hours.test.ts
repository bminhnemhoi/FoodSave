import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  defaultHours,
  hoursFromRows,
  hoursToRows,
  HOURS_MESSAGES,
  summarizeHours,
  validateHours,
  type HoursValue,
} from "./hours";

function withDay(v: HoursValue, dow: number, patch: Partial<HoursValue["days"][number]>): HoursValue {
  return { ...v, days: v.days.map((d) => (d.dow === dow ? { ...d, ...patch } : d)) };
}

describe("defaultHours / hoursToRows / hoursFromRows", () => {
  it("mặc định 7 ngày, Thứ Hai trước, Chủ nhật cuối", () => {
    const v = defaultHours("store");
    expect(v.days.map((d) => d.dow)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(validateHours(v)).toBeNull();
    expect(hoursToRows(v)).toHaveLength(7);
  });

  it("24/7 ⇒ [] và điểm có sẵn không có dòng ⇒ 24/7", () => {
    expect(hoursToRows({ ...defaultHours("store"), alwaysOpen: true })).toEqual([]);
    expect(hoursFromRows([], true, "store").alwaysOpen).toBe(true);
    expect(hoursFromRows([], false, "charity").alwaysOpen).toBe(false);
  });

  it("đi vòng DB ⇒ editor ⇒ DB giữ nguyên", () => {
    const rows = [
      { dow: 1, opens: "07:00:00", closes: "21:00:00", closes_next_day: false },
      { dow: 6, opens: "18:00", closes: "02:00", closes_next_day: true },
    ];
    const v = hoursFromRows(rows, true, "store");
    expect(v.days.find((d) => d.dow === 0)?.open).toBe(false);
    expect(hoursToRows(v)).toEqual([
      { dow: 1, opens: "07:00", closes: "21:00", closes_next_day: false },
      { dow: 6, opens: "18:00", closes: "02:00", closes_next_day: true },
    ]);
  });
});

describe("validateHours (khớp set_site_hours)", () => {
  const base = defaultHours("store");

  it("giờ kết thúc phải sau giờ bắt đầu nếu không qua nửa đêm", () => {
    const e = validateHours(withDay(base, 1, { opens: "21:00", closes: "07:00" }));
    expect(e?.days[1]).toBe(HOURS_MESSAGES.order);
  });

  it("qua nửa đêm cần giờ kết thúc ≤ giờ bắt đầu (18:00 → 00:00 hợp lệ)", () => {
    const allClosed = { ...base, days: base.days.map((d) => ({ ...d, open: d.dow === 3 })) };
    expect(
      validateHours(withDay(allClosed, 3, { opens: "18:00", closes: "00:00", closesNextDay: true })),
    ).toBeNull();
    expect(
      validateHours(withDay(allClosed, 3, { opens: "18:00", closes: "19:00", closesNextDay: true }))?.days[3],
    ).toBe(HOURS_MESSAGES.overnight);
  });

  it("khung qua đêm chồng lên sáng hôm sau", () => {
    const v = withDay(withDay(base, 1, { opens: "18:00", closes: "08:00", closesNextDay: true }), 2, {
      opens: "07:00",
      closes: "21:00",
    });
    expect(validateHours(v)?.days[2]).toBe(HOURS_MESSAGES.overlap("Thứ Ba", "Thứ Hai"));
  });

  it("vòng tuần: Thứ Bảy qua đêm chồng lên sáng Chủ nhật", () => {
    const v = withDay(withDay(base, 6, { opens: "20:00", closes: "08:00", closesNextDay: true }), 0, {
      opens: "07:00",
      closes: "12:00",
    });
    expect(validateHours(v)?.days[0]).toBe(HOURS_MESSAGES.overlap("Chủ nhật", "Thứ Bảy"));
  });

  it("qua đêm kết thúc đúng lúc ngày sau mở cửa thì không chồng", () => {
    const v = withDay(withDay(base, 6, { opens: "20:00", closes: "07:00", closesNextDay: true }), 0, {
      opens: "07:00",
      closes: "12:00",
    });
    expect(validateHours(v)).toBeNull();
  });

  it("định dạng giờ sai", () => {
    expect(validateHours(withDay(base, 5, { opens: "7h" }))?.days[5]).toBe(HOURS_MESSAGES.format);
  });

  it("không có ngày nào và không 24/7 ⇒ lỗi chung", () => {
    const none = { ...base, days: base.days.map((d) => ({ ...d, open: false })) };
    expect(validateHours(none)?.form).toBe(HOURS_MESSAGES.noDay);
    expect(validateHours({ ...none, alwaysOpen: true })).toBeNull();
  });

  it("property: lịch không qua đêm, mỗi ngày một khung luôn hợp lệ", () => {
    const time = fc.tuple(fc.integer({ min: 0, max: 22 }), fc.integer({ min: 0, max: 59 }));
    fc.assert(
      fc.property(
        fc.array(fc.tuple(time, fc.integer({ min: 1, max: 60 })), { minLength: 7, maxLength: 7 }),
        (spec) => {
          const v: HoursValue = {
            alwaysOpen: false,
            days: base.days.map((d, i) => {
              const [[h, m], len] = spec[i]!;
              const start = h * 60 + m;
              const end = Math.min(start + len, 23 * 60 + 59);
              const fmt = (x: number) =>
                `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
              return { ...d, open: true, opens: fmt(start), closes: fmt(end), closesNextDay: false };
            }),
          };
          return validateHours(v) === null;
        },
      ),
    );
  });
});

describe("summarizeHours", () => {
  it("gộp ngày liền nhau cùng giờ, ghi rõ ngày nghỉ và qua đêm", () => {
    let v = defaultHours("store");
    v = withDay(v, 6, { opens: "08:00", closes: "02:00", closesNextDay: true });
    v = withDay(v, 0, { open: false });
    expect(summarizeHours(v)).toEqual([
      "Thứ Hai – Thứ Sáu: 07:00–21:00",
      "Thứ Bảy: 08:00–02:00 (hôm sau)",
      "Chủ nhật: nghỉ",
    ]);
    expect(summarizeHours({ ...v, alwaysOpen: true })).toEqual(["Mở cả ngày, mọi ngày (24/7)"]);
  });
});
