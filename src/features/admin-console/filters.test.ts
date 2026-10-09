import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  allocationsHref,
  auditHref,
  buildHref,
  hasAuditFilter,
  hasOfferFilter,
  offerSortOf,
  offerStatusesOf,
  offersHref,
  parseAllocationFilters,
  parseAuditFilters,
  parseOfferFilters,
  staleBefore,
  toggleLabel,
  vnDayRange,
} from "./filters";

const BASE = "/admin/offers";

describe("parseOfferFilters / offersHref", () => {
  it("mặc định: lô đang diễn ra, không lọc, chỉ dữ liệu thật, trang 1", () => {
    const f = parseOfferFilters({});
    expect(f).toEqual({
      view: "live",
      labels: [],
      q: "",
      cat: null,
      demo: false,
      unclaimed: false,
      soon: false,
      page: 1,
    });
    expect(offersHref(BASE, f)).toBe(BASE);
    expect(hasOfferFilter(f)).toBe(false);
  });

  it("đọc đủ tham số và giữ thứ tự nhãn Đỏ → Vàng → Xanh → Hết hạn", () => {
    const f = parseOfferFilters({
      view: "all",
      label: "green,red,bogus,expired",
      q: "  Hạt Lúa  ",
      cat: "bread",
      demo: "1",
      unclaimed: "1",
      soon: "1",
      page: "3",
    });
    expect(f).toMatchObject({ view: "all", labels: ["red", "green", "expired"], q: "Hạt Lúa", cat: "bread" });
    expect(f).toMatchObject({ demo: true, unclaimed: true, soon: true, page: 3 });
    expect(hasOfferFilter(f)).toBe(true);
    expect(offersHref(BASE, f)).toBe(
      `${BASE}?view=all&label=red%2Cgreen%2Cexpired&q=H%E1%BA%A1t+L%C3%BAa&cat=bread&demo=1&unclaimed=1&soon=1&page=3`,
    );
  });

  it("giá trị lạ ⇒ mặc định, không lỗi (trạng thái, danh mục, trang, mảng)", () => {
    const f = parseOfferFilters({
      view: "deleted",
      cat: "Bread;drop",
      page: "-2",
      demo: "true",
      label: ["red", "green"],
    });
    expect(f.view).toBe("live");
    expect(f.cat).toBeNull();
    expect(f.page).toBe(1);
    expect(f.demo).toBe(false);
    expect(f.labels).toEqual(["red"]); // mảng ⇒ lấy phần tử đầu
    expect(parseOfferFilters({ page: "1001" }).page).toBe(1);
    expect(parseOfferFilters({ q: "x".repeat(200) }).q).toHaveLength(80);
  });

  it("round-trip: parse(href(f)) = f", () => {
    const arb = fc.record({
      view: fc.constantFrom(
        "live",
        "open",
        "fully_allocated",
        "draft",
        "completed",
        "expired",
        "cancelled",
        "all",
      ),
      labels: fc.subarray(["red", "yellow", "green", "expired"] as const),
      q: fc.string({ maxLength: 20 }).map((s) => s.trim()),
      cat: fc.constantFrom(null, "bread", "cooked_meal"),
      demo: fc.boolean(),
      unclaimed: fc.boolean(),
      soon: fc.boolean(),
      page: fc.integer({ min: 1, max: 1000 }),
    });
    fc.assert(
      fc.property(arb, (f) => {
        const href = offersHref(BASE, f);
        const sp = new URL(href, "http://x").searchParams;
        expect(parseOfferFilters(Object.fromEntries(sp))).toEqual(f);
      }),
    );
  });

  it("toggleLabel bật/tắt một nhãn và về trang 1", () => {
    const f = parseOfferFilters({ label: "yellow", page: "4" });
    expect(toggleLabel(f, "red")).toEqual({ labels: ["red", "yellow"], page: 1 });
    expect(toggleLabel(f, "yellow")).toEqual({ labels: [], page: 1 });
  });

  it("trạng thái và cách sắp xếp theo chế độ xem", () => {
    expect(offerStatusesOf("live")).toEqual(["open", "fully_allocated"]);
    expect(offerStatusesOf("all")).toBeNull();
    expect(offerStatusesOf("expired")).toEqual(["expired"]);
    expect(offerSortOf("live")).toBe("urgency");
    expect(offerSortOf("all")).toBe("urgency");
    expect(offerSortOf("cancelled")).toBe("closed");
    expect(offerSortOf("draft")).toBe("created");
  });
});

describe("parseAllocationFilters / allocationsHref", () => {
  const A = "/admin/allocations";

  it("mặc định: mọi trạng thái, chỉ dữ liệu thật", () => {
    const f = parseAllocationFilters({});
    expect(f).toEqual({ view: "all", quick: null, demo: false, id: null, page: 1 });
    expect(allocationsHref(A, f)).toBe(A);
  });

  it("'chờ quá 1 giờ' luôn là trạng thái requested (bỏ view khỏi URL)", () => {
    const f = parseAllocationFilters({ quick: "stale", view: "delivered" });
    expect(f.view).toBe("requested");
    expect(allocationsHref(A, f)).toBe(`${A}?quick=stale`);
  });

  it("chuyến đang chạy kết hợp được với trạng thái; id phải là uuid", () => {
    const f = parseAllocationFilters({
      quick: "running",
      view: "assigned",
      demo: "1",
      id: "8F14E45F-CEEA-467A-9575-1E2A6C3F4B5D",
    });
    expect(f).toMatchObject({ view: "assigned", quick: "running", demo: true });
    expect(f.id).toBe("8f14e45f-ceea-467a-9575-1e2a6c3f4b5d");
    expect(parseAllocationFilters({ id: "1 or 1=1" }).id).toBeNull();
    expect(parseAllocationFilters({ quick: "x" }).quick).toBeNull();
  });

  it("staleBefore = now − 60 phút", () => {
    const now = new Date("2026-10-09T05:00:00Z");
    expect(staleBefore(now)).toBe("2026-10-09T04:00:00.000Z");
  });
});

describe("parseAuditFilters / auditHref / vnDayRange", () => {
  const B = "/admin/audit";

  it("nhóm hành động và loại đối tượng chỉ nhận giá trị trong danh sách đóng", () => {
    const f = parseAuditFilters({ act: "org", type: "organization", actor: " Tâm " });
    expect(f).toMatchObject({ act: "org", type: "organization", actor: "Tâm" });
    expect(parseAuditFilters({ act: "org.%", type: "users" })).toMatchObject({ act: null, type: null });
    expect(hasAuditFilter(f)).toBe(true);
    expect(hasAuditFilter(parseAuditFilters({}))).toBe(false);
  });

  it("ngày sai định dạng bị bỏ; from > to thì đổi chỗ", () => {
    expect(parseAuditFilters({ from: "2026-02-30", to: "09/10/2026" })).toMatchObject({
      from: null,
      to: null,
    });
    expect(parseAuditFilters({ from: "2026-10-09", to: "2026-10-01" })).toMatchObject({
      from: "2026-10-01",
      to: "2026-10-09",
    });
  });

  it("khoảng ngày giờ Việt Nam: [00:00 from, 00:00 ngày sau to)", () => {
    expect(vnDayRange("2026-10-01", "2026-10-09")).toEqual({
      gte: "2026-10-01T00:00:00+07:00",
      lt: "2026-10-10T00:00:00+07:00",
    });
    expect(vnDayRange(null, "2026-12-31")).toEqual({ gte: null, lt: "2027-01-01T00:00:00+07:00" });
    expect(vnDayRange(null, null)).toEqual({ gte: null, lt: null });
  });

  it("auditHref bỏ giá trị rỗng, giữ thứ tự cố định", () => {
    const f = parseAuditFilters({ actor: "a@b.vn", from: "2026-10-09", page: "2" });
    expect(auditHref(B, f)).toBe(`${B}?actor=a%40b.vn&from=2026-10-09&page=2`);
    expect(auditHref(B, f, { page: 1, actor: "" })).toBe(`${B}?from=2026-10-09`);
  });

  it("buildHref: false/null/rỗng/trang 1 không vào URL", () => {
    expect(buildHref("/x", { a: null, b: "", c: false, page: 1 })).toBe("/x");
    expect(buildHref("/x", { a: true, page: 2 })).toBe("/x?a=1&page=2");
  });
});
