import { z } from "zod";

/**
 * Biến môi trường công khai (NEXT_PUBLIC_*). An toàn để dùng ở client.
 * Next.js chỉ inline biến khi truy cập trực tiếp `process.env.NEXT_PUBLIC_X`, nên liệt kê tường minh.
 */
const clientSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  NEXT_PUBLIC_APP_ENV: z.enum(["local", "staging", "production"]).default("local"),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_GOONG_MAPTILES_KEY: z.string().optional(),
  NEXT_PUBLIC_MAP_STYLE_FALLBACK: z.url().default("https://tiles.openfreemap.org/styles/liberty"),
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
  NEXT_PUBLIC_APP_VERSION: z.string().default("0.0.0"),
});

/**
 * Trên Vercel: tự suy URL/môi trường từ biến hệ thống (NEXT_PUBLIC_VERCEL_*) nếu chưa khai báo tường minh.
 * production → domain production cố định (vd. foodsave-psi.vercel.app); preview → URL của lần deploy đó.
 */
const vercelEnv = process.env.NEXT_PUBLIC_VERCEL_ENV;
const vercelHost =
  vercelEnv === "production"
    ? process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL
    : (process.env.NEXT_PUBLIC_VERCEL_BRANCH_URL ?? process.env.NEXT_PUBLIC_VERCEL_URL);

/** Bỏ khoảng trắng/xuống dòng thừa khi dán giá trị vào Vercel; chuỗi rỗng ⇒ undefined (dùng mặc định). */
const t = (v: string | undefined) => v?.trim() || undefined;

export const clientEnv = clientSchema.parse({
  NEXT_PUBLIC_APP_URL:
    t(process.env.NEXT_PUBLIC_APP_URL) || (vercelHost ? `https://${vercelHost}` : undefined),
  NEXT_PUBLIC_APP_ENV:
    t(process.env.NEXT_PUBLIC_APP_ENV) ||
    (vercelEnv === "production" ? "production" : vercelEnv ? "staging" : undefined),
  NEXT_PUBLIC_SUPABASE_URL: t(process.env.NEXT_PUBLIC_SUPABASE_URL),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: t(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  NEXT_PUBLIC_GOONG_MAPTILES_KEY: t(process.env.NEXT_PUBLIC_GOONG_MAPTILES_KEY),
  NEXT_PUBLIC_MAP_STYLE_FALLBACK: t(process.env.NEXT_PUBLIC_MAP_STYLE_FALLBACK),
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: t(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
  NEXT_PUBLIC_SENTRY_DSN: t(process.env.NEXT_PUBLIC_SENTRY_DSN),
  NEXT_PUBLIC_APP_VERSION: t(process.env.NEXT_PUBLIC_APP_VERSION),
});
