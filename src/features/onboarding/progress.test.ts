import { describe, expect, it } from "vitest";

import {
  computeProgress,
  documentsComplete,
  missingSteps,
  nextStep,
  prevStep,
  resumeStep,
  snapshotOf,
  type ProgressSnapshot,
} from "./progress";
import { EMPTY_BASICS, EMPTY_LEGAL } from "./schemas";

const BASICS = {
  ...EMPTY_BASICS,
  name: "Tiệm bánh Hạt Lúa",
  subtype: "bakery",
  contactPhone: "0901234567",
  contactEmail: "lan@example.com",
};
const LEGAL = {
  ...EMPTY_LEGAL,
  legalName: "Hộ kinh doanh Hạt Lúa",
  taxCode: "0312345678",
  representativeName: "Nguyễn Thị Lan",
  representativeTitle: "Chủ hộ",
};

function snap(p: Partial<ProgressSnapshot>): ProgressSnapshot {
  return {
    hasOrg: true,
    basics: BASICS,
    legal: LEGAL,
    hasSite: true,
    documentTypes: ["business_license"],
    ...p,
  };
}

describe("thứ tự bước", () => {
  it("next/prev", () => {
    expect(nextStep("basics")).toBe("location");
    expect(nextStep("review")).toBeNull();
    expect(prevStep("basics")).toBeNull();
    expect(prevStep("legal")).toBe("location");
  });
});

describe("documentsComplete (khớp submit_organization)", () => {
  it("cửa hàng cần giấy đăng ký kinh doanh; giấy ATTP không bắt buộc", () => {
    expect(documentsComplete("store", ["food_safety_cert"])).toBe(false);
    expect(documentsComplete("store", ["business_license"])).toBe(true);
  });
  it("tổ chức cần quyết định thành lập HOẶC giấy phép hoạt động", () => {
    expect(documentsComplete("charity", ["other"])).toBe(false);
    expect(documentsComplete("charity", ["operating_license"])).toBe(true);
    expect(documentsComplete("charity", ["establishment_decision", "other"])).toBe(true);
  });
});

describe("resumeStep (US-STO-01 AC1: mở lại đúng bước đang làm)", () => {
  it("chưa có nháp ⇒ bước 1", () => {
    expect(resumeStep("store", snap({ hasOrg: false }))).toBe("basics");
  });
  it("xong bước 1 ⇒ bước 2", () => {
    expect(resumeStep("store", snap({ hasSite: false, legal: EMPTY_LEGAL, documentTypes: [] }))).toBe(
      "location",
    );
  });
  it("thiếu giấy tờ ⇒ bước giấy tờ", () => {
    expect(resumeStep("store", snap({ documentTypes: [] }))).toBe("documents");
  });
  it("đủ hết ⇒ bước gửi duyệt", () => {
    expect(resumeStep("store", snap({}))).toBe("review");
    expect(missingSteps("store", snap({}))).toEqual([]);
  });
});

describe("computeProgress", () => {
  it("bước gửi duyệt không bao giờ 'xong' trước khi gửi", () => {
    const p = computeProgress("store", snap({}));
    expect(p.map((s) => s.complete)).toEqual([true, true, true, true, false]);
    expect(p[1]?.title).toBe("Địa điểm & giờ mở cửa");
    expect(computeProgress("charity", snap({}))[1]?.title).toBe("Điểm nhận hàng");
  });

  it("tổ chức thiếu số người được hỗ trợ ⇒ bước 1 chưa xong; không cần mã số thuế", () => {
    const s = snap({ basics: { ...BASICS, subtype: "soup_kitchen" }, documentTypes: ["operating_license"] });
    expect(missingSteps("charity", s).map((m) => m.key)).toEqual(["basics"]);
    expect(missingSteps("store", snap({ legal: { ...LEGAL, taxCode: "" } })).map((m) => m.key)).toEqual([
      "legal",
    ]);
  });
});

describe("snapshotOf", () => {
  it("dựng từ dữ liệu wizard", () => {
    expect(snapshotOf({ org: null, site: null, documents: [] })).toMatchObject({
      hasOrg: false,
      hasSite: false,
    });
    expect(
      snapshotOf({
        org: { basics: BASICS, legal: LEGAL },
        site: {},
        documents: [{ docType: "business_license" }],
      }),
    ).toEqual(snap({}));
  });
});
