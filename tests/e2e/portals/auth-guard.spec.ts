import { expect, test, type Page } from "@playwright/test";

import { expectNoA11yViolations } from "../fixtures/a11y";
import { createConfirmedUser, createOrgFor, loginAs, serviceKey, SUPABASE_URL } from "../fixtures/users";

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1440) < 768;

test.describe("Guard cổng khi chưa đăng nhập (L2, L3)", () => {
  for (const path of ["/store", "/charity", "/admin", "/volunteer"]) {
    test(`${path} chuyển tới /login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(path)}$`));
    });
  }

  test("trang con cũng bị chặn", async ({ page }) => {
    await page.goto("/store/inventory");
    await expect(page).toHaveURL(/\/login\?next=/);
    await page.goto("/admin/reviews");
    await expect(page).toHaveURL(/\/login\?next=/);
  });
});

test.describe("Guard cổng khi đã đăng nhập (F-02)", () => {
  test("chưa có tổ chức: /store, /charity, /volunteer → /onboarding; /admin → 404", async ({ page }) => {
    const user = await createConfirmedUser({ prefix: "noorg" });
    await loginAs(page, user);

    for (const path of ["/store", "/charity", "/volunteer"]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/onboarding$/);
    }

    const res = await page.goto("/admin");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Không tìm thấy trang");
  });

  test("cửa hàng chờ duyệt: /store → trang trạng thái giải thích bước tiếp theo", async ({ page }) => {
    const user = await createConfirmedUser({ prefix: "pending" });
    const org = await createOrgFor(user, { kind: "store", status: "submitted" });
    await loginAs(page, user);

    await page.goto("/store/inventory");
    await expect(page).toHaveURL(new RegExp(`/onboarding/status\\?org=${org.id}`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Trạng thái hồ sơ");
    const card = page.getByRole("article", { name: org.name });
    await expect(card.getByText("Chờ duyệt", { exact: true })).toBeVisible();
    await expect(card.getByText("Hồ sơ đang chờ FoodSave duyệt")).toBeVisible();
    await expectNoA11yViolations(page, "/onboarding/status (submitted)");
  });

  test("tổ chức cần bổ sung: thấy lý do của FoodSave và nút sửa hồ sơ", async ({ page }) => {
    const user = await createConfirmedUser({ prefix: "changes" });
    const org = await createOrgFor(user, {
      kind: "charity",
      status: "needs_changes",
      rejectionReason: "Thiếu quyết định thành lập có dấu đỏ.",
    });
    await loginAs(page, user);

    await page.goto("/charity");
    await expect(page).toHaveURL(/\/onboarding\/status/);
    const card = page.getByRole("article", { name: org.name });
    await expect(card.getByText("Cần bổ sung", { exact: true })).toBeVisible();
    await expect(card.getByText("Thiếu quyết định thành lập có dấu đỏ.")).toBeVisible();
    await expect(card.getByRole("link", { name: "Sửa hồ sơ" })).toHaveAttribute("href", "/onboarding");
  });

  test("tình nguyện viên không vào được cổng Tổ chức", async ({ page }) => {
    const user = await createConfirmedUser({ prefix: "vol" });
    await createOrgFor(user, { kind: "charity", status: "approved", role: "volunteer" });
    await loginAs(page, user);
    await page.goto("/charity");
    await expect(page).toHaveURL(/\/onboarding$/);
  });
});

test.describe("App shell theo vai trò (F-85)", () => {
  test("cửa hàng đã duyệt: shell, điều hướng, trang giữ chỗ trung thực, đăng xuất", async ({ page }) => {
    const user = await createConfirmedUser({ prefix: "store", fullName: "Nguyễn Thị Thu Lan" });
    const org = await createOrgFor(user, {
      kind: "store",
      status: "approved",
      name: "Tiệm bánh Hạt Lúa Thử",
    });
    await loginAs(page, user, "/store");

    await expect(page).toHaveURL(/\/store$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tổng quan");
    await expect(page.getByText(`Xin chào ${user.fullName} · ${org.name}`)).toBeVisible();
    await expect(page.locator("body")).toHaveAttribute("data-role", "store");
    await expect(page.locator("header[data-app]").getByText("Cửa hàng", { exact: true })).toBeVisible();
    await expectNoA11yViolations(page, "/store");

    if (isMobile(page)) {
      const tabs = page.getByRole("navigation", { name: "Điều hướng nhanh" });
      await tabs.getByRole("link", { name: "Lô tặng" }).click();
      await expect(page).toHaveURL(/\/store\/inventory$/);
      await expect(tabs.getByRole("link", { name: "Lô tặng" })).toHaveAttribute("aria-current", "page");
      await tabs.getByRole("button", { name: "Thêm" }).click();
      const sheet = page.getByRole("dialog", { name: "Các mục khác" });
      await sheet.getByRole("link", { name: /Cài đặt/ }).click();
      await expect(page).toHaveURL(/\/store\/settings$/);
      await expect(sheet).toBeHidden();
      await page.goto("/store/inventory");
    } else {
      const nav = page.getByRole("navigation", { name: "Điều hướng chính" });
      await nav.getByRole("link", { name: /Lô tặng/ }).click();
      await expect(page).toHaveURL(/\/store\/inventory$/);
      await expect(nav.getByRole("link", { name: /Lô tặng/ })).toHaveAttribute("aria-current", "page");
    }

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Lô tặng");
    await expect(page.getByRole("heading", { name: "Tính năng mở ở giai đoạn P2" })).toBeVisible();
    await expectNoA11yViolations(page, "/store/inventory");

    // Đăng xuất từ menu tài khoản
    await page.getByRole("button", { name: `Tài khoản: ${user.fullName}` }).click();
    await page.getByRole("menuitem", { name: "Đăng xuất" }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/store");
    await expect(page).toHaveURL(/\/login\?next=%2Fstore$/);
  });

  test("tổ chức đã duyệt: shell với accent Tổ chức", async ({ page }) => {
    const user = await createConfirmedUser({ prefix: "charity", fullName: "Võ Thị Hạnh" });
    await createOrgFor(user, { kind: "charity", status: "approved" });
    await loginAs(page, user, "/charity/donations");

    await expect(page).toHaveURL(/\/charity\/donations$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Kho tặng");
    await expect(page.locator("body")).toHaveAttribute("data-role", "charity");
    await expectNoA11yViolations(page, "/charity/donations");
  });

  test("tình nguyện viên: shell PWA không sidebar, bottom tab luôn hiện", async ({ page }) => {
    const user = await createConfirmedUser({ prefix: "volunteer", fullName: "Lê Minh Khoa" });
    await createOrgFor(user, { kind: "charity", status: "approved", role: "volunteer" });
    await loginAs(page, user, "/volunteer");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hôm nay");
    await expect(page.getByRole("navigation", { name: "Điều hướng chính" })).toHaveCount(0);
    const tabs = page.getByRole("navigation", { name: "Điều hướng nhanh" });
    await expect(tabs).toBeVisible();
    await tabs.getByRole("link", { name: "Chuyến" }).click();
    await expect(page).toHaveURL(/\/volunteer\/trips$/);
    await expectNoA11yViolations(page, "/volunteer/trips");
  });

  test("admin phiên aal1 bị chuyển tới trang yêu cầu MFA", async ({ page, request }) => {
    const user = await createConfirmedUser({ prefix: "admin", fullName: "Ngô Thanh Tâm" });
    const key = serviceKey();
    const rpc = (fn: string) =>
      request.post(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        data: { p_user_id: user.id, p_reason: "E2E: kiểm tra guard MFA" },
      });
    expect((await rpc("grant_platform_admin")).ok()).toBeTruthy();
    try {
      await loginAs(page, user, "/admin");
      await expect(page).toHaveURL(/\/admin\/mfa$/);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Xác thực hai lớp");
      await page.goto("/admin/reviews");
      await expect(page).toHaveURL(/\/admin\/mfa$/);
      await expectNoA11yViolations(page, "/admin/mfa");
    } finally {
      await rpc("revoke_platform_admin");
    }
  });
});
