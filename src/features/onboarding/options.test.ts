import { describe, expect, it } from "vitest";

import { defaultSiteVisibility } from "./options";

describe("defaultSiteVisibility (SECURITY-PRIVACY C8)", () => {
  it("mái ấm trẻ em và nhà mở/tạm lánh mặc định ẩn vị trí", () => {
    expect(defaultSiteVisibility("shelter")).toBe("hidden");
    expect(defaultSiteVisibility("children_home")).toBe("hidden");
  });

  it("loại hình khác hoặc chưa chọn ⇒ vị trí gần đúng", () => {
    expect(defaultSiteVisibility("soup_kitchen")).toBe("approximate");
    expect(defaultSiteVisibility("elderly_home")).toBe("approximate");
    expect(defaultSiteVisibility(null)).toBe("approximate");
    expect(defaultSiteVisibility(undefined)).toBe("approximate");
    expect(defaultSiteVisibility("")).toBe("approximate");
  });
});
