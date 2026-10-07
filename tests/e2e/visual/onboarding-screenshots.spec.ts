import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import {
  clickNext,
  createApprovedStoreAt,
  ensureAddress,
  expectSaved,
  makePdf,
  makePng,
  pickLocationBySearch,
  startWizard,
} from "../onboarding/helpers";

/**
 * Ảnh chụp wizard onboarding để rà soát bằng mắt (skill ui-screen §3): mỗi bước ở 1440×900 và 390×844.
 * Chỉ chạy khi đặt E2E_SCREENSHOT_DIR, ví dụ:
 *   E2E_SCREENSHOT_DIR=./test-results/shots pnpm test:e2e tests/e2e/visual/onboarding-screenshots.spec.ts --project=desktop
 */
const DIR = process.env.E2E_SCREENSHOT_DIR;

async function shoot(page: Page, name: string) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(DIR!, `wizard-${name}-desktop.png`), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(DIR!, `wizard-${name}-mobile.png`), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
}

test.describe("Ảnh chụp wizard onboarding", () => {
  test.skip(!DIR, "Đặt E2E_SCREENSHOT_DIR để chụp ảnh");
  test.setTimeout(240_000);
  test.beforeEach(async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "Chỉ chạy một lần (project desktop)");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test("cửa hàng — từng bước", async ({ page }) => {
    await startWizard(page, "store");
    await shoot(page, "store-basics-empty");
    await clickNext(page);
    await expect(page.getByText("Vui lòng nhập tên cửa hàng.").first()).toBeVisible();
    await shoot(page, "store-basics-errors");

    await page.getByLabel("Tên cửa hàng").fill("Tiệm bánh Hạt Lúa");
    await page.getByRole("radio", { name: "Tiệm bánh" }).check();
    await page.getByLabel("Mô tả ngắn").fill("Tiệm bánh mì gia đình, thường dư 20–40 ổ bánh mỗi tối.");
    await page.getByLabel("Số điện thoại liên hệ").fill("0901234567");
    await expectSaved(page);
    await shoot(page, "store-basics");
    await clickNext(page);

    await expect(page).toHaveURL(/\/location$/);
    await pickLocationBySearch(page, "135 Nam Kỳ Khởi Nghĩa");
    await expectSaved(page);
    await page.getByLabel("Thứ Bảy: giờ kết thúc").fill("02:00");
    await page.getByRole("checkbox", { name: "Thứ Bảy: qua nửa đêm" }).check();
    await page.getByRole("checkbox", { name: "Chủ nhật: mở cửa" }).uncheck();
    await page.waitForLoadState("networkidle");
    await shoot(page, "store-location");
    await clickNext(page);

    await expect(page).toHaveURL(/\/legal$/);
    await page.getByLabel("Tên doanh nghiệp / hộ kinh doanh").fill("Hộ kinh doanh Hạt Lúa");
    await page.getByLabel("Mã số thuế").fill("0312345678");
    await page.getByLabel("Họ và tên").fill("Phạm Thu Hà");
    await page.getByLabel("Chức danh").fill("Chủ hộ kinh doanh");
    await expectSaved(page);
    await shoot(page, "store-legal");
    await clickNext(page);

    await expect(page).toHaveURL(/\/documents$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Giấy tờ");
    await shoot(page, "store-documents-empty");
    await page
      .locator("#doc-business_license")
      .setInputFiles({ name: "gp.png", mimeType: "image/png", buffer: makePng() });
    await expect(page.getByTestId("doc-slot-business_license").getByText(/Ảnh/)).toBeVisible({
      timeout: 30_000,
    });
    await page
      .locator("#doc-food_safety_cert")
      .setInputFiles({ name: "a.pdf", mimeType: "application/pdf", buffer: makePdf() });
    await expect(page.getByTestId("doc-slot-food_safety_cert").getByText(/Tệp PDF/)).toBeVisible({
      timeout: 30_000,
    });
    await shoot(page, "store-documents");
    await clickNext(page);

    await expect(page).toHaveURL(/\/review$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Cam kết & gửi duyệt");
    await shoot(page, "store-review");
    await page.getByRole("button", { name: "Gửi duyệt" }).click();
    await expect(page.getByText("Vui lòng đồng ý Điều khoản sử dụng và Chính sách bảo mật.")).toBeVisible();
    await shoot(page, "store-review-errors");
    for (const name of [/Tôi đã đọc và đồng ý/, /đúng sự thật/, /chỉ tặng thực phẩm còn hạn/]) {
      await page.getByRole("checkbox", { name }).check();
    }
    await page.getByRole("button", { name: "Gửi duyệt" }).click();
    await expect(page).toHaveURL(/\/onboarding\/status/, { timeout: 30_000 });
    await expect(page.getByText("Đã gửi hồ sơ. Hồ sơ đang chờ duyệt.")).toBeVisible();
    await shoot(page, "store-submitted");

    await page.goto("/onboarding");
    await expect(page.getByRole("heading", { name: "Hồ sơ của bạn" })).toBeVisible();
    await shoot(page, "onboarding-landing");
  });

  test("tổ chức — điểm nhận với bán kính và số cửa hàng", async ({ page, context }) => {
    const lat = 10.86;
    const lng = 106.78;
    await createApprovedStoreAt(lat + 0.015, lng + 0.01);
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: lat, longitude: lng });

    await startWizard(page, "charity");
    await page.getByLabel("Tên tổ chức").fill("Bếp ăn Nắng Mai");
    await page.getByRole("radio", { name: "Bếp ăn từ thiện" }).check();
    await page.getByLabel("Số người được hỗ trợ mỗi ngày").fill("45");
    await page.getByLabel("Số điện thoại liên hệ").fill("0912345678");
    await expectSaved(page);
    await shoot(page, "charity-basics");
    await clickNext(page);

    await expect(page).toHaveURL(/\/location$/);
    await page.getByRole("button", { name: "Dùng vị trí hiện tại" }).click();
    await expect(page.getByTestId("location-coords")).toBeVisible({ timeout: 20_000 });
    await ensureAddress(page);
    await expectSaved(page);
    await expect(page.getByTestId("store-count")).toContainText(/cửa hàng/, { timeout: 20_000 });
    await page.getByLabel("Bán kính phục vụ (km)").fill("3");
    await expect(page.getByTestId("store-count")).toContainText("3 km", { timeout: 10_000 });
    await page.waitForLoadState("networkidle");
    await shoot(page, "charity-location");
  });

  test("trang pháp lý", async ({ page }) => {
    for (const p of ["terms", "privacy"]) {
      await page.goto(`/${p}`);
      await shoot(page, `legal-${p}`);
    }
  });
});
