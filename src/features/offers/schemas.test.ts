import { describe, expect, it } from "vitest";

import {
  buildOfferPatch,
  buildOfferPayload,
  offerFieldErrorsFromRpc,
  offerFormValuesSchema,
  parseDecimal,
  validateNewQuantity,
  validateOfferForm,
  weightForUnit,
  type CategoryOption,
  type OfferFormValues,
} from "./schemas";

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
    code: "vegetables",
    nameVi: "Rau củ tươi",
    perishability: "fresh",
    defaultUnit: "kg",
    defaultUnitWeightKg: 1,
    icon: "carrot",
  },
];

const SITE = "6f1c7e2a-1111-4c2b-9a3d-2b7c9d0e1f20";
const NOW = new Date("2026-10-08T15:00:00+07:00");

const VALID: OfferFormValues = {
  siteId: SITE,
  categoryCode: "bread",
  title: "Bánh mì thịt nướng",
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
  photoPath: null,
  aiAssisted: false,
};

describe("parseDecimal", () => {
  it.each([
    ["12", 12],
    ["12,5", 12.5],
    [" 2.25 ", 2.25],
    ["0,125", 0.125],
  ])("%s ⇒ %s", (raw, n) => expect(parseDecimal(raw)).toBe(n));

  it.each(["", "-1", "1,2,3", "abc", "1e3", "0,1234"])("%s ⇒ null", (raw) =>
    expect(parseDecimal(raw)).toBeNull(),
  );
});

describe("validateOfferForm", () => {
  it("giá trị hợp lệ: nháp và đăng (có cam kết) không lỗi", () => {
    expect(validateOfferForm(VALID, { mode: "draft", now: NOW, categories: CATEGORIES })).toEqual({});
    expect(
      validateOfferForm(VALID, { mode: "publish", now: NOW, attested: true, categories: CATEGORIES }),
    ).toEqual({});
  });

  it("US-STO-07 AC2: 12,5 ổ ⇒ phải là số nguyên với đơn vị ổ", () => {
    const e = validateOfferForm({ ...VALID, quantity: "12,5" }, { mode: "draft", now: NOW });
    expect(e.quantity).toBe("Số lượng phải là số nguyên với đơn vị ổ.");
  });

  it("kg cho phép số lẻ và không cần khối lượng mỗi đơn vị", () => {
    const e = validateOfferForm(
      { ...VALID, categoryCode: "vegetables", unit: "kg", quantity: "2,5", unitWeightKg: "" },
      { mode: "draft", now: NOW, categories: CATEGORIES },
    );
    expect(e).toEqual({});
  });

  it("đơn vị khác mặc định của danh mục ⇒ bắt buộc khai khối lượng", () => {
    const e = validateOfferForm(
      { ...VALID, unit: "box", unitWeightKg: "", weightSource: "declared" },
      { mode: "draft", now: NOW, categories: CATEGORIES },
    );
    expect(e.unitWeightKg).toBe("Vui lòng nhập khối lượng mỗi hộp (kg).");
  });

  it("thiếu trường bắt buộc ⇒ lỗi tại từng trường", () => {
    const e = validateOfferForm(
      { ...VALID, siteId: "", categoryCode: "", title: "a", quantity: "", expiryDate: "" },
      { mode: "draft", now: NOW },
    );
    expect(Object.keys(e).sort()).toEqual(["categoryCode", "expiryDate", "quantity", "siteId", "title"]);
    expect(e.title).toBe("Tên lô cần từ 2 đến 120 ký tự.");
  });

  it("giờ kết thúc phải sau giờ bắt đầu", () => {
    const e = validateOfferForm({ ...VALID, pickupEndTime: "16:00" }, { mode: "draft", now: NOW });
    expect(e.pickupEnd).toBe("Giờ kết thúc phải sau giờ bắt đầu.");
  });

  it("đăng: khung lấy sau hạn dùng ⇒ báo hạn; đã qua ⇒ tương lai; chưa cam kết ⇒ lỗi cam kết", () => {
    const afterExpiry = validateOfferForm(
      { ...VALID, expiryTime: "20:00" },
      { mode: "publish", now: NOW, attested: true },
    );
    expect(afterExpiry.pickupEnd).toBe("Khung giờ lấy phải kết thúc trước hạn sử dụng (20:00 hôm nay).");

    const past = validateOfferForm(
      { ...VALID, pickupStartTime: "10:00", pickupEndTime: "12:00" },
      { mode: "publish", now: NOW, attested: true },
    );
    expect(past.pickupEnd).toBe("Vui lòng chọn thời điểm trong tương lai.");

    const notAttested = validateOfferForm(VALID, { mode: "publish", now: NOW, attested: false });
    expect(notAttested.attested).toBe("Vui lòng xác nhận cam kết an toàn thực phẩm trước khi đăng.");
  });

  it("giờ hạn dùng sai định dạng 24 giờ", () => {
    const e = validateOfferForm({ ...VALID, expiryTime: "7h" }, { mode: "draft", now: NOW });
    expect(e.expiryTime).toBe("Giờ chưa đúng định dạng 24 giờ, ví dụ 21:00.");
  });
});

describe("buildOfferPayload / buildOfferPatch", () => {
  it("hạn chỉ có ngày ⇒ {date}; khối lượng mặc định ⇒ null; giờ có offset VN", () => {
    expect(buildOfferPayload(VALID)).toEqual({
      site_id: SITE,
      category_code: "bread",
      title: "Bánh mì thịt nướng",
      description: null,
      quantity: 20,
      unit: "loaf",
      unit_weight_kg: null,
      expiry: { date: "2026-10-08" },
      pickup_start: "2026-10-08T17:00:00+07:00",
      pickup_end: "2026-10-08T21:00:00+07:00",
      photo_paths: [],
      ai_assisted: false,
    });
  });

  it("hạn có giờ ⇒ {datetime}; khối lượng khai báo ⇒ số", () => {
    const p = buildOfferPayload({
      ...VALID,
      expiryTime: "22:30",
      unitWeightKg: "0,15",
      weightSource: "declared",
    });
    expect(p.expiry).toEqual({ datetime: "2026-10-08T22:30:00+07:00" });
    expect(p.unit_weight_kg).toBe(0.15);
  });

  it("nháp: gửi toàn bộ payload", () => {
    expect(buildOfferPatch(VALID, VALID, { isDraft: true, hasAllocations: false })).toEqual(
      buildOfferPayload(VALID),
    );
  });

  it("đã đăng, chưa có phân bổ: chỉ khóa đổi, không bao giờ gửi quantity/ai_assisted", () => {
    const next = { ...VALID, title: "Bánh mì que", quantity: "30", pickupEndTime: "20:00", aiAssisted: true };
    expect(buildOfferPatch(VALID, next, { isDraft: false, hasAllocations: false })).toEqual({
      title: "Bánh mì que",
      pickup_end: "2026-10-08T20:00:00+07:00",
    });
  });

  it("đã có phân bổ: chỉ tên, mô tả, ảnh", () => {
    const next = { ...VALID, description: "Bảo quản mát", pickupEndTime: "20:00" };
    expect(buildOfferPatch(VALID, next, { isDraft: false, hasAllocations: true })).toEqual({
      description: "Bảo quản mát",
    });
  });

  it("schema envelope chấp nhận giá trị form", () => {
    expect(offerFormValuesSchema.safeParse(VALID).success).toBe(true);
    expect(offerFormValuesSchema.safeParse({ ...VALID, unit: "ton" }).success).toBe(false);
  });
});

describe("offerFieldErrorsFromRpc", () => {
  it("ánh xạ lỗi khung lấy của publish_offer + gợi ý giờ kết thúc", () => {
    const r = offerFieldErrorsFromRpc(
      { pickup_window: "after_close", suggested_end: "2026-10-08T14:00:00+00:00" },
      { unit: "loaf", now: NOW },
    );
    expect(r.errors.pickupEnd).toBe("Khung giờ lấy phải kết thúc trước 21:00 hôm nay (giờ đóng cửa).");
    expect(r.suggestedEnd).toBe("2026-10-08T14:00:00+00:00");
  });

  it("ánh xạ lỗi trường của create_offer", () => {
    const r = offerFieldErrorsFromRpc(
      {
        quantity: "integer_required",
        unit_weight_kg: "required_for_unit",
        category_code: "unknown_or_inactive",
        title: "2-120 chars",
        safety_attested: "required",
      },
      { unit: "box", now: NOW },
    );
    expect(r.errors).toEqual({
      quantity: "Số lượng phải là số nguyên với đơn vị hộp.",
      unitWeightKg: "Vui lòng nhập khối lượng mỗi hộp (kg).",
      categoryCode: "Danh mục này không còn dùng được. Vui lòng chọn danh mục khác.",
      title: "Tên lô cần từ 2 đến 120 ký tự.",
      attested: "Vui lòng xác nhận cam kết an toàn thực phẩm trước khi đăng.",
    });
    expect(r.suggestedEnd).toBeNull();
  });

  it("outside_hours ⇒ trường bắt đầu; too_short ⇒ trường kết thúc", () => {
    expect(
      offerFieldErrorsFromRpc({ pickup_window: "outside_hours" }, { now: NOW }).errors.pickupStart,
    ).toMatch(/đang đóng cửa/);
    expect(offerFieldErrorsFromRpc({ pickup_window: "too_short" }, { now: NOW }).errors.pickupEnd).toMatch(
      /ít nhất 30 phút/,
    );
  });
});

describe("validateNewQuantity (US-STO-12 AC2)", () => {
  it("không thấp hơn số đã được giữ", () => {
    expect(validateNewQuantity("15", { unit: "loaf", committed: 20 })).toEqual({
      ok: false,
      message: "Không thể thấp hơn số đã được giữ (20 ổ).",
    });
    expect(validateNewQuantity("25", { unit: "loaf", committed: 20 })).toEqual({ ok: true, value: 25 });
    expect(validateNewQuantity("2,5", { unit: "kg", committed: 0 })).toEqual({ ok: true, value: 2.5 });
    expect(validateNewQuantity("2,5", { unit: "loaf", committed: 0 }).ok).toBe(false);
  });
});

describe("weightForUnit — đổi đơn vị (US-STO-07 AC1, UAT 09/10 m2)", () => {
  const bread = CATEGORIES[0]!;
  const veg = CATEGORIES[1]!;
  const fromDefault = { unitWeightKg: "0,12", weightSource: "category_default" as const };

  it("ổ → cái: không còn trống, gợi ý mức của danh mục (lưu là declared)", () => {
    expect(weightForUnit("piece", bread, fromDefault)).toEqual({
      unitWeightKg: "0,12",
      weightSource: "declared",
      origin: "suggested",
    });
  });

  it("về đúng đơn vị mặc định của danh mục ⇒ mức ước tính, category_default", () => {
    expect(weightForUnit("loaf", bread, { unitWeightKg: "0,08", weightSource: "declared" })).toEqual({
      unitWeightKg: "0,12",
      weightSource: "category_default",
      origin: "category_default",
    });
  });

  it("đã gõ khối lượng ⇒ giữ nguyên khi đổi sang đơn vị đếm khác", () => {
    expect(weightForUnit("box", bread, { unitWeightKg: "0,5", weightSource: "declared" })).toEqual({
      unitWeightKg: "0,5",
      weightSource: "declared",
      origin: "kept",
    });
  });

  it("chỉ xóa khi đổi sang kg hoặc lít", () => {
    for (const unit of ["kg", "liter"] as const) {
      expect(weightForUnit(unit, bread, { unitWeightKg: "0,5", weightSource: "declared" })).toEqual({
        unitWeightKg: "",
        weightSource: "declared",
        origin: "cleared",
      });
    }
  });

  it("danh mục tính theo kg không có mức cho đơn vị đếm; chưa chọn danh mục ⇒ để trống", () => {
    const empty = { unitWeightKg: "", weightSource: "declared" as const };
    expect(weightForUnit("piece", veg, empty)).toMatchObject({ unitWeightKg: "", origin: "cleared" });
    expect(weightForUnit("piece", null, empty)).toMatchObject({ unitWeightKg: "", origin: "cleared" });
    expect(weightForUnit("piece", null, { unitWeightKg: "0,3", weightSource: "declared" })).toMatchObject({
      unitWeightKg: "0,3",
      origin: "kept",
    });
  });

  it("ô đã khai trống (declared rỗng) ⇒ gợi ý thay vì để trống", () => {
    expect(weightForUnit("piece", bread, { unitWeightKg: "  ", weightSource: "declared" })).toMatchObject({
      unitWeightKg: "0,12",
      origin: "suggested",
    });
  });

  it("mức gợi ý vượt qua kiểm tra của form (không còn lỗi “bắt buộc”)", () => {
    const w = weightForUnit("piece", bread, fromDefault);
    const errors = validateOfferForm(
      { ...VALID, unit: "piece", unitWeightKg: w.unitWeightKg, weightSource: w.weightSource },
      { mode: "draft", now: NOW, categories: CATEGORIES },
    );
    expect(errors.unitWeightKg).toBeUndefined();
  });
});
