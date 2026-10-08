import { randomUUID } from "node:crypto";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { accessTokenOf, adminPatch, createSite, rpcAs, vnDatePlus } from "../fixtures/orgs";
import { createConfirmedUser, createOrgFor, loginAs, uniqueSuffix } from "../fixtures/users";
import { makePng } from "../onboarding/helpers";

/**
 * Ảnh chụp các màn cửa hàng P2 (Tổng quan, Lô tặng, Đăng lô, Chi tiết lô) để rà bằng mắt (skill ui-screen §3):
 * 1440×900 và 390×844. Chỉ chạy khi đặt E2E_SCREENSHOT_DIR (project desktop).
 */
const DIR = process.env.E2E_SCREENSHOT_DIR;

async function shoot(page: Page, name: string) {
  for (const [suffix, size] of [
    ["desktop", { width: 1440, height: 900 }],
    ["mobile", { width: 390, height: 844 }],
  ] as const) {
    await page.setViewportSize(size);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(DIR!, `p2store-${name}-${suffix}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

const hours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

test.describe("Ảnh chụp màn cửa hàng P2", () => {
  test.skip(!DIR, "Đặt E2E_SCREENSHOT_DIR để chụp ảnh");
  test.setTimeout(300_000);
  test.beforeEach(async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "Chỉ chạy một lần (project desktop)");
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("tổng quan, lô tặng, đăng lô, chi tiết", async ({ page }) => {
    const owner = await createConfirmedUser({ prefix: "shot-store", fullName: "Nguyễn Thị Thu Lan" });
    const org = await createOrgFor(owner, { kind: "store", status: "approved", name: "Tiệm bánh Hạt Lúa" });
    const site = await createSite(org.id, { name: "Chi nhánh Bến Thành" });
    await createSite(org.id, { name: "Chi nhánh Gia Định", lat: 10.8, lng: 106.69, primary: false });
    const token = await accessTokenOf(owner);

    const make = async (p: Record<string, unknown>, publish = true) => {
      const id = await rpcAs<string>(token, "create_offer", {
        p_payload: { site_id: site.id, ...p },
        p_client_op_id: randomUUID(),
      });
      if (publish)
        await rpcAs(token, "publish_offer", {
          p_offer_id: id,
          p_safety_attested: true,
          p_client_op_id: randomUUID(),
        });
      return id;
    };
    const red = await make({
      category_code: "bread",
      title: "Bánh mì thịt nướng",
      quantity: 30,
      expiry: { date: vnDatePlus(0) },
      pickup_start: hours(-0.2),
      pickup_end: hours(2.5),
    });
    await make({
      category_code: "cooked_meal",
      title: "Cơm gà xối mỡ",
      quantity: 15,
      expiry: { date: vnDatePlus(1) },
      pickup_start: hours(-0.2),
      pickup_end: hours(8),
    });
    await make({
      category_code: "dry_goods",
      title: "Mì gói (thùng 30 gói)",
      quantity: 6,
      unit: "box",
      unit_weight_kg: 2.5,
      expiry: { date: vnDatePlus(30) },
      pickup_start: hours(-0.2),
      pickup_end: hours(24 * 10),
    });
    await make(
      {
        category_code: "pastry",
        title: "Bánh bông lan trứng muối",
        quantity: 12,
        expiry: { date: vnDatePlus(1) },
        pickup_start: hours(1),
        pickup_end: hours(4),
      },
      false,
    );

    for (const [name, qty, visibility] of [
      ["Bếp ăn Nắng Mai", 8, "approximate"],
      ["Mái ấm An Nhiên", 5, "hidden"],
    ] as const) {
      const u = await createConfirmedUser({ prefix: "shot-charity" });
      const c = await createOrgFor(u, {
        kind: "charity",
        status: "approved",
        name: `${name} ${uniqueSuffix().slice(-3)}`,
      });
      const s = await createSite(c.id, { name: "Điểm nhận chính", lat: 10.776, lng: 106.7 });
      await adminPatch(`sites?id=eq.${s.id}`, { visibility });
      await rpcAs(await accessTokenOf(u), "request_offer", {
        p_offer_id: red,
        p_qty: qty,
        p_charity_site_id: s.id,
        p_client_op_id: randomUUID(),
      });
    }

    await loginAs(page, owner, "/store");
    await expect(page.getByRole("heading", { level: 1, name: "Tổng quan" })).toBeVisible();
    await shoot(page, "overview");

    await page.goto("/store/inventory");
    await expect(page.getByRole("heading", { level: 1, name: "Lô tặng" })).toBeVisible();
    await shoot(page, "inventory");

    await page.goto("/store/inventory?tab=draft");
    await shoot(page, "inventory-draft");

    await page.goto(`/store/inventory/${red}`);
    await expect(page.getByRole("heading", { level: 1, name: "Bánh mì thịt nướng" })).toBeVisible();
    await shoot(page, "detail");

    await page.goto("/store/inventory/new");
    await page.getByRole("button", { name: "Lưu nháp" }).click();
    await expect(page.getByText(/Có \d+ mục cần sửa/)).toBeVisible();
    await shoot(page, "new-errors");

    await page.locator("label", { hasText: "Bánh mì & bakery" }).click();
    await page.getByLabel("Tên lô").fill("Bánh mì que bơ tỏi");
    await page.getByRole("textbox", { name: "Số lượng", exact: true }).fill("25");
    await page.getByRole("button", { name: "Hôm nay" }).click();
    await shoot(page, "new");

    // Có AI (máy chủ bật FEATURE_AI) ⇒ chụp trạng thái sau khi AI điền gợi ý
    const aiButton = page.getByRole("button", { name: "Chụp ảnh để điền nhanh" });
    if ((await aiButton.count()) > 0) {
      await page.goto("/store/inventory/new");
      const chooser = page.waitForEvent("filechooser");
      await aiButton.click();
      await (await chooser).setFiles({ name: "khay.png", mimeType: "image/png", buffer: makePng(320, 240) });
      await expect(page.getByText("AI gợi ý — kiểm tra lại").first()).toBeVisible({ timeout: 30_000 });
      await shoot(page, "new-ai");
    }
  });
});
