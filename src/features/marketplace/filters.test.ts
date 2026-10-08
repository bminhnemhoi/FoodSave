import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  clearFilters,
  countActiveFilters,
  effectiveMaxKm,
  EMPTY_FILTERS,
  filtersHref,
  LABEL_FILTERS,
  normalizeKm,
  parseFilters,
  parseView,
  serializeFilters,
  toggle,
  toRpcArgs,
  type MarketplaceFilters,
} from "./filters";

const SITE = "6f1c2a7e-9b1d-4c8e-8a51-2f0e5b9d3c11";

describe("parseFilters", () => {
  it("đọc đủ tham số hợp lệ", () => {
    const f = parseFilters(
      new URLSearchParams(`site=${SITE}&labels=yellow,red&maxKm=3&maxMin=30&cats=dairy,bread`),
    );
    expect(f).toEqual({
      siteId: SITE,
      labels: ["red", "yellow"],
      maxKm: 3,
      maxMin: 30,
      categories: ["bread", "dairy"],
    });
  });

  it("nhận object searchParams của Next (có mảng)", () => {
    const f = parseFilters({ site: [SITE, "x"], labels: "green", maxKm: "2,5" });
    expect(f.siteId).toBe(SITE);
    expect(f.labels).toEqual(["green"]);
    expect(f.maxKm).toBe(2.5);
  });

  it("bỏ qua giá trị không hợp lệ thay vì báo lỗi", () => {
    const f = parseFilters(
      new URLSearchParams("site=abc&labels=blue,expired&maxKm=-1&maxMin=7.5&cats=DROP TABLE,x,bread"),
    );
    expect(f).toEqual({ ...EMPTY_FILTERS, categories: ["bread"] });
  });

  it("maxMin ngoài 5–240 bị bỏ", () => {
    expect(parseFilters(new URLSearchParams("maxMin=4")).maxMin).toBeNull();
    expect(parseFilters(new URLSearchParams("maxMin=241")).maxMin).toBeNull();
    expect(parseFilters(new URLSearchParams("maxMin=240")).maxMin).toBe(240);
  });

  it("chế độ xem mặc định là danh sách", () => {
    expect(parseView(new URLSearchParams(""))).toBe("list");
    expect(parseView(new URLSearchParams("view=map"))).toBe("map");
    expect(parseView({ view: "satellite" })).toBe("list");
  });
});

describe("normalizeKm / effectiveMaxKm", () => {
  it("làm tròn bước 0,5 km trong 0,5–30", () => {
    expect(normalizeKm(2.3)).toBe(2.5);
    expect(normalizeKm(0.2)).toBeNull();
    expect(normalizeKm(31)).toBeNull();
    expect(normalizeKm(Number.NaN)).toBeNull();
  });

  it("không lọc thêm khi bằng hoặc vượt bán kính phục vụ", () => {
    expect(effectiveMaxKm(5, 5)).toBeNull();
    expect(effectiveMaxKm(8, 5)).toBeNull();
    expect(effectiveMaxKm(3, 5)).toBe(3);
    expect(effectiveMaxKm(null, 5)).toBeNull();
  });
});

describe("serializeFilters", () => {
  it("bỏ giá trị mặc định, thứ tự ổn định", () => {
    const f: MarketplaceFilters = {
      siteId: SITE,
      labels: ["yellow", "red"],
      maxKm: 5,
      maxMin: null,
      categories: ["dairy", "bread"],
    };
    expect(serializeFilters(f, { radiusKm: 5 }).toString()).toBe(
      `site=${SITE}&labels=red%2Cyellow&cats=bread%2Cdairy`,
    );
  });

  it("chọn đủ 3 nhãn = không lọc nhãn", () => {
    const f = { ...EMPTY_FILTERS, labels: [...LABEL_FILTERS] };
    expect(serializeFilters(f).has("labels")).toBe(false);
    expect(countActiveFilters(f, 5)).toBe(0);
  });

  it("giữ chế độ bản đồ trong URL", () => {
    expect(filtersHref("/charity/donations", EMPTY_FILTERS, { view: "map" })).toBe(
      "/charity/donations?view=map",
    );
    expect(filtersHref("/charity/donations", EMPTY_FILTERS)).toBe("/charity/donations");
  });

  it("thuộc tính: parse(serialize(f)) giữ nguyên bộ lọc đã chuẩn hóa", () => {
    const arb = fc.record({
      siteId: fc.option(
        fc.uuid().map((s) => s.toLowerCase()),
        { nil: null },
      ),
      labels: fc.subarray([...LABEL_FILTERS]),
      maxKm: fc.option(
        fc.integer({ min: 1, max: 60 }).map((n) => n / 2),
        { nil: null },
      ),
      maxMin: fc.option(fc.integer({ min: 5, max: 240 }), { nil: null }),
      categories: fc.uniqueArray(fc.constantFrom("bread", "dairy", "cooked_meal", "fruit"), { maxLength: 4 }),
    });
    fc.assert(
      fc.property(arb, (f) => {
        const back = parseFilters(serializeFilters(f));
        const labels =
          f.labels.length === LABEL_FILTERS.length ? [] : LABEL_FILTERS.filter((l) => f.labels.includes(l));
        expect(back).toEqual({ ...f, labels, categories: [...f.categories].sort() });
      }),
      { numRuns: 200 },
    );
  });
});

describe("countActiveFilters / clearFilters / toggle", () => {
  it("đếm bộ lọc đang áp (không tính điểm nhận)", () => {
    const f: MarketplaceFilters = {
      siteId: SITE,
      labels: ["red"],
      maxKm: 3,
      maxMin: 30,
      categories: ["bread"],
    };
    expect(countActiveFilters(f, 5)).toBe(4);
    expect(countActiveFilters({ ...f, maxKm: 5 }, 5)).toBe(3);
    expect(clearFilters(f)).toEqual({ ...EMPTY_FILTERS, siteId: SITE });
  });

  it("toggle thêm/bớt phần tử", () => {
    expect(toggle(["red"], "yellow")).toEqual(["red", "yellow"]);
    expect(toggle(["red", "yellow"], "red")).toEqual(["yellow"]);
  });
});

describe("toRpcArgs", () => {
  it("chỉ gửi tham số có giá trị", () => {
    expect(toRpcArgs(EMPTY_FILTERS, SITE, 5)).toEqual({ p_charity_site_id: SITE });
    expect(
      toRpcArgs({ siteId: SITE, labels: ["red"], maxKm: 3, maxMin: 45, categories: ["bread"] }, SITE, 5),
    ).toEqual({
      p_charity_site_id: SITE,
      p_labels: ["red"],
      p_max_km: 3,
      p_max_travel_min: 45,
      p_category_codes: ["bread"],
    });
  });

  it("khoảng cách ≥ bán kính không gửi p_max_km", () => {
    expect(toRpcArgs({ ...EMPTY_FILTERS, maxKm: 10 }, SITE, 5)).toEqual({ p_charity_site_id: SITE });
  });
});
