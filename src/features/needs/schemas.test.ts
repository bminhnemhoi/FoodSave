import { describe, expect, it } from "vitest";

import {
  buildPublishNeedArgs,
  cancelNeedInput,
  choosePlanInput,
  defaultNeededBy,
  needFieldErrorsFromRpc,
  NEED_MESSAGES,
  neededByDateBounds,
  needFormValuesSchema,
  validateNeedForm,
  type NeedFormValues,
} from "./schemas";

const NOW = new Date("2026-10-20T10:00:00+07:00");
const SITE = "11111111-1111-4111-8111-111111111111";

function values(patch: Partial<NeedFormValues> = {}): NeedFormValues {
  return {
    siteId: SITE,
    categoryCodes: ["bread"],
    quantity: "50",
    unit: "loaf",
    neededByDate: "2026-10-20",
    neededByTime: "15:00",
    peopleToServe: "",
    note: "",
    ...patch,
  };
}

describe("validateNeedForm (US-CHA-09, khớp publish_need)", () => {
  it("form hợp lệ ⇒ không lỗi", () => {
    expect(validateNeedForm(values(), { now: NOW })).toEqual({});
  });

  it("thiếu điểm nhận, danh mục, số lượng, đơn vị", () => {
    const e = validateNeedForm(values({ siteId: "", categoryCodes: [], quantity: " ", unit: "" }), {
      now: NOW,
    });
    expect(e).toMatchObject({
      siteId: NEED_MESSAGES.site,
      categoryCodes: NEED_MESSAGES.categoriesRequired,
      quantity: NEED_MESSAGES.quantityRequired,
      unit: NEED_MESSAGES.unit,
    });
  });

  it("1–3 danh mục, trùng được gộp; điểm nhận chỉ nhận một số danh mục", () => {
    expect(validateNeedForm(values({ categoryCodes: ["bread", "bread", "pastry"] }), { now: NOW })).toEqual(
      {},
    );
    expect(
      validateNeedForm(values({ categoryCodes: ["bread", "pastry", "dairy", "fruit"] }), { now: NOW })
        .categoryCodes,
    ).toBe(NEED_MESSAGES.categoriesMax);
    expect(
      validateNeedForm(values({ categoryCodes: ["bread", "dairy"] }), {
        now: NOW,
        acceptedCategories: ["bread"],
      }).categoryCodes,
    ).toBe(NEED_MESSAGES.categoriesNotAccepted);
    expect(validateNeedForm(values(), { now: NOW, acceptedCategories: null })).toEqual({});
  });

  it("số nguyên với đơn vị đếm, số lẻ với kg/lít, > 0, tối đa 999.999", () => {
    expect(validateNeedForm(values({ quantity: "12,5" }), { now: NOW }).quantity).toBe(
      NEED_MESSAGES.quantityInteger("loaf"),
    );
    expect(validateNeedForm(values({ quantity: "12,5", unit: "kg" }), { now: NOW })).toEqual({});
    expect(validateNeedForm(values({ quantity: "0" }), { now: NOW }).quantity).toBe(
      NEED_MESSAGES.quantityInvalid,
    );
    expect(validateNeedForm(values({ quantity: "abc" }), { now: NOW }).quantity).toBe(
      NEED_MESSAGES.quantityInvalid,
    );
    expect(validateNeedForm(values({ quantity: "1000000" }), { now: NOW }).quantity).toBe(
      NEED_MESSAGES.quantityMax,
    );
  });

  it("cần trước: > 1 giờ và ≤ 7 ngày, giờ 24h hợp lệ", () => {
    expect(validateNeedForm(values({ neededByTime: "11:00" }), { now: NOW }).neededBy).toBe(
      NEED_MESSAGES.neededByMin,
    );
    expect(validateNeedForm(values({ neededByTime: "11:01" }), { now: NOW })).toEqual({});
    expect(
      validateNeedForm(values({ neededByDate: "2026-10-27", neededByTime: "10:00" }), { now: NOW }),
    ).toEqual({});
    expect(
      validateNeedForm(values({ neededByDate: "2026-10-27", neededByTime: "10:01" }), { now: NOW }).neededBy,
    ).toBe(NEED_MESSAGES.neededByMax);
    expect(validateNeedForm(values({ neededByDate: "2026-10-19" }), { now: NOW }).neededBy).toBe(
      NEED_MESSAGES.neededByMin,
    );
    expect(validateNeedForm(values({ neededByTime: "25:00" }), { now: NOW }).neededBy).toBe(
      NEED_MESSAGES.neededByTime,
    );
    expect(validateNeedForm(values({ neededByDate: "" }), { now: NOW }).neededBy).toBe(
      NEED_MESSAGES.neededByRequired,
    );
  });

  it("số người 1–100.000 (cho phép dấu chấm nghìn), ghi chú ≤ 500 ký tự", () => {
    expect(validateNeedForm(values({ peopleToServe: "45" }), { now: NOW })).toEqual({});
    expect(validateNeedForm(values({ peopleToServe: "1.200" }), { now: NOW })).toEqual({});
    expect(validateNeedForm(values({ peopleToServe: "0" }), { now: NOW }).peopleToServe).toBe(
      NEED_MESSAGES.people,
    );
    expect(validateNeedForm(values({ peopleToServe: "4,5" }), { now: NOW }).peopleToServe).toBe(
      NEED_MESSAGES.people,
    );
    expect(validateNeedForm(values({ peopleToServe: "100001" }), { now: NOW }).peopleToServe).toBe(
      NEED_MESSAGES.people,
    );
    expect(validateNeedForm(values({ note: "x".repeat(501) }), { now: NOW }).note).toBe(NEED_MESSAGES.note);
    expect(validateNeedForm(values({ note: `  ${"x".repeat(500)}  ` }), { now: NOW })).toEqual({});
  });
});

describe("buildPublishNeedArgs", () => {
  it("giờ VN gửi ISO +07:00, gộp danh mục trùng, NULL cho trường tùy chọn trống", () => {
    expect(buildPublishNeedArgs(values({ categoryCodes: ["bread", "pastry", "bread"], note: "  " }))).toEqual(
      {
        p_site_id: SITE,
        p_category_codes: ["bread", "pastry"],
        p_unit: "loaf",
        p_quantity: 50,
        p_needed_by: "2026-10-20T15:00:00+07:00",
        p_people_to_serve: null,
        p_note: null,
      },
    );
  });

  it("số lẻ kg, số người, ghi chú đã trim", () => {
    const a = buildPublishNeedArgs(
      values({ unit: "kg", quantity: "12,5", peopleToServe: "45", note: " cho các em " }),
    );
    expect(a).toMatchObject({ p_quantity: 12.5, p_people_to_serve: 45, p_note: "cho các em" });
  });
});

describe("needFieldErrorsFromRpc — PT422 detail của publish_need", () => {
  it("ánh xạ từng mã về đúng trường", () => {
    expect(
      needFieldErrorsFromRpc(
        {
          site_id: "inactive",
          category_codes: "not_accepted_by_site",
          unit: "required",
          quantity: "integer_required",
          needed_by: "max_7_days",
          people_to_serve: "1-100000",
          note: "≤ 500 chars",
        },
        { unit: "loaf" },
      ),
    ).toEqual({
      siteId: NEED_MESSAGES.siteInactive,
      categoryCodes: NEED_MESSAGES.categoriesNotAccepted,
      unit: NEED_MESSAGES.unit,
      quantity: NEED_MESSAGES.quantityInteger("loaf"),
      neededBy: NEED_MESSAGES.neededByMax,
      peopleToServe: NEED_MESSAGES.people,
      note: NEED_MESSAGES.note,
    });
  });

  it("các biến thể còn lại và khóa lạ", () => {
    expect(
      needFieldErrorsFromRpc({
        site_id: "not_a_charity_site",
        category_codes: "unknown_or_inactive",
        quantity: "> 0",
        needed_by: "min_1_hour",
        unknown_keys: "x",
      }),
    ).toEqual({
      siteId: NEED_MESSAGES.site,
      categoryCodes: NEED_MESSAGES.categoriesUnknown,
      quantity: NEED_MESSAGES.quantityInvalid,
      neededBy: NEED_MESSAGES.neededByMin,
    });
    expect(needFieldErrorsFromRpc({ category_codes: "1-3 codes", needed_by: "required" })).toEqual({
      categoryCodes: NEED_MESSAGES.categoriesMax,
      neededBy: NEED_MESSAGES.neededByRequired,
    });
  });
});

describe("mặc định và schema envelope", () => {
  it("cần trước mặc định = 4 giờ nữa làm tròn lên 15 phút (giờ VN)", () => {
    expect(defaultNeededBy(new Date("2026-10-20T10:07:00+07:00"))).toEqual({
      date: "2026-10-20",
      time: "14:15",
    });
    expect(defaultNeededBy(new Date("2026-10-20T21:00:00+07:00"))).toEqual({
      date: "2026-10-21",
      time: "01:00",
    });
    expect(neededByDateBounds(NOW)).toEqual({ min: "2026-10-20", max: "2026-10-27" });
  });

  it("envelope chặn dữ liệu lạ; input action cần uuid", () => {
    expect(needFormValuesSchema.safeParse(values()).success).toBe(true);
    expect(needFormValuesSchema.safeParse({ ...values(), unit: "ton" }).success).toBe(false);
    expect(choosePlanInput.safeParse({ needId: SITE, planKey: "a:1", clientOpId: SITE }).success).toBe(true);
    expect(choosePlanInput.safeParse({ needId: "x", planKey: "a:1", clientOpId: SITE }).success).toBe(false);
    expect(cancelNeedInput.safeParse({ needId: SITE, reason: "  ", clientOpId: SITE }).success).toBe(false);
  });
});
