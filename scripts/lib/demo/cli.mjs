/* eslint-disable no-console -- script CLI: in kế hoạch và kết quả cho người chạy */
// Tham số dòng lệnh, nạp môi trường và các chốt an toàn dùng chung cho seed-demo / demo-reset
// (docs/DEPLOYMENT.md "Dữ liệu demo", skill demo-reset).
// - Không bao giờ tự đọc .env*: chỉ nạp file truyền TƯỜNG MINH bằng --env-file, hoặc --local (đọc
//   `supabase status -o env` của Supabase local, không cần file).
// - Đích không phải localhost ⇒ bắt buộc --yes. Đích có dữ liệu thật (tổ chức không demo đã duyệt) ⇒
//   bắt buộc thêm --allow-prod.
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import process from "node:process";
import { parseArgs } from "node:util";

export class ExitError extends Error {}

/** Dừng với thông báo lỗi (không gọi process.exit khi còn socket mở). */
export function fail(message) {
  throw new ExitError(message);
}

export const COMMON_OPTIONS = {
  "env-file": { type: "string" },
  local: { type: "boolean", default: false },
  yes: { type: "boolean", default: false },
  "allow-prod": { type: "boolean", default: false },
  "judge-password": { type: "string" },
  "team-password": { type: "string" },
  "email-domain": { type: "string" },
  "history-days": { type: "string" },
  help: { type: "boolean", short: "h", default: false },
};

export function parseCli(extra = {}) {
  try {
    return parseArgs({ options: { ...COMMON_OPTIONS, ...extra }, strict: true }).values;
  } catch (err) {
    return fail(`Tham số không hợp lệ: ${err.message}`);
  }
}

const LOCAL_URL = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/;

/** Đọc `supabase status -o env` của Supabase local (Docker). */
function localStatus() {
  let out;
  try {
    out = execSync("npx supabase status -o env", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 120_000,
    });
  } catch {
    return fail("Không đọc được `npx supabase status` — Supabase local đã chạy chưa (`pnpm db:start`)?");
  }
  const pick = (name) => out.match(new RegExp(`^${name}="?([^"\\r\\n]+)"?\\s*$`, "m"))?.[1];
  const url = pick("API_URL");
  const serviceKey = pick("SERVICE_ROLE_KEY") ?? pick("SECRET_KEY");
  const anonKey = pick("ANON_KEY") ?? pick("PUBLISHABLE_KEY");
  if (!url || !serviceKey || !anonKey)
    fail("`supabase status -o env` thiếu API_URL / SERVICE_ROLE_KEY / ANON_KEY.");
  return { url, serviceKey, anonKey };
}

/** Mật khẩu chia sẻ được nhưng đủ mạnh: 12–72 ký tự, có chữ và số. */
function checkPassword(value, flag) {
  if (value === undefined || value === "") return undefined;
  if (value.length < 12 || value.length > 72 || !/[A-Za-z]/.test(value) || !/\d/.test(value)) {
    fail(`${flag}: cần 12–72 ký tự, có cả chữ và số.`);
  }
  return value;
}

/**
 * Xác định project đích và cấu hình chung từ tham số. Trả về ctx dùng cho seed/reset.
 * Biến môi trường dùng đúng tên của ứng dụng: NEXT_PUBLIC_SUPABASE_URL (hoặc SUPABASE_URL),
 * NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY. Mật khẩu: --judge-password /
 * DEMO_JUDGE_PASSWORD, --team-password / DEMO_TEAM_PASSWORD (khuyên dùng biến môi trường để không lưu
 * vào lịch sử shell).
 */
export function resolveTarget(args) {
  if (args.local && args["env-file"]) fail("Chọn một trong --local hoặc --env-file.");

  let url;
  let serviceKey;
  let anonKey;
  if (args.local) {
    ({ url, serviceKey, anonKey } = localStatus());
    if (!LOCAL_URL.test(url)) fail(`--local nhưng supabase status trả về ${url}`);
  } else {
    if (args["env-file"]) {
      if (!existsSync(args["env-file"])) fail(`Không thấy file ${args["env-file"]}.`);
      process.loadEnvFile(args["env-file"]);
    }
    url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !serviceKey || !anonKey) {
      fail(
        "Thiếu NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY hoặc SUPABASE_SERVICE_ROLE_KEY " +
          "(dùng --local cho Supabase local, hoặc --env-file <file> cho project cloud).",
      );
    }
  }

  const historyDays = args["history-days"] === undefined ? 90 : Number(args["history-days"]);
  if (!Number.isInteger(historyDays) || historyDays < 0 || historyDays > 110) {
    fail("--history-days: số nguyên 0–110 (0 = không sinh lịch sử).");
  }
  const emailDomain = (args["email-domain"] ?? "").trim().toLowerCase() || undefined;
  if (emailDomain && !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(emailDomain)) fail("--email-domain không hợp lệ.");

  return {
    url: url.replace(/\/$/, ""),
    serviceKey,
    anonKey,
    isLocal: LOCAL_URL.test(url),
    host: new URL(url).host,
    yes: Boolean(args.yes),
    allowProd: Boolean(args["allow-prod"]),
    judgePassword: checkPassword(
      args["judge-password"] ?? process.env.DEMO_JUDGE_PASSWORD,
      "--judge-password",
    ),
    teamPassword: checkPassword(args["team-password"] ?? process.env.DEMO_TEAM_PASSWORD, "--team-password"),
    emailDomain,
    historyDays,
  };
}

/**
 * Chốt an toàn trước khi ghi: không phải local ⇒ cần --yes; có dữ liệu thật ⇒ cần --allow-prod.
 * `realOrgs` = số tổ chức không demo đã duyệt (dấu hiệu môi trường có dữ liệu pilot thật).
 */
export function confirmTarget(ctx, { realOrgs, action }) {
  if (ctx.isLocal) return;
  if (!ctx.yes)
    fail(`Đích ${ctx.host} không phải Supabase local. Kiểm tra kế hoạch ở trên rồi chạy lại với --yes.`);
  if (realOrgs > 0 && !ctx.allowProd) {
    fail(
      `Đích ${ctx.host} có ${realOrgs} tổ chức thật (không demo) đã duyệt — dấu hiệu dữ liệu pilot/production. ` +
        `${action} chỉ đụng tới tổ chức is_demo, nhưng phải xác nhận thêm --allow-prod (trong cửa sổ đã thống nhất).`,
    );
  }
}

/** Đồng hồ đơn giản cho báo cáo thời gian. */
export function stopwatch() {
  const t0 = performance.now();
  return () => `${((performance.now() - t0) / 1000).toFixed(1)} s`;
}

let sectionStart = 0;
let sectionTitle = null;

/** Tiêu đề mục; in kèm thời gian của mục trước để biết chỗ chậm (độ trễ tới DB cloud). */
export function section(title) {
  const now = performance.now();
  if (sectionTitle) console.log(`   ⏱ ${((now - sectionStart) / 1000).toFixed(1)} s`);
  sectionStart = now;
  sectionTitle = title;
  console.log(`\n== ${title}`);
}

/** Chạy main; lỗi in gọn một dòng (DEBUG=1 để xem stack). */
export function runMain(main) {
  main().catch((err) => {
    const detail = err?.cause?.message ? ` (${err.cause.message})` : "";
    console.error(`✗ ${err?.message ?? String(err)}${detail}`);
    if (process.env.DEBUG && !(err instanceof ExitError)) console.error(err?.stack);
    process.exitCode = 1;
  });
}
