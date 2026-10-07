#!/usr/bin/env bash
# Cài bộ skill/plugin cộng đồng cho Claude Code ở PHẠM VI PROJECT (ghi vào .claude/settings.json)
# và RTK. Chạy một lần trên mỗi máy (Minh, Khanh) từ thư mục gốc repo, bằng Git Bash:
#   bash scripts/setup-claude-tools.sh
# Mọi plugin chạy hook/MCP trên máy bạn — đã review nguồn trong docs/ARCHITECTURE.md (mục Harness).
set -euo pipefail

if ! command -v claude >/dev/null 2>&1; then
  echo "Không tìm thấy lệnh 'claude'. Cài Claude Code trước." >&2
  exit 1
fi

echo "== Marketplaces =="
claude plugin marketplace add anthropics/claude-plugins-official || true
claude plugin marketplace add anthropics/skills || true
claude plugin marketplace add DietrichGebert/ponytail || true
claude plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill || true
claude plugin marketplace add supabase/agent-skills || true
claude plugin marketplace add JuliusBrussee/caveman || true

echo "== Plugins (scope project) =="
install() { claude plugin install "$1" --scope project || echo "!! Không cài được $1 — kiểm tra tên trong /plugin" >&2; }
install ponytail@ponytail
install ui-ux-pro-max@ui-ux-pro-max-skill
install frontend-design@claude-plugins-official
install security-guidance@claude-plugins-official
install pr-review-toolkit@claude-plugins-official
install typescript-lsp@claude-plugins-official
install commit-commands@claude-plugins-official
install example-skills@anthropic-agent-skills          # gồm webapp-testing, skill-creator
install supabase@supabase-agent-skills
install postgres-best-practices@supabase-agent-skills
install caveman@caveman
claude plugin disable caveman@caveman --scope project || true   # mặc định TẮT; bật tay khi cần: /caveman lite

echo "== Vercel agent skills (react-best-practices, web-design-guidelines, composition-patterns) =="
npx -y skills add vercel-labs/agent-skills || echo "!! Cài tay: npx skills add vercel-labs/agent-skills" >&2

echo "== RTK (Rust Token Killer) =="
if ! command -v rtk >/dev/null 2>&1; then
  if command -v winget >/dev/null 2>&1; then
    winget install --id rtk-ai.rtk -e --accept-source-agreements --accept-package-agreements || true
  else
    echo "Cài RTK theo https://github.com/rtk-ai/rtk rồi chạy lại." >&2
  fi
fi
command -v rtk >/dev/null 2>&1 && rtk init || echo "!! Chưa init được RTK — mở terminal mới rồi chạy: rtk init" >&2

echo "Xong. Mở lại Claude Code trong thư mục repo và chạy /plugin để kiểm tra."
