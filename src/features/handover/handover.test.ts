import { describe, expect, it } from "vitest";

import { HANDOVER_MESSAGES, mapHandoverError, tokenConsumedMessage } from "./errors";
import { formatClock, formatWindow, parsePgTimestamp, parseTstzRange } from "./format";
import { CARRIER_SHORTFALL_REASONS, STORE_SHORTFALL_REASONS } from "./labels";
import {
  draftFromSpec,
  isAdjusted,
  parseQtyInput,
  qtyToInput,
  toRpcLines,
  totalKg,
  validateLine,
  validateLines,
  type LineDraft,
  type LineSpec,
} from "./lines";
import {
  formatHandoverCode,
  normalizeCodeInput,
  parseScannedPayload,
  qrPayloadForToken,
  spokenHandoverCode,
} from "./payload";

const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_abcde"; // 43 ký tự base64url

describe("payload QR", () => {
  it("QR chỉ chứa token thô", () => {
    expect(TOKEN).toHaveLength(43);
    expect(qrPayloadForToken(TOKEN)).toBe(TOKEN);
  });

  it("token sai dạng ⇒ lỗi lập trình", () => {
    expect(() => qrPayloadForToken("ngắn")).toThrow();
    expect(() => qrPayloadForToken(`${TOKEN}=`)).toThrow();
  });

  it.each([
    [TOKEN, TOKEN],
    [`  ${TOKEN}\n`, TOKEN],
    [`https://foodsave.vn/h/${TOKEN}`, TOKEN],
    [`https://foodsave.vn/h/${TOKEN}/`, TOKEN],
    [`http://localhost:3000/store/handover?t=${TOKEN}`, TOKEN],
  ])("đọc mã quét được: %s", (text, expected) => {
    expect(parseScannedPayload(text)).toBe(expected);
  });

  it.each([
    "",
    "482913",
    "https://example.com/khong-phai-ma",
    `https://foodsave.vn/h/${TOKEN}x`,
    `ftp://foodsave.vn/h/${TOKEN}`,
    "https://[không hợp lệ",
    `WIFI:S:${TOKEN};;`,
  ])("không phải mã bàn giao: %s", (text) => {
    expect(parseScannedPayload(text)).toBeNull();
  });

  it("mã 6 số: chuẩn hóa, nhóm 3-3, đọc từng số", () => {
    expect(normalizeCodeInput("482 913")).toBe("482913");
    expect(normalizeCodeInput("48-29-13-77")).toBe("482913");
    expect(formatHandoverCode("482913")).toBe("482 913");
    expect(formatHandoverCode("48")).toBe("48");
    expect(spokenHandoverCode("482913")).toBe("4 8 2 9 1 3");
  });
});

const BREAD: LineSpec = {
  allocationId: "a1",
  title: "Bánh mì",
  unit: "loaf",
  expectedQty: 20,
  unitWeightKg: 0.12,
};
const VEG: LineSpec = { allocationId: "a2", title: "Rau cải", unit: "kg", expectedQty: 2.5, unitWeightKg: 1 };

const draft = (over: Partial<LineDraft> = {}): LineDraft => ({
  allocationId: "a1",
  qty: "20",
  reason: "",
  note: "",
  ...over,
});

describe("parseQtyInput", () => {
  it.each([
    ["18", 18],
    [" 2,5 ", 2.5],
    ["2.5", 2.5],
    ["0", 0],
    ["1 000", 1000],
  ])("%s ⇒ %d", (raw, n) => expect(parseQtyInput(raw)).toBe(n));

  it.each(["", "abc", "-1", "1,2,3", "1e3"])("%s ⇒ null", (raw) => expect(parseQtyInput(raw)).toBeNull());

  it("qtyToInput dùng dấu phẩy", () => expect(qtyToInput(2.5)).toBe("2,5"));
});

describe("validateLine — đối soát cửa hàng (US-STO-18)", () => {
  it("giao đủ: không cần lý do, bỏ lý do/ghi chú thừa", () => {
    const r = validateLine(BREAD, draft({ reason: "capacity", note: "x" }), STORE_SHORTFALL_REASONS);
    expect(r.value).toEqual({ allocationId: "a1", qty: 20, reason: null, note: null });
  });

  it("giao 18/20 ⇒ bắt buộc lý do", () => {
    expect(validateLine(BREAD, draft({ qty: "18" }), STORE_SHORTFALL_REASONS).error?.reason).toBe(
      "Vui lòng chọn lý do thiếu.",
    );
    const ok = validateLine(BREAD, draft({ qty: "18", reason: "store_short" }), STORE_SHORTFALL_REASONS);
    expect(ok.value).toEqual({ allocationId: "a1", qty: 18, reason: "store_short", note: null });
  });

  it("từ chối vì chất lượng ⇒ bắt buộc ghi chú (≤ 300 ký tự)", () => {
    const r = validateLine(BREAD, draft({ qty: "17", reason: "quality_reject" }), STORE_SHORTFALL_REASONS);
    expect(r.error?.note).toMatch(/mô tả ngắn/);
    const long = validateLine(
      BREAD,
      draft({ qty: "17", reason: "quality_reject", note: "x".repeat(301) }),
      STORE_SHORTFALL_REASONS,
    );
    expect(long.error?.note).toBe("Ghi chú tối đa 300 ký tự.");
    const ok = validateLine(
      BREAD,
      draft({ qty: "17", reason: "quality_reject", note: "  3 ổ bị mốc  " }),
      STORE_SHORTFALL_REASONS,
    );
    expect(ok.value).toEqual({ allocationId: "a1", qty: 17, reason: "quality_reject", note: "3 ổ bị mốc" });
  });

  it("vượt số đặt bị chặn (AC5)", () => {
    expect(validateLine(BREAD, draft({ qty: "21" }), STORE_SHORTFALL_REASONS).error?.qty).toBe(
      "Chỉ có 20 ổ — vui lòng nhập tối đa 20.",
    );
  });

  it("đơn vị đếm phải là số nguyên; kg cho phép 3 chữ số thập phân", () => {
    expect(validateLine(BREAD, draft({ qty: "18,5" }), STORE_SHORTFALL_REASONS).error?.qty).toBe(
      "Số lượng phải là số nguyên với đơn vị ổ.",
    );
    const veg = { ...draft(), allocationId: "a2" };
    expect(
      validateLine(VEG, { ...veg, qty: "2,25", reason: "capacity" }, STORE_SHORTFALL_REASONS).value?.qty,
    ).toBe(2.25);
    expect(validateLine(VEG, { ...veg, qty: "2,2501" }, STORE_SHORTFALL_REASONS).error?.qty).toBe(
      "Số lượng chỉ lấy tối đa 3 chữ số thập phân.",
    );
  });

  it("rỗng / sai định dạng", () => {
    expect(validateLine(BREAD, draft({ qty: " " }), STORE_SHORTFALL_REASONS).error?.qty).toBe(
      "Vui lòng nhập số lượng.",
    );
    expect(validateLine(BREAD, draft({ qty: "mười" }), STORE_SHORTFALL_REASONS).error?.qty).toMatch(
      /chưa hợp lệ/,
    );
  });

  it("lý do không thuộc bước này bị từ chối", () => {
    const r = validateLine(BREAD, draft({ qty: "10", reason: "no_show" }), STORE_SHORTFALL_REASONS);
    expect(r.error?.reason).toBe("Lý do này không dùng được ở bước này.");
    expect(CARRIER_SHORTFALL_REASONS).toContain("capacity");
  });

  it("giao 0 (từ chối cả dòng) vẫn hợp lệ khi có lý do", () => {
    const r = validateLine(BREAD, draft({ qty: "0", reason: "capacity" }), STORE_SHORTFALL_REASONS);
    expect(r.value?.qty).toBe(0);
  });
});

describe("validateLines / tiện ích", () => {
  it("phải có bản nháp cho mọi phân bổ", () => {
    const r = validateLines([BREAD, VEG], [draft()], STORE_SHORTFALL_REASONS);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors)).toEqual(["a2"]);
  });

  it("hợp lệ ⇒ p_lines đúng định dạng RPC", () => {
    const r = validateLines(
      [BREAD, VEG],
      [draft({ qty: "18", reason: "store_short" }), { allocationId: "a2", qty: "2,5", reason: "", note: "" }],
      STORE_SHORTFALL_REASONS,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(toRpcLines(r.lines)).toEqual([
        { allocation_id: "a1", qty: 18, reason: "store_short", note: null },
        { allocation_id: "a2", qty: 2.5, reason: null, note: null },
      ]);
      expect(totalKg([BREAD, VEG], r.lines)).toBe(4.66);
    }
  });

  it("draftFromSpec lấy đề xuất của người mang hàng", () => {
    expect(draftFromSpec(BREAD)).toEqual({ allocationId: "a1", qty: "20", reason: "", note: "" });
    expect(draftFromSpec(BREAD, { qty: 15, reason: "capacity", note: null })).toEqual({
      allocationId: "a1",
      qty: "15",
      reason: "capacity",
      note: "",
    });
    expect(draftFromSpec(BREAD, { qty: null, reason: null, note: null }).qty).toBe("20");
  });

  it("isAdjusted chỉ đúng khi có dòng khác số dự kiến", () => {
    expect(isAdjusted([BREAD], [draft()])).toBe(false);
    expect(isAdjusted([BREAD], [draft({ qty: "19" })])).toBe(true);
  });
});

describe("định dạng giờ VN và kiểu Postgres", () => {
  it("formatClock 24h giờ Việt Nam", () => {
    expect(formatClock("2026-10-08T12:05:00Z")).toBe("19:05");
    expect(formatClock(new Date("2026-10-08T17:30:00Z"))).toBe("00:30");
    expect(formatClock("không phải ngày")).toBe("—");
  });

  it("parsePgTimestamp đọc định dạng text của Postgres", () => {
    expect(parsePgTimestamp("2026-10-08 02:15:30.123456+00")?.toISOString()).toBe("2026-10-08T02:15:30.123Z");
    expect(parsePgTimestamp("2026-10-08 09:15:30+07:00")?.toISOString()).toBe("2026-10-08T02:15:30.000Z");
    expect(parsePgTimestamp("2026-10-08T02:15:30Z")?.toISOString()).toBe("2026-10-08T02:15:30.000Z");
    expect(parsePgTimestamp("")).toBeNull();
    expect(parsePgTimestamp("abc")).toBeNull();
  });

  it("parseTstzRange + formatWindow", () => {
    const r = parseTstzRange('["2026-10-08 07:00:00+00","2026-10-08 10:00:00+00")');
    expect(r?.start.toISOString()).toBe("2026-10-08T07:00:00.000Z");
    expect(r?.end.toISOString()).toBe("2026-10-08T10:00:00.000Z");
    expect(formatWindow(r!.start, r!.end)).toBe("14:00–17:00, 08/10");
    expect(parseTstzRange("empty")).toBeNull();
    expect(parseTstzRange(null)).toBeNull();
  });
});

describe("mapHandoverError", () => {
  it("token đã dùng ⇒ nói giờ đã dùng (US-STO-17 AC3); khi phát mã ⇒ điểm đã xong", () => {
    const err = { code: "PT409", message: "token_consumed", details: "2026-10-08 07:32:10.5+00" };
    expect(mapHandoverError(err, "consume").message).toBe(
      "Mã này đã được dùng lúc 14:32 — lượt bàn giao đã ghi nhận xong.",
    );
    expect(mapHandoverError(err, "issue").message).toBe(HANDOVER_MESSAGES.stopDone);
    expect(tokenConsumedMessage(null)).toMatch(/^Mã này đã được dùng —/);
  });

  it("sai cửa hàng, tự xác nhận, mã hết hạn/khóa, ngoài khung giờ", () => {
    expect(
      mapHandoverError({ code: "PT403", message: "not_authorized", details: "wrong_store" }, "peek").message,
    ).toBe(HANDOVER_MESSAGES.wrongStore);
    expect(mapHandoverError({ code: "PT403", message: "self_dealing" }, "consume").message).toBe(
      HANDOVER_MESSAGES.selfDealing,
    );
    expect(mapHandoverError({ code: "PT422", message: "token_locked" }, "consume").code).toBe("token_locked");
    expect(
      mapHandoverError(
        { code: "PT422", message: "token_expired", details: "outside_pickup_window" },
        "consume",
      ).code,
    ).toBe("token_expired");
    expect(mapHandoverError({ code: "PT404", message: "not_found" }, "consume").message).toBe(
      HANDOVER_MESSAGES.notFoundCode,
    );
    expect(mapHandoverError({ code: "PT403", message: "not_authorized" }, "issue").message).toBe(
      HANDOVER_MESSAGES.issueForbidden,
    );
  });

  it("lỗi dòng gắn vào đúng phân bổ", () => {
    const e = mapHandoverError(
      {
        code: "PT422",
        message: "validation_failed",
        details: JSON.stringify({ p_lines: "note_required", allocation_id: "a1" }),
      },
      "consume",
    );
    expect(e.fieldErrors).toEqual({ "line:a1": "Vui lòng mô tả ngắn vì sao hàng không đạt chất lượng." });
    const changed = mapHandoverError(
      {
        code: "PT422",
        message: "validation_failed",
        details: JSON.stringify({ p_lines: "missing_allocation", allocation_id: "a2" }),
      },
      "consume",
    );
    expect(changed.message).toBe(HANDOVER_MESSAGES.linesChanged);
  });
});
