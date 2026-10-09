import { expect, test } from "@playwright/test";

import { createConfirmedUser, createOrgFor, loginAs } from "../fixtures/users";

/**
 * Hồi quy L2, L3 (SECURITY-PRIVACY §10.1, P1-12).
 * - L2: bản cũ nhận diện vai trò theo tên file; mở `/charity` là vào thẳng cổng với màn đăng nhập mẫu.
 * - L3: nút "Mã QR"/OTP mẫu vào thẳng cổng không cần đăng nhập.
 * v2: guard server đọc membership từ DB cho mọi trang cổng; không có lối tắt phía client (query, cookie,
 * localStorage giả, OTP/QR mẫu).
 */
const PORTALS = ["/charity", "/store", "/volunteer", "/charity/settings", "/store/settings?tab=members"];

test.describe("L2 — không vào được cổng khi chưa đăng nhập", () => {
  for (const path of PORTALS) {
    test(`${path} ⇒ /login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login\?next=/);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Đăng nhập");
    });
  }
});

test.describe("L3 — không có lối tắt QR/OTP/giả lập vào cổng", () => {
  test("trang đăng nhập không có nút QR/OTP mẫu hay chọn vai trò", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: /QR|OTP|demo|dùng thử/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /QR|OTP|vào thẳng|dùng thử/i })).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: /vai trò/i })).toHaveCount(0);
    await expect(page.getByRole("radio")).toHaveCount(0);
  });

  test("query/cookie/localStorage giả không mở được cổng", async ({ page, context, baseURL }) => {
    // Tham số kiểu bản cũ
    for (const path of [
      "/charity?role=charity",
      "/charity?otp=123456",
      "/store?qr=1&demo=1",
      "/volunteer?token=abc",
    ]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/login\?next=/);
    }
    // Cookie phiên giả và cờ vai trò trong localStorage
    const host = new URL(baseURL!).hostname;
    await context.addCookies([
      { name: "sb-127-auth-token", value: "base64-eyJmYWtlIjp0cnVlfQ", domain: host, path: "/" },
      { name: "role", value: "charity", domain: host, path: "/" },
    ]);
    await page.goto("/login");
    await page.evaluate(() => {
      localStorage.setItem("role", "charity");
      localStorage.setItem("fs_role", "admin");
      sessionStorage.setItem("loggedIn", "true");
    });
    for (const path of ["/charity", "/store", "/volunteer"]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/login\?next=/);
    }
    const res = await page.goto("/admin");
    expect(page.url()).toMatch(/\/login\?next=%2Fadmin$/);
    expect(res?.status()).toBe(200);
  });

  test("liên kết xác nhận email giả/hết hạn không đăng nhập được", async ({ page }) => {
    await page.goto("/auth/confirm?token_hash=khong-hop-le&type=magiclink&next=/charity");
    await expect(page).toHaveURL(/\/login\?error=/);
    await page.goto("/charity");
    await expect(page).toHaveURL(/\/login\?next=/);
  });

  test("đăng nhập thật cũng chỉ vào đúng cổng theo membership (cửa hàng không mở cổng Tổ chức)", async ({
    page,
  }) => {
    const user = await createConfirmedUser({ prefix: "l3-store" });
    await createOrgFor(user, { kind: "store", status: "approved" });
    await loginAs(page, user, "/store");
    await expect(page).toHaveURL(/\/store$/);
    for (const path of ["/charity", "/charity/settings", "/volunteer"]) {
      await page.goto(path);
      // về trang của mình kèm câu "Bạn không có quyền vào cổng …" (UAT 09/10 C5)
      await expect(page, path).toHaveURL(new RegExp(`/onboarding[?]denied=${path.split("/")[1]}$`));
    }
  });
});
