#!/usr/bin/env node
/* eslint-disable no-console -- script CLI: in kế hoạch và kết quả cho người chạy */
// Reset dữ liệu demo FoodSave — ROADMAP P2-17, skill demo-reset, docs/DEPLOYMENT.md §10.
//
//   node scripts/demo-reset.mjs --local                                  # Supabase local
//   DEMO_JUDGE_PASSWORD=… node scripts/demo-reset.mjs --env-file .env.cloud.local --yes [--allow-prod]
//
// 1. Đếm dữ liệu thật/demo, in kế hoạch, kiểm chốt an toàn (--yes, --allow-prod, demo_reset_enabled).
// 2. public.demo_reset(): xóa MỌI tổ chức is_demo và mọi thứ gắn với chúng trong một giao dịch (từ chối nếu
//    có dòng nối demo với tổ chức thật), ghi audit demo.reset. Tài khoản demo được giữ lại.
// 3. Xóa file Storage của các tổ chức đó (Storage API).
// 4. Kiểm số liệu thật không đổi, rồi chạy lại seed (trừ khi --no-seed).
import {
  confirmTarget,
  fail,
  parseCli,
  resolveTarget,
  runMain,
  section,
  stopwatch,
} from "./lib/demo/cli.mjs";
import { serviceClient } from "./lib/demo/client.mjs";
import {
  checkRealUntouched,
  demoResetEnabled,
  printResetPlan,
  printResetResult,
  purgeDemo,
  snapshot,
} from "./lib/demo/reset.mjs";
import { runSeed } from "./lib/demo/seed.mjs";

const HELP = `Cách dùng: node scripts/demo-reset.mjs (--local | --env-file <file>) [tùy chọn]

  --local / --env-file / --yes / --allow-prod / --judge-password / --team-password /
  --email-domain / --history-days   như scripts/seed-demo.mjs
  --no-seed                         chỉ xóa dữ liệu demo, không seed lại`;

async function main() {
  const args = parseCli({ "no-seed": { type: "boolean", default: false } });
  if (args.help) {
    console.log(HELP);
    return;
  }
  const total = stopwatch();
  const ctx = resolveTarget(args);
  const svc = serviceClient(ctx);

  section("Kế hoạch demo:reset");
  console.log(`Đích                   : ${ctx.host}${ctx.isLocal ? " (Supabase local)" : " (REMOTE)"}`);
  const before = await snapshot(svc);
  printResetPlan(before);
  console.log(
    `Sau đó                 : ${args["no-seed"] ? "không seed lại (--no-seed)" : "seed lại bộ demo chuẩn"}`,
  );
  if (!(await demoResetEnabled(svc)))
    fail("app_settings.demo_reset_enabled = false trên đích này — reset bị khóa.");
  confirmTarget(ctx, { realOrgs: before.realApproved, action: "demo:reset" });

  const purgeTime = stopwatch();
  const purge = await purgeDemo(svc);
  printResetResult(purge);
  const after = await snapshot(svc);
  const problems = checkRealUntouched(before, after, purge.result);
  if (problems.length) {
    fail(`Kiểm tra sau reset KHÔNG đạt: ${problems.join("; ")}`);
  }
  console.log(
    `✓ Dữ liệu thật không đổi: ${after.realOrgs} tổ chức, ${after.realLedger} dòng ledger thật (xóa demo ${purgeTime()}).`,
  );

  if (!args["no-seed"]) {
    section("Seed lại");
    await runSeed(ctx, svc);
  }
  console.log(`\n✓ demo:reset xong trong ${total()}.`);
}

runMain(main);
