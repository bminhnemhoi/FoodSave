import { expect, test } from "@playwright/test";

import { literal } from "../charity/helpers";
import { expectNoA11yViolations } from "../fixtures/a11y";
import { loginAs, uniqueSuffix } from "../fixtures/users";
import { addVolunteer, confirmedLot, setupCharity, shot } from "./helpers";

/**
 * Trang Tình nguyện viên (PRD US-CHA-14, US-CHA-15; ROADMAP P3-08 phía điều phối): danh sách với phương tiện,
 * sức chở, khu vực gần đúng, đồng ý vị trí; mời qua email và thu hồi lời mời; tạm ngưng ⇒ không được chọn khi
 * lập chuyến (US-CHA-15 AC2).
 */

test.describe("Điều phối — tình nguyện viên", () => {
  test("xem danh sách, mời và thu hồi lời mời, tạm ngưng một TNV", async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const charity = await setupCharity("owner");
    const suffix = charity.org.name.split(" ").at(-1)!;
    await addVolunteer(charity, {
      name: `Lan Anh ${suffix}`,
      base: { lat: 10.78, lng: 106.7 },
      capacityKg: 15,
      area: "Phường Bến Thành",
    });
    await confirmedLot(charity, {
      at: { lat: 10.7801, lng: 106.6992 },
      title: `Bánh mì TNV ${suffix}`,
      qty: 4,
    });

    await loginAs(page, charity.user, "/charity/volunteers");
    await page.goto("/charity/volunteers");
    await expect(page.getByRole("heading", { level: 1, name: "Tình nguyện viên" })).toBeVisible();
    const card = page.getByRole("article", { name: literal(`Lan Anh ${suffix}`) });
    await expect(card).toContainText("Xe máy");
    await expect(card).toContainText("Chở tối đa 15 kg");
    await expect(card).toContainText("Phường Bến Thành (gần đúng)");
    await expect(card).toContainText("Chỉ check-in tại điểm dừng");
    await expect(card).toContainText("Sẵn sàng");
    await expectNoA11yViolations(page, "tình nguyện viên");
    await shot(page, testInfo, "volunteers");

    // Mời qua email ⇒ lời mời đang chờ ⇒ thu hồi
    const email = `e2e.vol.invite.${uniqueSuffix()}@example.com`;
    await page.getByRole("button", { name: "Mời tình nguyện viên" }).first().click();
    const invite = page.getByRole("dialog", { name: "Mời tình nguyện viên" });
    await invite.getByLabel("Email người được mời").fill(email);
    await invite.getByRole("button", { name: "Gửi lời mời" }).click();
    const invitations = page.getByRole("region", { name: /Lời mời đang chờ/ });
    const row = invitations.getByRole("listitem", { name: email });
    await expect(row).toContainText("Đã mời", { timeout: 30_000 });
    await row.getByRole("button", { name: /Thu hồi/ }).click();
    const confirm = page.getByRole("alertdialog", { name: "Thu hồi lời mời?" });
    await confirm.getByRole("button", { name: "Thu hồi lời mời" }).click();
    await expect(invitations.getByRole("listitem", { name: email })).toHaveCount(0, { timeout: 30_000 });

    // Tạm ngưng qua ngăn chi tiết
    await card.getByRole("button", { name: "Xem chi tiết" }).click();
    const drawer = page.getByRole("dialog", { name: literal(`Lan Anh ${suffix}`) });
    await expect(drawer).toContainText("Phường Bến Thành — vị trí gần đúng khoảng 1 km");
    await drawer.getByLabel("Lý do (không bắt buộc)").fill("Đang thi học kỳ");
    await shot(page, testInfo, "volunteer-drawer");
    await drawer.getByRole("button", { name: "Tạm ngưng" }).click();
    await expect(drawer).toContainText("Tạm ngưng từ", { timeout: 30_000 });
    await expect(drawer).toContainText("Lý do: Đang thi học kỳ");
    await page.keyboard.press("Escape");
    await expect(card).toContainText("Tạm ngưng");

    // Lập chuyến: TNV tạm ngưng không chọn được
    await page.goto("/charity/pickups");
    const planner = page.getByRole("region", { name: `Giao về ${charity.site.name}` });
    await planner.getByRole("radio", { name: "Tình nguyện viên" }).click();
    await expect(planner.getByRole("checkbox", { name: literal(`Lan Anh ${suffix}`) })).toBeDisabled();
    await expect(planner).toContainText("Đang tạm ngưng");
  });
});
