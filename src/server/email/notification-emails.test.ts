import { describe, expect, it } from "vitest";

import {
  allocationConfirmedEmail,
  allocationRejectedEmail,
  allocationRequestedEmail,
  escapeHtml,
  notificationEmail,
  type NotificationEmailInput,
  urgentOfferEmail,
} from "./templates";

const APP = "https://foodsave-psi.vercel.app";

function input(over: Partial<NotificationEmailInput> = {}): NotificationEmailInput {
  return {
    to: "lan@example.com",
    recipientName: "Nguyễn Thị Lan",
    orgName: "Tiệm bánh Hạt Lúa",
    event: "allocation_requested",
    urgency: "normal",
    title: "Yêu cầu nhận lô mới: Bánh mì que",
    body: "Bếp ăn Nắng Mai muốn nhận 20 ổ. Hãy trả lời trước 19:30, sau đó yêu cầu tự hết hạn.",
    linkPath: "/store/inventory?offer=8a1c",
    appUrl: APP,
    ...over,
  };
}

describe("email thông báo vận hành (dispatcher)", () => {
  it("N-07 yêu cầu nhận lô: tiêu đề = tiêu đề thông báo, lời chào, nội dung, nút về đúng lô", () => {
    const m = allocationRequestedEmail(input());
    expect(m.to).toBe("lan@example.com");
    expect(m.tag).toBe("notify.allocation_requested");
    expect(m.subject).toBe("Yêu cầu nhận lô mới: Bánh mì que");
    expect(m.html).toContain('lang="vi"');
    expect(m.html).toContain("Xin chào Nguyễn Thị Lan");
    expect(m.html).toContain("Có tổ chức muốn nhận lô của bạn");
    expect(m.html).toContain(escapeHtml(`${APP}/store/inventory?offer=8a1c`));
    expect(m.text).toContain(`Xem và trả lời yêu cầu: ${APP}/store/inventory?offer=8a1c`);
    expect(m.text).toContain("Bếp ăn Nắng Mai muốn nhận 20 ổ");
  });

  it("có lý do nhận thư và cách ngừng nhận (gợi ý tùy chọn)", () => {
    const m = allocationRequestedEmail(input());
    expect(m.text).toContain("Bạn nhận email này vì là thành viên của Tiệm bánh Hạt Lúa trên FoodSave.");
    expect(m.text).toContain("Không muốn nhận loại email này nữa?");
    expect(allocationRequestedEmail(input({ orgName: null })).text).toContain(
      "Bạn nhận email này vì đang dùng FoodSave.",
    );
  });

  it("N-05 lô Đỏ: tiêu đề GẤP, lời nhắc chỉ nhận khi đến kịp", () => {
    const m = urgentOfferEmail(
      input({
        event: "offer_turned_red",
        urgency: "urgent",
        title: "GẤP · Lô Đỏ gần bạn: Bánh mì que",
        body: "GẤP · Tiệm bánh Hạt Lúa có 30 ổ Bánh mì que (Đỏ), cách 2,4 km, cần lấy trước 21:00.",
        linkPath: "/charity/donations?offer=8a1c",
      }),
    );
    expect(m.subject).toBe("GẤP · Lô Đỏ gần bạn: Bánh mì que");
    expect(m.tag).toBe("notify.offer_urgent");
    expect(m.text).toContain("Chỉ gửi yêu cầu nếu bạn đến kịp");
    expect(m.text).toContain(`${APP}/charity/donations?offer=8a1c`);
  });

  it("N-08 / N-09: chấp nhận, từ chối, hết hạn có lời dẫn riêng", () => {
    const ok = allocationConfirmedEmail(
      input({ event: "allocation_confirmed", title: "Yêu cầu đã được chấp nhận: X" }),
    );
    expect(ok.tag).toBe("notify.allocation_confirmed");
    expect(ok.text).toContain("mã QR hoặc mã 6 số");
    const no = allocationRejectedEmail(
      input({ event: "allocation_rejected", title: "Yêu cầu chưa được chấp nhận: X" }),
    );
    expect(no.tag).toBe("notify.allocation_rejected");
    expect(no.html).toContain("Yêu cầu nhận lô chưa thành công");
    expect(allocationRejectedEmail(input({ event: "allocation_expired" })).tag).toBe(
      "notify.allocation_expired",
    );
  });

  it("chọn mẫu theo sự kiện và mức khẩn", () => {
    const tag = (over: Partial<NotificationEmailInput>) => notificationEmail(input(over)).tag;
    expect(tag({ event: "offer_published", urgency: "urgent" })).toBe("notify.offer_urgent");
    expect(tag({ event: "offer_turned_red", urgency: "urgent" })).toBe("notify.offer_urgent");
    expect(tag({ event: "offer_published", urgency: "normal" })).toBe("notify.offer_published");
    expect(tag({ event: "allocation_requested" })).toBe("notify.allocation_requested");
    expect(tag({ event: "allocation_confirmed" })).toBe("notify.allocation_confirmed");
    expect(tag({ event: "allocation_rejected" })).toBe("notify.allocation_rejected");
    expect(tag({ event: "allocation_expired" })).toBe("notify.allocation_expired");
    expect(tag({ event: "pickup_assigned" })).toBe("notify.pickup_assigned");
    const generic = notificationEmail(
      input({ event: "org_suspended", urgency: "normal", title: "Tổ chức đang bị tạm khóa" }),
    );
    expect(generic.html).toContain("Thông báo từ FoodSave");
    expect(notificationEmail(input({ event: "allocation_cancelled", urgency: "urgent" })).html).toContain(
      "Thông báo GẤP từ FoodSave",
    );
  });

  it("thoát HTML và bỏ xuống dòng trong tiêu đề (chặn chèn mã / header)", () => {
    const m = notificationEmail(
      input({
        title: "Lô <script>alert(1)</script>\r\nBcc: x@y",
        body: "<img src=x onerror=alert(1)>",
        recipientName: "<b>",
      }),
    );
    expect(m.subject).not.toMatch(/[\r\n]/);
    expect(m.html).not.toContain("<script>");
    expect(m.html).not.toContain("<img src=x");
    expect(m.html).toContain("&lt;script&gt;");
    expect(m.html).toContain("Xin chào &lt;b&gt;");
  });

  it("đường dẫn lạ (//host, http:, rỗng) quay về trang đầu FoodSave, không chuyển ra ngoài", () => {
    for (const linkPath of [
      "//evil.example/x",
      "https://evil.example",
      "javascript:alert(1)",
      null,
      "/a b",
    ]) {
      expect(notificationEmail(input({ linkPath })).text).toContain(`Xem và trả lời yêu cầu: ${APP}/\n`);
    }
  });

  it("không nhắc tới địa chỉ email người nhận trong nội dung", () => {
    const m = notificationEmail(input());
    expect(m.html).not.toContain("lan@example.com");
    expect(m.text).not.toContain("lan@example.com");
  });
});
