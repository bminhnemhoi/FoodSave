import { expect, test, type Locator, type Page } from "@playwright/test";

import { expectNoA11yViolations } from "../fixtures/a11y";
import { createConfirmedUser, loginAs } from "../fixtures/users";

/**
 * P1-03 / F-05: chọn địa chỉ qua gợi ý → ghim → toạ độ trong vùng phục vụ.
 * Chạy được với MAPS_PROVIDER=goong (key thật) lẫn fake; nếu dịch vụ gợi ý lỗi thì kiểm luồng
 * dự phòng "bấm lên bản đồ để đặt ghim".
 */

const BBOX = { minLng: 106.35, maxLng: 107.1, minLat: 10.35, maxLat: 11.2 };

async function expectPinInsideServiceArea(coords: Locator) {
  await expect(coords).toBeVisible({ timeout: 20_000 });
  const lat = Number(await coords.getAttribute("data-lat"));
  const lng = Number(await coords.getAttribute("data-lng"));
  expect(lat).toBeGreaterThanOrEqual(BBOX.minLat);
  expect(lat).toBeLessThanOrEqual(BBOX.maxLat);
  expect(lng).toBeGreaterThanOrEqual(BBOX.minLng);
  expect(lng).toBeLessThanOrEqual(BBOX.maxLng);
}

async function openPicker(page: Page) {
  const user = await createConfirmedUser({ prefix: "loc" });
  await loginAs(page, user, "/dev/location-picker");
  await expect(page).toHaveURL(/\/dev\/location-picker$/);
  return page.getByRole("combobox", { name: "Tìm địa chỉ" });
}

/** Chờ gợi ý hoặc thông báo lỗi dịch vụ; trả về true nếu có gợi ý. */
async function waitForSuggestions(page: Page): Promise<boolean> {
  const options = page.getByRole("listbox", { name: "Gợi ý địa chỉ" }).getByRole("option");
  const failure = page.getByRole("alert").filter({ hasText: /bản đồ|tìm địa chỉ|FoodSave/ });
  await expect(options.first().or(failure.first())).toBeVisible({ timeout: 20_000 });
  return options.first().isVisible();
}

test.describe("Bộ chọn vị trí (F-05)", () => {
  test("gõ địa chỉ → chọn gợi ý → ghim nằm trong TP.HCM và giá trị được phát ra", async ({ page }) => {
    const box = await openPicker(page);
    await box.fill("Chợ Bến Thành");

    if (await waitForSuggestions(page)) {
      await expect(box).toHaveAttribute("aria-expanded", "true");
      await page.getByRole("listbox", { name: "Gợi ý địa chỉ" }).getByRole("option").first().click();
      await expectPinInsideServiceArea(page.getByTestId("location-coords"));
      await expect(page.getByText("Gợi ý địa chỉ", { exact: true })).toBeVisible();
      await expect(page.getByTestId("location-value")).toContainText('"source": "autocomplete"');
    } else {
      test.info().annotations.push({ type: "provider", description: "Gợi ý lỗi — kiểm luồng ghim thủ công" });
      const map = page.getByRole("region", { name: /Bản đồ chọn vị trí/ });
      await map.locator("canvas").click({ position: { x: 120, y: 120 } });
      await expectPinInsideServiceArea(page.getByTestId("location-coords"));
    }
    await expect(page.getByLabel("Số nhà, tên đường")).not.toHaveValue("");
    await expectNoA11yViolations(page, "/dev/location-picker");
  });

  test("điều khiển bằng bàn phím: mũi tên xuống + Enter chọn gợi ý, Esc đóng danh sách", async ({ page }) => {
    const box = await openPicker(page);
    await box.fill("Nhà thờ Đức Bà");
    test.skip(!(await waitForSuggestions(page)), "Dịch vụ gợi ý không phản hồi");

    await box.press("Escape");
    await expect(box).toHaveAttribute("aria-expanded", "false");
    await box.press("ArrowDown");
    await expect(box).toHaveAttribute("aria-expanded", "true");
    const first = page.getByRole("listbox", { name: "Gợi ý địa chỉ" }).getByRole("option").first();
    await expect(first).toHaveAttribute("aria-selected", "true");
    await expect(box).toHaveAttribute("aria-activedescendant", (await first.getAttribute("id"))!);
    await box.press("Enter");
    await expectPinInsideServiceArea(page.getByTestId("location-coords"));
  });

  test("vị trí hiện tại ngoài TP.HCM bị chặn với thông báo tiếng Việt", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 21.0285, longitude: 105.8542 }); // Hà Nội
    await openPicker(page);
    await page.getByRole("button", { name: "Dùng vị trí hiện tại" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "ngoài vùng phục vụ" }).first()).toBeVisible();
    await expect(page.getByTestId("location-value")).toContainText("null");
  });

  test("vị trí hiện tại trong TP.HCM tạo ghim nguồn GPS", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 10.7769, longitude: 106.7009 });
    await openPicker(page);
    await page.getByRole("button", { name: "Dùng vị trí hiện tại" }).click();
    await expectPinInsideServiceArea(page.getByTestId("location-coords"));
    await expect(page.getByText("Vị trí hiện tại (GPS)")).toBeVisible();
  });
});
