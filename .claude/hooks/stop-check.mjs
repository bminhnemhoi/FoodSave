// Stop: quick quality gate before Claude finishes a turn.
// - Skips when re-entered (stop_hook_active), before scaffold, or when the tree is unchanged since last pass.
// - Runs `tsc --noEmit --incremental` + `vitest related --run <changed files>` within ~90 s.
// - On failure: exit 2 (Claude continues and fixes). On timeout: warn and exit 0.
// Full ESLint, pgTAP and E2E run in CI, not here.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { block, projectDir, readInput, run, tail } from './lib.mjs';

const BUDGET_MS = 90_000;
const started = Date.now();
const input = readInput();
if (input?.stop_hook_active) process.exit(0);
if (process.env.FOODSAVE_SKIP_STOP_HOOK === '1') process.exit(0);

const nodeModules = path.join(projectDir, 'node_modules');
if (!existsSync(path.join(projectDir, 'package.json')) || !existsSync(nodeModules)) process.exit(0);

const status = run('git', ['status', '--porcelain', '--untracked-files=all'], { timeoutMs: 10_000 });
if (status.code !== 0) process.exit(0);
const changed = status.out
  .split(/\r?\n/)
  .map((l) => l.slice(3).trim().replace(/^"|"$/g, ''))
  .filter((f) => /\.(ts|tsx)$/.test(f) && !f.startsWith('supabase/'));
if (changed.length === 0) process.exit(0);

// Fingerprint = porcelain status + diff content, so unchanged trees are skipped.
const diff = run('git', ['diff', '--no-ext-diff'], { timeoutMs: 10_000 });
const fingerprint = createHash('sha256').update(status.out).update(diff.out).digest('hex');
const cacheDir = path.join(projectDir, '.claude', '.cache');
const stateFile = path.join(cacheDir, 'stop-check.json');
try {
  if (JSON.parse(readFileSync(stateFile, 'utf8')).fingerprint === fingerprint) process.exit(0);
} catch {
  /* no previous state */
}

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const remaining = () => BUDGET_MS - (Date.now() - started);

const tsc = run(pnpm, ['exec', 'tsc', '--noEmit', '--incremental', '--pretty', 'false'], { timeoutMs: remaining() });
if (tsc.timedOut) {
  process.stdout.write('[stop-check] tsc quá 90 s — bỏ qua, CI sẽ kiểm tra.\n');
  process.exit(0);
}
if (tsc.code !== 0) block(`[stop-check] TypeScript lỗi — sửa trước khi kết thúc:\n${tail(tsc.out)}`);

if (remaining() > 10_000) {
  const vitest = run(pnpm, ['exec', 'vitest', 'related', '--run', '--passWithNoTests', ...changed], {
    timeoutMs: remaining(),
  });
  if (vitest.timedOut) {
    process.stdout.write('[stop-check] vitest quá thời gian — bỏ qua, CI sẽ kiểm tra.\n');
    process.exit(0);
  }
  if (vitest.code !== 0) block(`[stop-check] Unit test liên quan bị lỗi:\n${tail(vitest.out)}`);
}

mkdirSync(cacheDir, { recursive: true });
writeFileSync(stateFile, JSON.stringify({ fingerprint, at: new Date().toISOString() }));
process.exit(0);
