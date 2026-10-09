import { expect, test } from "@playwright/test";

import { literal, requestViaApi, setupCharity, setupStoreOffer } from "../charity/helpers";
import { expectNoA11yViolations } from "../fixtures/a11y";
import { loginAdminWithMfa, revokeAdmin } from "../fixtures/admin";
import { adminPatch } from "../fixtures/orgs";
import { uniqueSuffix } from "../fixtures/users";
import { isWide, publishOffer, shot } from "./console-helpers";

/**
 * UAT P2-12 · US-ADM-05 (F-64): màn "Lô hàng" của Admin — mọi lô cùng nhãn Xanh/Vàng/Đỏ tính lúc đọc,
 * Đỏ trước với đếm ngược, lọc nhãn qua URL, ẩn dữ liệu demo mặc định, chi tiết lô có phân bổ.
 */

// Đăng ký TOTP có thể phải chờ sang chu kỳ 30 s mới (freshCode)
test.describe.configure({ timeout: 150_000 });

test("Lô hàng: Đỏ trước có đếm ngược, lọc nhãn qua URL, demo tách riêng, chi tiết lô có phân bổ", async ({
  page,
}, testInfo) => {
  const suffix = uniqueSuffix();
  const store = await setupStoreOffer({ title: `Bánh mì Đỏ ${suffix}`, hoursLeft: 2 });
  const yellowTitle = `Cơm hộp Vàng ${suffix}`;
  const greenTitle = `Bánh mì Xanh ${suffix}`;
  await publishOffer(store, { title: yellowTitle, category: "cooked_meal", hoursLeft: 8 });
  await publishOffer(store, { title: greenTitle, hoursLeft: 20 });
  const charity = await setupCharity();
  await requestViaApi(charity, store.offerId, 5);

  // Cửa hàng demo cùng tên (để cùng khớp ô tìm kiếm) — chỉ hiện khi bật "Gồm dữ liệu demo"
  const demo = await setupStoreOffer({ title: `Bánh mì demo ${suffix}`, hoursLeft: 1 });
  await adminPatch(`organizations?id=eq.${demo.org.id}`, { is_demo: true, name: `${store.org.name} (demo)` });

  const { admin } = await loginAdminWithMfa(page);
  try {
    const q = encodeURIComponent(store.org.name);
    await page.goto(`/admin/offers?q=${q}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Lô hàng");
    await expect(page.getByRole("heading", { name: "Lô đang mở theo nhãn" })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Lô đang mở nhãn Đỏ: \d+$/ })).toBeVisible();

    const rows = page.getByTestId(isWide(page) ? "admin-offer-row" : "admin-offer-card");
    await expect(rows).toHaveCount(3);
    // Đỏ trước (đếm ngược "còn 1 giờ 5x phút"), rồi Vàng, rồi Xanh
    await expect(rows.nth(0)).toContainText(`Bánh mì Đỏ ${suffix}`);
    await expect(rows.nth(0)).toContainText("Nhãn Đỏ");
    await expect(rows.nth(0)).toContainText(/còn 1 giờ \d{2} phút/);
    await expect(rows.nth(0)).toContainText("1 chờ");
    await expect(rows.nth(0)).toContainText(store.org.name);
    await expect(rows.nth(1)).toContainText(yellowTitle);
    await expect(rows.nth(1)).toContainText("Nhãn Vàng");
    await expect(rows.nth(2)).toContainText(greenTitle);
    await expect(rows.nth(2)).toContainText("Nhãn Xanh");
    await expect(page.getByText("Dữ liệu demo", { exact: true })).toHaveCount(0);
    await expect(page.getByText(/Cập nhật lúc \d{2}:\d{2}:\d{2}/)).toBeVisible();
    await expectNoA11yViolations(page, "/admin/offers");
    await shot(page, testInfo, "admin-offers");

    // Lọc nhãn qua URL; chip đang áp dụng có aria-current; bấm thêm chip Đỏ ⇒ Đỏ + Vàng
    await page.goto(`/admin/offers?label=yellow&q=${q}`);
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(yellowTitle);
    const labelNav = page.getByRole("navigation", { name: "Lọc theo nhãn và tình trạng giữ hàng" });
    await expect(labelNav.getByRole("link", { name: /^Nhãn Vàng/ })).toHaveAttribute("aria-current", "true");
    await labelNav.getByRole("link", { name: /^Nhãn Đỏ/ }).click();
    await expect(page).toHaveURL(/label=red%2Cyellow/);
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText(`Bánh mì Đỏ ${suffix}`);
    await expect(rows.nth(1)).toContainText(yellowTitle);

    // Dữ liệu demo: chỉ hiện khi bật, kèm nhãn "Dữ liệu demo"; lô demo còn 1 giờ ⇒ đứng đầu
    await page.goto(`/admin/offers?q=${q}&demo=1`);
    await expect(rows).toHaveCount(4);
    await expect(rows.nth(0)).toContainText(`Bánh mì demo ${suffix}`);
    await expect(rows.nth(0)).toContainText("Dữ liệu demo");

    // Chi tiết lô: phân bổ của tổ chức đang chờ cửa hàng
    await page.goto(`/admin/offers?q=${q}`);
    await rows
      .nth(0)
      .getByRole("link", { name: `Bánh mì Đỏ ${suffix}` })
      .click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Bánh mì Đỏ ${suffix}`);
    const allocation = page.getByTestId("offer-allocation");
    await expect(allocation).toHaveCount(1);
    await expect(allocation).toContainText(charity.org.name);
    await expect(allocation).toContainText("Chờ cửa hàng xác nhận");
    await expect(allocation).toContainText("Đặt 5 ổ");
    await expect(page.getByRole("link", { name: literal(store.org.name) })).toHaveAttribute(
      "href",
      `/admin/reviews/${store.org.id}`,
    );
    await expectNoA11yViolations(page, "/admin/offers/[offerId]");
    await shot(page, testInfo, "admin-offer-detail");
  } finally {
    await revokeAdmin(admin);
  }
});

test("Lô hàng: ô 'Sắp chuyển Đỏ' và bộ lọc rỗng có hướng dẫn", async ({ page }, testInfo) => {
  const suffix = uniqueSuffix();
  // Bánh mì còn 5 giờ ⇒ Vàng, chuyển Đỏ sau 1 giờ (< 3 giờ)
  const store = await setupStoreOffer({ title: `Bánh mì sắp Đỏ ${suffix}`, hoursLeft: 5 });
  const { admin } = await loginAdminWithMfa(page);
  try {
    const q = encodeURIComponent(store.org.name);
    await page.goto(`/admin/offers?soon=1&q=${q}`);
    const rows = page.getByTestId(isWide(page) ? "admin-offer-row" : "admin-offer-card");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Nhãn Vàng");
    await expect(
      page
        .getByRole("navigation", { name: "Lọc theo nhãn và tình trạng giữ hàng" })
        .getByRole("link", { name: /Sắp Đỏ trong 3 giờ/ }),
    ).toHaveAttribute("aria-current", "true");

    await page.goto(`/admin/offers?label=red&q=${q}`);
    await expect(page.getByRole("heading", { name: "Không có lô khớp bộ lọc" })).toBeVisible();
    await page.getByRole("link", { name: "Xóa lọc" }).last().click();
    await expect(page).toHaveURL(/\/admin\/offers$/);
    await expectNoA11yViolations(page, "/admin/offers (sau khi xóa lọc)");
    await shot(page, testInfo, "admin-offers-default");
  } finally {
    await revokeAdmin(admin);
  }
});
