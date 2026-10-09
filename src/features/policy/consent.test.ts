import { describe, expect, it } from "vitest";

import { POLICY_CHANGES, POLICY_VERSION } from "@/lib/legal";

import { needsReconsent, POLICY_UPDATE_TITLE, policyUpdateText } from "./consent";

describe("đồng ý lại chính sách (B3)", () => {
  it("chỉ hỏi người đã từng đồng ý một phiên bản khác", () => {
    expect(needsReconsent("2026-10-v1")).toBe(true);
    expect(needsReconsent(POLICY_VERSION)).toBe(false);
    expect(needsReconsent(null)).toBe(false);
    expect(needsReconsent(undefined)).toBe(false);
  });

  it("text_hash băm đúng chữ hiển thị: tiêu đề có phiên bản + mọi điểm thay đổi", () => {
    expect(POLICY_VERSION).toBe("2026-10-v2");
    expect(POLICY_UPDATE_TITLE).toBe(`Chính sách bảo mật đã cập nhật (phiên bản ${POLICY_VERSION})`);
    const text = policyUpdateText();
    for (const c of POLICY_CHANGES) expect(text).toContain(c);
    expect(text.startsWith(POLICY_UPDATE_TITLE)).toBe(true);
  });
});
