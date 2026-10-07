import { expect, test } from "@playwright/test";

import { expectNoA11yViolations } from "../fixtures/a11y";
import {
  createAdminUser,
  createSubmittedOrg,
  enrollTotpViaUi,
  freshCode,
  passwordToken,
  reviewViaRest,
  revokeAdmin,
} from "../fixtures/admin";
import { createConfirmedUser, loginAs } from "../fixtures/users";

/**
 * P1-10 · US-ADM-01 (F-62): Admin bắt buộc TOTP. aal1 không vào được console, cũng không gọi được RPC duyệt.
 */

// Các test này đăng ký/nhập TOTP: có thể phải chờ sang chu kỳ 30 s mới (freshCode) ⇒ cho 90 s mỗi test.
test.describe.configure({ timeout: 90_000 });

test.describe("Admin MFA (TOTP)", () => {
  test("admin chưa có MFA: /admin/reviews → /admin/mfa, đăng ký TOTP rồi vào hàng đợi; lần sau nhập mã", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const admin = await createAdminUser("Phạm Quốc Huy");
    try {
      await loginAs(page, admin, "/admin/reviews");
      await expect(page).toHaveURL(/\/admin\/mfa$/, { timeout: 15_000 });
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Xác thực hai lớp");
      await expect(page.getByRole("heading", { name: "Thêm FoodSave vào ứng dụng" })).toBeVisible();

      // Console vẫn bị chặn ở aal1, kể cả trang chi tiết
      await page.goto("/admin/organizations");
      await expect(page).toHaveURL(/\/admin\/mfa$/, { timeout: 15_000 });

      // QR + khóa bí mật hiện sau khi bấm "Tạo mã QR"
      await page.getByRole("button", { name: "Tạo mã QR" }).click();
      await expect(page.getByRole("img", { name: /Mã QR/ })).toBeVisible({ timeout: 20_000 });
      await expectNoA11yViolations(page, "/admin/mfa (đăng ký)");

      // Mã sai ⇒ lỗi tại trường, không vào được
      await page.getByLabel("Mã xác thực 6 số").fill("000000");
      await page.getByRole("button", { name: "Xác nhận và vào khu vực quản trị" }).click();
      await expect(page.getByText(/Mã chưa đúng/)).toBeVisible({ timeout: 20_000 });
      await expect(page).toHaveURL(/\/admin\/mfa$/, { timeout: 15_000 });

      const secret = ((await page.getByTestId("mfa-secret").textContent()) ?? "").replace(/\s+/g, "");
      const first = await freshCode(secret);
      await page.getByLabel("Mã xác thực 6 số").fill(first.code);
      await page.getByRole("button", { name: "Xác nhận và vào khu vực quản trị" }).click();
      await expect(page).toHaveURL((u) => u.pathname === "/admin/reviews", { timeout: 20_000 });
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hàng đợi duyệt");

      // Phiên aal2: /admin/mfa tự quay về hàng đợi, console mở
      await page.goto("/admin/mfa");
      await expect(page).toHaveURL(/\/admin\/reviews$/, { timeout: 15_000 });
      await page.goto("/admin/organizations");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tổ chức");

      // Đăng xuất rồi đăng nhập lại ⇒ thử thách (không đăng ký lại)
      await page.context().clearCookies();
      await loginAs(page, admin, "/admin");
      await expect(page).toHaveURL(/\/admin\/mfa$/, { timeout: 15_000 });
      await expect(page.getByRole("heading", { name: "Nhập mã xác thực" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Tạo mã QR" })).toHaveCount(0);
      await expectNoA11yViolations(page, "/admin/mfa (thử thách)");

      const second = await freshCode(secret, first.at);
      await page.getByLabel("Mã xác thực 6 số").fill(second.code);
      await page.getByRole("button", { name: "Xác thực" }).click();
      await expect(page).toHaveURL((u) => u.pathname === "/admin/reviews", { timeout: 20_000 });
    } finally {
      await revokeAdmin(admin);
    }
  });

  test("đăng xuất ngay từ trang MFA", async ({ page }) => {
    const admin = await createAdminUser();
    try {
      await loginAs(page, admin, "/admin");
      await expect(page).toHaveURL(/\/admin\/mfa$/, { timeout: 15_000 });
      await page.getByRole("button", { name: "Đăng xuất" }).click();
      await expect(page).toHaveURL(/\/login/);
      await page.goto("/admin");
      await expect(page).toHaveURL(/\/login\?next=%2Fadmin$/);
    } finally {
      await revokeAdmin(admin);
    }
  });

  test("admin aal1 gọi RPC duyệt trực tiếp (bỏ qua UI) bị DB từ chối: mfa_required", async () => {
    const owner = await createConfirmedUser({ prefix: "owner", fullName: "Trần Thị Mai" });
    const org = await createSubmittedOrg(owner);
    const admin = await createAdminUser();
    try {
      const token = await passwordToken(admin); // phiên aal1
      const res = await reviewViaRest(token, org.id);
      expect(res.status).toBe(403);
      expect(res.body.message).toBe("mfa_required");
    } finally {
      await revokeAdmin(admin);
    }
  });

  test("người dùng thường: mọi trang /admin trả 404 (không lộ khu vực quản trị)", async ({ page }) => {
    const user = await createConfirmedUser({ prefix: "plain" });
    await loginAs(page, user);
    for (const path of ["/admin", "/admin/reviews", "/admin/mfa", "/admin/organizations"]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(404);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Không tìm thấy trang");
    }
  });
});

test.describe("Admin MFA — đăng ký nhanh dùng cho test khác", () => {
  test("enrollTotpViaUi đưa admin tới đúng trang next", async ({ page }) => {
    const admin = await createAdminUser();
    try {
      await loginAs(page, admin, "/admin/organizations");
      await page.goto("/admin/mfa?next=/admin/organizations");
      await enrollTotpViaUi(page);
      await expect(page).toHaveURL((u) => u.pathname === "/admin/organizations", { timeout: 20_000 });
      // next ngoài /admin bị bỏ qua (chống open redirect)
      await page.goto("/admin/mfa?next=https://evil.example");
      await expect(page).toHaveURL(/\/admin\/reviews$/, { timeout: 15_000 });
    } finally {
      await revokeAdmin(admin);
    }
  });
});
