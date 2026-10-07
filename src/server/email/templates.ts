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

// ---------------------------------------------------------------------------
// Kết quả duyệt hồ sơ (US-ADM-04 AC1, US-STO-04) — gửi cho chủ hồ sơ sau khi Admin ra quyết định
// ---------------------------------------------------------------------------

export type OrgReviewEmailInput = {
  to: string;
  ownerName: string;
  orgName: string;
  kind: "store" | "charity";
  /** URL tuyệt đối của ứng dụng (NEXT_PUBLIC_APP_URL). */
  appUrl: string;
  orgId: string;
};

/** Tiêu đề email là văn bản thuần: bỏ xuống dòng để không chèn được header. */
function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function greet(name: string): string {
  return `Xin chào ${name.trim() || "bạn"},`;
}

function statusUrl(input: OrgReviewEmailInput): string {
  const url = new URL("/onboarding/status", input.appUrl);
  url.searchParams.set("org", input.orgId);
  return url.toString();
}

function quoteHtml(reason: string): string {
  return `<span style="display:block;border-left:3px solid #9a5b00;background:#fff4db;padding:12px 14px;border-radius:6px;color:#13261e;white-space:pre-line">${escapeHtml(reason)}</span>`;
}

const KIND_PORTAL = { store: "cổng Cửa hàng", charity: "cổng Tổ chức" } as const;

export function orgApprovedEmail(input: OrgReviewEmailInput): EmailMessage {
  const portal = KIND_PORTAL[input.kind];
  const portalUrl = new URL(input.kind === "store" ? "/store" : "/charity", input.appUrl).toString();
  const cta = input.kind === "store" ? "Vào cổng Cửa hàng" : "Vào cổng Tổ chức";
  return {
    to: input.to,
    tag: "org.review.approved",
    subject: oneLine(`Hồ sơ ${input.orgName} đã được duyệt`),
    html: layout({
      heading: "Hồ sơ đã được duyệt",
      paragraphs: [
        escapeHtml(greet(input.ownerName)),
        `FoodSave đã duyệt hồ sơ <strong>${escapeHtml(input.orgName)}</strong>. Từ bây giờ bạn có thể dùng ${portal}.`,
      ],
      cta: { label: cta, href: portalUrl },
      footnote:
        "Giấy tờ bạn đã nộp sẽ được xóa sau 30 ngày theo chính sách bảo mật. Nếu cần hỗ trợ, hãy trả lời email này.",
    }),
    text: `${greet(input.ownerName)}\n\nFoodSave đã duyệt hồ sơ ${input.orgName}. Từ bây giờ bạn có thể dùng ${portal}:\n${portalUrl}\n\nGiấy tờ bạn đã nộp sẽ được xóa sau 30 ngày theo chính sách bảo mật.`,
  };
}

export function orgChangesRequestedEmail(input: OrgReviewEmailInput & { reason: string }): EmailMessage {
  const link = statusUrl(input);
  return {
    to: input.to,
    tag: "org.review.changes_requested",
    subject: oneLine(`Hồ sơ ${input.orgName} cần bổ sung thông tin`),
    html: layout({
      heading: "Hồ sơ cần bổ sung",
      paragraphs: [
        escapeHtml(greet(input.ownerName)),
        `FoodSave đã xem hồ sơ <strong>${escapeHtml(input.orgName)}</strong> và cần bạn sửa hoặc bổ sung trước khi duyệt:`,
        quoteHtml(input.reason),
        "Sau khi sửa, bấm “Gửi duyệt” lại. Dữ liệu bạn đã nhập vẫn được giữ nguyên.",
      ],
      cta: { label: "Xem và sửa hồ sơ", href: link },
      footnote: "Nếu có thắc mắc về yêu cầu này, hãy trả lời email này kèm tên tổ chức.",
    }),
    text: `${greet(input.ownerName)}\n\nFoodSave cần bạn sửa hoặc bổ sung hồ sơ ${input.orgName} trước khi duyệt:\n\n${input.reason}\n\nXem và sửa hồ sơ: ${link}`,
  };
}

export function orgRejectedEmail(input: OrgReviewEmailInput & { reason: string }): EmailMessage {
  const link = statusUrl(input);
  return {
    to: input.to,
    tag: "org.review.rejected",
    subject: oneLine(`Hồ sơ ${input.orgName} chưa được duyệt`),
    html: layout({
      heading: "Hồ sơ chưa được duyệt",
      paragraphs: [
        escapeHtml(greet(input.ownerName)),
        `FoodSave chưa thể duyệt hồ sơ <strong>${escapeHtml(input.orgName)}</strong> vì lý do sau:`,
        quoteHtml(input.reason),
        "Nếu bạn cho rằng có nhầm lẫn, hãy trả lời email này kèm tên tổ chức để FoodSave xem xét lại.",
      ],
      cta: { label: "Xem trạng thái hồ sơ", href: link },
      footnote: "Giấy tờ bạn đã nộp sẽ được xóa sau 30 ngày theo chính sách bảo mật.",
    }),
    text: `${greet(input.ownerName)}\n\nFoodSave chưa thể duyệt hồ sơ ${input.orgName} vì lý do sau:\n\n${input.reason}\n\nXem trạng thái hồ sơ: ${link}\nGiấy tờ đã nộp sẽ được xóa sau 30 ngày theo chính sách bảo mật.`,
  };
}
