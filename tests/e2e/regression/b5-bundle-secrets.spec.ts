import { expect, test, type Page } from "@playwright/test";

import { createConfirmedUser, createOrgFor, loginAs, serviceKey } from "../fixtures/users";

/**
 * Hồi quy B5 (SECURITY-PRIVACY §10.2, C16): key/mật khẩu lọt vào code client. Quét mọi tệp JS mà trình
 * duyệt tải trên trang công khai và trang cổng (sau đăng nhập): không chứa service role key của môi trường
 * đang chạy, không có secret key dạng `sb_secret_…`, JWT `service_role` hay khóa riêng PEM.
 * (Repo: `src/server/no-committed-secrets.test.ts`; CI gitleaks chờ GitHub Actions — ROADMAP P0-10.)
 */

function decodeJwtRole(jwt: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split(".")[1]!, "base64url").toString("utf8")) as {
      role?: string;
    };
    return payload.role ?? null;
  } catch {
    return null;
  }
}

async function collectScripts(page: Page, paths: string[], into: Set<string>) {
  const onResponse = (res: { url(): string; request(): { resourceType(): string } }) => {
    if (res.request().resourceType() === "script") into.add(res.url());
  };
  page.on("response", onResponse);
  for (const path of paths) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    for (const src of await page
      .locator("script[src]")
      .evaluateAll((s) => s.map((x) => (x as HTMLScriptElement).src)))
      into.add(src);
  }
  page.off("response", onResponse);
}

test("B5 — bundle client không chứa secret", async ({ page, request }) => {
  test.setTimeout(120_000);
  const scripts = new Set<string>();
  await collectScripts(page, ["/", "/login", "/register", "/terms"], scripts);

  const user = await createConfirmedUser({ prefix: "b5" });
  await createOrgFor(user, { kind: "store", status: "approved" });
  await loginAs(page, user, "/store/settings");
  await collectScripts(
    page,
    ["/store/settings", "/store/settings?tab=sites", "/store/settings?tab=members"],
    scripts,
  );

  const origin = new URL(page.url()).origin;
  const sameOrigin = [...scripts].filter((u) => u.startsWith(origin));
  expect(sameOrigin.length).toBeGreaterThan(5);

  const key = serviceKey();
  for (const url of sameOrigin) {
    const body = await (await request.get(url)).text();
    expect(body.includes(key), `${url} chứa SUPABASE_SERVICE_ROLE_KEY`).toBe(false);
    expect(body, url).not.toMatch(/sb_secret_[A-Za-z0-9_-]{10,}/);
    expect(body, url).not.toMatch(/-----BEGIN [A-Z ]*PRIVATE KEY-----/);
    expect(body, url).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|SMTP_PASS|OPENAI_API_KEY|GOONG_API_KEY/);
    for (const jwt of body.match(/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g) ?? []) {
      expect(decodeJwtRole(jwt), `${url} chứa JWT service_role`).not.toBe("service_role");
    }
  }
});
