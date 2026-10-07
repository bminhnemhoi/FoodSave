// PostToolUse (Edit|Write|MultiEdit): format the edited file with Prettier (only Prettier — no eslint --fix,
// which rewrites code Claude is still holding in memory). Silent and non-blocking.
import { existsSync } from "node:fs";
import path from "node:path";
import { projectDir, readInput, relPath, run } from "./lib.mjs";

const input = readInput();
const file = relPath(input?.tool_input?.file_path ?? "");
if (!file || file.startsWith("..")) process.exit(0);
if (!/\.(ts|tsx|js|jsx|mjs|cjs|json|css|md|mdx|yml|yaml|html)$/.test(file)) process.exit(0);
if (/^(supabase\/migrations|node_modules|\.next|dist)\//.test(file)) process.exit(0);

const bin = path.join(
  projectDir,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "prettier.cmd" : "prettier",
);
if (!existsSync(bin)) process.exit(0); // before P0 scaffold: nothing to do

run(bin, ["--write", "--log-level", "warn", file], { timeoutMs: 15_000 });
process.exit(0);
