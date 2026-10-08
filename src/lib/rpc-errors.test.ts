import { describe, expect, it } from "vitest";

import { mapRpcError, RPC_MESSAGES } from "./rpc-errors";

describe("mapRpcError", () => {
  it("ánh xạ mã nghiệp vụ P2", () => {
    expect(mapRpcError({ code: "PT409", message: "insufficient_quantity" })).toEqual({
      code: "insufficient_quantity",
      message: RPC_MESSAGES.insufficientQuantity,
    });
    expect(mapRpcError({ code: "PT422", message: "token_expired" }).message).toBe(RPC_MESSAGES.tokenExpired);
    expect(
      mapRpcError({ code: "PT422", message: "token_expired", details: "outside_pickup_window" }).message,
    ).toBe(RPC_MESSAGES.outsidePickupWindow);
    expect(mapRpcError({ code: "PT403", message: "org_not_active", details: "paused" }).message).toBe(
      RPC_MESSAGES.orgPaused,
    );
    expect(mapRpcError({ code: "PT409", message: "invalid_state", details: "store_paused" }).code).toBe(
      "store_paused",
    );
  });

  it("PT422 có details JSON ⇒ fieldErrors (bỏ tiền tố p_)", () => {
    const e = mapRpcError({
      code: "PT422",
      message: "validation_failed",
      details: '{"p_qty":"above_available","unit":"integer_required","n":3}',
    });
    expect(e.code).toBe("validation_failed");
    expect(e.fieldErrors).toEqual({ qty: "above_available", unit: "integer_required" });
  });

  it("overrides theo message:detail rồi message", () => {
    const o = { "invalid_state:already_packed": "Lô đã đóng gói.", deadline_passed: "Hết hạn rồi." };
    expect(
      mapRpcError({ code: "PT409", message: "invalid_state", details: "already_packed" }, o).message,
    ).toBe("Lô đã đóng gói.");
    expect(mapRpcError({ code: "PT409", message: "deadline_passed" }, o).message).toBe("Hết hạn rồi.");
  });

  it("PT429 dùng hint (giây)", () => {
    expect(mapRpcError({ code: "PT429", message: "rate_limited", hint: "300" }).message).toContain("5 phút");
  });

  it("mã lạ ⇒ server_error, không lộ chi tiết kỹ thuật", () => {
    const e = mapRpcError({ code: "XX000", message: "relation foo does not exist" });
    expect(e).toEqual({ code: "server_error", message: RPC_MESSAGES.server });
  });
});
