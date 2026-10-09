import { expect, test } from "@playwright/test";

import { requestViaApi, setupCharity, setupStoreOffer } from "../charity/helpers";
import { expectNoA11yViolations } from "../fixtures/a11y";
import { loginAdminWithMfa, revokeAdmin } from "../fixtures/admin";
import { adminPatch } from "../fixtures/orgs";
import { uniqueSuffix } from "../fixtures/users";
import { isWide, shot } from "./console-helpers";

/**
 * UAT P2-12 · US-ADM-07 (F-65): "Phân bổ & chuyến" — tổ chức nhận từ cửa hàng nào, số lượng, trạng thái,
 * chuyến; lọc nhanh "chờ cửa hàng quá 1 giờ" và "chuyến đang chạy".
 */

test.describe.configure({ timeout: 150_000 });

test("Phân bổ: yêu cầu chờ quá 1 giờ hiện trong lọc nhanh, yêu cầu mới thì không", async ({
  page,
}, testInfo) => {
  const suffix = uniqueSuffix();
  const store = await setupStoreOffer({ title: `Bánh mì chờ lâu ${suffix}`, hoursLeft: 6, quantity: 30 });
  const charity = await setupCharity();
  const staleId = await requestViaApi(charity, store.offerId, 8);
  const freshId = await requestViaApi(charity, store.offerId, 4);
  // Dựng trạng thái "đã chờ 90 phút" bằng service role (hạn giữ chỗ reserved_until vẫn ở tương lai)
  await adminPatch(`allocations?id=eq.${staleId}`, {
    requested_at: new Date(Date.now() - 90 * 60_000).toISOString(),
  });

  const { admin } = await loginAdminWithMfa(page);
  try {
    await page.goto("/admin/allocations");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Phân bổ & chuyến");
    const quickNav = page.getByRole("navigation", { name: "Lọc nhanh" });
    const staleChip = quickNav.getByRole("link", { name: /Chờ cửa hàng quá 1 giờ/ });
    await expect(staleChip).toContainText(/giờ: ?[1-9]\d*/);
    await staleChip.click();
    await expect(page).toHaveURL(/quick=stale/);
    await expect(staleChip).toHaveAttribute("aria-current", "true");

    const rows = page.getByTestId(isWide(page) ? "admin-allocation-row" : "admin-allocation-card");
    // Phân bổ cụ thể: có trong "chờ quá 1 giờ" (lọc thêm theo id để không phụ thuộc dữ liệu của test khác)
    await page.goto(`/admin/allocations?quick=stale&id=${staleId}`);
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(charity.org.name);
    await expect(rows.first()).toContainText(store.org.name);
    await expect(rows.first()).toContainText(`Bánh mì chờ lâu ${suffix}`);
    await expect(rows.first()).toContainText("Chờ cửa hàng xác nhận");
    await expect(rows.first()).toContainText(/Đã chờ 1 giờ 3\d phút/);
    await expect(rows.first()).toContainText("Đặt 8 ổ");
    await expect(rows.first()).toContainText("Chưa lên chuyến");
    await expectNoA11yViolations(page, "/admin/allocations?quick=stale");
    await shot(page, testInfo, "admin-allocations-stale");

    // Yêu cầu vừa gửi: không thuộc "chờ quá 1 giờ" nhưng có trong danh sách chung
    await page.goto(`/admin/allocations?quick=stale&id=${freshId}`);
    await expect(page.getByRole("heading", { name: "Không có yêu cầu nào chờ quá 1 giờ" })).toBeVisible();
    await page.goto(`/admin/allocations?id=${freshId}`);
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Đặt 4 ổ");

    // Liên kết sang lô và nhật ký của phân bổ
    await expect(rows.first().getByRole("link", { name: `Bánh mì chờ lâu ${suffix}` })).toHaveAttribute(
      "href",
      `/admin/offers/${store.offerId}`,
    );
    await expect(rows.first().getByRole("link", { name: "Nhật ký" })).toHaveAttribute(
      "href",
      `/admin/audit?type=allocation&id=${freshId}`,
    );

    // Trang mặc định có đủ bộ lọc trạng thái; "Chuyến đang chạy" chỉ hiện phân bổ của chuyến đang thực hiện
    await page.goto("/admin/allocations?quick=running");
    await expect(quickNav.getByRole("link", { name: /Chuyến đang chạy/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
    const running = await rows.count();
    for (let i = 0; i < Math.min(running, 5); i++) {
      await expect(rows.nth(i)).toContainText("Đang thực hiện");
    }
    if (running === 0) {
      await expect(page.getByRole("heading", { name: "Không có chuyến nào đang chạy" })).toBeVisible();
    }
    await page.goto("/admin/allocations");
    await expect(page.getByRole("navigation", { name: "Lọc theo trạng thái" }).getByRole("link")).toHaveCount(
      9,
    );
    await expectNoA11yViolations(page, "/admin/allocations");
    await shot(page, testInfo, "admin-allocations");
  } finally {
    await revokeAdmin(admin);
  }
});
