import { expect, test } from "@playwright/test";

import { expectNoA11yViolations } from "../fixtures/a11y";
import { createAdminUser, createSubmittedOrg, enrollTotpViaUi, revokeAdmin } from "../fixtures/admin";
import { vnDatePlus } from "../fixtures/orgs";
import { createConfirmedUser, loginAs } from "../fixtures/users";
import { isWide, shot } from "./console-helpers";

/**
 * UAT P1-29 · US-ADM-11 (F-63): "Nhật ký kiểm toán" chỉ đọc — quyết định duyệt hồ sơ hiện tên người duyệt
 * và giờ; lọc theo người, nhóm hành động, loại đối tượng, ngày (giờ VN); mở rộng xem trước/sau.
 * Cùng file: người dùng thường và Admin chưa MFA không vào được các màn mới.
 */

test.describe.configure({ timeout: 150_000 });

test("Nhật ký: quyết định duyệt hồ sơ ghi tên người duyệt và giờ (P1-29)", async ({ page }, testInfo) => {
  const owner = await createConfirmedUser({ prefix: "owner", fullName: "Đặng Thị Kiều" });
  const org = await createSubmittedOrg(owner, { kind: "store" });
  const admin = await createAdminUser("Lê Khánh Kiểm Toán");
  try {
    // requireAdmin chuyển về /admin/mfa không kèm `next` ⇒ mở thẳng trang MFA với `next` là hồ sơ cần duyệt
    await loginAs(page, admin, "/admin/reviews");
    await page.goto(`/admin/mfa?next=/admin/reviews/${org.id}`);
    await enrollTotpViaUi(page);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(org.name, { timeout: 20_000 });

    // Duyệt qua giao diện thật
    await page.getByRole("button", { name: "Duyệt", exact: true }).click();
    const dialog = page.getByRole("alertdialog", { name: `Duyệt hồ sơ ${org.name}?` });
    await dialog.getByRole("button", { name: "Duyệt hồ sơ" }).click();
    await expect(page.getByText(`Đã duyệt hồ sơ ${org.name}.`)).toBeVisible({ timeout: 20_000 });

    // Nhật ký: lọc theo email người duyệt + nhóm "Hồ sơ tổ chức" + hôm nay (giờ VN)
    const today = vnDatePlus(0);
    const [y, m, d] = today.split("-");
    await page.goto(
      `/admin/audit?act=org&type=organization&actor=${encodeURIComponent(admin.email)}&from=${today}&to=${today}`,
    );
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Nhật ký kiểm toán");
    await expect(page.getByLabel("Nhóm hành động")).toHaveValue("org");
    await expect(page.getByLabel("Người thực hiện")).toHaveValue(admin.email);

    const rows = page.getByTestId(isWide(page) ? "audit-row" : "audit-card");
    await expect(rows).toHaveCount(1);
    const row = rows.first();
    await expect(row).toContainText("Duyệt hồ sơ");
    await expect(row).toContainText("org.review");
    await expect(row).toContainText("Lê Khánh Kiểm Toán");
    await expect(row).toContainText("Admin");
    await expect(row).toContainText(new RegExp(`${d}/${m}/${y} \\d{2}:\\d{2}:\\d{2}`));
    await expect(row.getByRole("link", { name: org.name })).toHaveAttribute(
      "href",
      `/admin/reviews/${org.id}`,
    );
    await expect(row.getByRole("link", { name: /^Mở tổ chức / })).toHaveAttribute(
      "href",
      `/admin/reviews/${org.id}`,
    );
    await expectNoA11yViolations(page, "/admin/audit");

    // Mở rộng: dữ liệu sau (đã che khóa nhạy cảm) có quyết định "approve"
    if (isWide(page)) {
      const toggle = row.getByRole("button", { name: /^Chi tiết/ });
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await toggle.click();
      await expect(row.getByRole("button", { name: /^Ẩn/ })).toHaveAttribute("aria-expanded", "true");
    } else {
      await row.getByText("Xem dữ liệu trước / sau").click();
    }
    const detail = page.getByTestId("audit-detail").filter({ visible: true });
    await expect(detail).toHaveCount(1);
    await expect(detail.getByLabel("Dữ liệu sau")).toContainText('"decision": "approve"');
    await expect(detail).toContainText("Mã đối tượng");
    await expect(detail).toContainText(org.id);
    await expectNoA11yViolations(page, "/admin/audit (mở rộng)");
    await shot(page, testInfo, "admin-audit");

    // Lọc rỗng có hướng dẫn + "Xóa lọc"; ngày tương lai không có dòng nào
    const tomorrow = vnDatePlus(1);
    await page.goto(`/admin/audit?actor=${encodeURIComponent(admin.email)}&from=${tomorrow}`);
    await expect(page.getByRole("heading", { name: "Không có dòng nhật ký khớp bộ lọc" })).toBeVisible();

    // Lịch sử của chủ hồ sơ (tạo, gửi duyệt) truy được qua đúng đối tượng
    await page.goto(`/admin/audit?type=organization&id=${org.id}`);
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText("Duyệt hồ sơ");
    await expect(rows.nth(1)).toContainText("Gửi hồ sơ để duyệt");
    await expect(rows.nth(1)).toContainText("Đặng Thị Kiều");
    await expect(rows.nth(2)).toContainText("Tạo hồ sơ nháp");
    await expect(page.getByRole("link", { name: "Bỏ chọn đối tượng" })).toBeVisible();
  } finally {
    await revokeAdmin(admin);
  }
});

test("Người dùng thường nhận 404, Admin chưa MFA bị đưa về /admin/mfa ở các màn giám sát", async ({
  page,
  browser,
}) => {
  const user = await createConfirmedUser({ prefix: "plain" });
  await loginAs(page, user);
  const paths = [
    "/admin/offers",
    "/admin/offers/00000000-0000-4000-8000-000000000000",
    "/admin/allocations",
    "/admin/audit",
  ];
  for (const path of paths) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Không tìm thấy trang");
  }

  const admin = await createAdminUser();
  const ctx = await browser.newContext();
  const adminPage = await ctx.newPage();
  try {
    await loginAs(adminPage, admin, "/admin/offers");
    for (const path of ["/admin/offers", "/admin/allocations", "/admin/audit"]) {
      await adminPage.goto(path);
      await expect(adminPage, path).toHaveURL(/\/admin\/mfa$/, { timeout: 15_000 });
    }
  } finally {
    await ctx.close();
    await revokeAdmin(admin);
  }
});
