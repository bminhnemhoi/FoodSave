import { expect, test, type Page } from "@playwright/test";

import { expectNoA11yViolations } from "../fixtures/a11y";
import {
  anonKey,
  createSubmittedOrg,
  jwtPayload,
  loginAdminWithMfa,
  revokeAdmin,
  waitForEmailSubject,
} from "../fixtures/admin";
import { createConfirmedUser, createOrgFor, loginAs, SUPABASE_URL } from "../fixtures/users";

/**
 * P1-09 · US-ADM-02..04 (F-61), hồi quy L9: hàng đợi duyệt, xem giấy tờ bằng signed URL 60 s,
 * duyệt / yêu cầu bổ sung có lý do, email cho chủ hồ sơ, chủ hồ sơ vào được cổng.
 */

async function openFromQueue(page: Page, orgName: string) {
  await page.goto(`/admin/reviews?q=${encodeURIComponent(orgName)}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hàng đợi duyệt");
  const link = page.getByRole("link", { name: orgName, exact: true });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(orgName);
}

// Các test này đăng ký/nhập TOTP: có thể phải chờ sang chu kỳ 30 s mới (freshCode) ⇒ cho 90 s mỗi test.
test.describe.configure({ timeout: 90_000 });

test.describe("Hàng đợi duyệt hồ sơ", () => {
  test("duyệt hồ sơ: xem giấy tờ (signed URL 60 s), duyệt, email tới chủ hồ sơ, chủ hồ sơ vào /store", async ({
    page,
    browser,
    request,
  }) => {
    test.setTimeout(150_000);
    const owner = await createConfirmedUser({ prefix: "owner", fullName: "Nguyễn Thị Thu Lan" });
    const org = await createSubmittedOrg(owner, { kind: "store" });
    const { admin } = await loginAdminWithMfa(page);
    try {
      // Hàng đợi: hồ sơ hiện với loại, phường, số giấy tờ, thời gian chờ
      await page.goto(`/admin/reviews?q=${encodeURIComponent(org.name)}`);
      const statusNav = page.getByRole("navigation", { name: "Lọc theo trạng thái" });
      await expect(statusNav.getByRole("link", { name: /^Chờ duyệt/ })).toHaveAttribute(
        "aria-current",
        "page",
      );
      await expect(
        page
          .getByText(/Phường Sài Gòn/)
          .filter({ visible: true })
          .first(),
      ).toBeVisible();
      await expect(
        page
          .getByText(/Chờ dưới 1 ngày/)
          .filter({ visible: true })
          .first(),
      ).toBeVisible();
      await expectNoA11yViolations(page, "/admin/reviews");

      await openFromQueue(page, org.name);
      await expect(page.getByText("•••• •••• 4821")).toBeVisible();
      await expect(page.getByRole("region", { name: /Bản đồ vị trí/ })).toBeVisible();
      await expect(page.getByText("Gửi hồ sơ để duyệt")).toBeVisible(); // lịch sử audit
      await expect(page.getByText("Điều khoản sử dụng và cam kết an toàn thực phẩm")).toBeVisible();
      await expectNoA11yViolations(page, "/admin/reviews/[orgId]");

      // PDF: mở tab mới tới signed URL có token, TTL 60 s; tệp tải được, URL public bị chặn
      const signedRequest = page
        .context()
        .waitForEvent("request", (r) => r.url().includes("/object/sign/kyc/"));
      await page.getByRole("button", { name: "Xem Giấy phép kinh doanh" }).click();
      const signedUrl = (await signedRequest).url();
      const token = new URL(signedUrl).searchParams.get("token");
      expect(token, "signed URL phải có token").toBeTruthy();
      const claims = jwtPayload(token!);
      expect((claims.exp ?? 0) - (claims.iat ?? 0)).toBe(60);
      expect((await request.get(signedUrl)).status()).toBe(200);
      const pdfPath = org.documents.find((d) => d.mime === "application/pdf")!.path;
      const publicRes = await request.get(`${SUPABASE_URL}/storage/v1/object/public/kyc/${pdfPath}`, {
        headers: { apikey: anonKey() },
      });
      expect(publicRes.ok(), "bucket kyc không được truy cập công khai (B4)").toBe(false);
      await expect(page.getByText(/Đã mở ở tab mới/)).toBeVisible();
      for (const p of page.context().pages()) if (p !== page) await p.close();

      // Ảnh: xem ngay trong trang qua signed URL
      await page.getByRole("button", { name: "Xem Giấy chứng nhận an toàn thực phẩm" }).click();
      const img = page.getByRole("img", { name: `Giấy chứng nhận an toàn thực phẩm của ${org.name}` });
      await expect(img).toBeVisible({ timeout: 20_000 });
      expect(await img.getAttribute("src")).toContain("token=");
      await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);

      // Duyệt
      await page.getByRole("button", { name: "Duyệt", exact: true }).click();
      const dialog = page.getByRole("alertdialog", { name: `Duyệt hồ sơ ${org.name}?` });
      await expect(dialog).toBeVisible();
      await expectNoA11yViolations(page, "hộp thoại duyệt");
      await dialog.getByRole("button", { name: "Duyệt hồ sơ" }).click();
      await expect(page.getByText(`Đã duyệt hồ sơ ${org.name}.`)).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole("heading", { name: "Quyết định" })).toBeVisible();
      await expect(page.getByText("Duyệt hồ sơ", { exact: true })).toBeVisible(); // dòng lịch sử mới

      // Email tới chủ hồ sơ (Mailpit)
      const mail = await waitForEmailSubject(owner.email, /đã được duyệt/);
      expect(mail.Subject).toBe(`Hồ sơ ${org.name} đã được duyệt`);
      expect(mail.Text).toContain("/store");

      // Hồ sơ rời hàng đợi, nằm ở tab Đã duyệt
      await page.goto(`/admin/reviews?q=${encodeURIComponent(org.name)}`);
      await expect(page.getByRole("link", { name: org.name, exact: true })).toHaveCount(0);
      await page.goto(`/admin/reviews?view=approved&q=${encodeURIComponent(org.name)}`);
      await expect(page.getByRole("link", { name: org.name, exact: true })).toBeVisible();

      // Chủ hồ sơ vào thẳng cổng Cửa hàng (không bị chuyển tới trang trạng thái)
      const ctx = await browser.newContext();
      const ownerPage = await ctx.newPage();
      await loginAs(ownerPage, owner, "/store");
      await expect(ownerPage).toHaveURL(/\/store$/);
      await expect(ownerPage.getByRole("heading", { level: 1 })).toHaveText("Tổng quan");
      await ctx.close();
    } finally {
      await revokeAdmin(admin);
    }
  });

  test("yêu cầu bổ sung bắt buộc lý do; chủ hồ sơ thấy lý do ở trang trạng thái", async ({
    page,
    browser,
  }) => {
    test.setTimeout(150_000);
    const owner = await createConfirmedUser({ prefix: "owner", fullName: "Võ Thị Hạnh" });
    const org = await createSubmittedOrg(owner, { kind: "charity" });
    const { admin } = await loginAdminWithMfa(page);
    try {
      await openFromQueue(page, org.name);
      await page.getByRole("button", { name: "Yêu cầu bổ sung" }).click();
      const dialog = page.getByRole("alertdialog", { name: `Yêu cầu ${org.name} bổ sung hồ sơ?` });
      await expect(dialog).toBeVisible();

      // Không có lý do ⇒ lỗi tại trường, không gửi
      await dialog.getByRole("button", { name: "Gửi yêu cầu bổ sung" }).click();
      await expect(dialog.getByText(/ít nhất 10 ký tự/)).toBeVisible();
      await expect(dialog.getByLabel(/Nội dung cần bổ sung/)).toHaveAttribute("aria-invalid", "true");

      // Lý do quá ngắn cũng bị chặn
      await dialog.getByLabel(/Nội dung cần bổ sung/).fill("mờ");
      await dialog.getByRole("button", { name: "Gửi yêu cầu bổ sung" }).click();
      await expect(dialog.getByText(/ít nhất 10 ký tự/)).toBeVisible();

      // Lý do mẫu điền sẵn rồi sửa
      await dialog.getByRole("button", { name: /Ảnh giấy tờ bị mờ/ }).click();
      const reason = "Ảnh quyết định thành lập bị mờ, vui lòng tải lại bản có dấu đỏ rõ ràng.";
      await dialog.getByLabel(/Nội dung cần bổ sung/).fill(reason);
      await dialog.getByRole("button", { name: "Gửi yêu cầu bổ sung" }).click();
      await expect(page.getByText(`Đã gửi yêu cầu bổ sung cho ${org.name}.`)).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.getByText("Nội dung đã yêu cầu bổ sung")).toBeVisible();
      await expect(page.getByText(reason).first()).toBeVisible();

      const mail = await waitForEmailSubject(owner.email, /cần bổ sung/);
      expect(mail.Text).toContain(reason);

      const ctx = await browser.newContext();
      const ownerPage = await ctx.newPage();
      await loginAs(ownerPage, owner, "/charity");
      await expect(ownerPage).toHaveURL(/\/onboarding\/status/);
      const card = ownerPage.getByRole("article", { name: org.name });
      await expect(card.getByText("Cần bổ sung", { exact: true })).toBeVisible();
      await expect(card.getByText(reason)).toBeVisible();
      await ctx.close();
    } finally {
      await revokeAdmin(admin);
    }
  });

  test("admin không tự duyệt tổ chức do mình tạo (self_dealing)", async ({ page }) => {
    test.setTimeout(120_000);
    const { admin } = await loginAdminWithMfa(page);
    try {
      const own = await createOrgFor(admin, { kind: "store", status: "submitted" });
      await page.goto(`/admin/reviews/${own.id}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(own.name);
      await expect(page.getByText(/không thể tự ra quyết định/)).toBeVisible();
      await expect(page.getByRole("button", { name: "Duyệt", exact: true })).toHaveCount(0);
    } finally {
      await revokeAdmin(admin);
    }
  });

  test("bộ lọc và trạng thái rỗng của hàng đợi", async ({ page }) => {
    test.setTimeout(90_000);
    const { admin } = await loginAdminWithMfa(page);
    try {
      await page.goto("/admin/reviews?q=khong-ton-tai-zzzz-9999");
      await expect(page.getByRole("heading", { name: "Không có kết quả khớp bộ lọc" })).toBeVisible();
      await page.getByRole("link", { name: "Xóa lọc" }).first().click();
      await expect(page).toHaveURL(/\/admin\/reviews$/, { timeout: 15_000 });

      await page
        .getByRole("navigation", { name: "Lọc theo trạng thái" })
        .getByRole("link", { name: /^Cập nhật hồ sơ/ })
        .click();
      await expect(page).toHaveURL(/view=changes/, { timeout: 15_000 });
      await page
        .getByRole("navigation", { name: "Lọc theo loại" })
        .getByRole("link", { name: "Tổ chức" })
        .click();
      await expect(page).toHaveURL(/kind=charity/, { timeout: 15_000 });
      await expectNoA11yViolations(page, "/admin/reviews?view=changes");

      // Trang có loading.tsx nên lỗi 404 được stream (mã HTTP có thể là 200) — kiểm nội dung trang
      await page.goto("/admin/reviews/khong-phai-uuid");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Không tìm thấy trang");
      await page.goto("/admin/reviews/00000000-0000-4000-8000-000000000000");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Không tìm thấy trang");
    } finally {
      await revokeAdmin(admin);
    }
  });
});
