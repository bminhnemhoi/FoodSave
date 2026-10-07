import { describe, expect, it } from "vitest";

import {
  escapeHtml,
  existingAccountEmail,
  orgApprovedEmail,
  orgChangesRequestedEmail,
  orgRejectedEmail,
  passwordResetEmail,
  signupConfirmationEmail,
} from "./templates";

const LINK = "https://foodsave-psi.vercel.app/auth/confirm?token_hash=abc&type=signup&next=/onboarding";

describe("email templates", () => {
  it("thư xác nhận có tiêu đề tiếng Việt, tên người dùng, link ở cả HTML và text", () => {
    const m = signupConfirmationEmail({ to: "a@b.vn", fullName: "Nguyễn Văn An", link: LINK });
    expect(m.subject).toBe("Xác nhận email để kích hoạt tài khoản FoodSave");
    expect(m.html).toContain("Xin chào Nguyễn Văn An");
    expect(m.html).toContain(escapeHtml(LINK));
    expect(m.text).toContain(LINK);
    expect(m.tag).toBe("auth.signup_confirmation");
    expect(m.html).toContain('lang="vi"');
  });

  it("thoát HTML trong tên để chặn chèn mã (XSS qua email)", () => {
    const m = signupConfirmationEmail({
      to: "a@b.vn",
      fullName: '<img src=x onerror="alert(1)">',
      link: LINK,
    });
    expect(m.html).not.toContain("<img src=x");
    expect(m.html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("thư đặt lại mật khẩu nêu rõ thời hạn và cách bỏ qua", () => {
    const m = passwordResetEmail({ to: "a@b.vn", link: LINK.replace("signup", "recovery") });
    expect(m.text).toContain("15 phút");
    expect(m.html).toContain("Đặt mật khẩu mới");
  });

  it("thư 'đã có tài khoản' không chứa token, chỉ có link đăng nhập/đặt lại", () => {
    const m = existingAccountEmail({
      to: "a@b.vn",
      loginUrl: "https://x.vn/login",
      resetUrl: "https://x.vn/forgot-password",
    });
    expect(m.html).not.toContain("token_hash");
    expect(m.text).toContain("https://x.vn/forgot-password");
  });

  it("tên rỗng dùng xưng hô trung tính", () => {
    expect(signupConfirmationEmail({ to: "a@b.vn", fullName: "  ", link: LINK }).text).toContain(
      "Xin chào bạn",
    );
  });
});

describe("email kết quả duyệt hồ sơ", () => {
  const base = {
    to: "chu@tiem.vn",
    ownerName: "Nguyễn Thị Thu Lan",
    orgName: "Tiệm bánh Hạt Lúa",
    kind: "store" as const,
    appUrl: "https://foodsave-psi.vercel.app",
    orgId: "6f1c2b8e-3a4d-4c5e-9f60-7a8b9c0d1e2f",
  };

  it("duyệt: tiêu đề nêu tên hồ sơ, link vào đúng cổng, nhắc xóa giấy tờ sau 30 ngày", () => {
    const m = orgApprovedEmail(base);
    expect(m.subject).toBe("Hồ sơ Tiệm bánh Hạt Lúa đã được duyệt");
    expect(m.tag).toBe("org.review.approved");
    expect(m.html).toContain("Vào cổng Cửa hàng");
    expect(m.html).toContain("https://foodsave-psi.vercel.app/store");
    expect(m.text).toContain("https://foodsave-psi.vercel.app/store");
    expect(m.text).toContain("30 ngày");
    expect(orgApprovedEmail({ ...base, kind: "charity" }).html).toContain("/charity");
  });

  it("cần bổ sung: có lý do (đã thoát HTML) và link trang trạng thái của đúng tổ chức", () => {
    const m = orgChangesRequestedEmail({ ...base, reason: "Ảnh <b>giấy phép</b> bị mờ.\nVui lòng tải lại." });
    expect(m.subject).toBe("Hồ sơ Tiệm bánh Hạt Lúa cần bổ sung thông tin");
    expect(m.html).toContain("Ảnh &lt;b&gt;giấy phép&lt;/b&gt; bị mờ.");
    expect(m.html).not.toContain("<b>giấy phép</b>");
    expect(m.text).toContain("Vui lòng tải lại.");
    expect(m.text).toContain(`/onboarding/status?org=${base.orgId}`);
  });

  it("từ chối: có lý do và cách khiếu nại", () => {
    const m = orgRejectedEmail({ ...base, reason: "Không xác minh được giấy phép." });
    expect(m.subject).toBe("Hồ sơ Tiệm bánh Hạt Lúa chưa được duyệt");
    expect(m.tag).toBe("org.review.rejected");
    expect(m.html).toContain("Không xác minh được giấy phép.");
    expect(m.html).toContain("trả lời email này");
  });

  it("tên tổ chức có xuống dòng/HTML không chèn được header hay mã", () => {
    const m = orgApprovedEmail({ ...base, orgName: "Tiệm\r\nBcc: x@y.z <script>", ownerName: " " });
    expect(m.subject).not.toMatch(/[\r\n]/);
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("Xin chào bạn,");
  });
});
