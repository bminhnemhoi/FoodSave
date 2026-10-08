import { describe, expect, it } from "vitest";

import { computeDeadlinePreview } from "./preview";

const at = (iso: string) => new Date(iso);

describe("computeDeadlinePreview (US-STO-09)", () => {
  it("AC1: bánh hết hạn 24:00, đóng cửa 21:00, đăng lúc 15:00 ⇒ hạn 21:00 (giờ đóng cửa), Vàng, Đỏ từ 17:00", () => {
    const p = computeDeadlinePreview({
      expiresAt: at("2026-10-08T23:59:00+07:00"),
      pickupEnd: at("2026-10-08T21:00:00+07:00"),
      siteCloseAt: at("2026-10-08T21:00:00+07:00"),
      perishability: "cooked",
      now: at("2026-10-08T15:00:00+07:00"),
    });
    expect(p?.deadline.toISOString()).toBe(at("2026-10-08T21:00:00+07:00").toISOString());
    expect(p?.reason).toBe("site_close");
    expect(p?.label).toBe("yellow");
    expect(p?.turnsYellowAt).toBeNull();
    expect(p?.turnsRedAt?.toISOString()).toBe(at("2026-10-08T17:00:00+07:00").toISOString());
  });

  it("điểm 24/7: hạn = cuối khung lấy khi khung lấy kết thúc trước hạn dùng", () => {
    const p = computeDeadlinePreview({
      expiresAt: at("2026-10-10T23:59:00+07:00"),
      pickupEnd: at("2026-10-08T20:00:00+07:00"),
      siteCloseAt: null,
      perishability: "fresh",
      now: at("2026-10-08T15:00:00+07:00"),
    });
    expect(p?.reason).toBe("pickup_end");
    expect(p?.label).toBe("red");
    expect(p?.turnsRedAt).toBeNull();
  });

  it("hạn dùng đến trước ⇒ lý do hạn sử dụng; Xanh có cả mốc Vàng và Đỏ", () => {
    const p = computeDeadlinePreview({
      expiresAt: at("2026-10-20T23:59:00+07:00"),
      pickupEnd: at("2026-10-21T10:00:00+07:00"),
      siteCloseAt: null,
      perishability: "packaged",
      now: at("2026-10-08T15:00:00+07:00"),
    });
    expect(p?.reason).toBe("expiry");
    expect(p?.label).toBe("green");
    expect(p?.turnsYellowAt?.toISOString()).toBe(at("2026-10-13T23:59:00+07:00").toISOString());
    expect(p?.turnsRedAt?.toISOString()).toBe(at("2026-10-17T23:59:00+07:00").toISOString());
  });

  it("thiếu hạn dùng hoặc danh mục ⇒ null", () => {
    const base = { pickupEnd: null, siteCloseAt: null, now: at("2026-10-08T15:00:00+07:00") };
    expect(computeDeadlinePreview({ ...base, expiresAt: null, perishability: "cooked" })).toBeNull();
    expect(
      computeDeadlinePreview({ ...base, expiresAt: at("2026-10-09T00:00:00+07:00"), perishability: null }),
    ).toBeNull();
  });

  it("đã quá hạn ⇒ Hết hạn, không còn mốc chuyển", () => {
    const p = computeDeadlinePreview({
      expiresAt: at("2026-10-08T10:00:00+07:00"),
      pickupEnd: null,
      siteCloseAt: null,
      perishability: "cooked",
      now: at("2026-10-08T15:00:00+07:00"),
    });
    expect(p?.label).toBe("expired");
    expect(p?.turnsRedAt).toBeNull();
  });
});
