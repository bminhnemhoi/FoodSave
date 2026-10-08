import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { adminPatch } from "../fixtures/orgs";
import { loginAs } from "../fixtures/users";
import { confirmViaApi, literal, requestViaApi, setupCharity, setupStoreOffer } from "./helpers";

/**
 * Ảnh chụp cổng Tổ chức P2 (Kho tặng, xin nhận, Tổng quan, Chuyến) để rà bằng mắt (skill ui-screen §3):
 * 1440×900 và 390×844. Chỉ chạy khi đặt E2E_SCREENSHOT_DIR (project desktop).
 */
const DIR = process.env.E2E_SCREENSHOT_DIR;

async function shoot(page: Page, name: string, opts: { fullPage?: boolean; mobileOnly?: boolean } = {}) {
  const sizes = [
    ["desktop", { width: 1440, height: 900 }],
    ["mobile", { width: 390, height: 844 }],
  ] as const;
  for (const [suffix, size] of opts.mobileOnly ? sizes.slice(1) : sizes) {
    await page.setViewportSize(size);
    await page.waitForTimeout(600);
    await page.screenshot({
      path: path.join(DIR!, `p2-charity-${name}-${suffix}.png`),
      fullPage: opts.fullPage ?? true,
    });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

/** Chờ canvas MapLibre + ít nhất một marker, rồi thêm thời gian cho tile. */
async function waitForMap(page: Page, name: RegExp) {
  const region = page.getByRole("region", { name });
  await expect(region.locator("canvas.maplibregl-canvas")).toBeVisible({ timeout: 30_000 });
  await expect(region.getByRole("button").first()).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(3000);
}

test.describe("Ảnh chụp cổng Tổ chức P2", () => {
  test.skip(!DIR, "Đặt E2E_SCREENSHOT_DIR để chụp ảnh");
  test.setTimeout(400_000);
  test.beforeEach(async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "Chỉ chạy một lần (project desktop)");
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("kho tặng, xin nhận, tổng quan, chuyến", async ({ page }) => {
    const charity = await setupCharity();
    const red = await setupStoreOffer({ title: "Bánh mì ổ nướng trong ngày", quantity: 30, hoursLeft: 3 });
    const yellow = await setupStoreOffer({
      title: "Cơm hộp gà xối mỡ",
      category: "cooked_meal",
      quantity: 24,
      hoursLeft: 8,
      at: { lat: 10.7862, lng: 106.6905 },
    });
    const green = await setupStoreOffer({
      title: "Sữa tươi tiệt trùng 180 ml",
      category: "dairy",
      quantity: 48,
      hoursLeft: 100,
      at: { lat: 10.7631, lng: 106.6822 },
    });
    await adminPatch(`sites?id=eq.${green.site.id}`, { visibility: "approximate" });

    await loginAs(page, charity.user, "/charity/donations");
    await page.goto("/charity/donations");
    await expect(page.getByRole("article", { name: literal(red.title) }).first()).toBeVisible({
      timeout: 20_000,
    });
    await waitForMap(page, /Bản đồ kho tặng/);
    await shoot(page, "donations", { fullPage: false });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Bản đồ", exact: true }).click();
    await waitForMap(page, /Bản đồ kho tặng/);
    await page.screenshot({ path: path.join(DIR!, "p2-charity-donations-map-mobile.png") });
    await page.getByRole("button", { name: /^Danh sách/ }).click();
    await page.setViewportSize({ width: 1440, height: 900 });

    await page
      .getByRole("article", { name: literal(yellow.title) })
      .first()
      .getByRole("button", { name: "Xin nhận" })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await shoot(page, "request-dialog", { fullPage: false });
    await page.getByRole("dialog").getByRole("button", { name: "Gửi yêu cầu" }).click();
    await expect(page.getByText(/Đã gửi yêu cầu nhận/)).toBeVisible();

    const a = await requestViaApi(charity, red.offerId, 12);
    await confirmViaApi(red, a);

    await page.goto("/charity/donations?labels=green&maxKm=0.5&cats=meat_seafood");
    await expect(page.getByText("Không có lô khớp bộ lọc")).toBeVisible();
    await shoot(page, "donations-empty-filter", { fullPage: false });

    await page.goto("/charity");
    await expect(page.getByRole("heading", { name: "Yêu cầu của tôi" })).toBeVisible();
    await shoot(page, "overview");

    await page.goto("/charity/pickups");
    await expect(page.getByRole("button", { name: "Tạo chuyến tự đến lấy" })).toBeVisible();
    await shoot(page, "pickups");
    await page.getByRole("button", { name: "Tạo chuyến tự đến lấy" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Chuyến tự đến lấy" })).toBeVisible({
      timeout: 20_000,
    });
    await waitForMap(page, /Bản đồ chuyến/);
    await shoot(page, "trip", { fullPage: true });
  });

  test("trạng thái rỗng (tổ chức mới)", async ({ page }) => {
    const charity = await setupCharity();
    await loginAs(page, charity.user, "/charity");
    await page.goto("/charity");
    await expect(page.getByText("Chưa có yêu cầu nào")).toBeVisible();
    await shoot(page, "overview-empty");
    await page.goto("/charity/pickups");
    await expect(page.getByText("Chưa có lô nào chờ đi lấy")).toBeVisible();
    await shoot(page, "pickups-empty");
  });
});
