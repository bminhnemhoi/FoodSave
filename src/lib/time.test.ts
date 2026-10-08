import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { maskTimeTyping, parseTime24, stepTime, TIME_24H_RE } from "./time";

describe("parseTime24", () => {
  it.each([
    ["7", "07:00"],
    ["07", "07:00"],
    ["18", "18:00"],
    ["730", "07:30"],
    ["0730", "07:30"],
    ["1830", "18:30"],
    ["7:30", "07:30"],
    ["07:30", "07:30"],
    ["7h30", "07:30"],
    ["18h", "18:00"],
    ["7.05", "07:05"],
    [" 21:00 ", "21:00"],
    ["0:00", "00:00"],
    ["23:59", "23:59"],
  ])("%s → %s", (raw, expected) => {
    expect(parseTime24(raw)).toBe(expected);
  });

  it.each(["", "  ", "24:00", "24", "7:3", "7:60", "1860", "183", "12345", "ab", "-1", "7:30 PM"])(
    "từ chối %j",
    (raw) => {
      expect(parseTime24(raw)).toBeNull();
    },
  );

  it("mọi giờ hợp lệ HH:mm được giữ nguyên (property)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 }), (h, m) => {
        const t = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
        expect(parseTime24(t)).toBe(t);
        expect(parseTime24(t.replace(":", ""))).toBe(t);
      }),
    );
  });

  it("kết quả luôn đúng dạng 24 giờ hoặc null (property)", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 8 }), (raw) => {
        const out = parseTime24(raw);
        expect(out === null || TIME_24H_RE.test(out)).toBe(true);
      }),
    );
  });
});

describe("maskTimeTyping", () => {
  it.each([
    ["1", "1"],
    ["18", "18"],
    ["183", "183"],
    ["1830", "18:30"],
    ["18305", "18:30"],
    ["18:3", "18:3"],
    ["18:30", "18:30"],
    ["7h30", "7:30"],
    ["7.30", "7:30"],
    ["ab12:3:4", "12:34"],
    ["18::30", "18:30"],
    ["", ""],
  ])("%j → %j", (raw, expected) => {
    expect(maskTimeTyping(raw)).toBe(expected);
  });

  it("không bao giờ dài quá 5 ký tự và chỉ có số, dấu ':' (property)", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 20 }), (raw) => {
        const out = maskTimeTyping(raw);
        expect(out.length).toBeLessThanOrEqual(5);
        expect(out).toMatch(/^[\d:]*$/);
        expect(out.split(":").length).toBeLessThanOrEqual(2);
      }),
    );
  });
});

describe("stepTime", () => {
  it("bước 15 phút, quay vòng trong ngày", () => {
    expect(stepTime("07:00", 1)).toBe("07:15");
    expect(stepTime("07:00", -1)).toBe("06:45");
    expect(stepTime("23:45", 1)).toBe("00:00");
    expect(stepTime("00:00", -1)).toBe("23:45");
  });

  it("giờ lệch bước làm tròn tới mốc kế tiếp theo chiều bấm", () => {
    expect(stepTime("07:10", 1)).toBe("07:15");
    expect(stepTime("07:10", -1)).toBe("07:00");
    expect(stepTime("23:50", 1)).toBe("00:00");
  });

  it("ô trống/sai bắt đầu từ 00:00; nhận giá trị chưa chuẩn hóa", () => {
    expect(stepTime("", 1)).toBe("00:00");
    expect(stepTime("abc", -1)).toBe("00:00");
    expect(stepTime("730", 1)).toBe("07:45");
  });

  it("bước tùy chọn", () => {
    expect(stepTime("07:00", 1, 30)).toBe("07:30");
    expect(stepTime("07:00", 1, 1)).toBe("07:01");
  });
});
