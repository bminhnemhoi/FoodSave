import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Hồi quy B5 (SECURITY-PRIVACY §10.2, C16, C17): bản cũ để key/mật khẩu trong code và lịch sử Git.
 * Quét mọi tệp đang được Git theo dõi (không thay gitleaks lịch sử — CI job `secrets` chờ GitHub Actions):
 * không có tệp `.env*` (trừ `.env.example`), JWT `service_role`, secret key `sb_secret_…`, khóa riêng PEM,
 * key OpenAI/AWS/Resend dạng thật.
 */

function trackedFiles(): string[] | null {
  try {
    return execFileSync("git", ["ls-files", "-z"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
      .split("\0")
      .filter(Boolean);
  } catch {
    return null; // không có git (vd. bản tải về) ⇒ bỏ qua
  }
}

const BINARY = /\.(png|jpe?g|webp|gif|ico|pdf|woff2?|ttf|otf|zip|gz|mp4|webm|pbf|wasm)$/i;

const PATTERNS: [string, RegExp][] = [
  ["Supabase secret key", /sb_secret_[A-Za-z0-9_-]{16,}/],
  ["khóa riêng PEM", /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ["OpenAI key", /\bsk-(proj-)?[A-Za-z0-9_-]{32,}/],
  ["Anthropic key", /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["Resend key", /\bre_[A-Za-z0-9]{8}_[A-Za-z0-9]{16,}/],
  [
    "Gán biến secret có giá trị",
    /^\s*(SUPABASE_SERVICE_ROLE_KEY|SMTP_PASS|OPENAI_API_KEY|GOONG_API_KEY|JOBS_HMAC_SECRET)\s*=\s*\S{12,}/m,
  ],
];

function jwtRoles(text: string): string[] {
  const roles: string[] = [];
  for (const jwt of text.match(/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g) ?? []) {
    try {
      const payload = JSON.parse(Buffer.from(jwt.split(".")[1]!, "base64url").toString("utf8")) as {
        role?: string;
      };
      if (payload.role) roles.push(payload.role);
    } catch {
      // không phải JWT hợp lệ
    }
  }
  return roles;
}

describe("B5 — không commit secret", () => {
  const files = trackedFiles();

  it.skipIf(files === null)("không có tệp .env* thật trong Git", () => {
    const envFiles = files!.filter((f) => /(^|\/)\.env(\.|$)/.test(f) && !f.endsWith(".env.example"));
    expect(envFiles).toEqual([]);
  });

  it.skipIf(files === null)("không có key/secret trong tệp được theo dõi", () => {
    const hits: string[] = [];
    for (const f of files!) {
      if (BINARY.test(f) || f === "pnpm-lock.yaml") continue;
      let text: string;
      try {
        text = readFileSync(f, "utf8");
      } catch {
        continue; // tệp đã xóa khỏi ổ đĩa nhưng chưa commit
      }
      for (const [name, re] of PATTERNS) if (re.test(text)) hits.push(`${f}: ${name}`);
      if (jwtRoles(text).includes("service_role")) hits.push(`${f}: JWT service_role`);
    }
    expect(hits).toEqual([]);
  });
});
