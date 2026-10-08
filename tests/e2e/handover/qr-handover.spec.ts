import {
  devices,
  expect,
  test,
  type BrowserContextOptions,
  type Page,
  type TestInfo,
} from "@playwright/test";

import { expectNoA11yViolations } from "../fixtures/a11y";
import { loginAs } from "../fixtures/users";

import { allocationOf, createSelfPickupScenario, ledgerOf, parseVnNumber, writeQrVideo } from "./scenario";

/**
 * P2-12 / P2-13 — chuỗi bàn giao QR với HAI thiết bị (PRD US-CHA-20, US-STO-17, US-STO-18, US-SYS-07, US-PUB-02):
 * điện thoại tổ chức (người mang hàng, tự đến lấy) hiện mã ⇒ máy cửa hàng nhập mã 6 số / quét QR bằng camera
 * ⇒ đối soát từng dòng ⇒ hai máy cùng thấy kết quả ⇒ sổ tác động có dòng credit ⇒ bộ đếm landing tăng.
 *
 * Camera: Chromium chạy với camera giả phát đúng ma trận QR đang hiện trên điện thoại tổ chức (không có
 * hook test nào trong ứng dụng).
 */

const carrierUrl = (pickupId: string, stopId: string) =>
  `/charity/pickups/${pickupId}/stops/${stopId}/handover`;

/** Máy cửa hàng: laptop ở project desktop, điện thoại nhân viên ở project mobile. */
function storeContextOptions(testInfo: TestInfo): BrowserContextOptions {
  const base = {
    baseURL: testInfo.project.use.baseURL,
    locale: "vi-VN",
    timezoneId: "Asia/Ho_Chi_Minh",
    // Tắt chuyển động (globals.css tôn trọng prefers-reduced-motion): axe không bắt nút đang chuyển opacity
    reducedMotion: "reduce" as const,
  };
  return testInfo.project.name === "mobile"
    ? { ...devices["Pixel 7"], ...base }
    : { ...base, viewport: { width: 1440, height: 900 } };
}

async function landingKg(page: Page): Promise<number> {
  await page.goto("/");
  const section = page.getByRole("region", { name: "Bộ đếm tác động của FoodSave" });
  await expect(section).toBeVisible();
  const value = section.locator('[data-metric="kg"] [data-value]');
  if ((await value.count()) === 0) return 0; // sổ trống: câu trạng thái rỗng, không có số 0 giả
  return parseVnNumber(await value.innerText());
}

/** Chờ khung hình kế tiếp và mọi transition CSS kết thúc (nút vừa hết trạng thái chờ), rồi mới chạy axe. */
async function a11y(page: Page, label: string) {
  await page.evaluate(async () => {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined)));
  });
  await expectNoA11yViolations(page, label);
}

/** Token chỉ nằm trong bộ nhớ: không có trong URL, localStorage, sessionStorage. */
async function expectNoSecretPersisted(page: Page) {
  expect(new URL(page.url()).search).toBe("");
  const stored = await page.evaluate(() =>
    [localStorage, sessionStorage].flatMap((s) =>
      Array.from({ length: s.length }, (_, i) => s.getItem(s.key(i) ?? "") ?? ""),
    ),
  );
  for (const v of stored) expect(v).not.toMatch(/[A-Za-z0-9_-]{43}/);
}

test.describe("Bàn giao QR — tự đến lấy (P2-12, P2-13)", () => {
  test.describe.configure({ timeout: 180_000 });

  test("mã 6 số: sai mã bị đếm, thiếu hàng bắt buộc lý do, hai máy cùng thấy kết quả, sổ tác động + landing cập nhật", async ({
    page,
    browser,
  }, testInfo) => {
    const s = await createSelfPickupScenario({ tag: `code-${testInfo.project.name}` });
    await page.emulateMedia({ reducedMotion: "reduce" });

    const landing = await browser.newPage();
    const kgBefore = await landingKg(landing);

    // --- Điện thoại tổ chức: xem điểm dừng, hiện mã
    await loginAs(page, s.charity, carrierUrl(s.pickupId, s.stopId));
    await expect(page.getByRole("heading", { level: 1, name: `Bàn giao tại ${s.storeName}` })).toBeVisible();
    await expect(page.getByText(s.offerTitle)).toBeVisible();
    // Trang chứa mã dùng một lần: không gửi Referer, không index (C10)
    await expect(page.locator('meta[name="referrer"]')).toHaveAttribute("content", "no-referrer");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await a11y(page, "màn người mang hàng");
    await page.screenshot({ path: testInfo.outputPath("carrier-before.png"), fullPage: true });

    await page.getByRole("button", { name: "Hiện mã bàn giao" }).click();
    const qrDialog = page.getByRole("dialog", { name: "Mã bàn giao" });
    await expect(qrDialog.getByRole("img", { name: /Mã QR bàn giao/ })).toBeVisible();
    const code = (await qrDialog.locator("[data-handover-code]").innerText()).replace(/\D/g, "");
    expect(code).toMatch(/^\d{6}$/);
    await expect(qrDialog.getByText(/Mã dùng một lần, còn 1[45]:\d\d/)).toBeVisible();
    await expectNoSecretPersisted(page);
    await expect(qrDialog.getByRole("button", { name: "Tạo mã mới" })).toBeEnabled();
    await a11y(page, "màn mã QR");
    await page.screenshot({ path: testInfo.outputPath("carrier-qr.png") });

    // --- Máy cửa hàng: chọn lượt đang chờ, nhập mã
    const storeCtx = await browser.newContext(storeContextOptions(testInfo));
    try {
      const store = await storeCtx.newPage();
      await loginAs(store, s.store, "/store/handover");
      await expect(store.getByRole("heading", { level: 1, name: "Bàn giao" })).toBeVisible();
      const card = store.locator(`[data-pending-stop="${s.stopId}"]`);
      await expect(card).toContainText(s.charityName);
      await expect(card).toContainText("Mã đang mở");
      await a11y(store, "bảng bàn giao cửa hàng");
      await store.screenshot({ path: testInfo.outputPath("store-board.png"), fullPage: true });

      await card.getByRole("button", { name: "Nhập mã 6 số" }).click();
      const review = store.getByRole("dialog", { name: "Xác nhận bàn giao" });
      await expect(review).toContainText(s.charityName);
      const codeInput = review.getByLabel("Mã 6 số trên điện thoại người nhận");
      const confirm = review.getByRole("button", { name: "Xác nhận bàn giao" });

      // Sai mã: không raise, đếm lần sai (US-STO-17 AC3)
      await codeInput.fill(code === "000000" ? "111111" : "000000");
      await confirm.click();
      await expect(review.getByText("Mã chưa đúng. Bạn còn 4 lần thử.")).toBeVisible();

      // Giao 18/20: bắt buộc lý do (US-STO-18 AC1)
      await review.getByLabel(/Số thực giao/).fill("18");
      await codeInput.fill(code);
      await confirm.click();
      await expect(review.getByText("Vui lòng chọn lý do thiếu.")).toBeVisible();
      await review.getByRole("radio", { name: /Cửa hàng không đủ hàng/ }).check();
      await a11y(store, "đối soát từng dòng");
      await store.screenshot({ path: testInfo.outputPath("store-review.png"), fullPage: true });
      await confirm.click();

      const done = store.getByRole("dialog", { name: "Đã bàn giao" });
      await expect(done.locator("[data-handover-success]")).toContainText(`Đã bàn giao cho ${s.charityName}`);
      await expect(done).toContainText("18 ổ");
      await expect(done).toContainText("Cửa hàng không đủ hàng");
      await expect(done).toContainText("Đã ghi vào sổ tác động");
      await store.screenshot({ path: testInfo.outputPath("store-done.png"), fullPage: true });

      // --- Điện thoại tổ chức tự chuyển sang kết quả (hỏi trạng thái mỗi 3 giây)
      await expect(page.locator("[data-handover-done]")).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole("dialog", { name: "Mã bàn giao" })).toBeHidden();
      await expect(page.locator(`[data-received="${s.allocationId}"]`)).toContainText("Đã nhận 18 ổ");
      await expect(page.getByRole("region", { name: "Tác động của lần bàn giao này" })).toContainText("2,2");
      await a11y(page, "kết quả bàn giao (tổ chức)");
      await page.screenshot({ path: testInfo.outputPath("carrier-done.png"), fullPage: true });

      // --- DB: tự đến lấy ⇒ một bàn giao vừa là lấy vừa là giao, sổ tác động ghi ngay (US-CHA-20 AC2)
      const alloc = await allocationOf(s.allocationId);
      expect(alloc).toMatchObject({ status: "delivered", shortfall_reason: "store_short" });
      expect(Number(alloc.qty_delivered)).toBe(18);
      const ledger = await ledgerOf(s.allocationId);
      expect(ledger).toHaveLength(1);
      expect(ledger[0]!.entry_type).toBe("credit");
      expect(Number(ledger[0]!.kg)).toBeCloseTo(18 * s.unitWeightKg, 3);
      expect(Number(ledger[0]!.co2e_kg)).toBeCloseTo(18 * s.unitWeightKg * 2, 3);

      // Lượt vừa xong rời danh sách chờ, vào "Đã bàn giao trong 24 giờ qua"
      await store.reload();
      await expect(store.locator(`[data-pending-stop="${s.stopId}"]`)).toHaveCount(0);
      await expect(store.getByRole("region", { name: /Đã bàn giao trong 24 giờ qua/ })).toContainText(
        s.charityName,
      );
    } finally {
      await storeCtx.close();
    }

    // --- Landing: bộ đếm công khai tăng (cache theo thẻ, làm mới sau bàn giao)
    await expect
      .poll(() => landingKg(landing), { timeout: 60_000, intervals: [500, 1000, 2000, 3000] })
      .toBeGreaterThan(kgBefore);
    await landing.screenshot({ path: testInfo.outputPath("landing-impact.png"), fullPage: true });
    await landing.close();
  });

  test("quét QR bằng camera: cửa hàng quét mã trên điện thoại tổ chức, thấy người nhận, xác nhận đủ", async ({
    page,
    playwright,
  }, testInfo) => {
    const s = await createSelfPickupScenario({ tag: `cam-${testInfo.project.name}` });
    await page.emulateMedia({ reducedMotion: "reduce" });

    await loginAs(page, s.charity, carrierUrl(s.pickupId, s.stopId));
    await page.getByRole("button", { name: "Hiện mã bàn giao" }).click();
    const qr = page.getByRole("dialog", { name: "Mã bàn giao" }).locator("svg[data-qr-size]");
    await expect(qr).toBeVisible();
    const d = await qr.locator("path").getAttribute("d");
    const size = Number(await qr.getAttribute("data-qr-size"));
    const video = testInfo.outputPath("qr-camera.y4m");
    writeQrVideo(video, d!, size);

    const storeBrowser = await playwright.chromium.launch({
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        `--use-file-for-fake-video-capture=${video}`,
      ],
    });
    const ctx = await storeBrowser.newContext({ ...storeContextOptions(testInfo), permissions: ["camera"] });
    const store = await ctx.newPage();
    try {
      await loginAs(store, s.store, "/store/handover");

      const started = Date.now();
      await store.getByRole("button", { name: "Quét mã QR" }).click();
      await expect(store.getByRole("dialog", { name: "Quét mã bàn giao" })).toBeVisible();
      const review = store.getByRole("dialog", { name: "Xác nhận bàn giao" });
      await expect(review).toBeVisible({ timeout: 30_000 });
      const scanMs = Date.now() - started;
      testInfo.annotations.push({ type: "scan-ms", description: String(scanMs) });

      // Xem trước từ peek_handover_token: tổ chức + người mang hàng + dòng (US-STO-17 AC1)
      await expect(review).toContainText(s.charityName);
      await expect(review).toContainText("Người nhận: Cô Võ Thị Hạnh");
      await expect(review).toContainText(s.offerTitle);
      await expect(review.getByLabel(/Số thực giao/)).toHaveValue(String(s.qty));
      await expect(review.getByLabel("Mã 6 số trên điện thoại người nhận")).toHaveCount(0);
      await a11y(store, "xem trước sau khi quét");
      await store.screenshot({ path: testInfo.outputPath("store-scanned.png"), fullPage: true });

      await review.getByRole("button", { name: "Xác nhận bàn giao" }).click();
      const done = store.getByRole("dialog", { name: "Đã bàn giao" });
      await expect(done).toContainText(`${s.qty} ổ`);

      await expect(page.locator("[data-handover-done]")).toBeVisible({ timeout: 20_000 });
      await expect(page.locator("[data-handover-done]")).toContainText("quét QR");
      expect((await allocationOf(s.allocationId)).status).toBe("delivered");
      expect(await ledgerOf(s.allocationId)).toHaveLength(1);

      // Quét lại đúng mã đã dùng ⇒ báo đã dùng, không ghi thêm (AC3, AC4)
      await done.getByRole("button", { name: "Quét lượt tiếp theo" }).click();
      const blocked = store.getByRole("dialog", { name: "Chưa bàn giao được" });
      await expect(blocked).toContainText(/Mã này đã được dùng lúc \d\d:\d\d/, { timeout: 20_000 });
      expect(await ledgerOf(s.allocationId)).toHaveLength(1);
    } catch (err) {
      await store
        .screenshot({ path: testInfo.outputPath("store-failure.png"), fullPage: true })
        .catch(() => {});
      throw err;
    } finally {
      await storeBrowser.close();
    }
  });
});
