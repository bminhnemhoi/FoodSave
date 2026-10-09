import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  basicsFields,
  emailSchema,
  HOTLINE_PHONE_RE,
  hotlineEmailSchema,
  hotlinePhoneSchema,
  isComplete,
  legalFields,
  MESSAGES,
  normalizePhone,
  parseFields,
  phoneSchema,
  pickValid,
  radiusSchema,
  siteFields,
  todayInVietnam,
} from "./schemas";

const LOCATION = {
  lat: 10.7769,
  lng: 106.7009,
  addressLine: "135 Nam Kỳ Khởi Nghĩa",
  ward: "Phường Bến Thành",
  city: "Thành phố Hồ Chí Minh",
  source: "autocomplete" as const,
};

function firstError(schema: z.ZodType, value: unknown): string | undefined {
  const r = schema.safeParse(value);
  return r.success ? undefined : r.error.issues[0]?.message;
}

describe("normalizePhone / phoneSchema", () => {
  it.each([
    ["0901 234 567", "0901234567"],
    ["0901.234.567", "0901234567"],
    ["+84 901 234 567", "0901234567"],
    ["84901234567", "0901234567"],
    ["(028) 3822-1234", "02838221234"],
  ])("%s ⇒ %s", (input, out) => {
    expect(normalizePhone(input)).toBe(out);
  });

  it("nhận số 10 chữ số bắt đầu bằng 0 và trả dạng chuẩn hóa", () => {
    expect(phoneSchema.parse("+84 901 234 567")).toBe("0901234567");
  });

  it("báo lỗi tiếng Việt khi trống hoặc sai", () => {
    expect(firstError(phoneSchema, "")).toBe("Vui lòng nhập số điện thoại.");
    expect(firstError(phoneSchema, "12345")).toBe(MESSAGES.phone);
    expect(firstError(phoneSchema, "1901234567")).toBe(MESSAGES.phone);
  });
});

describe("emailSchema", () => {
  it("chuẩn hóa chữ thường, bỏ khoảng trắng", () => {
    expect(emailSchema.parse("  Ten@ToChuc.VN ")).toBe("ten@tochuc.vn");
  });
  it("lỗi tiếng Việt theo DESIGN-SYSTEM §12.1", () => {
    expect(firstError(emailSchema, "")).toBe("Vui lòng nhập email.");
    expect(firstError(emailSchema, "khong-phai-email")).toBe(
      "Email chưa đúng định dạng, ví dụ: ten@tochuc.vn.",
    );
  });
});

describe("hotlinePhoneSchema / hotlineEmailSchema (B1, org_contacts)", () => {
  it("không bắt buộc: rỗng hoặc thiếu ⇒ null", () => {
    expect(hotlinePhoneSchema.parse("")).toBeNull();
    expect(hotlinePhoneSchema.parse(undefined)).toBeNull();
    expect(hotlineEmailSchema.parse("  ")).toBeNull();
    expect(hotlineEmailSchema.parse(undefined)).toBeNull();
  });

  it("di động 10 số, máy bàn 11 số 02…, đầu số 1800/1900; chuẩn hóa như số liên hệ", () => {
    expect(hotlinePhoneSchema.parse("0901 234 567")).toBe("0901234567");
    expect(hotlinePhoneSchema.parse("+84 28 3823 4567")).toBe("02838234567");
    expect(hotlinePhoneSchema.parse("028.3823.4567")).toBe("02838234567");
    expect(hotlinePhoneSchema.parse("1900 1234")).toBe("19001234");
    expect(hotlinePhoneSchema.parse("1800-123456")).toBe("1800123456");
    expect(HOTLINE_PHONE_RE.test("0901234567")).toBe(true);
  });

  it("từ chối số sai định dạng với câu tiếng Việt", () => {
    for (const bad of ["12345", "09012345678", "0901 234 56", "1700123456", "1900123", "abc"]) {
      expect(firstError(hotlinePhoneSchema, bad)).toBe(MESSAGES.hotline);
    }
  });

  it("email hotline: chữ thường, đúng định dạng", () => {
    expect(hotlineEmailSchema.parse(" Hotline@TiemBanh.VN ")).toBe("hotline@tiembanh.vn");
    expect(firstError(hotlineEmailSchema, "khong-phai-email")).toBe(MESSAGES.email);
  });
});

describe("basicsFields", () => {
  const store = z.object(basicsFields("store"));
  const charity = z.object(basicsFields("charity"));
  const ok = {
    name: "Tiệm bánh Hạt Lúa",
    subtype: "bakery",
    description: "",
    contactPhone: "0901234567",
    contactEmail: "lan@example.com",
  };

  it("cửa hàng hợp lệ; mô tả rỗng ⇒ null", () => {
    const r = store.parse(ok);
    expect(r.description).toBeNull();
    expect(r.name).toBe("Tiệm bánh Hạt Lúa");
  });

  it("loại hình phải khớp loại tổ chức (CHECK organizations_subtype_by_kind)", () => {
    expect(store.safeParse({ ...ok, subtype: "soup_kitchen" }).success).toBe(false);
    expect(firstError(basicsFields("store").subtype, "")).toBe("Vui lòng chọn loại hình.");
  });

  it("tên cửa hàng: bắt buộc, 2–160 ký tự", () => {
    expect(firstError(basicsFields("store").name, "  ")).toBe("Vui lòng nhập tên cửa hàng.");
    expect(firstError(basicsFields("store").name, "A")).toBe("Tên cửa hàng cần từ 2 đến 160 ký tự.");
    expect(firstError(basicsFields("charity").name, "")).toBe("Vui lòng nhập tên tổ chức.");
  });

  it("tổ chức cần số người được hỗ trợ; ngày thành lập không được ở tương lai", () => {
    const base = { ...ok, subtype: "soup_kitchen", beneficiaries: "45", foundedOn: "" };
    const r = charity.parse(base);
    expect(r.beneficiaries).toBe(45);
    expect(r.foundedOn).toBeNull();
    expect(charity.safeParse({ ...base, beneficiaries: "" }).success).toBe(false);
    expect(charity.safeParse({ ...base, beneficiaries: "4,5" }).success).toBe(false);
    expect(charity.safeParse({ ...base, beneficiaries: "0" }).success).toBe(false);
    expect(charity.safeParse({ ...base, foundedOn: "2999-01-01" }).success).toBe(false);
    expect(charity.safeParse({ ...base, foundedOn: "2010-02-30" }).success).toBe(false);
    expect(charity.parse({ ...base, foundedOn: "2010-02-28" }).foundedOn).toBe("2010-02-28");
  });
});

describe("legalFields", () => {
  it("cửa hàng cần mã số thuế 10 hoặc 13 ký tự", () => {
    const tax = legalFields("store").taxCode;
    expect(tax.safeParse("0312345678").success).toBe(true);
    expect(tax.safeParse("0312345678-001").success).toBe(true);
    expect(firstError(tax, "12345")).toBe(MESSAGES.taxCode);
    expect(firstError(tax, "")).toBe("Vui lòng nhập mã số thuế.");
  });

  it("tổ chức: số quyết định không bắt buộc (rỗng ⇒ null); không có trường CCCD", () => {
    const f = legalFields("charity");
    expect(f.registrationNo.parse("")).toBeNull();
    expect(Object.keys(f)).not.toContain("representativeIdLast4");
    expect(Object.keys(legalFields("store"))).not.toContain("representativeIdLast4");
  });
});

describe("siteFields", () => {
  it("bán kính 0,5–30 km, làm tròn 1 chữ số", () => {
    expect(radiusSchema.parse(2.54)).toBe(2.5);
    expect(radiusSchema.safeParse(0.4).success).toBe(false);
    expect(radiusSchema.safeParse(30.5).success).toBe(false);
    expect(radiusSchema.safeParse(Number.NaN).success).toBe(false);
  });

  it("tổ chức: cần ít nhất một loại thực phẩm hợp lệ", () => {
    const f = siteFields("charity");
    expect(f.acceptedCategories.safeParse(["bread"]).success).toBe(true);
    expect(firstError(f.acceptedCategories, [])).toBe(MESSAGES.categories);
    expect(f.acceptedCategories.safeParse(["pizza"]).success).toBe(false);
  });

  it("sức nhận: rỗng ⇒ null, nhận dấu phẩy thập phân", () => {
    const f = siteFields("charity");
    expect(f.capacityKg.parse("")).toBeNull();
    expect(f.capacityKg.parse("12,5")).toBe(12.5);
    expect(f.capacityKg.safeParse("-1").success).toBe(false);
  });

  it("vị trí phải nằm trong vùng phục vụ", () => {
    const f = siteFields("store");
    expect(f.location.safeParse(LOCATION).success).toBe(true);
    expect(f.location.safeParse({ ...LOCATION, lat: 21.0285, lng: 105.8542 }).success).toBe(false);
  });
});

describe("pickValid / parseFields / isComplete", () => {
  const fields = basicsFields("store");

  it("chỉ giữ trường hợp lệ để tự lưu (US-STO-01 AC1)", () => {
    const { data, errors } = pickValid(fields, { name: "Tiệm A", contactEmail: "sai", contactPhone: "" });
    expect(data).toEqual({ name: "Tiệm A" });
    expect(Object.keys(errors).sort()).toEqual(["contactEmail", "contactPhone"]);
  });

  it("server từ chối khóa lạ và giá trị sai", () => {
    expect(parseFields(fields, { name: "Tiệm A", status: "approved" })).toMatchObject({
      ok: false,
      errors: { status: "Trường không được phép." },
    });
    expect(parseFields(fields, null)).toMatchObject({ ok: false });
    expect(parseFields(fields, { name: "Tiệm A" })).toEqual({ ok: true, data: { name: "Tiệm A" } });
  });

  it("isComplete cần đủ trường bắt buộc", () => {
    expect(isComplete(fields, { name: "Tiệm A" })).toBe(false);
    expect(
      isComplete(fields, {
        name: "Tiệm A",
        subtype: "other",
        description: "",
        contactPhone: "0901234567",
        contactEmail: "a@b.vn",
      }),
    ).toBe(true);
  });
});

describe("todayInVietnam", () => {
  it("theo múi giờ Asia/Ho_Chi_Minh", () => {
    // 2026-10-08 18:30 UTC = 2026-10-09 01:30 giờ Việt Nam
    expect(todayInVietnam(new Date("2026-10-08T18:30:00Z"))).toBe("2026-10-09");
  });
});
