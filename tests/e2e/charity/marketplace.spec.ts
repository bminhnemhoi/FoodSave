import { expect, test, type Page } from "@playwright/test";

import { expectNoA11yViolations } from "../fixtures/a11y";
import { loginAs } from "../fixtures/users";
import { literal, requestViaApi, setupCharity, setupStoreOffer } from "./helpers";

/**
 * Kho tặng (P2-07/08, US-CHA-05/06/08): tổ chức đã duyệt thấy lô của cửa hàng trong bán kính trên danh sách
 * và bản đồ, lọc theo URL, xin nhận (giữ chỗ nguyên tử) và thấy yêu cầu ở Tổng quan.
 */

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1440) < 1024;

test.describe("Kho tặng — tổ chức", () => {
  test("thấy lô trên danh sách và bản đồ, xin nhận rồi thấy ở Yêu cầu của tôi", async ({ page }) => {
    test.setTimeout(240_000);
    const charity = await setupCharity();
    const store = await setupStoreOffer({ quantity: 30 });

    await loginAs(page, charity.user, "/charity/donations");
    await page.goto("/charity/donations");
    await expect(page.getByRole("heading", { level: 1, name: "Kho tặng" })).toBeVisible();

    const card = page.getByRole("article", { name: literal(store.title) });
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card).toContainText(store.org.name);
    await expect(card.getByText("Nhãn Đỏ")).toBeVisible();
    await expect(card).toContainText("30 ổ");
    await expect(card).toContainText(/km|m/);

    // Bản đồ: chọn "Xem trên bản đồ" ⇒ bay tới cửa hàng, marker có tên cửa hàng (không chỉ màu)
    await card.getByRole("button", { name: "Xem trên bản đồ" }).click();
    const map = page.getByRole("region", { name: /Bản đồ kho tặng/ });
    await expect(map).toBeVisible();
    const marker = map.getByRole("button", { name: literal(store.org.name) });
    await expect(marker).toBeVisible({ timeout: 30_000 });
    await expect(marker).toHaveAttribute("aria-label", /gấp nhất: Nhãn Đỏ/);
    await expect(page).toHaveURL(isMobile(page) ? /view=map/ : /\/charity\/donations/);
    await expectNoA11yViolations(page, "kho tặng + bản đồ");

    if (isMobile(page)) {
      // Thẻ lô của cửa hàng đang chọn hiện trong khung bản đồ
      await expect(page.getByRole("region", { name: `Lô của ${store.org.name}` })).toBeVisible();
      await page.getByRole("button", { name: /^Danh sách/ }).click();
    }

    await card.getByRole("button", { name: "Xin nhận" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: literal(store.title) })).toBeVisible();
    const qty = dialog.getByLabel(/Số lượng xin nhận/);
    await expect(qty).toHaveValue("30");
    await qty.fill("12,5");
    await dialog.getByRole("button", { name: "Gửi yêu cầu" }).click();
    await expect(dialog.getByText("Số lượng phải là số nguyên với đơn vị ổ.")).toBeVisible();
    await qty.fill("12");
    await expectNoA11yViolations(page, "hộp thoại xin nhận");
    await dialog.getByRole("button", { name: "Gửi yêu cầu" }).click();
    await expect(page.getByText(/Đã gửi yêu cầu nhận 12 ổ/)).toBeVisible({ timeout: 30_000 });
    await expect(dialog).toBeHidden();

    // Số còn lại cập nhật ngay (đã giữ chỗ 12)
    await expect(card).toContainText("18 ổ", { timeout: 15_000 });

    await page.goto("/charity");
    const waiting = page.getByRole("region", { name: /^Chờ cửa hàng xác nhận/ });
    await expect(waiting.getByRole("article", { name: literal(store.title) })).toBeVisible();
    await expect(waiting).toContainText("12 ổ");
    await expectNoA11yViolations(page, "tổng quan tổ chức");
  });

  test("lọc theo nhãn giữ trong URL, rỗng thì gợi ý xóa lọc", async ({ page }) => {
    test.setTimeout(200_000);
    const charity = await setupCharity();
    const store = await setupStoreOffer();

    await loginAs(page, charity.user, "/charity/donations");
    await page.goto(`/charity/donations?labels=green&site=${charity.site.id}`);
    await expect(page.getByRole("button", { name: "Nhãn Xanh", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByRole("article", { name: literal(store.title) })).toHaveCount(0);

    // Bỏ lọc Xanh, chọn Đỏ ⇒ URL đổi, lô Đỏ hiện
    await page.getByRole("button", { name: "Nhãn Xanh", exact: true }).click();
    await expect(page).not.toHaveURL(/labels=/);
    await page.getByRole("button", { name: "Nhãn Đỏ", exact: true }).click();
    await expect(page).toHaveURL(/labels=red/);
    await expect(page.getByRole("article", { name: literal(store.title) })).toBeVisible({ timeout: 20_000 });

    // Khoảng cách 0,5 km ⇒ cửa hàng (~850 m) bị lọc; empty state có CTA mở rộng
    await page.goto(`/charity/donations?site=${charity.site.id}&maxKm=0.5`);
    await expect(page.getByRole("article", { name: literal(store.title) })).toHaveCount(0);
    const widen = page.getByRole("button", { name: /Mở rộng tới 5 km/ });
    if (await widen.isVisible()) {
      await widen.click();
      await expect(page).not.toHaveURL(/maxKm=/);
      await expect(page.getByRole("article", { name: literal(store.title) })).toBeVisible({
        timeout: 20_000,
      });
    }
    await expectNoA11yViolations(page, "kho tặng có lọc");
  });

  test("lô vừa bị tổ chức khác giữ: báo đúng số còn lại và cho nhận phần đó", async ({ page }) => {
    test.setTimeout(200_000);
    const charity = await setupCharity();
    const other = await setupCharity();
    const store = await setupStoreOffer({ quantity: 20 });

    await loginAs(page, charity.user, "/charity/donations");
    await page.goto("/charity/donations");
    const card = page.getByRole("article", { name: literal(store.title) });
    await card.getByRole("button", { name: "Xin nhận" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel(/Số lượng xin nhận/)).toHaveValue("20");

    // Tổ chức khác giữ 15 trong lúc hộp thoại đang mở
    await requestViaApi(other, store.offerId, 15);

    await dialog.getByRole("button", { name: "Gửi yêu cầu" }).click();
    const alert = dialog.getByRole("alert");
    await expect(alert).toContainText("Lô vừa được tổ chức khác giữ một phần.", { timeout: 30_000 });
    await expect(alert).toContainText("Chỉ còn 5 ổ — bạn có muốn nhận 5 ổ?");
    await alert.getByRole("button", { name: "Nhận 5 ổ" }).click();
    await expect(dialog.getByLabel(/Số lượng xin nhận/)).toHaveValue("5");
    await dialog.getByRole("button", { name: "Gửi yêu cầu" }).click();
    await expect(page.getByText(/Đã gửi yêu cầu nhận 5 ổ/)).toBeVisible({ timeout: 30_000 });
  });
});
