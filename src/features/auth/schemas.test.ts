import { describe, expect, it } from "vitest";

import { safeNextPath } from "./schemas";

describe("safeNextPath", () => {
  it("giữ đường dẫn nội bộ, kể cả query và hash", () => {
    expect(safeNextPath("/onboarding/store")).toBe("/onboarding/store");
    expect(safeNextPath("/invite/abc_DEF-123")).toBe("/invite/abc_DEF-123");
    expect(safeNextPath("/store/settings?tab=members#invite")).toBe("/store/settings?tab=members#invite");
  });

  it("thiếu hoặc không bắt đầu bằng / ⇒ fallback", () => {
    expect(safeNextPath(undefined)).toBe("/onboarding");
    expect(safeNextPath(null)).toBe("/onboarding");
    expect(safeNextPath("")).toBe("/onboarding");
    expect(safeNextPath("https://evil.com")).toBe("/onboarding");
    expect(safeNextPath("javascript:alert(1)")).toBe("/onboarding");
    expect(safeNextPath("store", "/login")).toBe("/login");
  });

  it.each([
    "//evil.com",
    "/\\evil.com",
    "/\t/evil.com",
    "/\n/evil.com",
    "/\r\n/evil.com",
    "/\u0000/evil.com",
    "/a\\b",
  ])("chặn open redirect qua %j", (next) => {
    expect(safeNextPath(next)).toBe("/onboarding");
  });

  it("chuẩn hóa đoạn .. nhưng không thoát khỏi origin", () => {
    expect(safeNextPath("/store/../admin")).toBe("/admin");
    expect(safeNextPath("/%2F%2Fevil.com")).toBe("/%2F%2Fevil.com");
  });

  it("chặn chuỗi quá dài", () => {
    expect(safeNextPath(`/${"a".repeat(2048)}`)).toBe("/onboarding");
  });
});
