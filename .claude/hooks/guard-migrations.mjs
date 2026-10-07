// PreToolUse (Edit|Write|MultiEdit): never modify a migration that already exists on origin/main.
import { block, readInput, relPath, run } from "./lib.mjs";

const input = readInput();
const file = relPath(input?.tool_input?.file_path ?? "");
if (!/^supabase\/migrations\/[^/]+\.sql$/.test(file)) process.exit(0);

// Only applies once origin/main exists (fresh repo => allow).
const hasRemoteMain = run("git", ["rev-parse", "--verify", "--quiet", "origin/main"], { timeoutMs: 5_000 });
if (hasRemoteMain.code !== 0) process.exit(0);

const onMain = run("git", ["cat-file", "-e", `origin/main:${file}`], { timeoutMs: 5_000 });
if (onMain.code === 0) {
  block(
    `[guard-migrations] ${file} đã có trên origin/main nên đã (hoặc sẽ) được áp dụng ở staging/prod.\n` +
      "Không sửa migration cũ. Tạo migration mới: `pnpm supabase migration new <ten>` (xem skill new-migration).",
  );
}
process.exit(0);
