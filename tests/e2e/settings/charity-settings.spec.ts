import { expect, test } from "@playwright/test";

import { expectNoA11yViolations } from "../fixtures/a11y";
import { addMember, createSite, seedSensitive } from "../fixtures/orgs";
import { createConfirmedUser, createOrgFor, loginAs, uniqueSuffix } from "../fixtures/users";
import { adminSelect } from "../onboarding/helpers";

/** F-11, US-CHA-02 AC2, US-CHA-37, US-STO-06 AC2: Cài đặt tổ chức + quyền theo vai trò. */
test.describe("Cài đặt tổ chức (F-11)", () => {
  test.setTimeout(150_000);

  test("sửa bán kính điểm nhận; tạm ngưng nhận donation", async ({ page }) => {
    const owner = await createConfirmedUser({ prefix: "settings-charity", fullName: "Võ Thị Hạnh" });
    const org = await createOrgFor(owner, {
      kind: "charity",
      status: "approved",
      name: `Bếp ăn Nắng Mai ${uniqueSuffix()}`,
    });
    await seedSensitive(org.id, { legal_name: "Bếp ăn Nắng Mai", contact_phone: "0901234567" });
    const site = await createSite(org.id, { name: "Bếp chính" });

    await loginAs(page, owner, "/charity/settings?tab=sites");
    const card = page.getByRole("article", { name: "Bếp chính" });
    await expect(card.getByText("5 km")).toBeVisible();
    await expect(card.getByText("Công khai vị trí chính xác")).toBeVisible();
    await expectNoA11yViolations(page, "/charity/settings?tab=sites");

    await card.getByRole("button", { name: /Sửa thông tin điểm/ }).click();
    await expect(card.getByRole("combobox", { name: /Tìm địa chỉ/ })).toBeVisible();
    await card.getByLabel("Bán kính phục vụ (km)").fill("8");
    await card.getByRole("radio", { name: /Chỉ hiện vùng gần đúng/ }).check();
    await card.getByRole("button", { name: "Lưu điểm" }).click();
    await expect(page.getByText("Đã lưu điểm “Bếp chính”.")).toBeVisible();
    await expect(card.getByText("8 km")).toBeVisible();
    await expect(card.getByText("Chỉ hiện vùng gần đúng (~500 m)")).toBeVisible();
    const [saved] = await adminSelect<{ radius_km: number; visibility: string }[]>(
      `sites?select=radius_km,visibility&id=eq.${site.id}`,
    );
    expect(Number(saved!.radius_km)).toBe(8);
    expect(saved!.visibility).toBe("approximate");

    // Tạm ngưng nhận donation (US-CHA-37)
    await page
      .getByRole("navigation", { name: "Các mục cài đặt" })
      .getByRole("link", { name: "Tạm ngưng" })
      .click();
    await expect(page).toHaveURL(/\/charity\/settings\?tab=pause$/);
    await expect(page.getByText("Tổ chức đang nhận donation bình thường.")).toBeVisible();
    await page.getByRole("button", { name: "Tạm ngưng nhận donation" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Tạm ngưng", exact: true }).click();
    await expect(page.getByText("Đang tạm ngưng nhận donation").first()).toBeVisible();
    const [paused] = await adminSelect<{ is_paused: boolean }[]>(
      `organizations?select=is_paused&id=eq.${org.id}`,
    );
    expect(paused!.is_paused).toBe(true);
  });

  test("nhân viên không mở được Cài đặt; quản lý không đổi được quyền thành viên", async ({ page }) => {
    const owner = await createConfirmedUser({ prefix: "charity-owner" });
    const org = await createOrgFor(owner, { kind: "charity", status: "approved" });
    await seedSensitive(org.id, { legal_name: "Tổ chức thử" });
    await createSite(org.id, { name: "Bếp chính" });

    const staff = await createConfirmedUser({ prefix: "charity-staff", fullName: "Trần Văn Bếp" });
    await addMember(org.id, staff, "staff");
    await loginAs(page, staff, "/charity/settings?tab=members");
    await expect(page.getByRole("heading", { name: "Bạn chưa có quyền mở Cài đặt" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Các mục cài đặt" })).toHaveCount(0);
    await expect(page.getByLabel("Email người được mời")).toHaveCount(0);
    await expectNoA11yViolations(page, "/charity/settings (nhân viên)");

    // Quản lý: mời được nhưng không thấy "Sửa quyền"/"Gỡ" và không mời được chủ sở hữu
    await page.context().clearCookies();
    const manager = await createConfirmedUser({ prefix: "charity-manager", fullName: "Lê Thị Quản" });
    await addMember(org.id, manager, "manager");
    await loginAs(page, manager, "/charity/settings?tab=members");
    await expect(page.getByLabel("Email người được mời")).toBeVisible();
    await expect(page.getByRole("radio", { name: /Chủ sở hữu/ })).toHaveCount(0);
    await expect(page.getByRole("radio", { name: /Tình nguyện viên/ })).toHaveCount(1);
    await expect(page.getByText("Chỉ chủ sở hữu đổi được vai trò hoặc gỡ thành viên.")).toBeVisible();
    await expect(page.getByRole("button", { name: /Sửa quyền/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Gỡ/ })).toHaveCount(0);
  });
});
