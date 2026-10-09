#!/usr/bin/env node
/**
 * Chạy một lệnh test trong khóa độc quyền: pgTAP và E2E dùng chung Supabase local và cổng 3100, nên khi nhiều
 * phiên/agent làm việc song song trên cùng repo, mỗi lúc chỉ một lệnh được chạy.
 *
 *   node scripts/with-test-lock.mjs pnpm test:e2e tests/e2e/needs
 *   node scripts/with-test-lock.mjs -- supabase db reset "&&" supabase test db
 *
 * Khóa là thư mục `.test-lock/` (mkdir nguyên tử); khóa cũ hơn 90 phút coi như bị bỏ rơi và được lấy lại.
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const LOCK = join(import.meta.dirname, "..", ".test-lock");
const STALE_MS = 90 * 60_000;
const POLL_MS = 15_000;

const args = process.argv.slice(2);
if (args[0] === "--") args.shift();
if (args.length === 0) {
  console.error("Cách dùng: node scripts/with-test-lock.mjs <lệnh> [tham số…]");
  process.exit(2);
}

// Mã riêng của lần chạy này: chỉ nhả khóa khi tệp owner vẫn mang đúng mã (khóa có thể đã bị coi là bỏ
// rơi và được phiên khác lấy lại, vd. khi máy sleep lâu).
const TOKEN = randomUUID();

function tryAcquire() {
  try {
    mkdirSync(LOCK);
    writeFileSync(join(LOCK, "owner"), `${TOKEN} ${process.pid} ${new Date().toISOString()} ${args.join(" ")}\n`);
    return true;
  } catch (err) {
    if (err.code !== "EEXIST") throw err;
    try {
      if (Date.now() - statSync(LOCK).mtimeMs > STALE_MS) {
        console.warn("[test-lock] khóa quá 90 phút — coi như bị bỏ rơi, lấy lại");
        rmSync(LOCK, { recursive: true, force: true });
      }
    } catch {
      // khóa vừa được nhả giữa hai lần kiểm tra
    }
    return false;
  }
}

function owner() {
  try {
    return readFileSync(join(LOCK, "owner"), "utf8").trim();
  } catch {
    return "không rõ";
  }
}

const started = Date.now();
while (!tryAcquire()) {
  console.warn(`[test-lock] đang chờ (${Math.round((Date.now() - started) / 1000)} s) — đang chạy: ${owner()}`);
  await new Promise((r) => setTimeout(r, POLL_MS));
}

const release = () => {
  if (owner().startsWith(TOKEN)) rmSync(LOCK, { recursive: true, force: true });
  else console.warn("[test-lock] khóa đã thuộc phiên khác — không nhả");
};
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    release();
    process.exit(130);
  });
}

const child = spawn(args.join(" "), { stdio: "inherit", shell: true });
child.on("exit", (code, signal) => {
  release();
  process.exit(code ?? (signal ? 1 : 0));
});
