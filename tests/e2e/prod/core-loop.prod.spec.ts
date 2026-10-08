import { devices, expect, test, type Page } from "@playwright/test";

/**
 * P2-18 — vòng lõi trên PRODUCTION bằng tài khoản demo (chỉ chạm dữ liệu `is_demo`, không tạo người dùng mới):
 * tổ chức xin nhận 1 đơn vị từ cửa hàng demo → cửa hàng xác nhận → tổ chức tạo chuyến tự đến lấy → điện thoại
 * tổ chức hiện mã → máy cửa hàng nhập mã 6 số → hai bên cùng thấy "Đã bàn giao".
 *
 * Chỉ chạy khi bật rõ ràng (playwright.config.ts bỏ qua thư mục `prod/` nếu thiếu E2E_PROD):
 *   E2E_PROD=1 E2E_BASE_URL=https://foodsave-psi.vercel.app DEMO_JUDGE_PASSWORD=… npx playwright test tests/e2e/prod --project=desktop
 * Trước buổi chấm nên chạy `node scripts/demo-reset.mjs --env-file .env.cloud.local --yes` để làm mới lô demo.
 */

const PASSWORD = process.env.DEMO_JUDGE_PASSWORD ?? "";
const STORE_EMAIL = process.env.DEMO_STORE_EMAIL ?? "giamkhao.cuahang@foodsave.test";
const CHARITY_EMAIL = process.env.DEMO_CHARITY_EMAIL ?? "giamkhao.tochuc@foodsave.test";
const STORE_NAME = process.env.DEMO_STORE_NAME ?? "Cửa hàng tiện lợi Phố Xanh";
const CHARITY_NAME = process.env.DEMO_CHARITY_NAME ?? "Mái ấm Hướng Dương";

const literal = (s: string) => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

async function login(page: Page, email: string, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  const form = page.locator("form").filter({ has: page.getByLabel("Mật khẩu") });
  await form.getByLabel("Email").fill(email);
  await form.getByLabel("Mật khẩu").fill(PASSWORD);
  await form.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).not.toHaveURL(/\/login(\?|$)/, { timeout: 30_000 });
}

test.describe("Vòng lõi trên production (P2-18)", () => {
  test.skip(!PASSWORD, "Thiếu DEMO_JUDGE_PASSWORD");
  test.describe.configure({ mode: "serial", timeout: 240_000 });

  test("xin nhận → xác nhận → chuyến tự lấy → mã 6 số → đã bàn giao", async ({ page, browser }, testInfo) => {
    // 1. Tổ chức (điện thoại) chọn một lô của cửa hàng demo đang mở, xin nhận 1 đơn vị
    await login(page, CHARITY_EMAIL, "/charity/donations");
    await expect(page.getByRole("heading", { level: 1, name: "Kho tặng" })).toBeVisible();
    const card = page.getByRole("article").filter({ hasText: STORE_NAME }).first();
    await expect(card).toBeVisible({ timeout: 30_000 });
    const title = (await card.getByRole("heading").first().innerText()).trim();
    await card.getByRole("button", { name: "Xin nhận" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/Số lượng xin nhận/).fill("1");
    await dialog.getByRole("button", { name: "Gửi yêu cầu" }).click();
    await expect(page.getByText(/Đã gửi yêu cầu|Xem yêu cầu của tôi/).first()).toBeVisible({ timeout: 20_000 });
    await page.screenshot({ path: testInfo.outputPath("1-charity-requested.png") });

    // 2. Cửa hàng (laptop) xác nhận đúng yêu cầu vừa gửi
    const storeCtx = await browser.newContext({
      ...devices["Desktop Chrome"],
      viewport: { width: 1440, height: 900 },
      baseURL: testInfo.project.use.baseURL,
      locale: "vi-VN",
      timezoneId: "Asia/Ho_Chi_Minh",
    });
    try {
      const store = await storeCtx.newPage();
      await login(store, STORE_EMAIL, "/store");
      const request = store
        .locator("#cho-xac-nhan")
        .getByRole("article")
        .filter({ has: store.getByRole("heading", { name: CHARITY_NAME }) })
        .filter({ hasText: title })
        .first();
      await expect(request).toBeVisible({ timeout: 30_000 });
      await request.getByRole("button", { name: "Xác nhận" }).click();
      await expect(store.getByText(new RegExp(`Đã xác nhận .* cho ${CHARITY_NAME}`))).toBeVisible({
        timeout: 20_000,
      });
      await store.screenshot({ path: testInfo.outputPath("2-store-confirmed.png") });

      // 3. Tổ chức tạo chuyến tự đến lấy chỉ với lô này
      await page.goto("/charity/pickups");
      await expect(page.getByRole("heading", { level: 1, name: "Chuyến lấy hàng" })).toBeVisible();
      const planner = page.getByRole("region", { name: /^Giao về / }).first();
      const boxes = planner.getByRole("checkbox");
      for (let i = 0; i < (await boxes.count()); i++) {
        const box = boxes.nth(i);
        const name = (await box.getAttribute("aria-label")) ?? (await box.innerText().catch(() => ""));
        if ((await box.isChecked()) && !name.includes(title)) await box.click();
      }
      const mine = planner.getByRole("checkbox", { name: literal(title) }).first();
      if (!(await mine.isChecked())) await mine.click();
      await planner.getByRole("button", { name: "Tạo chuyến tự đến lấy" }).click();
      await expect(page).toHaveURL(/\/charity\/pickups\/[0-9a-f-]{36}$/, { timeout: 60_000 });

      const stop = page
        .getByRole("region", { name: "Điểm dừng theo thứ tự" })
        .getByRole("article", { name: literal(STORE_NAME) });
      await stop.getByRole("link", { name: "Mở mã bàn giao" }).click();
      await expect(page).toHaveURL(/\/stops\/[0-9a-f-]{36}\/handover$/, { timeout: 30_000 });
      const stopId = /\/stops\/([0-9a-f-]{36})\/handover$/.exec(page.url())![1]!;

      // 4. Điện thoại tổ chức hiện mã
      await page.getByRole("button", { name: "Hiện mã bàn giao" }).click();
      const qr = page.getByRole("dialog", { name: "Mã bàn giao" });
      await expect(qr.getByRole("img", { name: /Mã QR bàn giao/ })).toBeVisible();
      const code = (await qr.locator("[data-handover-code]").innerText()).replace(/\D/g, "");
      expect(code).toMatch(/^\d{6}$/);
      await page.screenshot({ path: testInfo.outputPath("3-charity-qr.png") });

      // 5. Máy cửa hàng nhập mã 6 số, giao đủ
      await store.goto("/store/handover");
      const pending = store.locator(`[data-pending-stop="${stopId}"]`);
      await expect(pending).toContainText(CHARITY_NAME, { timeout: 30_000 });
      await pending.getByRole("button", { name: "Nhập mã 6 số" }).click();
      const review = store.getByRole("dialog", { name: "Xác nhận bàn giao" });
      await review.getByLabel("Mã 6 số trên điện thoại người nhận").fill(code);
      await review.getByRole("button", { name: "Xác nhận bàn giao" }).click();
      const done = store.getByRole("dialog", { name: "Đã bàn giao" });
      await expect(done.locator("[data-handover-success]")).toContainText(`Đã bàn giao cho ${CHARITY_NAME}`, {
        timeout: 30_000,
      });
      await store.screenshot({ path: testInfo.outputPath("4-store-done.png") });

      // 6. Điện thoại tổ chức tự chuyển sang "đã bàn giao"
      await expect(page.locator("[data-handover-done]")).toBeVisible({ timeout: 30_000 });
      await page.screenshot({ path: testInfo.outputPath("5-charity-done.png"), fullPage: true });
    } finally {
      await storeCtx.close();
    }
  });
});
