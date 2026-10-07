import { z } from "zod";

/** Mã TOTP 6 số (cho phép dán có khoảng trắng: "482 913"). */
export const totpCodeSchema = z
  .string()
  .transform((v) => v.replace(/\s+/g, ""))
  .pipe(z.string().regex(/^[0-9]{6}$/, "Vui lòng nhập đủ 6 chữ số từ ứng dụng xác thực."));

export const ADMIN_HOME_AFTER_MFA = "/admin/reviews";

/**
 * Đích quay lại sau khi xác thực hai lớp: chỉ đường dẫn nội bộ trong /admin (không open redirect,
 * không quay về chính /admin/mfa). Mặc định là hàng đợi duyệt.
 */
export function safeAdminNext(next: string | null | undefined): string {
  if (!next || typeof next !== "string") return ADMIN_HOME_AFTER_MFA;
  if (next.startsWith("//") || next.includes("\\") || /[\r\n]/.test(next)) return ADMIN_HOME_AFTER_MFA;
  if (next !== "/admin" && !next.startsWith("/admin/") && !next.startsWith("/admin?")) {
    return ADMIN_HOME_AFTER_MFA;
  }
  if (next === "/admin/mfa" || next.startsWith("/admin/mfa?") || next.startsWith("/admin/mfa/")) {
    return ADMIN_HOME_AFTER_MFA;
  }
  return next;
}

export type MfaFormState = {
  status: "idle" | "error";
  message?: string;
  fieldError?: string;
};

export const initialMfaState: MfaFormState = { status: "idle" };

/** Nhóm khóa bí mật thành cụm 4 ký tự để dễ nhập tay: "JBSW Y3DP EHPK 3PXP". */
export function groupSecret(secret: string): string {
  return secret.replace(/\s+/g, "").replace(/(.{4})(?=.)/g, "$1 ");
}

/** GoTrue trả SVG dạng `data:image/svg+xml;utf-8,<svg…>` chưa mã hóa — ký tự `#` làm hỏng data URI. */
export function qrCodeDataUri(qr: string): string {
  const svgStart = qr.indexOf("<svg");
  if (svgStart === -1) return qr;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr.slice(svgStart))}`;
}
