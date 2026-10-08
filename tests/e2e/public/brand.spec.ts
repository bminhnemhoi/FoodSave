import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { expectNoA11yViolations } from "../fixtures/a11y";

const credits = JSON.parse(readFileSync(path.join(process.cwd(), "public/images/credits.json"), "utf8")) as {
  photos: { id: string; photographer: string; sourceUrl: string }[];
};

test.describe("Bộ nhận diện (logo Bát lá)", () => {
  test("icon, favicon, apple-icon và ảnh chia sẻ được khai báo và tải được", async ({ page, request }) => {
    await page.goto("/");
    const head = page.locator("head");
    const icon = head.locator('link[rel="icon"][type="image/svg+xml"]');
    await expect(icon).toHaveCount(1);
    await expect(head.locator('link[rel="icon"][href^="/favicon.ico"]')).toHaveCount(1);
    await expect(head.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
    const og = head.locator('meta[property="og:image"]');
    await expect(og).toHaveCount(1);
    await expect(head.locator('meta[property="og:image:width"]')).toHaveAttribute("content", "1200");
    await expect(head.locator('meta[property="og:image:height"]')).toHaveAttribute("content", "630");
    await expect(head.locator('meta[property="og:image:alt"]')).toHaveAttribute("content", /FoodSave/);
    await expect(head.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");

    const urls = [
      (await icon.getAttribute("href"))!,
      (await head.locator('link[rel="apple-touch-icon"]').getAttribute("href"))!,
      new URL((await og.getAttribute("content"))!).pathname,
      "/favicon.ico",
      "/brand/email-logo.png",
      "/brand/foodsave-logo-horizontal.svg",
      "/icons/badge-96.png",
    ];
    for (const url of urls) {
      const res = await request.get(url);
      expect(res.ok(), url).toBeTruthy();
      expect(res.headers()["content-type"], url).toMatch(/^image\//);
    }
  });

  test("logo có tên truy cập FoodSave ở trang chủ và trang xác thực", async ({ page }) => {
    for (const p of ["/", "/login", "/register"]) {
      await page.goto(p);
      await expect(page.getByRole("link", { name: "FoodSave" }).first()).toBeVisible();
    }
  });
});

test.describe("Nguồn ảnh", () => {
  test("liệt kê đủ ảnh trong credits.json, có tác giả, nguồn và giấy phép", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("navigation", { name: "Pháp lý" }).getByRole("link", { name: "Nguồn ảnh" }).click();
    await expect(page).toHaveURL(/\/credits$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Nguồn ảnh");
    const items = page.locator("main ul > li");
    await expect(items).toHaveCount(credits.photos.length);
    for (const photo of credits.photos) {
      await expect(page.getByRole("link", { name: new RegExp(photo.photographer) }).first()).toHaveAttribute(
        "href",
        /^https:\/\/www\.pexels\.com\/@/,
      );
      await expect(page.locator(`a[href="${photo.sourceUrl}"]`)).toHaveCount(1);
    }
    await expect(page.getByText("Giấy phép: Giấy phép Pexels")).toHaveCount(credits.photos.length);
    await expectNoA11yViolations(page, "/credits");
  });
});
