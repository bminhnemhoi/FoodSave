import { describe, expect, it } from "vitest";

import { newOfferValues, offerToFormValues } from "./mapping";
import { buildOfferPatch } from "./schemas";

const RECORD = {
  siteId: "6f1c7e2a-1111-4c2b-9a3d-2b7c9d0e1f20",
  categoryCode: "bread",
  title: "Bánh mì thịt",
  description: null,
  quantity: 20,
  unit: "loaf" as const,
  unitWeightKg: 0.12,
  weightSource: "category_default" as const,
  expiresAt: "2026-10-08T16:59:00+00:00",
  expiryIsDateOnly: true,
  pickupWindow: '["2026-10-08 10:00:00+00","2026-10-08 14:00:00+00")',
  photoPaths: ["org/x/offer/a.webp"],
  aiAssisted: false,
};

describe("newOfferValues", () => {
  it("khung lấy bắt đầu ở mốc 15 phút kế tiếp, dài 2 giờ, qua nửa đêm đổi ngày", () => {
    const v = newOfferValues("s", new Date("2026-10-08T15:07:00Z")); // 22:07 giờ VN
    expect(v).toMatchObject({
      pickupStartDate: "2026-10-08",
      pickupStartTime: "22:15",
      pickupEndDate: "2026-10-09",
      pickupEndTime: "00:15",
      categoryCode: "",
      expiryDate: "",
    });
  });
});

describe("offerToFormValues", () => {
  it("đọc ngày giờ theo giờ VN; hạn chỉ có ngày ⇒ giờ trống", () => {
    expect(offerToFormValues(RECORD)).toEqual({
      siteId: RECORD.siteId,
      categoryCode: "bread",
      title: "Bánh mì thịt",
      description: "",
      quantity: "20",
      unit: "loaf",
      unitWeightKg: "0,12",
      weightSource: "category_default",
      expiryDate: "2026-10-08",
      expiryTime: "",
      pickupStartDate: "2026-10-08",
      pickupStartTime: "17:00",
      pickupEndDate: "2026-10-08",
      pickupEndTime: "21:00",
      photoPath: "org/x/offer/a.webp",
      aiAssisted: false,
    });
  });

  it("hạn có giờ và kg", () => {
    const v = offerToFormValues({
      ...RECORD,
      unit: "kg",
      unitWeightKg: 1,
      weightSource: "declared",
      expiryIsDateOnly: false,
      expiresAt: "2026-10-09T13:30:00+00:00",
      quantity: 2.5,
    });
    expect(v).toMatchObject({ unit: "kg", unitWeightKg: "", quantity: "2,5", expiryTime: "20:30" });
  });

  it("vòng lặp DB ⇒ form ⇒ patch không đổi gì khi người dùng không sửa", () => {
    const v = offerToFormValues(RECORD);
    expect(buildOfferPatch(v, v, { isDraft: false, hasAllocations: false })).toEqual({});
  });
});
