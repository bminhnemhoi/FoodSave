import { describe, expect, it } from "vitest";

import { mapAiDraftToForm, type AiOfferDraft } from "./ai-mapping";
import type { CategoryOption, OfferFormValues } from "./schemas";

const CATEGORIES: CategoryOption[] = [
  {
    code: "bread",
    nameVi: "Bánh mì & bakery",
    perishability: "cooked",
    defaultUnit: "loaf",
    defaultUnitWeightKg: 0.12,
    icon: "croissant",
  },
  {
    code: "dairy",
    nameVi: "Sữa & sản phẩm sữa",
    perishability: "fresh",
    defaultUnit: "bottle",
    defaultUnitWeightKg: 0.25,
    icon: "milk",
  },
];

const CURRENT: OfferFormValues = {
  siteId: "6f1c7e2a-1111-4c2b-9a3d-2b7c9d0e1f20",
  categoryCode: "",
  title: "",
  description: "",
  quantity: "",
  unit: "",
  unitWeightKg: "",
  weightSource: "category_default",
  expiryDate: "",
  expiryTime: "",
  pickupStartDate: "2026-10-08",
  pickupStartTime: "17:00",
  pickupEndDate: "2026-10-08",
  pickupEndTime: "19:00",
  photoPath: null,
  aiAssisted: false,
};

const draft = (over: Partial<AiOfferDraft> = {}): AiOfferDraft => ({
  title: "Bánh mì thịt",
  categoryCode: "bread",
  quantity: 24,
  unit: "loaf",
  unitWeightKg: null,
  expiryDate: null,
  notes: null,
  confidence: 0.8,
  ...over,
});

const ctx = { categories: CATEGORIES, current: CURRENT, today: "2026-10-08" };

describe("mapAiDraftToForm (P2-05)", () => {
  it("điền danh mục, tên, số lượng, đơn vị + khối lượng mặc định của danh mục; đánh dấu AI", () => {
    const r = mapAiDraftToForm(draft(), ctx);
    expect(r.recognized).toBe(true);
    expect(r.patch).toEqual({
      aiAssisted: true,
      categoryCode: "bread",
      title: "Bánh mì thịt",
      unit: "loaf",
      quantity: "24",
      unitWeightKg: "0,12",
      weightSource: "category_default",
    });
    expect(r.filled).toEqual(["categoryCode", "title", "unit", "quantity"]);
    expect(r.lowConfidence).toBe(false);
  });

  it("mã danh mục lạ ⇒ không điền danh mục (giữ lựa chọn hiện tại)", () => {
    const r = mapAiDraftToForm(draft({ categoryCode: "bakery_xyz" }), {
      ...ctx,
      current: { ...CURRENT, categoryCode: "dairy", unit: "bottle" },
    });
    expect(r.recognized).toBe(true);
    expect(r.patch.categoryCode).toBeUndefined();
    expect(r.filled).not.toContain("categoryCode");
  });

  it("đơn vị đếm ⇒ làm tròn số nguyên ≥ 1; kg giữ số lẻ", () => {
    expect(mapAiDraftToForm(draft({ quantity: 12.6 }), ctx).patch.quantity).toBe("13");
    expect(mapAiDraftToForm(draft({ quantity: 0.2 }), ctx).patch.quantity).toBe("1");
    expect(mapAiDraftToForm(draft({ unit: "kg", quantity: 2.5 }), ctx).patch.quantity).toBe("2,5");
  });

  it("khối lượng AI ước lượng ⇒ khai báo (declared)", () => {
    const r = mapAiDraftToForm(draft({ unit: "piece", unitWeightKg: 0.15 }), ctx);
    expect(r.patch).toMatchObject({ unit: "piece", unitWeightKg: "0,15", weightSource: "declared" });
    expect(r.filled).toContain("unitWeightKg");
  });

  it("đơn vị khác mặc định và không có khối lượng ⇒ để trống cho người dùng nhập", () => {
    const r = mapAiDraftToForm(draft({ unit: "box" }), ctx);
    expect(r.patch).toMatchObject({ unit: "box", unitWeightKg: "", weightSource: "declared" });
  });

  it("hạn dùng: tương lai thì điền (chỉ ngày), quá khứ thì bỏ qua", () => {
    expect(mapAiDraftToForm(draft({ expiryDate: "2026-10-10" }), ctx).patch).toMatchObject({
      expiryDate: "2026-10-10",
      expiryTime: "",
    });
    expect(mapAiDraftToForm(draft({ expiryDate: "2026-10-01" }), ctx).patch.expiryDate).toBeUndefined();
  });

  it("ghi chú vào mô tả chỉ khi mô tả đang trống", () => {
    expect(mapAiDraftToForm(draft({ notes: "Bảo quản mát" }), ctx).patch.description).toBe("Bảo quản mát");
    expect(
      mapAiDraftToForm(draft({ notes: "Bảo quản mát" }), {
        ...ctx,
        current: { ...CURRENT, description: "Đã có" },
      }).patch.description,
    ).toBeUndefined();
  });

  it("không nhận diện được (confidence 0 hoặc không có tín hiệu) ⇒ không điền gì", () => {
    const none = mapAiDraftToForm(
      draft({ title: "Không nhận diện được thực phẩm", categoryCode: null, quantity: null, confidence: 0 }),
      ctx,
    );
    expect(none).toEqual({ recognized: false, patch: {}, filled: [], lowConfidence: false });
    expect(mapAiDraftToForm(draft({ categoryCode: null, quantity: null }), ctx).recognized).toBe(false);
  });

  it("độ tin cậy thấp ⇒ vẫn điền nhưng nhắc kiểm tra kỹ", () => {
    expect(mapAiDraftToForm(draft({ confidence: 0.3 }), ctx).lowConfidence).toBe(true);
  });
});
