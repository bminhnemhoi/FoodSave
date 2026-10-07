// PreToolUse (Bash|PowerShell): block destructive commands that permission rules cannot express.
import { block, readInput } from "./lib.mjs";

const input = readInput();
const cmd = String(input?.tool_input?.command ?? "");
if (!cmd) process.exit(0);

// Normalise whitespace for matching; keep original for messages.
const c = cmd.replace(/\s+/g, " ");

const SAFE_DELETE_TARGETS =
  /^(\.\/)?(node_modules|\.next|\.turbo|dist|out|coverage|test-results|playwright-report|\.vercel|supabase\/\.temp|\.claude\/\.cache)(\/.*)?$/;

const rules = [
  {
    test: () => /\bgit\b.*\bpush\b.*(\s--force(-with-lease)?\b|\s-f\b|\s\+\S+)/.test(c),
    msg: "Force push bị cấm trong FoodSave. Tạo commit mới hoặc hỏi Minh.",
  },
  {
    test: () => /\bgit\b.*\bpush\b(\s+\S+)?\s+(HEAD:)?(refs\/heads\/)?main\b/.test(c),
    msg: "Không push thẳng vào main. Push nhánh feat/* rồi mở Pull Request.",
  },
  {
    test: () => /\bgit\b.*\breset\b.*--hard\b/.test(c) || /\bgit\b.*\bclean\b.*-[a-z]*f/.test(c),
    msg: "git reset --hard / git clean -f có thể làm mất việc chưa commit. Hỏi Minh trước.",
  },
  {
    test: () => /\bsupabase\b.*\bdb\b.*\breset\b.*(--linked|--db-url)/.test(c),
    msg: "Không reset DB remote (staging/prod). Chỉ dùng `pnpm db:reset` cho DB local.",
  },
  {
    test: () =>
      /\b(drop\s+(table|schema|database)|truncate\s+table)\b/i.test(c) &&
      /(--linked|--db-url|psql\s+.*(supabase\.co|pooler))/i.test(c),
    msg: "Lệnh xóa dữ liệu trên DB remote bị chặn. Viết migration và để CI áp dụng.",
  },
  {
    test: () => /(\brm\b|Remove-Item|\bdel\b)[^|;&]*supabase[\\/]+migrations/i.test(c),
    msg: "Không xóa file migration. Muốn hoàn tác thì viết migration mới.",
  },
  {
    test: () => {
      const m = c.match(/\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*|-[a-zA-Z]*f[a-zA-Z]*r[a-zA-Z]*)\s+(.+)/);
      if (!m) return false;
      const targets = m[2].split(" ").filter((t) => t && !t.startsWith("-"));
      return targets.some((t) => !SAFE_DELETE_TARGETS.test(t.replace(/^["']|["']$/g, "")));
    },
    msg: "rm -rf chỉ được dùng cho thư mục build/cache (node_modules, .next, dist, coverage, test-results…).",
  },
  {
    test: () =>
      /Remove-Item\b.*-Recurse\b/i.test(c) &&
      !/Remove-Item\s+(-\S+\s+)*["']?(\.\\|\.\/)?(node_modules|\.next|dist|coverage|test-results|playwright-report)\b/i.test(
        c,
      ),
    msg: "Remove-Item -Recurse chỉ được dùng cho thư mục build/cache.",
  },
  {
    test: () =>
      /(\bcat\b|\btype\b|Get-Content|\bless\b|\bhead\b|\btail\b)\s+[^|;&]*\.env(?!\.example)(\.[\w.-]+)?\b/i.test(
        c,
      ),
    msg: "Không đọc file .env (chứa secret). Dùng .env.example để biết tên biến.",
  },
];

for (const rule of rules) {
  if (rule.test()) block(`[guard-shell] Đã chặn: ${cmd}\n${rule.msg}`);
}
process.exit(0);
