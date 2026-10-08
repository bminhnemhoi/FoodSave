import { describe, expect, it } from "vitest";

import { formatRemaining } from "./live-freshness";

const MIN = 60_000;

describe("formatRemaining", () => {
  it.each([
    [0, "đã hết hạn"],
    [-5 * MIN, "đã hết hạn"],
    [12 * MIN + 4_000, "còn 12:04"],
    [59 * MIN + 59_000, "còn 59:59"],
    [60 * MIN, "còn 1 giờ 00 phút"],
    [3 * 60 * MIN + 5 * MIN, "còn 3 giờ 05 phút"],
    [24 * 60 * MIN, "còn 1 ngày"],
    [2 * 24 * 60 * MIN + 3 * 60 * MIN + 59 * MIN, "còn 2 ngày 3 giờ"],
  ])("%d ms ⇒ %s", (ms, expected) => {
    expect(formatRemaining(ms)).toBe(expected);
  });
});
