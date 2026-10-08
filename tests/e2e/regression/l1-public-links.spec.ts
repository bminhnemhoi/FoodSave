import { expect, test } from "@playwright/test";

/**
 * Hồi quy L1 (SECURITY-PRIVACY §10.1, P1-12): nút "Đăng nhập doanh nghiệp" của bản cũ trỏ tới
 * `PARTNER_TINH.html` đã đổi tên ⇒ 404. v2: route thật cho từng cổng, không link chuỗi tay tới file.
 * Test: mọi liên kết nội bộ trên trang công khai (trang chủ, pháp lý, đăng nhập/đăng ký) trả về trang hợp lệ;
 * CTA trang chủ dẫn tới đúng luồng; đường dẫn file của bản cũ không phải lối vào (404).
 */
const PUBLIC_PAGES = ["/", "/terms", "/privacy", "/login", "/register", "/forgot-password"];

test.describe("L1 — không có liên kết hỏng trên trang công khai", () => {
  test("mọi liên kết nội bộ trả về 2xx/3xx sau chuyển hướng", async ({ page, request }) => {
    const found = new Map<string, string>(); // href → trang chứa
    for (const path of PUBLIC_PAGES) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
      const origin = new URL(page.url()).origin;
      const hrefs = await page
        .locator("a[href]")
        .evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href));
      for (const href of hrefs) {
        const url = new URL(href);
        if (url.origin !== origin) continue; // mailto:, liên kết ngoài
        found.set(url.pathname + url.search, path);
      }
    }
    expect(found.size).toBeGreaterThanOrEqual(6);
    for (const [href, from] of found) {
      const res = await request.get(href);
      expect(res.status(), `${href} (trên ${from})`).toBeLessThan(400);
      expect(href, "không link tới tệp .html của bản cũ").not.toMatch(/\.html?$/i);
    }
  });

  test("CTA trang chủ dẫn tới đăng ký/đăng nhập thật", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Đăng ký cửa hàng" }).click();
    await expect(page).toHaveURL(/\/register\?next=%2Fonboarding%2Fstore$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tạo tài khoản FoodSave");

    await page.goto("/");
    await page.getByRole("link", { name: "Đăng ký tổ chức" }).click();
    await expect(page).toHaveURL(/\/register\?next=%2Fonboarding%2Fcharity$/);

    await page.goto("/");
    await page.getByRole("link", { name: "Đăng nhập" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Đăng nhập");

    await page.goto("/");
    const legal = page.getByRole("navigation", { name: "Pháp lý" });
    await legal.getByRole("link", { name: "Điều khoản" }).click();
    await expect(page).toHaveURL(/\/terms$/);
  });

  test("đường dẫn tệp của bản cũ trả 404 tiếng Việt (không phải cửa sau)", async ({ request, page }) => {
    for (const old of ["/PARTNER_TINH.html", "/PARTNER.html", "/CHARITY.html", "/ADMIN.html"]) {
      expect((await request.get(old)).status(), old).toBe(404);
    }
    await page.goto("/PARTNER_TINH.html");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Không tìm thấy trang");
  });
});
