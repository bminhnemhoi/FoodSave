import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  actorDisplayName,
  actorRoleLabel,
  AUDIT_ACTION_LABEL,
  AUDIT_ENTITY_LABEL,
  AUDIT_GROUP_LABEL,
  auditActionLabel,
  auditEntityHref,
  isSensitiveKey,
  prettyAuditJson,
  REDACTED,
  redactAuditJson,
  shortId,
} from "./audit-present";
import { AUDIT_ACTION_GROUPS, AUDIT_ENTITY_TYPES } from "./filters";

describe("auditActionLabel", () => {
  it("quyết định duyệt hồ sơ đọc từ after.decision (P1-29)", () => {
    expect(auditActionLabel("org.review", { decision: "approve", status: "approved" })).toBe("Duyệt hồ sơ");
    expect(auditActionLabel("org.review", { decision: "request_changes" })).toBe("Yêu cầu bổ sung hồ sơ");
    expect(auditActionLabel("org.review", { decision: "reject" })).toBe("Từ chối hồ sơ");
    expect(auditActionLabel("org.change_review", { status: "approved" })).toBe(
      "Duyệt yêu cầu cập nhật thông tin pháp lý",
    );
  });

  it("mọi hành động đã biết có nhãn tiếng Việt; lạ ⇒ 'Hoạt động khác'", () => {
    for (const [code, label] of Object.entries(AUDIT_ACTION_LABEL)) {
      expect(code).toMatch(/^[a-z_]+\.[a-z_]+$/);
      expect(label.length).toBeGreaterThan(3);
      expect(auditActionLabel(code, null)).toBe(label);
    }
    expect(auditActionLabel("x.unknown", null)).toBe("Hoạt động khác");
  });

  it("mỗi hành động thuộc một nhóm lọc được; mỗi nhóm/loại có nhãn", () => {
    for (const code of Object.keys(AUDIT_ACTION_LABEL)) {
      expect(AUDIT_ACTION_GROUPS as readonly string[]).toContain(code.split(".")[0]);
    }
    for (const g of AUDIT_ACTION_GROUPS) expect(AUDIT_GROUP_LABEL[g]).toBeTruthy();
    for (const t of AUDIT_ENTITY_TYPES) expect(AUDIT_ENTITY_LABEL[t]).toBeTruthy();
  });
});

describe("người thực hiện", () => {
  it("vai trò theo actor_kind + vai trò trong tổ chức", () => {
    expect(actorRoleLabel("admin", null)).toBe("Admin");
    expect(actorRoleLabel("system", null)).toBe("Hệ thống");
    expect(actorRoleLabel("service", null)).toBe("Quản trị kỹ thuật (script)");
    expect(actorRoleLabel("user", "owner")).toBe("Chủ sở hữu");
    expect(actorRoleLabel("user", null)).toBe("Người dùng");
  });

  it("tên: họ tên → email → hệ thống / tài khoản đã ẩn danh", () => {
    expect(actorDisplayName("admin", "u1", { fullName: " Lê Khánh ", email: "k@x.vn" })).toBe("Lê Khánh");
    expect(actorDisplayName("user", "u1", { fullName: "", email: "k@x.vn" })).toBe("k@x.vn");
    expect(actorDisplayName("system", null, null)).toBe("Hệ thống FoodSave");
    expect(actorDisplayName("service", null, null)).toBe("Script quản trị");
    expect(actorDisplayName("user", "u1", null)).toBe("Tài khoản đã ẩn danh");
  });
});

describe("liên kết đối tượng", () => {
  const id = "11111111-2222-3333-4444-555555555555";
  const org = "99999999-8888-7777-6666-555555555555";
  it("tổ chức, lô, phân bổ, đối tượng thuộc hồ sơ", () => {
    expect(auditEntityHref("organization", id, org)).toBe(`/admin/reviews/${id}`);
    expect(auditEntityHref("offer", id, org)).toBe(`/admin/offers/${id}`);
    expect(auditEntityHref("allocation", id, org)).toBe(`/admin/allocations?id=${id}`);
    expect(auditEntityHref("org_change_request", id, org)).toBe(`/admin/reviews/${org}#change-request`);
    expect(auditEntityHref("site", id, org)).toBe(`/admin/reviews/${org}`);
    expect(auditEntityHref("site", id, null)).toBeNull();
    expect(auditEntityHref("pickup", id, org)).toBeNull();
    expect(auditEntityHref("offer", null, org)).toBeNull();
  });
  it("shortId", () => {
    expect(shortId(id)).toBe("11111111");
    expect(shortId(null)).toBe("—");
  });
});

describe("che khóa nhạy cảm (phòng thủ)", () => {
  it("nhận diện token/mã/bí mật/mật khẩu theo từ, không theo chuỗi con", () => {
    for (const k of [
      "token",
      "token_hash",
      "code",
      "code6",
      "code_hash",
      "otpCode",
      "client_secret",
      "password",
      "newPassword",
      "hash",
      "OTP",
      "tax_code",
    ]) {
      expect(isSensitiveKey(k), k).toBe(true);
    }
    for (const k of [
      "status",
      "decision",
      "category_code",
      "category_codes",
      "barcode_note",
      "reason",
      "kind",
    ]) {
      expect(isSensitiveKey(k), k).toBe(false);
    }
  });

  it("che ở mọi tầng, giữ nguyên khóa và giá trị khác", () => {
    const input = {
      status: "approved",
      token: "abc",
      nested: { code: 123456, list: [{ password: "x", ok: 1 }], expires_at: "2026-10-09" },
    };
    expect(redactAuditJson(input)).toEqual({
      status: "approved",
      token: REDACTED,
      nested: { code: REDACTED, list: [{ password: REDACTED, ok: 1 }], expires_at: "2026-10-09" },
    });
  });

  it("property: không còn giá trị gốc của khóa nhạy cảm trong JSON hiển thị", () => {
    const secret = "S3CR3T-VALUE";
    const arb = fc.letrec((tie) => ({
      node: fc.oneof(
        { depthSize: "small" },
        fc.constant(1),
        fc.dictionary(fc.constantFrom("a", "b", "status", "token", "code", "password", "hash"), tie("node"), {
          maxKeys: 4,
        }),
        fc.array(tie("node"), { maxLength: 3 }),
      ),
    })).node;
    fc.assert(
      fc.property(arb, (tree) => {
        const plant = (v: unknown): unknown =>
          Array.isArray(v)
            ? v.map(plant)
            : v && typeof v === "object"
              ? Object.fromEntries(
                  Object.entries(v).map(([k, x]) => [k, isSensitiveKey(k) ? secret : plant(x)]),
                )
              : v;
        expect(prettyAuditJson(plant(tree)) ?? "").not.toContain(secret);
      }),
    );
  });

  it("prettyAuditJson: null/rỗng ⇒ null; còn lại thụt lề 2", () => {
    expect(prettyAuditJson(null)).toBeNull();
    expect(prettyAuditJson({})).toBeNull();
    expect(prettyAuditJson({ status: "approved", code_hash: "x" })).toBe(
      '{\n  "status": "approved",\n  "code_hash": "[đã ẩn]"\n}',
    );
  });
});
