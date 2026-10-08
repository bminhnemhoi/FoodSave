import { expect, test } from "@playwright/test";

import { adminSelect, expectSaved, startWizard } from "../onboarding/helpers";

/**
 * Hồi quy L5 (SECURITY-PRIVACY §10.1, P1-12): bản cũ tạo 2 dòng `stores` khi đăng ký (trigger + client).
 * v2: trigger chỉ tạo `profiles`; tổ chức tạo bằng RPC idempotent `create_organization` (pgTAP
 * `rpc/create_organization.test.sql`); wizard dùng lại bản nháp đang có. Test luồng thật: tự lưu nhiều lần,
 * mở tab thứ hai (form cũ chưa biết orgId), quay lại /onboarding ⇒ vẫn đúng MỘT hồ sơ cửa hàng.
 */
test.describe("L5 — một chủ tài khoản chỉ có một hồ sơ cửa hàng nháp", () => {
  test.setTimeout(120_000);

  test("tự lưu nhiều lần + tab thứ hai ⇒ vẫn 1 tổ chức", async ({ page, context }) => {
    const user = await startWizard(page, "store");

    // Tab 2 mở wizard TRƯỚC khi tab 1 lưu (chưa có orgId)
    const second = await context.newPage();
    await second.goto("/onboarding/store/basics");
    await expect(second.getByRole("heading", { level: 1 })).toHaveText("Thông tin cơ bản");

    await page.getByLabel("Tên cửa hàng").fill("Tiệm bánh Một Hồ Sơ");
    await page.getByRole("radio", { name: "Tiệm bánh" }).check();
    await expectSaved(page);
    await page.getByLabel("Mô tả ngắn").fill("Lưu lần hai.");
    await expectSaved(page);

    // Tab 2 lưu sau ⇒ dùng lại bản nháp của tab 1, không tạo hồ sơ mới
    await second.getByLabel("Tên cửa hàng").fill("Tiệm bánh Một Hồ Sơ (tab 2)");
    await second.getByRole("radio", { name: "Tiệm bánh" }).check();
    await expectSaved(second);

    const orgs = await adminSelect<{ id: string; name: string; status: string }[]>(
      `organizations?select=id,name,status&created_by=eq.${user.id}&kind=eq.store`,
    );
    expect(orgs).toHaveLength(1);
    expect(orgs[0]!.name).toBe("Tiệm bánh Một Hồ Sơ (tab 2)");

    // Quay lại trang bắt đầu: chỉ thấy "Mở hồ sơ cửa hàng", không tạo thêm
    await page.goto("/onboarding");
    await expect(page.getByRole("link", { name: "Mở hồ sơ cửa hàng" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Đăng ký cửa hàng" })).toHaveCount(0);
    await page.getByRole("link", { name: "Mở hồ sơ cửa hàng" }).click();
    await expect(page.getByLabel("Tên cửa hàng")).toHaveValue("Tiệm bánh Một Hồ Sơ (tab 2)");
    const again = await adminSelect<unknown[]>(
      `organizations?select=id&created_by=eq.${user.id}&kind=eq.store`,
    );
    expect(again).toHaveLength(1);
    const members = await adminSelect<{ role: string }[]>(
      `org_members?select=role&user_id=eq.${user.id}&org_id=eq.${orgs[0]!.id}`,
    );
    expect(members).toEqual([{ role: "owner" }]);
  });
});
