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

export const clientEnv = clientSchema.parse({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_GOONG_MAPTILES_KEY: process.env.NEXT_PUBLIC_GOONG_MAPTILES_KEY || undefined,
  NEXT_PUBLIC_MAP_STYLE_FALLBACK: process.env.NEXT_PUBLIC_MAP_STYLE_FALLBACK || undefined,
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || undefined,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN || undefined,
  NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION || undefined,
});
