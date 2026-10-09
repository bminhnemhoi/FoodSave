import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { createConfirmedUser, createOrgFor, loginAs, serviceKey, SUPABASE_URL } from "../fixtures/users";

/** Chi nhánh chính (để kho hàng hiện đúng trạng thái "chưa có lô"). */
async function addPrimarySite(orgId: string) {
  const key = serviceKey();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/sites`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      org_id: orgId,
      name: "Điểm chính",
      is_primary: true,
      address_line: "45 Nguyễn Huệ",
      location: "SRID=4326;POINT(106.7019 10.7743)",
    }),
  });
  if (!res.ok) throw new Error(`POST sites → ${res.status}: ${await res.text()}`);
}

/**
 * Ảnh chụp bộ nhận diện mới (logo "Bát lá", ảnh, chuyển động) để rà soát bằng mắt (skill ui-screen §3):
 * landing, đăng nhập, đăng ký, quên mật khẩu, chọn vai trò onboarding, nguồn ảnh, trạng thái rỗng có minh họa.
 * Chỉ chạy khi đặt E2E_SCREENSHOT_DIR, ví dụ:
 *   E2E_SCREENSHOT_DIR=./test-results/brand pnpm test:e2e tests/e2e/visual/brand-screenshots.spec.ts --project=desktop
 */
const DIR = process.env.E2E_SCREENSHOT_DIR;

async function both(page: Page, name: string, { full = true } = {}) {
  for (const [w, h, suffix] of [
    [1440, 900, "desktop"],
    [390, 844, "mobile"],
  ] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.evaluate(() => window.scrollTo(0, 0));
    // Ảnh next/image tải lười: cuộn hết trang để mọi ảnh đã có trước khi chụp toàn trang
    if (full) {
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 600) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 60));
        }
        window.scrollTo(0, 0);
      });
      await page.waitForLoadState("networkidle");
    }
    await page.screenshot({ path: path.join(DIR!, `${name}-${suffix}.png`) });
    if (full) await page.screenshot({ path: path.join(DIR!, `${name}-${suffix}-full.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

test.describe("Ảnh chụp thương hiệu", () => {
  test.skip(!DIR, "Đặt E2E_SCREENSHOT_DIR để chụp ảnh");
  test.setTimeout(180_000);
  test.beforeEach(async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "Chỉ chạy một lần (project desktop)");
    // Tắt chuyển động để ảnh chụp đúng trạng thái nghỉ
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test("trang công khai và xác thực", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Cứu thực phẩm");
    // Số tác động lấy phía trình duyệt — chụp sau khi bộ đếm hết trạng thái đang tải
    await expect(page.getByRole("region", { name: "Bộ đếm tác động của FoodSave" })).toHaveAttribute(
      "data-impact-state",
      /^(ready|empty|unavailable)$/,
    );
    await both(page, "landing");

    await page.goto("/login");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Đăng nhập");
    await both(page, "login", { full: false });

    await page.goto("/register");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tạo tài khoản FoodSave");
    await both(page, "register", { full: false });

    await page.goto("/forgot-password");
    await both(page, "forgot-password", { full: false });

    await page.goto("/credits");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Nguồn ảnh");
    await both(page, "credits");
  });

  test("landing có chuyển động — trạng thái sau màn mở đầu", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    await page.waitForTimeout(1600);
    await page.screenshot({ path: path.join(DIR!, "landing-motion-desktop.png") });
  });

  test("chọn vai trò onboarding và trạng thái rỗng có minh họa", async ({ page }) => {
    const user = await createConfirmedUser({ prefix: "brandshot", fullName: "Nguyễn Thị Thu Lan" });
    await loginAs(page, user, "/onboarding");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Nguyễn Thị Thu Lan");
    await both(page, "onboarding-chooser", { full: false });

    const store = await createOrgFor(user, { kind: "store", status: "approved", name: "Tiệm bánh Hạt Lúa" });
    await addPrimarySite(store.id);
    await page.goto("/store/inventory");
    await expect(page.getByRole("heading", { name: "Chưa có lô nào đang mở" })).toBeVisible();
    await page.screenshot({ path: path.join(DIR!, "empty-store-inventory-desktop.png") });

    const charity = await createConfirmedUser({ prefix: "brandshotc", fullName: "Trần Minh Khoa" });
    const home = await createOrgFor(charity, {
      kind: "charity",
      status: "approved",
      name: "Mái ấm Nắng Mai",
    });
    await addPrimarySite(home.id);
    await page.context().clearCookies();
    await loginAs(page, charity, "/charity");
    await expect(page.getByRole("heading", { name: "Chưa có yêu cầu nào" })).toBeVisible();
    await page.screenshot({ path: path.join(DIR!, "empty-charity-requests-desktop.png"), fullPage: true });
    await page.goto("/charity/pickups");
    await expect(page.getByRole("heading", { name: "Chưa có lô nào chờ đi lấy" })).toBeVisible();
    await page.screenshot({ path: path.join(DIR!, "empty-charity-pickups-desktop.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(DIR!, "empty-charity-pickups-mobile.png"), fullPage: true });
  });
});
