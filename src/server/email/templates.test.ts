import { describe, expect, it } from "vitest";

import { escapeHtml, existingAccountEmail, passwordResetEmail, signupConfirmationEmail } from "./templates";

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
