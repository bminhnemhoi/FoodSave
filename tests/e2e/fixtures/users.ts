import { execSync } from "node:child_process";

import { expect, type Page } from "@playwright/test";

/**
 * Tạo người dùng/tổ chức thử bằng Admin API của Supabase LOCAL (service role).
 * Chỉ dùng cho E2E local/CI — không bao giờ trỏ vào project cloud.
 * Key lấy từ E2E_SUPABASE_SERVICE_KEY, nếu không có thì đọc `supabase status -o env`.
 */

export const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
export const E2E_PASSWORD = "FoodSave2026";

if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(SUPABASE_URL)) {
  throw new Error(`Fixture users chỉ chạy với Supabase local, không phải ${SUPABASE_URL}`);
}

let cachedKey: string | undefined;

export function serviceKey(): string {
  if (process.env.E2E_SUPABASE_SERVICE_KEY) return process.env.E2E_SUPABASE_SERVICE_KEY;
  if (cachedKey) return cachedKey;
  const out = execSync("pnpm exec supabase status -o env", {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 90_000,
  });
  const match = out.match(/^SERVICE_ROLE_KEY="?([^"\r\n]+)"?\s*$/m);
  if (!match) {
    throw new Error(
      "Không đọc được SERVICE_ROLE_KEY từ `supabase status`. Đặt biến E2E_SUPABASE_SERVICE_KEY.",
    );
  }
  cachedKey = match[1]!;
  return cachedKey;
}

function headers(extra: Record<string, string> = {}) {
  const key = serviceKey();
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

async function call<T>(path: string, init: RequestInit & { retries?: number } = {}): Promise<T> {
  // DB local có thể đang được reset bởi tác vụ khác ⇒ thử lại vài lần khi lỗi mạng/5xx
  const retries = init.retries ?? 4;
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(`${SUPABASE_URL}${path}`, init);
      const text = await res.text();
      if (res.ok) return (text ? JSON.parse(text) : null) as T;
      if (res.status < 500 || attempt >= retries) {
        throw new Error(`${init.method ?? "GET"} ${path} → ${res.status}: ${text.slice(0, 300)}`);
      }
    } catch (err) {
      if (attempt >= retries || (err instanceof Error && /→ [1-4]\d\d:/.test(err.message))) throw err;
    }
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
}

export type TestUser = { id: string; email: string; password: string; fullName: string };

export const uniqueSuffix = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

/** Người dùng đã xác nhận email (bỏ qua bước Mailpit). Vai trò KHÔNG gửi qua metadata. */
export async function createConfirmedUser(
  opts: { prefix?: string; fullName?: string } = {},
): Promise<TestUser> {
  const email = `e2e.${opts.prefix ?? "user"}.${uniqueSuffix()}@example.com`;
  const fullName = opts.fullName ?? "Người Dùng Kiểm Thử";
  const body = JSON.stringify({
    email,
    password: E2E_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  // POST tạo user KHÔNG idempotent: lần trước có thể đã tạo xong dù phản hồi lỗi (máy quá tải).
  // Vì vậy không thử lại mù quáng — nếu báo email_exists thì tra lại user theo email.
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const user = await call<{ id: string }>("/auth/v1/admin/users", {
        method: "POST",
        headers: headers(),
        body,
        retries: 0,
      });
      return { id: user.id, email, password: E2E_PASSWORD, fullName };
    } catch (err) {
      const existing = await call<{ id: string }[]>(
        `/rest/v1/profiles?select=id&email=eq.${encodeURIComponent(email)}`,
        { headers: headers() },
      ).catch(() => []);
      if (existing[0]) return { id: existing[0].id, email, password: E2E_PASSWORD, fullName };
      if (attempt === 3) throw err;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  throw new Error("unreachable");
}

export type OrgStatus =
  "draft" | "submitted" | "needs_changes" | "approved" | "rejected" | "suspended" | "closed";

/**
 * Tạo tổ chức + thành viên trực tiếp bằng service role (chỉ để dựng trạng thái cho E2E;
 * ứng dụng thật đi qua RPC create/submit/review_organization).
 */
export async function createOrgFor(
  user: TestUser,
  opts: {
    kind: "store" | "charity";
    status: OrgStatus;
    role?: "owner" | "manager" | "staff" | "volunteer";
    name?: string;
    rejectionReason?: string;
  },
): Promise<{ id: string; name: string }> {
  const suffix = uniqueSuffix();
  const name = opts.name ?? (opts.kind === "store" ? `Tiệm bánh Thử ${suffix}` : `Bếp ăn Thử ${suffix}`);
  const now = new Date().toISOString();
  const reviewed = ["approved", "rejected", "needs_changes", "suspended"].includes(opts.status);
  const [org] = await call<{ id: string }[]>("/rest/v1/organizations", {
    method: "POST",
    headers: headers({ Prefer: "return=representation" }),
    body: JSON.stringify({
      kind: opts.kind,
      name,
      slug: `e2e-${opts.kind}-${suffix}`,
      subtype: opts.kind === "store" ? "bakery" : "soup_kitchen",
      status: opts.status,
      created_by: user.id,
      submitted_at: opts.status === "draft" ? null : now,
      reviewed_by: reviewed ? user.id : null,
      reviewed_at: reviewed ? now : null,
      rejection_reason:
        opts.status === "rejected" || opts.status === "needs_changes"
          ? (opts.rejectionReason ?? "Ảnh giấy phép bị mờ, vui lòng tải lại bản rõ hơn.")
          : null,
      closed_at: opts.status === "closed" ? now : null,
    }),
  });
  await call("/rest/v1/org_members", {
    method: "POST",
    headers: headers({ Prefer: "return=minimal" }),
    body: JSON.stringify({
      org_id: org!.id,
      user_id: user.id,
      role: opts.role ?? "owner",
      status: "active",
      joined_at: now,
    }),
  });
  return { id: org!.id, name };
}

/** Đăng nhập qua form /login (đúng luồng người dùng thật). */
export async function loginAs(page: Page, user: TestUser, next?: string) {
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  const form = page.locator("form").filter({ has: page.getByLabel("Mật khẩu") });
  await form.getByLabel("Email").fill(user.email);
  await form.getByLabel("Mật khẩu").fill(user.password);
  await form.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).not.toHaveURL(/\/login(\?|$)/, { timeout: 20_000 });
}
