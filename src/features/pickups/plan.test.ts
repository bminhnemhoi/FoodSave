import { describe, expect, it } from "vitest";

import { checkPlan, groupBy } from "./plan";

const item = (id: string, store: string, site = "cs1") => ({ id, storeSiteId: store, charitySiteId: site });

describe("checkPlan", () => {
  it("đếm cửa hàng khác nhau", () => {
    expect(checkPlan([item("a", "s1"), item("b", "s1"), item("c", "s2")])).toEqual({ ok: true, stores: 2 });
  });

  it("rỗng / khác điểm nhận / quá 5 cửa hàng", () => {
    expect(checkPlan([])).toEqual({ ok: false, reason: "empty", stores: 0 });
    expect(checkPlan([item("a", "s1", "cs1"), item("b", "s2", "cs2")]).ok).toBe(false);
    const six = ["s1", "s2", "s3", "s4", "s5", "s6"].map((s, i) => item(String(i), s));
    expect(checkPlan(six)).toEqual({ ok: false, reason: "too_many_stops", stores: 6 });
    expect(checkPlan(six.slice(0, 5)).ok).toBe(true);
  });
});

describe("groupBy", () => {
  it("giữ thứ tự xuất hiện", () => {
    const g = groupBy([item("a", "s2"), item("b", "s1"), item("c", "s2")], (i) => i.storeSiteId);
    expect([...g.keys()]).toEqual(["s2", "s1"]);
    expect(g.get("s2")!.map((i) => i.id)).toEqual(["a", "c"]);
  });
});
