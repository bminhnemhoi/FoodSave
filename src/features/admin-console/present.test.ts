import { describe, expect, it } from "vitest";

import { formatWaiting } from "./present";

describe("formatWaiting", () => {
  it.each([
    [0, "dưới 1 phút"],
    [59_000, "dưới 1 phút"],
    [60_000, "1 phút"],
    [45 * 60_000, "45 phút"],
    [65 * 60_000, "1 giờ 05 phút"],
    [(2 * 60 + 30) * 60_000, "2 giờ 30 phút"],
    [24 * 3_600_000, "1 ngày"],
    [(3 * 24 + 4) * 3_600_000 + 10 * 60_000, "3 ngày 4 giờ"],
    [Number.NaN, "dưới 1 phút"],
  ])("%d ms ⇒ %s", (ms, text) => {
    expect(formatWaiting(ms)).toBe(text);
  });
});
