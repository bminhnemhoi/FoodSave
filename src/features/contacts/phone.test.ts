import { describe, expect, it } from "vitest";

import { formatPhone, mailtoHref, telHref } from "./phone";

describe("formatPhone / telHref / mailtoHref", () => {
  it("nhóm số di động, máy bàn, 1800/1900 để đọc dễ", () => {
    expect(formatPhone("0901234567")).toBe("0901 234 567");
    expect(formatPhone("02838234567")).toBe("028 3823 4567");
    expect(formatPhone("19001234")).toBe("1900 1234");
    expect(formatPhone("+84 xyz")).toBe("+84 xyz");
  });

  it("liên kết gọi/email", () => {
    expect(telHref("0901 234 567")).toBe("tel:0901234567");
    expect(mailtoHref("lienhe@tiem.vn")).toBe("mailto:lienhe@tiem.vn");
    expect(mailtoHref("lienhe@tiem.vn", "Bánh mì & bánh ngọt")).toBe(
      "mailto:lienhe@tiem.vn?subject=B%C3%A1nh%20m%C3%AC%20%26%20b%C3%A1nh%20ng%E1%BB%8Dt",
    );
  });
});
