#!/usr/bin/env node
/* eslint-disable no-console -- script CLI: in kế hoạch và kết quả cho người chạy */
// Seed dữ liệu demo FoodSave — ROADMAP P2-16, DATA-MODEL §17, docs/DEPLOYMENT.md §10.
//
//   node scripts/seed-demo.mjs --local                                   # Supabase local (supabase status)
//   DEMO_JUDGE_PASSWORD=… DEMO_TEAM_PASSWORD=… \
//   node scripts/seed-demo.mjs --env-file .env.cloud.local --yes [--allow-prod]
//
// - Idempotent: chạy lại chỉ bổ sung (lô theo now(), yêu cầu chờ duyệt, ngày lịch sử còn trống).
// - Chỉ tạo dữ liệu cho tổ chức is_demo; tên hư cấu; email @foodsave.test (không gửi được tới ai).
// - Không phải localhost ⇒ bắt buộc --yes; có tổ chức thật đã duyệt ⇒ bắt buộc thêm --allow-prod.
import { confirmTarget, parseCli, resolveTarget, runMain, section, stopwatch } from "./lib/demo/cli.mjs";
import { serviceClient } from "./lib/demo/client.mjs";
import { inspectTarget, printSeedPlan, runSeed } from "./lib/demo/seed.mjs";

const HELP = `Cách dùng: node scripts/seed-demo.mjs (--local | --env-file <file>) [tùy chọn]

  --local                 Supabase local (đọc \`npx supabase status -o env\`, không cần file .env)
  --env-file <file>       Nạp NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
                          SUPABASE_SERVICE_ROLE_KEY từ file chỉ định (không tự đọc .env*)
  --yes                   Bắt buộc khi đích không phải localhost
  --allow-prod            Bắt buộc khi đích có tổ chức thật đã duyệt (dữ liệu pilot)
  --judge-password <pw>   Mật khẩu chung của 3 tài khoản giám khảo (hoặc biến DEMO_JUDGE_PASSWORD)
  --team-password <pw>    Mật khẩu tài khoản trình diễn của nhóm (hoặc DEMO_TEAM_PASSWORD)
                          Không truyền: tài khoản mới nhận mật khẩu ngẫu nhiên in MỘT lần; tài khoản cũ giữ nguyên
  --email-domain <domain> Mặc định foodsave.test (TLD dành riêng, không gửi được thư)
  --history-days <n>      Số ngày lịch sử (mặc định 90, 0 = không sinh)`;

async function main() {
  const args = parseCli();
  if (args.help) {
    console.log(HELP);
    return;
  }
  const total = stopwatch();
  const ctx = resolveTarget(args);
  const svc = serviceClient(ctx);

  section("Kế hoạch seed demo");
  console.log(`Đích           : ${ctx.host}${ctx.isLocal ? " (Supabase local)" : " (REMOTE)"}`);
  const info = await inspectTarget(svc, ctx);
  printSeedPlan(ctx, info);
  confirmTarget(ctx, { realOrgs: info.realApprovedOrgs, action: "seed:demo" });

  await runSeed(ctx, svc);
  console.log(`\n✓ Seed demo xong trong ${total()}.`);
}

runMain(main);
