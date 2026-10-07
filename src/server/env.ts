import "server-only";
import { z } from "zod";

const flag = z
  .enum(["true", "false"])
  .default("false")
  .transform((v) => v === "true");

/** Biến môi trường chỉ dùng phía server. Không bao giờ import file này từ client component. */
const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  JOBS_HMAC_SECRET: z.string().min(16).optional(),
  IP_HASH_SECRET: z.string().min(16).optional(),

  FEATURE_AI: flag,
  FEATURE_WEB_PUSH: flag,
  MAINTENANCE_MODE: flag,

  MAPS_PROVIDER: z.enum(["goong", "ors", "aws", "fake"]).default("goong"),
  GOONG_API_KEY: z.string().optional(),
  ORS_API_KEY: z.string().optional(),
  NOMINATIM_BASE_URL: z.url().default("https://nominatim.openstreetmap.org"),
  NOMINATIM_USER_AGENT: z.string().default("FoodSave/1.0"),

  AI_PROVIDER: z.enum(["openai", "anthropic", "bedrock", "fake"]).default("openai"),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default("gpt-5.4-mini"),
  AI_MODEL_LIGHT: z.string().default("gpt-5.4-nano"),

  NOTIFY_PROVIDER: z.enum(["smtp", "resend", "ses", "fake"]).default("smtp"),
  SMTP_HOST: z.string().default("smtp.gmail.com"),
  SMTP_PORT: z.coerce.number().int().default(465),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("FoodSave <foodsavevietnam@gmail.com>"),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),
});

const empty = (v: string | undefined) => (v === "" ? undefined : v);

export const serverEnv = serverSchema.parse(
  Object.fromEntries(Object.keys(serverSchema.shape).map((k) => [k, empty(process.env[k])])),
);
