import { describe, expect, it } from "vitest";

import { classifyRpcError } from "./errors";
import { buildChangeDiff, describeActor, describeAuditEntry, waitingDays, waitingLabel } from "./present";
import {
  escapeLike,
  parseQueueFilters,
  QUEUE_VIEWS,
  queueHref,
  reviewChangeSchema,
  reviewOrgSchema,
} from "./schemas";

const ORG = "6f1c2b8e-3a4d-4c5e-9f60-7a8b9c0d1e2f";
const OP = "0b8e1f2a-3c4d-4e5f-8a6b-7c8d9e0f1a2b";

describe("thời gian chờ", () => {
  const now = new Date("2026-10-08T05:00:00Z");
  it("tính số ngày trọn vẹn, không âm", () => {
    expect(waitingDays("2026-10-08T01:00:00Z", now)).toBe(0);
    expect(waitingDays("2026-10-05T04:00:00Z", now)).toBe(3);
    expect(waitingDays("2026-10-09T00:00:00Z", now)).toBe(0);
    expect(waitingDays(null, now)).toBe(0);
    expect(waitingDays("không phải ngày", now)).toBe(0);
  });
  it("nhãn tiếng Việt", () => {
    expect(waitingLabel(0)).toBe("Chờ dưới 1 ngày");
    expect(waitingLabel(4)).toBe("Chờ 4 ngày");
  });
});

describe("lịch sử duyệt", () => {
  it("phân biệt ba quyết định duyệt", () => {
    const d = (decision: string) =>
      describeAuditEntry({ action: "org.review", after: { status: "x", decision }, actorKind: "admin" });
    expect(d("approve")).toEqual({ title: "Duyệt hồ sơ", tone: "success" });
    expect(d("request_changes").title).toBe("Yêu cầu bổ sung hồ sơ");
    expect(d("reject").tone).toBe("danger");
  });

  it("yêu cầu cập nhật và hành động chưa biết", () => {
    expect(
      describeAuditEntry({ action: "org.change_review", after: { status: "approved" }, actorKind: "admin" })
        .tone,
    ).toBe("success");
    expect(
      describeAuditEntry({ action: "org.change_review", after: { status: "rejected" }, actorKind: "admin" })
        .title,
    ).toContain("Từ chối");
    expect(describeAuditEntry({ action: "org.submit", after: null, actorKind: "user" }).title).toBe(
      "Gửi hồ sơ để duyệt",
    );
    expect(describeAuditEntry({ action: "x.unknown", after: null, actorKind: "user" }).title).toBe(
      "Hoạt động khác",
    );
  });

  it("người thực hiện", () => {
    expect(describeActor("admin", "Ngô Thanh Tâm")).toBe("Admin Ngô Thanh Tâm");
    expect(describeActor("admin", null)).toBe("Admin");
    expect(describeActor("user", " Lan ")).toBe("Lan");
    expect(describeActor("service", null)).toContain("script");
    expect(describeActor("system", "x")).toBe("Hệ thống FoodSave");
  });
});

describe("so sánh yêu cầu cập nhật", () => {
  it("chỉ các trường pháp lý được đổi, đúng thứ tự, giá trị thiếu là gạch ngang", () => {
    const rows = buildChangeDiff(
      { legal_name: "Cũ", representative_id_last4: "1234" },
      { representative_id_last4: "5678", legal_name: "Mới", tax_code: "0312345678", hacker: "x" },
    );
    expect(rows.map((r) => r.field)).toEqual(["legal_name", "tax_code", "representative_id_last4"]);
    expect(rows[0]).toMatchObject({ before: "Cũ", after: "Mới", label: "Tên pháp lý" });
    expect(rows[1]).toMatchObject({ before: "—", after: "0312345678" });
  });
  it("dữ liệu không phải object ⇒ không có dòng", () => {
    expect(buildChangeDiff(null, "x")).toEqual([]);
  });
});

describe("schema quyết định duyệt", () => {
  it("duyệt không cần lý do", () => {
    const r = reviewOrgSchema.safeParse({ orgId: ORG, decision: "approve", reason: "  ", clientOpId: OP });
    expect(r.success).toBe(true);
    expect(r.success && r.data.reason).toBeUndefined();
  });
  it("yêu cầu bổ sung / từ chối bắt buộc lý do ≥ 10 ký tự (đã cắt khoảng trắng)", () => {
    for (const decision of ["request_changes", "reject"] as const) {
      const short = reviewOrgSchema.safeParse({ orgId: ORG, decision, reason: "  ngắn  ", clientOpId: OP });
      expect(short.success).toBe(false);
      expect(short.error?.issues[0]?.path).toEqual(["reason"]);
      const ok = reviewOrgSchema.safeParse({
        orgId: ORG,
        decision,
        reason: "  Ảnh giấy phép bị mờ.  ",
        clientOpId: OP,
      });
      expect(ok.success && ok.data.reason).toBe("Ảnh giấy phép bị mờ.");
    }
  });
  it("từ chối id/quyết định lạ", () => {
    expect(reviewOrgSchema.safeParse({ orgId: "x", decision: "approve", clientOpId: OP }).success).toBe(
      false,
    );
    expect(reviewOrgSchema.safeParse({ orgId: ORG, decision: "delete", clientOpId: OP }).success).toBe(false);
  });
  it("lý do quá 1000 ký tự bị từ chối", () => {
    const r = reviewOrgSchema.safeParse({
      orgId: ORG,
      decision: "reject",
      reason: "a".repeat(1001),
      clientOpId: OP,
    });
    expect(r.success).toBe(false);
  });
  it("yêu cầu cập nhật: từ chối cần ghi chú, duyệt thì không", () => {
    expect(
      reviewChangeSchema.safeParse({ requestId: ORG, decision: "approve", clientOpId: OP }).success,
    ).toBe(true);
    const r = reviewChangeSchema.safeParse({ requestId: ORG, decision: "reject", note: "", clientOpId: OP });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["note"]);
  });
});

describe("bộ lọc hàng đợi", () => {
  it("giá trị lạ về mặc định, trang hợp lệ", () => {
    expect(parseQueueFilters({ view: "hack", kind: "x", page: "-3" }, QUEUE_VIEWS, "submitted")).toEqual({
      view: "submitted",
      kind: null,
      q: "",
      page: 1,
    });
    expect(
      parseQueueFilters(
        { view: "approved", kind: "charity", q: "  Bếp  ", page: "2" },
        QUEUE_VIEWS,
        "submitted",
      ),
    ).toEqual({ view: "approved", kind: "charity", q: "Bếp", page: 2 });
  });
  it("liên kết bỏ giá trị mặc định và đổi trang khi lọc", () => {
    const f = parseQueueFilters({ kind: "store", page: "3" }, QUEUE_VIEWS, "submitted");
    expect(queueHref("/admin/reviews", f, { page: 1 }, "submitted")).toBe("/admin/reviews?kind=store");
    expect(queueHref("/admin/reviews", f, { view: "approved", page: 1 }, "submitted")).toBe(
      "/admin/reviews?view=approved&kind=store",
    );
    expect(queueHref("/admin/reviews", f, { kind: null, q: "Hạt Lúa" }, "submitted")).toBe(
      "/admin/reviews?q=H%E1%BA%A1t+L%C3%BAa&page=3",
    );
  });
  it("thoát ký tự LIKE", () => {
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\");
  });
});

describe("phân loại lỗi RPC", () => {
  it("theo message máy và errcode", () => {
    expect(classifyRpcError({ code: "PT403", message: "self_dealing" })).toBe("self_dealing");
    expect(classifyRpcError({ code: "PT403", message: "mfa_required" })).toBe("mfa_required");
    expect(classifyRpcError({ code: "PT409", message: "invalid_state" })).toBe("invalid_state");
    expect(classifyRpcError({ code: "PT429", message: "x" })).toBe("rate_limited");
    expect(classifyRpcError({ code: "42501", message: "permission denied" })).toBe("not_authorized");
    expect(classifyRpcError({ message: "TypeError: fetch failed" })).toBe("network");
    expect(classifyRpcError(null)).toBe("unknown");
  });
});
