import "server-only";

import type { EmailMessage } from "@/server/providers/notify/types";

/** Thoát ký tự HTML cho dữ liệu người dùng nhập (tên…). */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

type LayoutInput = {
  heading: string;
  paragraphs: string[];
  cta?: { label: string; href: string };
  footnote: string;
};

/** Khung email chung — inline style vì nhiều trình đọc mail bỏ <style>; màu theo token thương hiệu. */
function layout({ heading, paragraphs, cta, footnote }: LayoutInput): string {
  const p = (html: string) =>
    `<p style="margin:0 0 16px;line-height:1.6;color:#4a5b53;font-size:15px">${html}</p>`;
  const button = cta
    ? `<p style="margin:8px 0 24px"><a href="${escapeHtml(cta.href)}" style="display:inline-block;background:#1b6b47;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px">${escapeHtml(cta.label)}</a></p>
       <p style="margin:0 0 20px;font-size:12px;line-height:1.6;color:#5f7068;word-break:break-all">Nếu nút không bấm được, mở liên kết: ${escapeHtml(cta.href)}</p>`
    : "";
  return `<!doctype html><html lang="vi"><body style="margin:0;padding:24px;background:#faf7f0;font-family:Arial,Helvetica,sans-serif;color:#13261e">
<table role="presentation" width="100%" style="max-width:520px;margin:0 auto;background:#fffdf8;border:1px solid #e6dfd0;border-radius:14px"><tr><td style="padding:28px">
<p style="margin:0 0 20px;font-size:22px;font-weight:700"><span style="color:#13261e">FOOD</span><span style="color:#1b6b47">SAVE</span></p>
<h1 style="margin:0 0 12px;font-size:20px;color:#13261e">${escapeHtml(heading)}</h1>
${paragraphs.map(p).join("\n")}
${button}
<p style="margin:0;font-size:13px;line-height:1.6;color:#5f7068">${footnote}</p>
</td></tr></table>
<p style="max-width:520px;margin:12px auto 0;font-size:12px;color:#8e8676;text-align:center">FoodSave — nền tảng phi lợi nhuận kết nối thực phẩm dư thừa tới tổ chức từ thiện.</p>
</body></html>`;
}

const LINK_TTL_TEXT = "Liên kết có hiệu lực trong 15 phút và chỉ dùng được một lần.";

export function signupConfirmationEmail(input: { to: string; fullName: string; link: string }): EmailMessage {
  const name = input.fullName.trim() || "bạn";
  return {
    to: input.to,
    tag: "auth.signup_confirmation",
    subject: "Xác nhận email để kích hoạt tài khoản FoodSave",
    html: layout({
      heading: "Xác nhận email của bạn",
      paragraphs: [
        `Xin chào ${escapeHtml(name)},`,
        "Cảm ơn bạn đã tham gia FoodSave. Bấm nút dưới đây để kích hoạt tài khoản, sau đó bạn có thể đăng ký hồ sơ cửa hàng hoặc tổ chức từ thiện.",
      ],
      cta: { label: "Xác nhận email", href: input.link },
      footnote: `${LINK_TTL_TEXT} Nếu bạn không đăng ký FoodSave, hãy bỏ qua email này.`,
    }),
    text: `Xin chào ${name},\n\nBấm vào liên kết sau để kích hoạt tài khoản FoodSave:\n${input.link}\n\n${LINK_TTL_TEXT}\nNếu bạn không đăng ký FoodSave, hãy bỏ qua email này.`,
  };
}

export function passwordResetEmail(input: { to: string; link: string }): EmailMessage {
  return {
    to: input.to,
    tag: "auth.password_reset",
    subject: "Đặt lại mật khẩu FoodSave",
    html: layout({
      heading: "Đặt lại mật khẩu",
      paragraphs: ["Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản FoodSave gắn với email này."],
      cta: { label: "Đặt mật khẩu mới", href: input.link },
      footnote: `${LINK_TTL_TEXT} Nếu bạn không yêu cầu, hãy bỏ qua email này — mật khẩu của bạn vẫn giữ nguyên.`,
    }),
    text: `Đặt lại mật khẩu FoodSave:\n${input.link}\n\n${LINK_TTL_TEXT}\nNếu bạn không yêu cầu, hãy bỏ qua email này.`,
  };
}

export function existingAccountEmail(input: {
  to: string;
  loginUrl: string;
  resetUrl: string;
}): EmailMessage {
  return {
    to: input.to,
    tag: "auth.existing_account",
    subject: "Bạn đã có tài khoản FoodSave",
    html: layout({
      heading: "Email này đã có tài khoản",
      paragraphs: [
        "Ai đó (có thể là bạn) vừa đăng ký FoodSave bằng email này, nhưng email đã được dùng cho một tài khoản.",
        `Bạn có thể <a href="${escapeHtml(input.loginUrl)}" style="color:#1b6b47;font-weight:700">đăng nhập</a> hoặc <a href="${escapeHtml(input.resetUrl)}" style="color:#1b6b47;font-weight:700">đặt lại mật khẩu</a> nếu quên.`,
      ],
      footnote: "Nếu không phải bạn, hãy bỏ qua email này — tài khoản của bạn vẫn an toàn.",
    }),
    text: `Email này đã có tài khoản FoodSave.\nĐăng nhập: ${input.loginUrl}\nQuên mật khẩu: ${input.resetUrl}\nNếu không phải bạn, hãy bỏ qua email này.`,
  };
}
