import fc from "fast-check";
import { describe, expect, it } from "vitest";

import fixtures from "./fixtures.json";
import {
  dateOnlyExpiry,
  effectiveDeadline,
  freshnessLabel,
  LABEL_PRIORITY,
  nextLabelChangeAt,
  type FreshnessLabel,
  type Perishability,
} from "./index";

const PERISHABILITY: Perishability[] = ["cooked", "fresh", "packaged"];

describe("freshnessLabel — fixture dùng chung với SQL", () => {
  it.each(fixtures.freshness)("$name", ({ perishability, deadline, at, expected }) => {
    expect(freshnessLabel(new Date(deadline), perishability as Perishability, new Date(at))).toBe(expected);
  });
});

describe("effectiveDeadline", () => {
  it.each(fixtures.effectiveDeadline)("$name", (f) => {
    const deadline = effectiveDeadline({
      expiresAt: new Date(f.expiresAt),
      pickupWindowEnd: f.pickupWindowEnd ? new Date(f.pickupWindowEnd) : null,
      siteCloseAt: f.siteCloseAt ? new Date(f.siteCloseAt) : null,
    });
    expect(deadline.toISOString()).toBe(new Date(f.expected).toISOString());
    if ("redFrom" in f && f.redFrom) {
      const redFrom = new Date(f.redFrom);
      expect(
        freshnessLabel(deadline, f.perishability as Perishability, new Date(redFrom.getTime() - 60_000)),
      ).toBe("yellow");
      expect(
        freshnessLabel(deadline, f.perishability as Perishability, new Date(redFrom.getTime() + 60_000)),
      ).toBe("red");
    }
  });
});

describe("dateOnlyExpiry", () => {
  it.each(fixtures.dateOnly)("$date ⇒ 23:59 giờ Việt Nam", ({ date, expected }) => {
    expect(dateOnlyExpiry(date).toISOString()).toBe(new Date(expected).toISOString());
  });
  it("từ chối chuỗi ngày sai định dạng", () => {
    expect(() => dateOnlyExpiry("20/10/2026")).toThrow("invalid_date");
  });
});

describe("thuộc tính (property-based)", () => {
  const arbCase = fc.record({
    perishability: fc.constantFrom(...PERISHABILITY),
    deadline: fc.integer({ min: 1_700_000_000_000, max: 1_900_000_000_000 }),
    t1: fc.integer({ min: 1_700_000_000_000, max: 1_900_000_000_000 }),
    dt: fc.integer({ min: 0, max: 30 * 24 * 3600 * 1000 }),
  });

  it("nhãn không bao giờ 'tươi lại' khi thời gian trôi", () => {
    const freshness: Record<FreshnessLabel, number> = { green: 3, yellow: 2, red: 1, expired: 0 };
    fc.assert(
      fc.property(arbCase, ({ perishability, deadline, t1, dt }) => {
        const a = freshnessLabel(new Date(deadline), perishability, new Date(t1));
        const b = freshnessLabel(new Date(deadline), perishability, new Date(t1 + dt));
        return freshness[b] <= freshness[a];
      }),
    );
  });

  it("Hết hạn khi và chỉ khi đã tới hạn", () => {
    fc.assert(
      fc.property(arbCase, ({ perishability, deadline, t1 }) => {
        const label = freshnessLabel(new Date(deadline), perishability, new Date(t1));
        return (label === "expired") === deadline <= t1;
      }),
    );
  });

  it("nextLabelChangeAt trả về thời điểm nhãn thực sự đổi", () => {
    fc.assert(
      fc.property(arbCase, ({ perishability, deadline, t1 }) => {
        const d = new Date(deadline);
        const now = new Date(t1);
        const change = nextLabelChangeAt(d, perishability, now);
        const label = freshnessLabel(d, perishability, now);
        if (change === null) return label === "expired";
        if (change.getTime() <= now.getTime()) return false;
        const before = freshnessLabel(d, perishability, new Date(change.getTime() - 1));
        const after = freshnessLabel(d, perishability, change);
        return before === label && after !== label;
      }),
    );
  });

  it("effectiveDeadline không bao giờ muộn hơn hạn dùng", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1e12 }),
        fc.option(fc.integer({ min: 0, max: 1e12 })),
        fc.option(fc.integer({ min: 0, max: 1e12 })),
        (exp, pw, close) => {
          const d = effectiveDeadline({
            expiresAt: new Date(exp),
            pickupWindowEnd: pw === null ? null : new Date(pw),
            siteCloseAt: close === null ? null : new Date(close),
          });
          return (
            d.getTime() <= exp &&
            (pw === null || d.getTime() <= pw) &&
            (close === null || d.getTime() <= close)
          );
        },
      ),
    );
  });

  it("thứ tự ưu tiên hiển thị Đỏ → Vàng → Xanh → Hết hạn", () => {
    const sorted = (["green", "expired", "red", "yellow"] as FreshnessLabel[]).sort(
      (a, b) => LABEL_PRIORITY[a] - LABEL_PRIORITY[b],
    );
    expect(sorted).toEqual(["red", "yellow", "green", "expired"]);
  });
});
