import { describe, expect, it } from "vitest";

import { infeasibleMessage, mapRequestError } from "./errors";

const NOW = new Date("2026-10-08T03:00:00Z"); // 10:00 giờ VN

describe("mapRequestError (request_offer)", () => {
  it("insufficient_quantity trả số còn lại để đề xuất nhận phần đó", () => {
    expect(
      mapRequestError({ code: "PT409", message: "insufficient_quantity", details: '{"available": 5}' }, NOW),
    ).toEqual({
      code: "insufficient_quantity",
      message: "Lô vừa được tổ chức khác giữ một phần.",
      available: 5,
    });
    expect(
      mapRequestError({ code: "PT409", message: "insufficient_quantity", details: null }, NOW).available,
    ).toBe(undefined);
  });

  it("infeasible_timing nói rõ giờ tới và hạn hiệu lực", () => {
    const e = mapRequestError(
      {
        code: "PT422",
        message: "infeasible_timing",
        details: JSON.stringify({
          eta_pickup: "2026-10-08T14:20:00Z",
          eta_dropoff: "2026-10-08T14:40:00Z",
          effective_deadline: "2026-10-08T14:00:00Z",
        }),
      },
      NOW,
    );
    expect(e.message).toBe(
      "Không kịp tới: đi xe máy dự kiến tới cửa hàng lúc 21:20 hôm nay, nhưng lô hết hạn hiệu lực lúc 21:00 hôm nay.",
    );
  });

  it("infeasible_timing vì điểm nhận đóng cửa lúc mang hàng về", () => {
    expect(
      infeasibleMessage(
        {
          eta_pickup: "2026-10-08T10:00:00Z",
          eta_dropoff: "2026-10-08T10:30:00Z",
          effective_deadline: "2026-10-08T14:00:00Z",
        },
        NOW,
      ),
    ).toMatch(/^Điểm nhận đang chọn không mở cửa lúc dự kiến mang hàng về \(17:30 hôm nay\)/);
    expect(infeasibleMessage(null, NOW)).toMatch(/^Không kịp đến lấy/);
  });

  it("các mã còn lại có câu riêng theo ngữ cảnh", () => {
    expect(mapRequestError({ code: "PT422", message: "out_of_radius" }).message).toMatch(
      /ngoài bán kính phục vụ/,
    );
    expect(mapRequestError({ code: "PT409", message: "deadline_passed" }).message).toMatch(
      /quá hạn hiệu lực/,
    );
    expect(mapRequestError({ code: "PT403", message: "self_dealing" }).message).toMatch(/không thể tự nhận/);
    expect(
      mapRequestError({ code: "PT409", message: "invalid_state", details: "store_paused" }).message,
    ).toMatch(/tạm ngưng nhận yêu cầu/);
    expect(mapRequestError({ code: "PT409", message: "invalid_state" }).message).toMatch(
      /không còn nhận yêu cầu/,
    );
    expect(mapRequestError({ code: "PT403", message: "org_not_active", details: "paused" }).message).toMatch(
      /tạm ngưng/,
    );
    expect(
      mapRequestError({
        code: "PT422",
        message: "validation_failed",
        details: '{"category_code":"not_accepted_by_site"}',
      }).code,
    ).toBe("category_not_accepted");
    expect(mapRequestError({ code: "PT429", message: "rate_limited", hint: "120" }).message).toMatch(
      /2 phút/,
    );
  });
});
