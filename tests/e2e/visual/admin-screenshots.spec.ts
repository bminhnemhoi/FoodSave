import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { createAdminUser, createSubmittedOrg, enrollTotpViaUi, revokeAdmin } from "../fixtures/admin";
import { createConfirmedUser, loginAs } from "../fixtures/users";

/**
 * Ảnh chụp khu vực Admin để rà soát bằng mắt (skill ui-screen §3): MFA, hàng đợi duyệt, chi tiết hồ sơ.
 * Chỉ chạy khi đặt E2E_SCREENSHOT_DIR, ví dụ:
 *   E2E_SCREENSHOT_DIR=./test-results/shots pnpm test:e2e tests/e2e/visual/admin-screenshots.spec.ts --project=desktop
 */
const DIR = process.env.E2E_SCREENSHOT_DIR;
const DESKTOP = { width: 1440, height: 900 };
/** Cuộn lên đầu trước ảnh fullPage để header/sidebar dính không bị vẽ giữa trang. */
const top = (page: Page) => page.evaluate(() => window.scrollTo(0, 0));
const MOBILE = { width: 390, height: 844 };

test.describe("Ảnh chụp khu vực Admin", () => {
  test.skip(!DIR, "Đặt E2E_SCREENSHOT_DIR để chụp ảnh");
  test.beforeEach(async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "Chỉ chạy một lần (project desktop)");
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("MFA, hàng đợi, chi tiết hồ sơ — desktop 1440×900 và mobile 390×844", async ({ page }) => {
    test.setTimeout(180_000);
    const owner = await createConfirmedUser({ prefix: "shotowner", fullName: "Nguyễn Thị Thu Lan" });
    const org = await createSubmittedOrg(owner, { kind: "store", name: "Tiệm bánh Hạt Lúa — Bến Thành" });
    const owner2 = await createConfirmedUser({ prefix: "shotowner2", fullName: "Võ Thị Hạnh" });
    await createSubmittedOrg(owner2, { kind: "charity", name: "Bếp ăn Nắng Mai" });

    const admin = await createAdminUser("Ngô Thanh Tâm");
    try {
      // MFA — đăng ký
      await page.setViewportSize(DESKTOP);
      await loginAs(page, admin, "/admin/reviews");
      await expect(page).toHaveURL(/\/admin\/mfa$/);
      await page.screenshot({ path: path.join(DIR!, "admin-mfa-start-desktop.png"), fullPage: true });
      await page.getByRole("button", { name: "Tạo mã QR" }).click();
      await expect(page.getByTestId("mfa-secret")).toBeVisible({ timeout: 20_000 });
      await page.screenshot({ path: path.join(DIR!, "admin-mfa-enroll-desktop.png"), fullPage: true });
      await page.setViewportSize(MOBILE);
      await page.screenshot({ path: path.join(DIR!, "admin-mfa-enroll-mobile.png"), fullPage: true });
      await page.setViewportSize(DESKTOP);
      await page.reload();
      await enrollTotpViaUi(page);
      await expect(page).toHaveURL((u) => u.pathname === "/admin/reviews", { timeout: 20_000 });

      // Hàng đợi
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hàng đợi duyệt");
      await page.screenshot({ path: path.join(DIR!, "admin-queue-desktop.png"), fullPage: true });
      await page.setViewportSize(MOBILE);
      await page.reload();
      await top(page);
      await page.screenshot({ path: path.join(DIR!, "admin-queue-mobile.png"), fullPage: true });

      // Chi tiết hồ sơ (ảnh giấy tờ mở xem ngay)
      await page.setViewportSize(DESKTOP);
      await page.goto(`/admin/reviews/${org.id}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(org.name);
      await page.getByRole("button", { name: "Xem Giấy chứng nhận an toàn thực phẩm" }).click();
      await expect(page.getByRole("img", { name: /Giấy chứng nhận an toàn thực phẩm của/ })).toBeVisible({
        timeout: 20_000,
      });
      await page.waitForLoadState("networkidle");
      await top(page);
      await page.screenshot({ path: path.join(DIR!, "admin-detail-desktop.png"), fullPage: true });

      await page.getByRole("button", { name: "Yêu cầu bổ sung" }).click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await page.screenshot({ path: path.join(DIR!, "admin-detail-dialog-desktop.png") });
      await page.getByRole("button", { name: "Quay lại" }).click();

      await page.setViewportSize(MOBILE);
      await page.reload();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(org.name);
      await page.waitForLoadState("networkidle");
      await top(page);
      await page.screenshot({ path: path.join(DIR!, "admin-detail-mobile.png"), fullPage: true });
      await page.getByRole("button", { name: "Từ chối" }).click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await page.screenshot({ path: path.join(DIR!, "admin-detail-dialog-mobile.png") });
      await page.getByRole("button", { name: "Quay lại" }).click();

      // Tổ chức đã duyệt
      await page.setViewportSize(DESKTOP);
      await page.goto("/admin/organizations");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tổ chức");
      await page.screenshot({ path: path.join(DIR!, "admin-organizations-desktop.png"), fullPage: true });
    } finally {
      await revokeAdmin(admin);
    }
  });
});
