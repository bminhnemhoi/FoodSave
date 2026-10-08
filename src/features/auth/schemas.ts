import { z } from "zod";

const email = z.email({ error: "Email không hợp lệ." }).trim().toLowerCase();

const password = z
  .string()
  .min(8, { error: "Mật khẩu cần ít nhất 8 ký tự." })
  .max(72, { error: "Mật khẩu tối đa 72 ký tự." })
  .regex(/[A-Za-z]/, { error: "Mật khẩu cần có ít nhất một chữ cái." })
  .regex(/\d/, { error: "Mật khẩu cần có ít nhất một chữ số." });

export const signInSchema = z.object({
  email,
  password: z.string().min(1, { error: "Vui lòng nhập mật khẩu." }),
  next: z.string().optional(),
});

export const signUpSchema = z
  .object({
    fullName: z.string().trim().min(2, { error: "Vui lòng nhập họ tên." }).max(120),
    email,
    password,
    confirmPassword: z.string(),
    acceptTerms: z.literal("on", { error: "Bạn cần đồng ý Điều khoản và Chính sách bảo mật." }),
    next: z.string().max(300).optional(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    error: "Mật khẩu nhập lại không khớp.",
  });

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({ password, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    error: "Mật khẩu nhập lại không khớp.",
  });

export type FormState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Partial<Record<string, string>>;
  values?: Partial<Record<string, string>>;
};

export const initialFormState: FormState = { status: "idle" };

/** Chuẩn hóa lỗi zod về dạng { field: message đầu tiên }. */
export function toFieldErrors(error: z.ZodError): Partial<Record<string, string>> {
  const out: Partial<Record<string, string>> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}

/**
 * Chỉ cho phép chuyển hướng nội bộ (chặn open redirect). Trình duyệt bỏ tab/xuống dòng và coi `\` như `/`
 * trong URL, nên `"/\t/evil.com"` hay `"/\\evil.com"` thành `//evil.com` — chặn mọi ký tự điều khiển và `\`,
 * rồi kiểm lại bằng URL parser rằng đích vẫn cùng origin.
 */
export function safeNextPath(next: string | undefined | null, fallback = "/onboarding"): string {
  if (!next || next.length > 2048 || !next.startsWith("/") || next.startsWith("//")) return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return fallback;
  const base = "https://foodsave.invalid";
  const url = new URL(next, base);
  if (url.origin !== base) return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}
