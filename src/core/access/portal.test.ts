import { describe, expect, it } from "vitest";

import {
  decidePortalAccess,
  isEligible,
  type Membership,
  type OrgKind,
  type OrgRole,
  type OrgStatus,
} from "./portal";

function m(id: string, kind: OrgKind, status: OrgStatus, role: OrgRole = "owner"): Membership {
  return {
    orgId: id,
    role,
    org: { id, kind, name: `Tổ chức ${id}`, status, isDemo: false, rejectionReason: null },
  };
}

describe("isEligible", () => {
  it("cổng cửa hàng chỉ nhận owner/manager/staff của cửa hàng", () => {
    expect(isEligible(m("a", "store", "approved", "owner"), "store")).toBe(true);
    expect(isEligible(m("a", "store", "approved", "staff"), "store")).toBe(true);
    expect(isEligible(m("a", "charity", "approved", "owner"), "store")).toBe(false);
  });

  it("cổng tổ chức không nhận tình nguyện viên", () => {
    expect(isEligible(m("a", "charity", "approved", "manager"), "charity")).toBe(true);
    expect(isEligible(m("a", "charity", "approved", "volunteer"), "charity")).toBe(false);
  });

  it("cổng tình nguyện viên chỉ nhận vai trò volunteer của tổ chức", () => {
    expect(isEligible(m("a", "charity", "approved", "volunteer"), "volunteer")).toBe(true);
    expect(isEligible(m("a", "charity", "approved", "owner"), "volunteer")).toBe(false);
    expect(isEligible(m("a", "store", "approved", "volunteer"), "volunteer")).toBe(false);
  });
});

describe("decidePortalAccess", () => {
  it("không có thành viên phù hợp ⇒ no-org", () => {
    expect(decidePortalAccess([], "store", null)).toEqual({ kind: "no-org" });
    expect(decidePortalAccess([m("c", "charity", "approved")], "store", null)).toEqual({ kind: "no-org" });
  });

  it("tổ chức chưa duyệt ⇒ not-approved", () => {
    for (const status of [
      "draft",
      "submitted",
      "needs_changes",
      "rejected",
      "suspended",
      "closed",
    ] as const) {
      const d = decidePortalAccess([m("s", "store", status)], "store", null);
      expect(d.kind).toBe("not-approved");
    }
  });

  it("ưu tiên tổ chức đang làm việc nếu đã duyệt", () => {
    const list = [m("s1", "store", "approved"), m("s2", "store", "approved")];
    const d = decidePortalAccess(list, "store", "s2");
    expect(d).toEqual({ kind: "ok", membership: list[1] });
  });

  it("tổ chức đang làm việc chưa duyệt ⇒ chọn tổ chức đã duyệt khác", () => {
    const list = [m("s1", "store", "submitted"), m("s2", "store", "approved")];
    const d = decidePortalAccess(list, "store", "s1");
    expect(d).toEqual({ kind: "ok", membership: list[1] });
  });

  it("không có tổ chức đã duyệt ⇒ trả về tổ chức đang làm việc để hiển thị trạng thái", () => {
    const list = [m("s1", "store", "draft"), m("s2", "store", "suspended")];
    expect(decidePortalAccess(list, "store", "s2")).toEqual({ kind: "not-approved", membership: list[1] });
    expect(decidePortalAccess(list, "store", null)).toEqual({ kind: "not-approved", membership: list[0] });
  });

  it("active_org_id thuộc cổng khác không ảnh hưởng", () => {
    const list = [m("c1", "charity", "approved"), m("s1", "store", "approved")];
    expect(decidePortalAccess(list, "store", "c1")).toEqual({ kind: "ok", membership: list[1] });
  });
});
