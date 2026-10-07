// SessionStart (startup|resume|compact): print current phase, next task and git status (<= 25 lines).
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { projectDir, run } from './lib.mjs';

const lines = ['[FoodSave] Bối cảnh phiên làm việc'];

const roadmap = path.join(projectDir, 'docs', 'ROADMAP.md');
if (existsSync(roadmap)) {
  const text = readFileSync(roadmap, 'utf8');
  const status = text.match(/<!--\s*STATUS\s*-->([\s\S]*?)<!--\s*\/STATUS\s*-->/);
  if (status) {
    lines.push(...status[1].trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 6));
    const next = status[1].match(/Việc kế tiếp:\s*([A-Z0-9-]+)/);
    if (next) {
      const row = text.split(/\r?\n/).find((l) => l.includes(`| ${next[1]} `) || l.includes(`|${next[1]}|`));
      if (row) lines.push(`Task: ${row.replace(/\s+/g, ' ').slice(0, 220)}`);
    }
  } else {
    lines.push('docs/ROADMAP.md chưa có khối <!-- STATUS -->.');
  }
} else {
  lines.push('Chưa có docs/ROADMAP.md.');
}

const branch = run('git', ['branch', '--show-current'], { timeoutMs: 5_000 });
const status = run('git', ['status', '--short'], { timeoutMs: 5_000 });
if (branch.code === 0) lines.push(`Nhánh: ${branch.out.trim() || '(chưa có commit)'}`);
if (status.code === 0) {
  const changed = status.out.trim().split(/\r?\n/).filter(Boolean);
  lines.push(`Thay đổi chưa commit: ${changed.length} file`);
  lines.push(...changed.slice(0, 10).map((l) => `  ${l}`));
  if (changed.length > 10) lines.push(`  … và ${changed.length - 10} file khác`);
}

lines.push('Nhắc: đọc task trong docs/ROADMAP.md, theo CLAUDE.md; chạy CLI bằng tool Bash.');
process.stdout.write(lines.slice(0, 25).join('\n') + '\n');
