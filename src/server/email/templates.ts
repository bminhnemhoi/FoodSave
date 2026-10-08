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
  /** URL tuyệt đối bất kỳ của ứng dụng — để lấy gốc cho ảnh logo khi email không có nút CTA. */
  appUrlHint?: string;
};

/** Gốc URL của ứng dụng (https://…) từ link trong email hoặc NEXT_PUBLIC_APP_URL; không xác định ⇒ null. */
function appOrigin(...candidates: (string | undefined)[]): string | null {
  for (const c of [...candidates, process.env.NEXT_PUBLIC_APP_URL]) {
    if (!c) continue;
    try {
      const url = new URL(c.trim());
      if (url.protocol === "https:" || url.protocol === "http:") return url.origin;
    } catch {
      // thử ứng viên kế tiếp
    }
  }
  return null;
}

/**
 * Đầu email: logo "Bát lá" dạng PNG đặt trên chính ứng dụng (`/brand/email-logo.png`, 2× — Gmail không hiện
 * SVG). Ảnh bị chặn ⇒ alt "FoodSave" hiện bằng chữ màu thương hiệu. Không xác định được gốc URL ⇒ chữ thuần.
 */
function header(origin: string | null): string {
  if (!origin) {
    return `<p style="margin:0 0 20px;font-size:22px;font-weight:700"><span style="color:#13261e">Food</span><span style="color:#1b6b47">Save</span></p>`;
  }
  return `<img src="${escapeHtml(`${origin}/brand/email-logo.png`)}" width="172" height="44" alt="FoodSave" style="display:block;border:0;outline:none;text-decoration:none;width:172px;height:44px;margin:0 0 20px;font-size:20px;font-weight:700;color:#1b6b47">`;
}

function footer(origin: string | null): string {
  const site = origin
    ? ` · <a href="${escapeHtml(origin)}" style="color:#5f7068;text-decoration:underline">${escapeHtml(new URL(origin).host)}</a>`
    : "";
  return `<p style="max-width:520px;margin:12px auto 0;font-size:12px;line-height:1.6;color:#5f7068;text-align:center">FoodSave — nền tảng phi lợi nhuận kết nối thực phẩm dư thừa tới tổ chức từ thiện${site}</p>`;
}

/** Khung email chung — inline style vì nhiều trình đọc mail bỏ <style>; màu theo token thương hiệu. */
function layout({ heading, paragraphs, cta, footnote, appUrlHint }: LayoutInput): string {
  const origin = appOrigin(cta?.href, appUrlHint);
  const p = (html: string) =>
    `<p style="margin:0 0 16px;line-height:1.6;color:#4a5b53;font-size:15px">${html}</p>`;
  const button = cta
    ? `<p style="margin:8px 0 24px"><a href="${escapeHtml(cta.href)}" style="display:inline-block;background:#1b6b47;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px">${escapeHtml(cta.label)}</a></p>
       <p style="margin:0 0 20px;font-size:12px;line-height:1.6;color:#5f7068;word-break:break-all">Nếu nút không bấm được, mở liên kết: ${escapeHtml(cta.href)}</p>`
    : "";
  return `<!doctype html><html lang="vi"><body style="margin:0;padding:24px;background:#faf7f0;font-family:Arial,Helvetica,sans-serif;color:#13261e">
<table role="presentation" width="100%" style="max-width:520px;margin:0 auto;background:#fffdf8;border:1px solid #e6dfd0;border-radius:14px"><tr><td style="padding:28px">
${header(origin)}
<h1 style="margin:0 0 12px;font-size:20px;color:#13261e">${escapeHtml(heading)}</h1>
${paragraphs.map(p).join("\n")}
${button}
<p style="margin:0;font-size:13px;line-height:1.6;color:#5f7068">${footnote}</p>
</td></tr></table>
${footer(origin)}
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
      appUrlHint: input.loginUrl,
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

// ---------------------------------------------------------------------------
// Lời mời thành viên / tình nguyện viên (N-03, F-09, F-32, US-STO-06, US-CHA-14)
// ---------------------------------------------------------------------------

export type MemberInviteEmailInput = {
  to: string;
  orgName: string;
  orgKind: "store" | "charity";
  role: "owner" | "manager" | "staff" | "volunteer";
  /** Tên người mời (có thể rỗng). */
  inviterName: string;
  /** Link tuyệt đối `/invite/<token>` — token chỉ có trong email này, không lưu ở outbox. */
  link: string;
  expiresAt: string | Date;
};

const INVITE_ROLE_TEXT: Record<MemberInviteEmailInput["role"], string> = {
  owner: "chủ sở hữu",
  manager: "quản lý",
  staff: "nhân viên",
  volunteer: "tình nguyện viên",
};

const INVITE_KIND_TEXT = { store: "cửa hàng", charity: "tổ chức từ thiện" } as const;

/** "08/10/2026 14:32" theo giờ Việt Nam (server chạy UTC). */
function vnDateTime(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
}

export function memberInviteEmail(input: MemberInviteEmailInput): EmailMessage {
  const inviter = oneLine(input.inviterName) || "Một thành viên";
  const role = INVITE_ROLE_TEXT[input.role];
  const kind = INVITE_KIND_TEXT[input.orgKind];
  const until = vnDateTime(input.expiresAt);
  const what =
    input.role === "volunteer"
      ? "Sau khi nhận lời mời, bạn dùng ứng dụng Tình nguyện viên của FoodSave để nhận chuyến lấy hàng."
      : `Sau khi nhận lời mời, bạn vào cổng ${input.orgKind === "store" ? "Cửa hàng" : "Tổ chức"} của FoodSave cùng ${escapeHtml(input.orgName)}.`;
  const whatText =
    input.role === "volunteer"
      ? "Sau khi nhận lời mời, bạn dùng ứng dụng Tình nguyện viên của FoodSave để nhận chuyến lấy hàng."
      : `Sau khi nhận lời mời, bạn vào cổng ${input.orgKind === "store" ? "Cửa hàng" : "Tổ chức"} của FoodSave cùng ${input.orgName}.`;
  const validity = `Lời mời có hiệu lực tới ${until} (7 ngày), chỉ dùng được một lần và chỉ với địa chỉ email này. Chưa có tài khoản FoodSave? Bạn tạo tài khoản bằng chính email này ngay trên trang nhận lời mời.`;
  return {
    to: input.to,
    tag: "member.invite",
    subject: oneLine(`Lời mời tham gia ${input.orgName} trên FoodSave`),
    html: layout({
      heading: "Bạn được mời tham gia FoodSave",
      paragraphs: [
        "Xin chào,",
        `${escapeHtml(inviter)} mời bạn tham gia ${kind} <strong>${escapeHtml(input.orgName)}</strong> với vai trò <strong>${role}</strong>.`,
        what,
      ],
      cta: { label: "Nhận lời mời", href: input.link },
      footnote: `${escapeHtml(validity)} Nếu bạn không biết người mời, hãy bỏ qua email này.`,
    }),
    text: `Xin chào,\n\n${inviter} mời bạn tham gia ${kind} ${oneLine(input.orgName)} với vai trò ${role}.\n${whatText}\n\nNhận lời mời: ${input.link}\n\n${validity}\nNếu bạn không biết người mời, hãy bỏ qua email này.`,
  };
}

// ---------------------------------------------------------------------------
// Thông báo vận hành do dispatcher gửi (P2-14/P2-15, PRD §10: N-05, N-07, N-08, N-09, N-14, N-19,
// N-23, N-32). Tiêu đề/nội dung đã được dựng ở DB (`private.render_notification`, không chứa địa chỉ
// hay tọa độ); mẫu email chỉ thêm lời chào, lời dẫn theo loại sự kiện, nút mở FoodSave và lý do nhận thư.
// ---------------------------------------------------------------------------

export type NotificationEmailInput = {
  to: string;
  recipientName: string;
  /** Tổ chức ngữ cảnh của người nhận (lý do nhận thư); null với thông báo không gắn tổ chức. */
  orgName: string | null;
  event: string;
  urgency: "normal" | "urgent";
  title: string;
  body: string;
  /** Đường dẫn nội bộ (bắt đầu bằng một dấu "/"). */
  linkPath: string | null;
  /** URL tuyệt đối của ứng dụng (NEXT_PUBLIC_APP_URL). */
  appUrl: string;
};

type NotificationFrame = { tag: string; heading: string; lead?: string; cta: string };

/** Đường dẫn nội bộ an toàn → URL tuyệt đối; giá trị lạ (//host, http:…) quay về trang đầu. */
function appLink(appUrl: string, linkPath: string | null): string {
  const path = linkPath && /^\/(?!\/)[^\s\\]*$/.test(linkPath) ? linkPath : "/";
  return new URL(path, appUrl).toString();
}

function whyYouGetThis(orgName: string | null): string {
  const reason = orgName
    ? `Bạn nhận email này vì là thành viên của ${oneLine(orgName)} trên FoodSave.`
    : "Bạn nhận email này vì đang dùng FoodSave.";
  return `${reason} Không muốn nhận loại email này nữa? Hãy trả lời email này, FoodSave sẽ tắt giúp bạn.`;
}

function renderNotificationEmail(input: NotificationEmailInput, frame: NotificationFrame): EmailMessage {
  const link = appLink(input.appUrl, input.linkPath);
  const title = oneLine(input.title);
  const body = input.body.trim();
  const footnote = whyYouGetThis(input.orgName);
  return {
    to: input.to,
    tag: frame.tag,
    subject: title,
    html: layout({
      heading: frame.heading,
      paragraphs: [
        escapeHtml(greet(input.recipientName)),
        `<strong>${escapeHtml(title)}</strong>${body ? `<br>${escapeHtml(body)}` : ""}`,
        ...(frame.lead ? [escapeHtml(frame.lead)] : []),
      ],
      cta: { label: frame.cta, href: link },
      footnote: escapeHtml(footnote),
    }),
    text: [
      greet(input.recipientName),
      "",
      title,
      body,
      ...(frame.lead ? ["", frame.lead] : []),
      "",
      `${frame.cta}: ${link}`,
      "",
      footnote,
    ]
      .filter((line, i, all) => !(line === "" && all[i - 1] === ""))
      .join("\n"),
  };
}

/** N-05: lô Đỏ gần tổ chức (đăng mới là Đỏ hoặc vừa chuyển Đỏ). */
export function urgentOfferEmail(input: NotificationEmailInput): EmailMessage {
  return renderNotificationEmail(input, {
    tag: "notify.offer_urgent",
    heading: "Có lô Đỏ cần lấy gấp gần bạn",
    lead: "Lô Đỏ cần được lấy sớm. Chỉ gửi yêu cầu nếu bạn đến kịp trước hạn.",
    cta: "Xem lô và gửi yêu cầu",
  });
}

/** N-07: cửa hàng nhận yêu cầu nhận lô. */
export function allocationRequestedEmail(input: NotificationEmailInput): EmailMessage {
  return renderNotificationEmail(input, {
    tag: "notify.allocation_requested",
    heading: "Có tổ chức muốn nhận lô của bạn",
    lead: "Nếu chưa được trả lời kịp, yêu cầu sẽ tự hết hạn và số lượng trở lại lô.",
    cta: "Xem và trả lời yêu cầu",
  });
}

/** N-08: yêu cầu của tổ chức được chấp nhận. */
export function allocationConfirmedEmail(input: NotificationEmailInput): EmailMessage {
  return renderNotificationEmail(input, {
    tag: "notify.allocation_confirmed",
    heading: "Yêu cầu nhận lô đã được chấp nhận",
    lead: "Khi đến lấy hàng, mở mã QR hoặc mã 6 số trong FoodSave để cửa hàng xác nhận bàn giao.",
    cta: "Xem và chuẩn bị lấy hàng",
  });
}

/** N-09: yêu cầu bị từ chối hoặc hết hạn giữ chỗ. */
export function allocationRejectedEmail(input: NotificationEmailInput): EmailMessage {
  return renderNotificationEmail(input, {
    tag: input.event === "allocation_expired" ? "notify.allocation_expired" : "notify.allocation_rejected",
    heading: "Yêu cầu nhận lô chưa thành công",
    lead: "Các lô khác quanh điểm nhận của bạn vẫn đang chờ trong Kho tặng.",
    cta: "Tìm lô khác",
  });
}

/** Các sự kiện còn lại có email mặc định (giao chuyến, hủy phân bổ, nhu cầu đóng, tạm khóa…). */
export function genericNotificationEmail(input: NotificationEmailInput): EmailMessage {
  return renderNotificationEmail(input, {
    tag: `notify.${input.event}`,
    heading: input.urgency === "urgent" ? "Thông báo GẤP từ FoodSave" : "Thông báo từ FoodSave",
    cta: "Mở FoodSave",
  });
}

/** Chọn mẫu email theo sự kiện (dispatcher dùng cho mọi dòng `notification_deliveries` kênh email). */
export function notificationEmail(input: NotificationEmailInput): EmailMessage {
  switch (input.event) {
    case "offer_published":
    case "offer_turned_red":
      return input.urgency === "urgent" || input.event === "offer_turned_red"
        ? urgentOfferEmail(input)
        : genericNotificationEmail(input);
    case "allocation_requested":
      return allocationRequestedEmail(input);
    case "allocation_confirmed":
      return allocationConfirmedEmail(input);
    case "allocation_rejected":
    case "allocation_expired":
      return allocationRejectedEmail(input);
    default:
      return genericNotificationEmail(input);
  }
}
