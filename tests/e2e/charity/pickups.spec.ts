import { expect, test } from "@playwright/test";

import { expectNoA11yViolations } from "../fixtures/a11y";
import { loginAs } from "../fixtures/users";
import { confirmViaApi, literal, requestViaApi, setupCharity, setupStoreOffer } from "./helpers";

/**
 * Chuyến tự đến lấy (P2-10 phía tổ chức, US-CHA-20 AC1) và hủy yêu cầu (US-CHA-08 AC4, ma trận hủy C1/C2).
 */

test.describe("Chuyến lấy hàng — tổ chức", () => {
  test("cửa hàng xác nhận ⇒ tạo chuyến tự đến lấy, thấy điểm dừng, chỉ đường và mã bàn giao", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const charity = await setupCharity();
    const store = await setupStoreOffer({ quantity: 30 });
    const allocationId = await requestViaApi(charity, store.offerId, 10);
    await confirmViaApi(store, allocationId);

    await loginAs(page, charity.user, "/charity/pickups");
    await page.goto("/charity/pickups");
    await expect(page.getByRole("heading", { level: 1, name: "Chuyến lấy hàng" })).toBeVisible();

    const planner = page.getByRole("region", { name: `Giao về ${charity.site.name}` });
    await expect(planner).toContainText(store.title);
    await expect(planner.getByRole("checkbox", { name: literal(store.title) })).toBeChecked();
    await expectNoA11yViolations(page, "chuyến lấy hàng");

    await planner.getByRole("button", { name: "Tạo chuyến tự đến lấy" }).click();
    await expect(page).toHaveURL(/\/charity\/pickups\/[0-9a-f-]{36}$/, { timeout: 45_000 });
    await expect(page.getByRole("heading", { level: 1, name: "Chuyến tự đến lấy" })).toBeVisible();
    await expect(page.getByText("Chờ đi lấy").first()).toBeVisible();

    const stops = page.getByRole("region", { name: "Điểm dừng theo thứ tự" });
    const pickupStop = stops.getByRole("article", { name: literal(store.org.name) });
    await expect(pickupStop).toContainText(store.title);
    await expect(pickupStop).toContainText("10 ổ");
    await expect(pickupStop).toContainText("45 Pasteur"); // địa chỉ chính xác khi chuyến đang chạy

    const handover = pickupStop.getByRole("link", { name: "Mở mã bàn giao" });
    await expect(handover).toHaveAttribute(
      "href",
      /\/charity\/pickups\/[0-9a-f-]{36}\/stops\/[0-9a-f-]{36}\/handover$/,
    );
    const maps = pickupStop.getByRole("link", { name: /Mở Google Maps/ });
    await expect(maps).toHaveAttribute(
      "href",
      /google\.com\/maps\/dir\/\?api=1&destination=10\.78\d*%2C106\.69\d*&travelmode=two-wheeler/,
    );
    await expect(maps).toHaveAttribute("target", "_blank");

    await expect(stops.getByRole("article", { name: literal(`Giao về ${charity.site.name}`) })).toBeVisible();
    await expect(page.getByRole("region", { name: /Bản đồ chuyến/ })).toBeVisible();
    await expectNoA11yViolations(page, "chi tiết chuyến");

    // Danh sách chuyến: chuyến đang chạy
    await page.goto("/charity/pickups");
    const running = page.getByRole("region", { name: "Chuyến đang chạy" });
    await expect(running.getByRole("link", { name: literal(store.org.name) })).toBeVisible();

    // Tổng quan: phân bổ ở nhóm "Đang lấy" với link mở chuyến
    await page.goto("/charity");
    const inTrip = page.getByRole("region", { name: /^Đang lấy/ });
    await expect(inTrip.getByRole("article", { name: literal(store.title) })).toBeVisible();
    await expect(inTrip.getByRole("link", { name: "Mở chuyến" })).toBeVisible();
  });

  test("chủ tổ chức hủy yêu cầu chờ xác nhận từ Tổng quan", async ({ page }) => {
    test.setTimeout(200_000);
    const charity = await setupCharity("owner");
    const store = await setupStoreOffer({ quantity: 8 });
    await requestViaApi(charity, store.offerId, 8);

    await loginAs(page, charity.user, "/charity");
    await page.goto("/charity");
    const waiting = page.getByRole("region", { name: /^Chờ cửa hàng xác nhận/ });
    const item = waiting.getByRole("article", { name: literal(store.title) });
    await expect(item).toContainText(/Cửa hàng cần trả lời trước/);
    await item.getByRole("button", { name: "Hủy yêu cầu" }).click();

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("Cửa hàng chưa xác nhận nên không ảnh hưởng điểm uy tín.");
    await expect(dialog.getByRole("button", { name: "Quay lại" })).toBeFocused();
    await expectNoA11yViolations(page, "hộp thoại hủy yêu cầu");
    await dialog.getByLabel("Không còn nhu cầu").check();
    await dialog.getByRole("button", { name: "Hủy yêu cầu" }).click();
    await expect(page.getByText(/Đã hủy yêu cầu nhận/)).toBeVisible({ timeout: 30_000 });
    await expect(waiting.getByRole("article", { name: literal(store.title) })).toHaveCount(0);
    await expect(page.getByText(/Đã đóng trong 7 ngày qua/)).toBeVisible();
  });

  test("nhân viên (staff) không thấy nút hủy yêu cầu", async ({ page }) => {
    test.setTimeout(200_000);
    const charity = await setupCharity("staff");
    const store = await setupStoreOffer({ quantity: 5 });
    await requestViaApi(charity, store.offerId, 5);

    await loginAs(page, charity.user, "/charity");
    await page.goto("/charity");
    const item = page.getByRole("article", { name: literal(store.title) });
    await expect(item).toBeVisible();
    await expect(item.getByRole("button", { name: "Hủy yêu cầu" })).toHaveCount(0);
    await expect(page.getByText("Chỉ chủ sở hữu hoặc quản lý tổ chức hủy được yêu cầu.")).toBeVisible();
  });
});
