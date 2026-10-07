import { describe, expect, it } from "vitest";

import { findNavItem, isNavActive, PORTAL_NAV } from "./nav-config";

describe("nav-config", () => {
  it("mỗi cổng có mục đúng tiền tố route và không trùng href", () => {
    for (const [role, nav] of Object.entries(PORTAL_NAV)) {
      const hrefs = nav.items.map((i) => i.href);
      expect(new Set(hrefs).size, role).toBe(hrefs.length);
      for (const href of hrefs) expect(href.startsWith(`/${role}`), href).toBe(true);
    }
  });

  it("bottom tab tối đa 4 mục và đều có trong danh sách nav", () => {
    for (const nav of Object.values(PORTAL_NAV)) {
      expect(nav.mobileTabs.length).toBeLessThanOrEqual(4);
      for (const href of nav.mobileTabs) expect(nav.items.some((i) => i.href === href)).toBe(true);
    }
  });

  it("đủ các mục theo yêu cầu shell", () => {
    expect(PORTAL_NAV.store.items.map((i) => i.label)).toEqual([
      "Tổng quan",
      "Lô tặng",
      "Nhu cầu gần bạn",
      "Bàn giao",
      "Minh chứng",
      "ESG",
      "Cài đặt",
    ]);
    expect(PORTAL_NAV.charity.items).toHaveLength(8);
    expect(PORTAL_NAV.admin.items.map((i) => i.href)).toContain("/admin/reviews");
    expect(PORTAL_NAV.volunteer.items.map((i) => i.label)).toEqual(["Hôm nay", "Chuyến", "Tài khoản"]);
  });

  it("isNavActive: trang đầu khớp chính xác, trang con khớp theo tiền tố", () => {
    const home = findNavItem("store", "/store");
    const inventory = findNavItem("store", "/store/inventory");
    expect(isNavActive(home, "/store", "/store")).toBe(true);
    expect(isNavActive(home, "/store/inventory", "/store")).toBe(false);
    expect(isNavActive(inventory, "/store/inventory", "/store")).toBe(true);
    expect(isNavActive(inventory, "/store/inventory/new", "/store")).toBe(true);
    expect(isNavActive(inventory, "/store/inventory-old", "/store")).toBe(false);
  });

  it("findNavItem báo lỗi khi route không có trong nav", () => {
    expect(() => findNavItem("admin", "/admin/khong-co")).toThrow();
  });
});
