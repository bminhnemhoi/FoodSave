import { describe, expect, it } from "vitest";

import { mfaErrorMessage } from "./errors";
import { groupSecret, qrCodeDataUri, safeAdminNext, totpCodeSchema } from "./schemas";

describe("mã TOTP", () => {
  it("nhận 6 chữ số, cho phép dán có khoảng trắng", () => {
    expect(totpCodeSchema.parse("482913")).toBe("482913");
    expect(totpCodeSchema.parse(" 482 913 ")).toBe("482913");
  });
  it("từ chối thiếu số hoặc có chữ", () => {
    for (const bad of ["", "12345", "1234567", "12a456"]) {
      expect(totpCodeSchema.safeParse(bad).success, bad).toBe(false);
    }
  });
});

describe("đích sau MFA (chống open redirect)", () => {
  it("giữ đường dẫn nội bộ trong /admin", () => {
    expect(safeAdminNext("/admin/reviews/abc")).toBe("/admin/reviews/abc");
    expect(safeAdminNext("/admin")).toBe("/admin");
    expect(safeAdminNext("/admin?x=1")).toBe("/admin?x=1");
  });
  it("mọi thứ khác về hàng đợi duyệt", () => {
    for (const bad of [
      undefined,
      null,
      "",
      "https://evil.example",
      "//evil.example",
      "/\\evil",
      "/store",
      "/administrator",
      "/admin/mfa",
      "/admin/mfa?next=/admin",
      "/admin/x\r\nSet-Cookie: a=b",
    ]) {
      expect(safeAdminNext(bad), String(bad)).toBe("/admin/reviews");
    }
  });
});

describe("hiển thị khóa bí mật và QR", () => {
  it("nhóm 4 ký tự", () => {
    expect(groupSecret("JBSWY3DPEHPK3PXP")).toBe("JBSW Y3DP EHPK 3PXP");
    expect(groupSecret("ABCDE")).toBe("ABCD E");
  });
  it("mã hóa lại SVG của GoTrue để ký tự # không làm hỏng data URI", () => {
    const uri = qrCodeDataUri(
      'data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg" fill="#000"/>',
    );
    expect(uri.startsWith("data:image/svg+xml;charset=utf-8,%3Csvg")).toBe(true);
    expect(uri).not.toContain("#");
    expect(qrCodeDataUri("data:image/png;base64,AAAA")).toBe("data:image/png;base64,AAAA");
  });
});

describe("thông điệp lỗi MFA", () => {
  it("mã sai, giới hạn tốc độ, mặc định", () => {
    expect(mfaErrorMessage("mfa_verification_failed")).toContain("Mã chưa đúng");
    expect(mfaErrorMessage("over_request_rate_limit")).toContain("đợi");
    expect(mfaErrorMessage(undefined)).toContain("thử lại");
  });
});
