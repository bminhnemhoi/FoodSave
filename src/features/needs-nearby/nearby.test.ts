import { describe, expect, it } from "vitest";

import { nearbyHref, parseNearbyFilters, parseNearbyView, toggleCategory } from "./filters";
import { areaText, canRespond, distanceText, toNearbyNeed, type NearbyRow } from "./present";

const KNOWN = ["bread", "pastry", "dairy"];
const SITE = "33333333-3333-4333-8333-333333333333";

function row(patch: Partial<NearbyRow> = {}): NearbyRow {
  return {
    need_id: "n1",
    charity_org_id: "c1",
    charity_name: "Mái ấm Nắng Mai",
    charity_subtype: "children_home",
    category_codes: ["bread"],
    unit: "loaf",
    quantity: 50,
    qty_in_flight: 20,
    qty_delivered: 0,
    qty_remaining: 30,
    needed_by: "2026-10-20T15:00:00+07:00",
    people_to_serve: 45,
    status: "partially_matched",
    store_site_id: SITE,
    distance_km: 2,
    site_visibility: "approximate",
    site_ward: "Phường Bàn Cờ",
    site_city: "Thành phố Hồ Chí Minh",
    site_lat: 10.775,
    site_lng: 106.69,
    ...patch,
  };
}

describe("toNearbyNeed — riêng tư vị trí", () => {
  it("gần đúng: giữ lưới + km nguyên", () => {
    const n = toNearbyNeed(row());
    expect(n.location).toEqual({ lat: 10.775, lng: 106.69 });
    expect(distanceText(n)).toBe("cách ~2 km");
    expect(areaText(n)).toBe("Phường Bàn Cờ");
  });

  it("ẩn: không toạ độ, không khoảng cách — kể cả khi dữ liệu lệch", () => {
    const n = toNearbyNeed(row({ site_visibility: "hidden", site_lat: 1, site_lng: 2, distance_km: 3 }));
    expect(n.location).toBeNull();
    expect(n.distanceKm).toBeNull();
    expect(distanceText(n)).toBe("trong bán kính phục vụ");
  });

  it("công khai: km một chữ số; thiếu phường ⇒ thành phố", () => {
    const n = toNearbyNeed(row({ site_visibility: "public", distance_km: 1.2, site_ward: null }));
    expect(distanceText(n)).toBe("cách 1,2 km");
    expect(areaText(n)).toBe("Thành phố Hồ Chí Minh");
    expect(areaText({ ward: null, city: null })).toBe("Khu vực gần bạn");
  });

  it("nút đáp ứng vô hiệu khi đã ghép đủ (US-STO-21 AC3)", () => {
    expect(canRespond(toNearbyNeed(row()))).toBe(true);
    expect(canRespond(toNearbyNeed(row({ status: "matched", qty_remaining: 0 })))).toBe(false);
    expect(canRespond(toNearbyNeed(row({ status: "open", qty_remaining: 0 })))).toBe(false);
  });
});

describe("bộ lọc URL", () => {
  it("đọc danh mục hợp lệ, bỏ mã lạ/trùng; chi nhánh phải là uuid", () => {
    expect(
      parseNearbyFilters({ cat: "bread,unknown,bread,DROP TABLE", site: SITE.toUpperCase() }, KNOWN),
    ).toEqual({
      categories: ["bread"],
      siteId: SITE,
    });
    expect(parseNearbyFilters({ cat: ["pastry,dairy"], site: "x" }, KNOWN)).toEqual({
      categories: ["pastry", "dairy"],
      siteId: null,
    });
    expect(parseNearbyFilters({}, KNOWN)).toEqual({ categories: [], siteId: null });
    expect(parseNearbyView({ view: "map" })).toBe("map");
    expect(parseNearbyView({ view: "x" })).toBe("list");
  });

  it("bật/tắt danh mục và dựng URL", () => {
    const f = toggleCategory({ categories: ["bread"], siteId: null }, "dairy");
    expect(f.categories).toEqual(["bread", "dairy"]);
    expect(toggleCategory(f, "bread").categories).toEqual(["dairy"]);
    expect(nearbyHref("/store/connect", f)).toBe("/store/connect?cat=bread%2Cdairy");
    expect(nearbyHref("/store/connect", { categories: [], siteId: SITE }, "map")).toBe(
      `/store/connect?site=${SITE}&view=map`,
    );
    expect(nearbyHref("/store/connect", { categories: [], siteId: null })).toBe("/store/connect");
  });
});
