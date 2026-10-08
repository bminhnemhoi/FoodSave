import { describe, expect, it } from "vitest";

import {
  closureInput,
  legalFormKeys,
  parseSettingsTab,
  pauseInput,
  settingsHref,
  validateLegalChanges,
} from "./schemas";

const SITE = "0b9c3a2e-1d4f-4a6b-8c7d-9e0f1a2b3c4d";
const ORG = "6f1c2b8e-3a4d-4c5e-9f60-7a8b9c0d1e2f";

describe("tab Cài đặt", () => {
  it("tab lạ hoặc thiếu ⇒ Hồ sơ", () => {
    expect(parseSettingsTab("members")).toBe("members");
    expect(parseSettingsTab("admin")).toBe("profile");
    expect(parseSettingsTab(["sites"])).toBe("profile");
    expect(parseSettingsTab(undefined)).toBe("profile");
  });

  it("URL theo tab", () => {
    expect(settingsHref("store", "profile")).toBe("/store/settings");
    expect(settingsHref("charity", "sites")).toBe("/charity/settings?tab=sites");
  });
});

describe("đề nghị sửa thông tin pháp lý (US-STO-27 AC4)", () => {
  const current = {
    legalName: "Hộ kinh doanh Hạt Lúa",
    taxCode: "0312345678",
    representativeName: "Phạm Thu Hà",
    representativeTitle: "Chủ hộ kinh doanh",
  };

  it("chỉ gửi trường đã thay đổi, theo tên cột DB", () => {
    const r = validateLegalChanges("store", { ...current, legalName: "  Công ty TNHH Hạt Lúa  " }, current);
    expect(r).toEqual({ ok: true, changes: { legal_name: "Công ty TNHH Hạt Lúa" } });
  });

  it("không đổi gì ⇒ báo lỗi chung", () => {
    expect(validateLegalChanges("store", current, current)).toEqual({
      ok: false,
      errors: { form: "Bạn chưa thay đổi mục nào." },
    });
  });

  it("mã số thuế sai và xóa trắng bị từ chối theo từng trường", () => {
    const r = validateLegalChanges(
      "store",
      { ...current, taxCode: "12345", representativeName: " " },
      current,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.taxCode).toBe("Mã số thuế gồm 10 chữ số, hoặc 13 ký tự dạng 0123456789-001.");
      expect(r.errors.representativeName).toContain("Không để trống");
    }
  });

  it("tổ chức dùng số quyết định thay mã số thuế; không có trường CCCD", () => {
    expect(legalFormKeys("charity")).toContain("registrationNo");
    expect(legalFormKeys("charity")).not.toContain("taxCode");
    expect(legalFormKeys("store")).not.toContain("registrationNo");
    const r = validateLegalChanges("charity", { registrationNo: "QĐ 123/2020" }, { registrationNo: null });
    expect(r).toEqual({ ok: true, changes: { registration_no: "QĐ 123/2020" } });
    // trường không thuộc loại tổ chức bị bỏ qua
    expect(validateLegalChanges("charity", { taxCode: "0312345678" }, {})).toEqual({
      ok: false,
      errors: { form: "Bạn chưa thay đổi mục nào." },
    });
  });
});

describe("ngày nghỉ và tạm ngưng", () => {
  it("ngày nghỉ: ngày có thật, ghi chú rỗng ⇒ null, tối đa 200 ký tự", () => {
    expect(closureInput.parse({ siteId: SITE, date: "2026-11-20", reason: "  " })).toEqual({
      siteId: SITE,
      date: "2026-11-20",
      reason: null,
    });
    expect(closureInput.safeParse({ siteId: SITE, date: "2026-02-30", reason: "" }).success).toBe(false);
    expect(
      closureInput.safeParse({ siteId: SITE, date: "2026-11-20", reason: "x".repeat(201) }).success,
    ).toBe(false);
  });

  it("tạm ngưng: lý do tùy chọn", () => {
    expect(pauseInput.parse({ orgId: ORG, paused: true, reason: " Sửa bếp " })).toEqual({
      orgId: ORG,
      paused: true,
      reason: "Sửa bếp",
    });
    expect(pauseInput.safeParse({ orgId: ORG, paused: "yes", reason: "" }).success).toBe(false);
  });
});
