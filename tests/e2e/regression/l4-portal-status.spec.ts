import { expect, test } from "@playwright/test";

import { addMember } from "../fixtures/orgs";
import { createConfirmedUser, createOrgFor, loginAs, type OrgStatus } from "../fixtures/users";

/**
 * Hồi quy L4 (SECURITY-PRIVACY §10.1, P1-12): bản cũ cho tài khoản chờ duyệt/bị từ chối vào cổng.
 * v2: guard yêu cầu `organizations.status = 'approved'` và đúng `kind` + vai trò (đọc từ DB); RLS
 * `is_active_org_member` chặn tiếp ở DB. Test: mọi trạng thái chưa duyệt của cả hai loại tổ chức, kể cả
 * khi gõ thẳng URL trang con (Cài đặt), đều về trang trạng thái; sai loại/sai vai trò không vào được.
 */
const NOT_APPROVED: OrgStatus[] = ["draft", "submitted", "needs_changes", "rejected", "suspended"];

test.describe("L4 — tổ chức chưa duyệt không vào được cổng", () => {
  for (const kind of ["store", "charity"] as const) {
    test(`${kind}: ${NOT_APPROVED.join(", ")} ⇒ trang trạng thái`, async ({ page }) => {
      test.setTimeout(120_000);
      for (const status of NOT_APPROVED) {
        await page.context().clearCookies();
        const user = await createConfirmedUser({ prefix: `l4-${kind}-${status}` });
        const org = await createOrgFor(user, { kind, status });
        await loginAs(page, user);
        for (const path of [`/${kind}`, `/${kind}/settings`, `/${kind}/settings?tab=members`]) {
          await page.goto(path);
          await expect(page, `${status} ${path}`).toHaveURL(new RegExp(`/onboarding/status\\?org=${org.id}`));
        }
        await expect(page.getByRole("heading", { level: 1 })).toHaveText("Trạng thái hồ sơ");
      }
    });
  }

  test("tổ chức đã đóng: không vào cổng (về onboarding)", async ({ page }) => {
    const user = await createConfirmedUser({ prefix: "l4-closed" });
    await createOrgFor(user, { kind: "store", status: "closed" });
    await loginAs(page, user);
    await page.goto("/store/settings");
    await expect(page).not.toHaveURL(/\/store\/settings/);
  });
});

test.describe("L4 — sai loại hoặc sai vai trò", () => {
  test("chủ tổ chức từ thiện không vào cổng Cửa hàng; tình nguyện viên không vào cổng Tổ chức", async ({
    page,
  }) => {
    const owner = await createConfirmedUser({ prefix: "l4-charity-owner" });
    const org = await createOrgFor(owner, { kind: "charity", status: "approved" });
    await loginAs(page, owner);
    await page.goto("/store/settings");
    await expect(page).toHaveURL(/\/onboarding$/);

    await page.context().clearCookies();
    const volunteer = await createConfirmedUser({ prefix: "l4-volunteer" });
    await addMember(org.id, volunteer, "volunteer");
    await loginAs(page, volunteer);
    for (const path of ["/charity", "/charity/settings"]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/onboarding$/);
    }
    await page.goto("/volunteer");
    await expect(page).toHaveURL(/\/volunteer$/);
  });

  test("nhân viên cửa hàng vào cổng nhưng không mở được Cài đặt (US-STO-06 AC2)", async ({ page }) => {
    const owner = await createConfirmedUser({ prefix: "l4-store-owner" });
    const org = await createOrgFor(owner, { kind: "store", status: "approved" });
    const staff = await createConfirmedUser({ prefix: "l4-store-staff" });
    await addMember(org.id, staff, "staff");
    await loginAs(page, staff, "/store");
    await expect(page).toHaveURL(/\/store$/);
    await page.goto("/store/settings?tab=members");
    await expect(page.getByRole("heading", { name: "Bạn chưa có quyền mở Cài đặt" })).toBeVisible();
    await expect(page.getByLabel("Email người được mời")).toHaveCount(0);
  });
});
