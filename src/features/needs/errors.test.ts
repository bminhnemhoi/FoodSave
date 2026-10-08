import { describe, expect, it } from "vitest";

import { RPC_MESSAGES } from "@/lib/rpc-errors";

import { mapCancelNeedError, mapMatchError, mapReserveError, NEED_MESSAGES_SERVER } from "./errors";

const OFFER = "22222222-2222-4222-8222-222222222222";
const lookup = (id: string) =>
  id === OFFER ? { title: "Bánh mì ổ", storeName: "Tiệm bánh Hạt Lúa", unit: "loaf" as const } : null;
const err = (code: string, message: string, details?: unknown) => ({
  code,
  message,
  details: details === undefined ? null : typeof details === "string" ? details : JSON.stringify(details),
});
const NOW = new Date("2026-10-20T10:00:00+07:00");

describe("mapReserveError — mọi mã lỗi của reserve_bundle (DATA-MODEL §8.4)", () => {
  it("insufficient_quantity: nói rõ còn bao nhiêu, tính lại phương án", () => {
    const e = mapReserveError(
      err("PT409", "insufficient_quantity", { offer_id: OFFER, available: 15 }),
      lookup,
    );
    expect(e).toMatchObject({ code: "insufficient_quantity", replan: true, available: 15 });
    expect(e.message).toContain("“Bánh mì ổ” của Tiệm bánh Hạt Lúa chỉ còn 15 ổ");
    const anon = mapReserveError(err("PT409", "insufficient_quantity", { offer_id: "x" }), lookup);
    expect(anon.message).toContain("Một lô trong phương án không còn đủ số lượng");
  });

  it("nhu cầu: đã đủ, đã đóng, quá needed_by", () => {
    expect(mapReserveError(err("PT409", "invalid_state", "need_already_covered"))).toMatchObject({
      code: "need_already_covered",
      message: NEED_MESSAGES_SERVER.needCovered,
    });
    expect(mapReserveError(err("PT409", "invalid_state")).code).toBe("need_closed");
    expect(mapReserveError(err("PT409", "deadline_passed", "needed_by")).code).toBe("need_past_deadline");
  });

  it("lỗi theo lô ⇒ replan", () => {
    const cases: [ReturnType<typeof err>, string][] = [
      [err("PT409", "deadline_passed", { offer_id: OFFER }), "deadline_passed"],
      [err("PT409", "invalid_state", { offer_id: OFFER, reason: "store_paused" }), "store_paused"],
      [err("PT409", "invalid_state", { offer_id: OFFER }), "offer_closed"],
      [err("PT404", "not_found", { offer_id: OFFER }), "offer_not_found"],
      [err("PT403", "self_dealing", { offer_id: OFFER }), "self_dealing"],
      [err("PT422", "out_of_radius", { offer_id: OFFER }), "out_of_radius"],
      [err("PT422", "unit_mismatch", { offer_id: OFFER }), "unit_mismatch"],
      [err("PT422", "validation_failed", { p_lines: "exceeds_need", remaining: 12 }), "exceeds_need"],
      [err("PT422", "validation_failed", { p_lines: "demo_mismatch", offer_id: OFFER }), "demo_mismatch"],
      [
        err("PT422", "validation_failed", { p_lines: "category_not_in_need", offer_id: OFFER }),
        "category_not_in_need",
      ],
      [
        err("PT422", "validation_failed", { p_lines: "category_not_accepted_by_site", offer_id: OFFER }),
        "category_not_accepted_by_site",
      ],
      [
        err("PT422", "validation_failed", { p_lines: "store_site_inactive", offer_id: OFFER }),
        "store_site_inactive",
      ],
      [
        err("PT422", "validation_failed", { p_lines: "integer_required", offer_id: OFFER }),
        "integer_required",
      ],
      [err("PT422", "validation_failed", { p_lines: "line_format", index: 0 }), "line_format"],
      [err("PT422", "validation_failed", { p_lines: "too_many_offers", max: 15 }), "too_many_offers"],
      [err("PT422", "validation_failed", { stop_count: "mismatch", expected: 3 }), "plans_changed"],
      [err("PT422", "validation_failed", { rematch_of: "not_a_bundle_of_this_need" }), "plans_changed"],
    ];
    for (const [e, code] of cases) {
      const m = mapReserveError(e, lookup, NOW);
      expect(m.code, code).toBe(code);
      expect(m.replan, code).toBe(true);
      expect(m.message.length, code).toBeGreaterThan(10);
    }
    expect(
      mapReserveError(err("PT409", "invalid_state", { offer_id: OFFER, reason: "store_paused" }), lookup)
        .message,
    ).toContain("Tiệm bánh Hạt Lúa vừa tạm ngưng");
    expect(
      mapReserveError(err("PT422", "validation_failed", { p_lines: "exceeds_need", remaining: 12 })).message,
    ).toContain("chỉ còn thiếu 12");
  });

  it("infeasible_timing nêu hạn hiệu lực theo giờ VN", () => {
    const m = mapReserveError(
      err("PT422", "infeasible_timing", { offer_id: OFFER, effective_deadline: "2026-10-20T12:30:00+07:00" }),
      lookup,
      NOW,
    );
    expect(m.message).toContain("trước hạn hiệu lực 12:30 hôm nay");
    expect(mapReserveError(err("PT422", "infeasible_timing", { offer_id: OFFER }), lookup).message).toContain(
      "trước hạn hiệu lực (tính theo xe máy)",
    );
  });

  it("không tính lại: quá nhiều điểm dừng, tạm ngưng, quyền, điểm nhận tắt, bận, giới hạn tần suất", () => {
    const stops = mapReserveError(err("PT422", "validation_failed", { p_lines: "too_many_stops", max: 5 }));
    expect(stops).toMatchObject({ code: "too_many_stops", message: NEED_MESSAGES_SERVER.tooManyStops(5) });
    expect(stops.replan).toBeUndefined();
    expect(mapReserveError(err("PT403", "org_not_active", "paused")).code).toBe("org_paused");
    expect(mapReserveError(err("PT403", "not_authorized")).code).toBe("forbidden");
    expect(mapReserveError(err("PT422", "validation_failed", { need: "receiving_site_inactive" })).code).toBe(
      "receiving_site_inactive",
    );
    expect(mapReserveError(err("PT409", "idempotency_conflict")).message).toBe(RPC_MESSAGES.busy);
    expect(mapReserveError({ code: "PT429", message: "rate_limited", hint: "120" }).message).toContain(
      "2 phút",
    );
    expect(mapReserveError(err("PT404", "not_found")).code).toBe("not_found");
    expect(mapReserveError(err("XX000", "boom")).code).toBe("server_error");
  });
});

describe("mapMatchError / mapCancelNeedError", () => {
  it("tìm phương án", () => {
    expect(mapMatchError(err("PT409", "deadline_passed")).code).toBe("need_past_deadline");
    expect(mapMatchError(err("PT409", "invalid_state")).code).toBe("need_closed");
    expect(mapMatchError(err("PT403", "not_authorized")).code).toBe("forbidden");
    expect(mapMatchError(err("PT403", "org_not_active")).code).toBe("org_not_active");
  });
  it("hủy nhu cầu", () => {
    expect(mapCancelNeedError(err("PT409", "invalid_state")).message).toContain("đã kết thúc");
    expect(mapCancelNeedError(err("PT403", "not_authorized")).message).toContain("chủ sở hữu hoặc quản lý");
    expect(
      mapCancelNeedError(err("PT422", "validation_failed", { p_reason: "required, ≤ 500 chars" })).code,
    ).toBe("validation_failed");
  });
});
