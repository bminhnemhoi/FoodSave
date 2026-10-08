import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { uniqueEmail } from "../fixtures/mailpit";
import { addMember, createSite, inviteViaApi, seedSensitive, vnDatePlus } from "../fixtures/orgs";
import { createConfirmedUser, createOrgFor, loginAs, uniqueSuffix } from "../fixtures/users";
import { clickNext, expectSaved, pickLocationBySearch, startWizard } from "../onboarding/helpers";

/**
 * Ảnh chụp Cài đặt (P1-06), thành viên, trang nhận lời mời và ô giờ 24 giờ để rà bằng mắt (skill ui-screen §3):
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
    await page.screenshot({ path: path.join(DIR!, `p1close-${name}-${suffix}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

test.describe("Ảnh chụp Cài đặt, thành viên, lời mời", () => {
  test.skip(!DIR, "Đặt E2E_SCREENSHOT_DIR để chụp ảnh");
  test.setTimeout(300_000);
  test.beforeEach(async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "Chỉ chạy một lần (project desktop)");
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("cửa hàng: các tab Cài đặt", async ({ page, browser }) => {
    const owner = await createConfirmedUser({ prefix: "shot-owner", fullName: "Nguyễn Thị Thu Lan" });
    const org = await createOrgFor(owner, { kind: "store", status: "approved", name: "Tiệm bánh Hạt Lúa" });
    await seedSensitive(org.id, {
      legal_name: "Hộ kinh doanh Hạt Lúa",
      tax_code: "0312345678",
      representative_name: "Nguyễn Thị Thu Lan",
      representative_title: "Chủ hộ kinh doanh",
      contact_email: "lien.he@hatlua.vn",
      contact_phone: "0901234567",
    });
    await createSite(org.id, { name: "Chi nhánh Bến Thành" });
    await createSite(org.id, { name: "Chi nhánh Gia Định", lat: 10.8, lng: 106.69, primary: false });
    const staff = await createConfirmedUser({ prefix: "shot-staff", fullName: "Trần Minh Ca Tối" });
    await addMember(org.id, staff, "staff");
    await inviteViaApi(owner, org.id, uniqueEmail("e2e.shot.invite"), "staff");

    await loginAs(page, owner, "/store/settings");
    await expect(page.getByLabel("Tên cửa hàng")).toBeVisible();
    await shoot(page, "settings-profile");

    await page.getByRole("button", { name: "Đề nghị sửa thông tin pháp lý" }).click();
    await page.getByLabel("Tên pháp lý").fill("Công ty TNHH Hạt Lúa");
    await page.getByLabel("Lý do thay đổi").fill("Chuyển từ hộ kinh doanh sang công ty TNHH.");
    await page.getByRole("button", { name: "Gửi đề nghị" }).click();
    await expect(page.getByText("Đề nghị sửa thông tin pháp lý đang chờ FoodSave duyệt")).toBeVisible();
    await page.getByRole("heading", { name: "Thông tin pháp lý" }).scrollIntoViewIfNeeded();
    await shoot(page, "settings-legal-pending");

    await page.goto("/store/settings?tab=sites");
    const card = page.getByRole("article", { name: "Chi nhánh Bến Thành" });
    await card.getByRole("checkbox", { name: "Mở cả ngày, mọi ngày (24/7)" }).uncheck();
    await card.getByLabel("Thứ Bảy: giờ kết thúc").fill("0200");
    await card.getByRole("checkbox", { name: "Thứ Bảy: qua nửa đêm" }).check();
    await card.getByRole("button", { name: "Lưu giờ hoạt động" }).click();
    await expect(page.getByText("Đã lưu giờ hoạt động.")).toBeVisible();
    const date = vnDatePlus(3);
    await card
      .getByRole("gridcell")
      .getByRole("button", { name: new RegExp(`, ${date.slice(8, 10)}/${date.slice(5, 7)}/`) })
      .first()
      .click();
    await card.getByLabel("Ghi chú (không bắt buộc)").fill("Nghỉ sửa lò nướng");
    await card.getByRole("button", { name: "Đánh dấu ngày nghỉ" }).click();
    await expect(card.getByRole("region", { name: /Ngày nghỉ sắp tới \(1\)/ })).toBeVisible();
    await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 15_000 }); // ảnh không dính toast
    await shoot(page, "settings-sites-hours-24h");

    // Lỗi giờ ở ô 24 giờ
    await card.getByLabel("Thứ Hai: giờ kết thúc").fill("0600");
    await expect(card.getByText("Giờ kết thúc phải sau giờ bắt đầu, hoặc chọn “Qua nửa đêm”.")).toBeVisible();
    await card.getByLabel("Thứ Hai: giờ kết thúc").scrollIntoViewIfNeeded();
    await shoot(page, "settings-hours-error");

    await page.goto("/store/settings?tab=members");
    await expect(page.getByRole("heading", { name: "Mời nhân viên" })).toBeVisible();
    await page.getByRole("radio", { name: "Chỉ một số điểm" }).check();
    await shoot(page, "settings-members");

    await page
      .getByRole("listitem", { name: "Trần Minh Ca Tối" })
      .getByRole("button", { name: /Sửa quyền/ })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await shoot(page, "settings-members-edit-dialog");
    await page.keyboard.press("Escape");

    await page.goto("/store/settings?tab=pause");
    await shoot(page, "settings-pause");

    // Nhân viên: không có quyền
    const ctx = await browser.newContext({ locale: "vi-VN", timezoneId: "Asia/Ho_Chi_Minh" });
    const staffPage = await ctx.newPage();
    await loginAs(staffPage, staff, "/store/settings");
    await expect(staffPage.getByRole("heading", { name: "Bạn chưa có quyền mở Cài đặt" })).toBeVisible();
    await shoot(staffPage, "settings-staff-no-access");
    await ctx.close();
  });

  test("tổ chức: điểm nhận, sửa điểm", async ({ page }) => {
    const owner = await createConfirmedUser({ prefix: "shot-charity", fullName: "Võ Thị Hạnh" });
    const org = await createOrgFor(owner, { kind: "charity", status: "approved", name: "Bếp ăn Nắng Mai" });
    await seedSensitive(org.id, { legal_name: "Bếp ăn Nắng Mai", registration_no: "QĐ 12/2019" });
    await createSite(org.id, { name: "Bếp chính" });
    await loginAs(page, owner, "/charity/settings?tab=sites");
    await expect(page.getByRole("article", { name: "Bếp chính" })).toBeVisible();
    await shoot(page, "charity-sites");
    await page.getByRole("button", { name: /Sửa thông tin điểm/ }).click();
    await expect(page.getByRole("region", { name: /Bản đồ chọn vị trí/ })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(".maplibregl-canvas")).toBeVisible({ timeout: 20_000 });
    await shoot(page, "charity-site-edit");
  });

  test("trang nhận lời mời", async ({ page }) => {
    const owner = await createConfirmedUser({ prefix: "shot-inv-owner" });
    const org = await createOrgFor(owner, { kind: "charity", status: "approved" });
    const invitee = await createConfirmedUser({ prefix: "shot-invitee", fullName: "Lê Minh Khoa" });
    const { token } = await inviteViaApi(owner, org.id, invitee.email, "volunteer");
    await page.goto(`/invite/${token}`);
    await shoot(page, "invite-anonymous");
    await loginAs(page, invitee, `/invite/${token}`);
    await shoot(page, "invite-signed-in");
    const other = await createConfirmedUser({ prefix: "shot-other" });
    const wrong = await inviteViaApi(owner, org.id, uniqueEmail(`e2e.wrong.${uniqueSuffix()}`), "staff");
    await page.context().clearCookies();
    await loginAs(page, other, `/invite/${wrong.token}`);
    await page.getByRole("button", { name: "Nhận lời mời" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "địa chỉ email khác" })).toBeVisible();
    await shoot(page, "invite-email-mismatch");
  });

  test("wizard: ô giờ 24 giờ ở bước địa điểm", async ({ page }) => {
    await startWizard(page, "store");
    await page.getByLabel("Tên cửa hàng").fill("Tiệm bánh Hạt Lúa");
    await page.getByRole("radio", { name: "Tiệm bánh" }).check();
    await page.getByLabel("Số điện thoại liên hệ").fill("0901234567");
    await expectSaved(page);
    await clickNext(page);
    await pickLocationBySearch(page, "Chợ Bến Thành");
    await page.getByLabel("Thứ Bảy: giờ kết thúc").fill("0200");
    await page.getByRole("checkbox", { name: "Thứ Bảy: qua nửa đêm" }).check();
    await page.getByRole("heading", { name: "Giờ mở cửa", exact: true }).scrollIntoViewIfNeeded();
    await shoot(page, "wizard-hours-24h");
  });
});
