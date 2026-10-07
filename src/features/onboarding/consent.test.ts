import { describe, expect, it } from "vitest";

import { sha256Hex } from "@/lib/hash";
import { POLICY_VERSION } from "@/lib/legal";

import { CONSENT_ITEMS, consentParts, consentPlainText, consentText } from "./consent";
import { isOrgLogoPath, kycObjectPath, logoObjectPath } from "./documents";
import { ERROR_MESSAGES, mapDbError, mapStorageError, missingFromSubmitDetail } from "./errors";

describe("consent", () => {
  it("tách liên kết Điều khoản/Chính sách và giữ đúng chữ người dùng đọc", () => {
    const parts = consentParts(CONSENT_ITEMS.store[0]!.template);
    expect(parts.filter((p) => p.kind === "link").map((p) => (p.kind === "link" ? p.href : ""))).toEqual([
      "/terms",
      "/privacy",
    ]);
    expect(consentPlainText(CONSENT_ITEMS.store[0]!.template)).toBe(
      `Tôi đã đọc và đồng ý với Điều khoản sử dụng và Chính sách bảo mật của FoodSave (phiên bản ${POLICY_VERSION}).`,
    );
  });

  it("mỗi loại tổ chức có đủ 3 cam kết; văn bản khác nhau ⇒ text_hash khác nhau", async () => {
    expect(CONSENT_ITEMS.store.map((c) => c.key)).toEqual(["terms", "truthful", "commitment"]);
    expect(CONSENT_ITEMS.charity.map((c) => c.key)).toEqual(["terms", "truthful", "commitment"]);
    const [a, b] = await Promise.all([sha256Hex(consentText("store")), sha256Hex(consentText("charity"))]);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
    expect(consentText("store")).toContain("thực phẩm còn hạn sử dụng");
  });

  it("sha256Hex đúng chuẩn", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("đường dẫn Storage (DATA-MODEL §10)", () => {
  const org = "3f1c2b8e-7d4a-4c1e-9b2a-0a1b2c3d4e5f";
  const file = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
  it("kyc: {org_id}/{doc_type}/{uuid}.{ext}", () => {
    expect(kycObjectPath(org, "business_license", file, "pdf")).toBe(`${org}/business_license/${file}.pdf`);
  });
  it("logo: org/{org_id}/logo/{uuid}.webp và chỉ chấp nhận đúng thư mục", () => {
    const p = logoObjectPath(org, file, "webp");
    expect(p).toBe(`org/${org}/logo/${file}.webp`);
    expect(isOrgLogoPath(org, p)).toBe(true);
    expect(isOrgLogoPath(org, `org/${file}/logo/${file}.webp`)).toBe(false);
    expect(isOrgLogoPath(org, `org/${org}/logo/../../x.webp`)).toBe(false);
    expect(isOrgLogoPath(org, `org/${org}/logo/${file}.svg`)).toBe(false);
  });
});

describe("mapDbError (DATA-MODEL §8.0)", () => {
  it("ánh xạ các mã lỗi RPC sang câu tiếng Việt", () => {
    expect(mapDbError({ code: "PT401" }).message).toBe(ERROR_MESSAGES.unauthenticated);
    expect(
      mapDbError({ code: "PT403", message: "not_authorized", details: "email_not_confirmed" }).code,
    ).toBe("email_not_confirmed");
    expect(mapDbError({ code: "PT409", message: "invalid_state", details: "draft_limit" }).message).toBe(
      ERROR_MESSAGES.draftLimit,
    );
    expect(mapDbError({ code: "PT409", message: "invalid_state" }).message).toBe(ERROR_MESSAGES.notEditable);
    expect(
      mapDbError({ code: "PT422", message: "validation_failed", details: '{"p_hours":"overlap"}' }).message,
    ).toBe(ERROR_MESSAGES.overlap);
    expect(
      mapDbError({
        code: "PT422",
        message: "validation_failed",
        details: '{"location":"out_of_service_area"}',
      }).fieldErrors?.location,
    ).toContain("ngoài vùng phục vụ");
    expect(mapDbError({ code: "XX000" }).message).toBe(ERROR_MESSAGES.server);
  });

  it("submit_organization thiếu điều kiện ⇒ danh sách mục cần bổ sung kèm bước", () => {
    const e = mapDbError({
      code: "PT422",
      message: "validation_failed",
      details: '{"sites":"at_least_one_site","documents":"business_license","consent":"terms"}',
    });
    expect(e.code).toBe("incomplete");
    expect(e.missing?.map((m) => m.step)).toEqual(["location", "documents", "review"]);
    expect(
      missingFromSubmitDetail({ documents: "establishment_decision_or_operating_license" })[0]?.message,
    ).toContain("quyết định thành lập");
  });

  it("lỗi Storage", () => {
    expect(mapStorageError({ message: "new row violates row-level security policy" })).toContain("20 tệp");
    expect(mapStorageError({ message: "The object exceeded the maximum allowed size" })).toContain("10 MB");
    expect(mapStorageError(null)).toBe("Chưa tải được tệp lên. Vui lòng thử lại.");
  });
});
