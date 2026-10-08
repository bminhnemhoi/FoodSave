import { describe, expect, it } from "vitest";

import { AT, CHARITY, around, makeCandidate, makeNeed } from "@/core/matching/__arbitraries__";
import { proposePlans } from "@/core/matching";

import {
  bundlePath,
  bundleStops,
  coverageText,
  displayStatusOf,
  formatAmount,
  needProgress,
  planKey,
  rematchExclusions,
  remainingOf,
  toPlanViews,
  type PlanEnrichment,
} from "./present";

describe("needProgress — thanh ba lớp", () => {
  it("chia đã giao / đang giữ / còn thiếu", () => {
    const p = needProgress({ quantity: 50, qtyInFlight: 38, qtyDelivered: 0 });
    expect(p).toMatchObject({ delivered: 0, inFlight: 38, missing: 12 });
    expect(p.pctDelivered).toBe(0);
    expect(p.pctInFlight).toBeCloseTo(76, 6);
  });

  it("kẹp bề rộng khi giữ + giao vượt cần (quy đổi kg)", () => {
    const p = needProgress({ quantity: 10, qtyInFlight: 6, qtyDelivered: 6 });
    expect(p.missing).toBe(0);
    expect(p.pctDelivered + p.pctInFlight).toBe(100);
  });

  it("số lẻ kg không sinh sai số dấu phẩy động", () => {
    expect(needProgress({ quantity: 5.3, qtyInFlight: 2.1, qtyDelivered: 1.1 }).missing).toBe(2.1);
    expect(remainingOf({ quantity: 5.3, qtyInFlight: 2.1, qtyDelivered: 1.1 })).toBe(2.1);
    expect(remainingOf({ quantity: 5, qtyInFlight: 6, qtyDelivered: 0 })).toBe(0);
  });

  it("nhu cầu 0 (dữ liệu hỏng) không chia cho 0", () => {
    expect(needProgress({ quantity: 0, qtyInFlight: 0, qtyDelivered: 0 })).toMatchObject({
      pctDelivered: 0,
      pctInFlight: 0,
    });
  });
});

describe("coverageText (US-CHA-10 AC1, AC3)", () => {
  it("đủ và thiếu", () => {
    expect(coverageText({ coveredQty: 50, requestedQty: 50, shortfall: 0 })).toBe("Đáp ứng 50/50");
    expect(coverageText({ coveredQty: 38, requestedQty: 50, shortfall: 12 })).toBe(
      "Đáp ứng 38/50 — thiếu 12",
    );
    expect(formatAmount(1200.5)).toBe("1.200,5");
  });
});

describe("planKey — chữ ký phương án", () => {
  it("không phụ thuộc thứ tự dòng, đổi khi số lượng đổi", () => {
    const a = planKey([
      { offerId: "b", qty: 18 },
      { offerId: "a", qty: 20 },
    ]);
    expect(a).toBe(
      planKey([
        { offerId: "a", qty: 20 },
        { offerId: "b", qty: 18 },
      ]),
    );
    expect(a).not.toBe(
      planKey([
        { offerId: "a", qty: 19 },
        { offerId: "b", qty: 18 },
      ]),
    );
  });
});

describe("rematchExclusions — ghép lại phần thiếu (US-CHA-12)", () => {
  it("loại điểm đang giữ, đã từ chối, hết hạn, cửa hàng hủy; giữ điểm do tổ chức tự hủy", () => {
    expect(
      rematchExclusions([
        { storeSiteId: "s-a", status: "requested", cancelActor: null },
        { storeSiteId: "s-b", status: "confirmed", cancelActor: null },
        { storeSiteId: "s-c", status: "rejected", cancelActor: "store" },
        { storeSiteId: "s-d", status: "expired", cancelActor: null },
        { storeSiteId: "s-e", status: "cancelled", cancelActor: "store" },
        { storeSiteId: "s-f", status: "cancelled", cancelActor: "charity" },
        { storeSiteId: "s-a", status: "delivered", cancelActor: null },
      ]),
    ).toEqual(["s-a", "s-b", "s-c", "s-d", "s-e"]);
    expect(rematchExclusions([])).toEqual([]);
  });
});

describe("displayStatusOf — quá needed_by mà cron chưa đóng", () => {
  const at = Date.parse("2026-10-20T10:00:00+07:00");
  it("sống + quá hạn ⇒ expired / closed_partial", () => {
    const past = "2026-10-20T09:00:00+07:00";
    expect(displayStatusOf({ status: "open", neededBy: past, qtyDelivered: 0 }, at)).toBe("expired");
    expect(displayStatusOf({ status: "matched", neededBy: past, qtyDelivered: 3 }, at)).toBe(
      "closed_partial",
    );
  });
  it("chưa tới hạn hoặc đã kết thúc ⇒ giữ nguyên", () => {
    expect(
      displayStatusOf({ status: "open", neededBy: "2026-10-20T15:00:00+07:00", qtyDelivered: 0 }, at),
    ).toBe("open");
    expect(
      displayStatusOf({ status: "cancelled", neededBy: "2026-10-19T15:00:00+07:00", qtyDelivered: 0 }, at),
    ).toBe("cancelled");
  });
});

describe("toPlanViews — kịch bản 50 bánh từ 3 cửa hàng", () => {
  const need = makeNeed({ quantity: 50 });
  const spec = {
    A: { location: around(1.0, 30), deadlineMin: 120, trust: 70 },
    B: { location: around(1.6, 80), deadlineMin: 360, trust: 65 },
    C: { location: around(2.2, 140), deadlineMin: 420, trust: 60 },
    D: { location: around(7.0, 250), deadlineMin: 400, trust: 80 },
  } as const;
  const rows = [
    makeCandidate({ offerId: "o-A", siteId: "s-A", qty: 20, ...spec.A }, need),
    makeCandidate({ offerId: "o-B", siteId: "s-B", qty: 18, ...spec.B }, need),
    makeCandidate({ offerId: "o-C", siteId: "s-C", qty: 12, ...spec.C, hidden: true }, need),
    makeCandidate({ offerId: "o-D", siteId: "s-D", qty: 25, ...spec.D }, need),
  ];
  const info: PlanEnrichment = {
    offers: { "o-A": { title: "Bánh mì A" }, "o-B": { title: "Bánh mì B" }, "o-C": { title: "Bánh mì C" } },
    stores: { "org-s-A": { name: "Tiệm A" }, "org-s-B": { name: "Tiệm B" }, "org-s-C": { name: "Tiệm C" } },
    sites: {
      "s-A": { name: "Chi nhánh A", visibility: "public", ward: "Phường 1" },
      "s-B": { name: "Chi nhánh B", visibility: "approximate", ward: "Phường 2" },
      "s-C": { name: "Chi nhánh C", visibility: "hidden", ward: "Phường 3" },
    },
    categoryNames: { bread: "Bánh mì & bakery" },
  };
  const result = proposePlans(need, rows);
  const views = toPlanViews(result, "loaf", info, CHARITY);
  const plan1 = views[0]!;

  it("phương án 1 = 20 + 18 + 12, đủ 50, 3 điểm dừng", () => {
    expect(plan1.rank).toBe(1);
    expect(plan1.covered).toBe(true);
    expect(plan1.coveredQty).toBe(50);
    expect(plan1.stopCount).toBe(3);
    expect(
      plan1.stops
        .flatMap((s) => s.lines.map((l) => [l.offerId, l.qty]))
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    ).toEqual([
      ["o-A", 20],
      ["o-B", 18],
      ["o-C", 12],
    ]);
    expect(plan1.key).toBe(planKey(result.plans[0]!.lines));
  });

  it("gắn tên lô / cửa hàng / danh mục và nhãn tươi", () => {
    const a = plan1.stops.find((s) => s.siteId === "s-A")!;
    expect(a.storeName).toBe("Tiệm A");
    expect(a.lines[0]).toMatchObject({ title: "Bánh mì A", categoryName: "Bánh mì & bakery", unit: "loaf" });
    expect(plan1.redLots).toBe(1); // A còn 2 giờ, bánh mì (cooked) ⇒ Đỏ
  });

  it("điểm ẩn: không toạ độ, không vào đường vẽ; phương án không gọi chỉ đường thật", () => {
    const c = plan1.stops.find((s) => s.siteId === "s-C")!;
    expect(c.visibility).toBe("hidden");
    expect(c.location).toBeNull();
    expect(plan1.hiddenStops).toBe(1);
    expect(plan1.allPublic).toBe(false);
    expect(plan1.path).toHaveLength(2 + 2); // điểm nhận → A, B → điểm nhận
    expect(plan1.path[0]).toEqual([CHARITY.lng, CHARITY.lat]);
    expect(plan1.path.at(-1)).toEqual([CHARITY.lng, CHARITY.lat]);
  });

  it("điểm gần đúng giữ toạ độ lưới, thứ tự đường vẽ theo thứ tự đi", () => {
    const order = plan1.stops.filter((s) => s.location).map((s) => [s.location!.lng, s.location!.lat]);
    expect(plan1.path.slice(1, -1)).toEqual(order);
    expect(plan1.stops.map((s) => s.seq)).toEqual([1, 2, 3]);
    expect(plan1.stops.find((s) => s.siteId === "s-B")!.visibility).toBe("approximate");
  });

  it("thiếu tên (RLS ẩn) ⇒ nhãn chung, điểm không rõ coi như ẩn", () => {
    const d = toPlanViews(
      result,
      "loaf",
      { offers: {}, stores: {}, sites: {}, categoryNames: {} },
      CHARITY,
    )[0]!;
    expect(d.stops.every((s) => s.storeName === "Cửa hàng" && s.visibility === "hidden" && !s.location)).toBe(
      true,
    );
  });

  it("thời điểm tính cố định ⇒ kết quả tất định", () => {
    expect(result.inputs.at).toBe(new Date(AT).toISOString());
  });
});

describe("bundleStops — điểm dừng của phương án đã chọn", () => {
  const allocs = [
    {
      storeSiteId: "s-2",
      storeName: "Bánh B",
      storeVisibility: "public" as const,
      storeLocation: { lat: 1, lng: 2 },
    },
    {
      storeSiteId: "s-1",
      storeName: "Bánh A",
      storeVisibility: "hidden" as const,
      storeLocation: { lat: 3, lng: 4 },
    },
    {
      storeSiteId: "s-2",
      storeName: "Bánh B",
      storeVisibility: "public" as const,
      storeLocation: { lat: 1, lng: 2 },
    },
    {
      storeSiteId: "s-9",
      storeName: "Ăn C",
      storeVisibility: "approximate" as const,
      storeLocation: { lat: 5, lng: 6 },
    },
  ];

  it("theo thứ tự đi đã lưu, mỗi điểm một lần, điểm lạ xếp sau; ẩn ⇒ không toạ độ", () => {
    const stops = bundleStops(["s-1", "s-2"], allocs);
    expect(stops.map((s) => [s.siteId, s.seq])).toEqual([
      ["s-1", 1],
      ["s-2", 2],
      ["s-9", 3],
    ]);
    expect(stops[0]!.location).toBeNull();
    expect(bundlePath(stops, { lat: 0, lng: 0 })).toEqual([
      [0, 0],
      [2, 1],
      [6, 5],
      [0, 0],
    ]);
  });
});
