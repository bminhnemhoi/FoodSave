import path from "node:path";

import { expect, test } from "@playwright/test";

import { createConfirmedUser, createOrgFor, loginAs, serviceKey, SUPABASE_URL } from "../fixtures/users";

/**
 * Ảnh chụp để rà soát bằng mắt (skill ui-screen §3). Chỉ chạy khi đặt E2E_SCREENSHOT_DIR,
 * ví dụ: E2E_SCREENSHOT_DIR=./test-results/shots pnpm test:e2e tests/e2e/visual --project=desktop
 */
const DIR = process.env.E2E_SCREENSHOT_DIR;

test.describe("Ảnh chụp app shell & bộ chọn vị trí", () => {
  test.skip(!DIR, "Đặt E2E_SCREENSHOT_DIR để chụp ảnh");
  test.beforeEach(async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "Chỉ chạy một lần (project desktop)");
    // Tắt chuyển động để ảnh không chụp giữa animation
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("cổng Cửa hàng — desktop 1440×900 và mobile 390×844", async ({ page }) => {
    const user = await createConfirmedUser({ prefix: "shot", fullName: "Nguyễn Thị Thu Lan" });
    await createOrgFor(user, { kind: "store", status: "approved", name: "Tiệm bánh Hạt Lúa" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAs(page, user, "/store");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tổng quan");
    await page.screenshot({ path: path.join(DIR!, "shell-store-desktop.png") });

    await page.goto("/store/inventory");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Lô tặng");
    await page.screenshot({ path: path.join(DIR!, "shell-store-inventory-desktop.png") });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/store");
    await expect(page.getByRole("navigation", { name: "Điều hướng nhanh" })).toBeVisible();
    await page.screenshot({ path: path.join(DIR!, "shell-store-mobile.png") });
    await page.screenshot({ path: path.join(DIR!, "shell-store-mobile-full.png"), fullPage: true });

    await page.getByRole("button", { name: "Thêm" }).click();
    await expect(page.getByRole("dialog", { name: "Các mục khác" })).toBeVisible();
    await page.screenshot({ path: path.join(DIR!, "shell-store-mobile-more.png") });
  });

  test("bộ chọn vị trí có ghim", async ({ page }) => {
    const user = await createConfirmedUser({ prefix: "shotloc" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAs(page, user, "/dev/location-picker");
    const box = page.getByRole("combobox", { name: "Tìm địa chỉ" });
    await box.fill("135 Nam Kỳ Khởi Nghĩa");
    const first = page.getByRole("listbox", { name: "Gợi ý địa chỉ" }).getByRole("option").first();
    await expect(first).toBeVisible({ timeout: 20_000 });
    await page.screenshot({ path: path.join(DIR!, "location-picker-suggestions.png") });
    await first.click();
    await expect(page.getByTestId("location-coords")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Đang xác định địa chỉ…")).toHaveCount(0);
    // Chờ tile tải xong để ảnh có nền bản đồ
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: path.join(DIR!, "location-picker.png"), fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(DIR!, "location-picker-mobile.png"), fullPage: true });
  });

  test("tablet, thanh bên thu gọn, trạng thái hồ sơ, TNV, MFA", async ({ page, browser, request }) => {
    const user = await createConfirmedUser({ prefix: "shot2", fullName: "Võ Thị Hạnh" });
    await createOrgFor(user, { kind: "charity", status: "approved", name: "Bếp ăn Nắng Mai" });
    await page.setViewportSize({ width: 820, height: 1000 });
    await loginAs(page, user, "/charity/needs");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Nhu cầu");
    await page.screenshot({ path: path.join(DIR!, "shell-charity-tablet.png") });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole("button", { name: "Thu gọn thanh bên" }).press("Enter");
    await expect(page.getByRole("button", { name: "Mở rộng thanh bên" })).toBeVisible();
    await page.screenshot({ path: path.join(DIR!, "shell-charity-collapsed.png") });
    await page.getByRole("button", { name: "Mở rộng thanh bên" }).press("Enter");

    const pending = await createConfirmedUser({ prefix: "shot3", fullName: "Trần Văn Bình" });
    await createOrgFor(pending, {
      kind: "store",
      status: "needs_changes",
      name: "Cửa hàng Tiện Lợi Sớm Mai",
      rejectionReason: "Ảnh giấy chứng nhận an toàn thực phẩm bị mờ, vui lòng tải lại bản rõ hơn.",
    });
    const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
    const p2 = await ctx2.newPage();
    await loginAs(p2, pending, "/store");
    await expect(p2).toHaveURL(/\/onboarding\/status/);
    await p2.screenshot({ path: path.join(DIR!, "onboarding-status-mobile.png"), fullPage: true });
    await ctx2.close();

    const vol = await createConfirmedUser({ prefix: "shot4", fullName: "Lê Minh Khoa" });
    await createOrgFor(vol, {
      kind: "charity",
      status: "approved",
      role: "volunteer",
      name: "Mái ấm Hoa Hồng",
    });
    const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
    const p3 = await ctx3.newPage();
    await loginAs(p3, vol, "/volunteer");
    await expect(p3.getByRole("heading", { level: 1 })).toHaveText("Hôm nay");
    await p3.screenshot({ path: path.join(DIR!, "shell-volunteer-mobile.png") });
    await ctx3.close();

    const admin = await createConfirmedUser({ prefix: "shot5", fullName: "Ngô Thanh Tâm" });
    const key = serviceKey();
    const rpc = (fn: string) =>
      request.post(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        data: { p_user_id: admin.id, p_reason: "E2E: ảnh chụp trang MFA" },
      });
    expect((await rpc("grant_platform_admin")).ok()).toBeTruthy();
    try {
      const ctx4 = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        reducedMotion: "reduce",
      });
      const p4 = await ctx4.newPage();
      await loginAs(p4, admin, "/admin");
      await expect(p4).toHaveURL(/\/admin\/mfa$/);
      await p4.screenshot({ path: path.join(DIR!, "admin-mfa-desktop.png") });
      await ctx4.close();
    } finally {
      await rpc("revoke_platform_admin");
    }
  });
});
