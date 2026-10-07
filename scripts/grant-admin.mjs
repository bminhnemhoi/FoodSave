#!/usr/bin/env node
/* eslint-disable no-console -- script CLI: in kết quả cho người chạy */
// Cấp quyền Admin nền tảng (bootstrap) — DEPLOYMENT §5.6, DATA-MODEL §8.2, SECURITY-PRIVACY C2.
//
//   node scripts/grant-admin.mjs --email minh@example.com --reason "Cấp admin ban đầu P1" [--env-file .env.local] [--yes]
//
// - Đọc NEXT_PUBLIC_SUPABASE_URL (hoặc SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY từ biến môi trường, hoặc từ file
//   truyền TƯỜNG MINH bằng --env-file (không tự nạp .env.local / .env.cloud.local).
// - Tìm người dùng theo email qua Admin API của Supabase Auth, rồi gọi RPC grant_platform_admin bằng service role
//   (ghi audit_logs admin.grant, actor_kind = 'service'). Không bao giờ UPDATE profiles bằng tay.
// - Bắt buộc --reason. Project không phải local ⇒ bắt buộc thêm --yes.
// - Người được cấp phải đăng nhập /admin và đăng ký TOTP trước khi dùng khu vực quản trị.
import { existsSync } from "node:fs";
import process from "node:process";
import { parseArgs } from "node:util";

import { createClient } from "@supabase/supabase-js";

class ExitError extends Error {}

/** Dừng với thông báo lỗi. Không gọi process.exit() khi còn socket mở (Node trên Windows có thể crash). */
function fail(message) {
  throw new ExitError(message);
}

async function main() {
  let args;
  try {
    ({ values: args } = parseArgs({
      options: {
        email: { type: "string" },
        reason: { type: "string" },
        "env-file": { type: "string" },
        yes: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
      strict: true,
    }));
  } catch (err) {
    fail(`Tham số không hợp lệ: ${err.message}`);
  }

  if (args.help) {
    console.log(
      'Cách dùng: node scripts/grant-admin.mjs --email <email> --reason "<lý do>" [--env-file <file>] [--yes]',
    );
    return;
  }

  const email = args.email?.trim().toLowerCase();
  const reason = args.reason?.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("Thiếu hoặc sai --email.");
  if (!reason || reason.length < 5)
    fail('Bắt buộc --reason "<lý do>" (ít nhất 5 ký tự) — lý do được ghi vào audit_logs.');
  if (reason.length > 1000) fail("--reason tối đa 1000 ký tự.");

  if (args["env-file"]) {
    if (!existsSync(args["env-file"])) fail(`Không thấy file ${args["env-file"]}.`);
    process.loadEnvFile(args["env-file"]);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    fail(
      "Thiếu NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY (đặt biến môi trường hoặc --env-file).",
    );
  }

  const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url);
  console.log(`Project: ${new URL(url).host}${isLocal ? " (local)" : ""}`);
  if (!isLocal && !args.yes)
    fail("Đây không phải Supabase local. Kiểm tra lại project rồi chạy lại với --yes.");

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  /** Tìm người dùng theo email qua Admin API (phân trang). */
  async function findUserByEmail(target) {
    const perPage = 1000;
    for (let page = 1; page <= 100; page++) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
      if (error) fail(`Không đọc được danh sách người dùng: ${error.message}`);
      const hit = data.users.find((u) => u.email?.toLowerCase() === target);
      if (hit) return hit;
      if (data.users.length < perPage) return null;
    }
    return null;
  }

  const user = await findUserByEmail(email);
  if (!user) fail(`Không có tài khoản ${email}. Người đó cần tự đăng ký tài khoản thường trước.`);
  if (!user.email_confirmed_at) console.warn("! Email của tài khoản này chưa được xác nhận.");

  const { data: before, error: profileError } = await supabase
    .from("profiles")
    .select("platform_role, deleted_at")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) fail(`Không đọc được hồ sơ: ${profileError.message}`);
  if (!before || before.deleted_at) fail("Hồ sơ người dùng không tồn tại hoặc đã ẩn danh hóa.");
  if (before.platform_role === "admin") {
    console.log(`= ${email} đã là Admin (không thay đổi, không ghi audit).`);
    return;
  }

  const { error } = await supabase.rpc("grant_platform_admin", { p_user_id: user.id, p_reason: reason });
  if (error) fail(`grant_platform_admin thất bại: ${error.code ?? ""} ${error.message}`);

  console.log(`✓ Đã cấp quyền Admin cho ${email} (id ${user.id}). Đã ghi audit_logs "admin.grant".`);
  console.log("  Bước tiếp theo: người này đăng nhập /admin và đăng ký ứng dụng xác thực (TOTP) ngay.");
}

main().catch((err) => {
  console.error(`✗ ${err instanceof ExitError ? err.message : String(err)}`);
  process.exitCode = 1;
});
