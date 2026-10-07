import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { uniqueEmail, waitForEmailCount, waitForEmailLink } from "../fixtures/mailpit";

const PASSWORD = "FoodSave2026";

async function submitRegister(page: import("@playwright/test").Page, email: string) {
  await page.goto("/register");
  await page.getByLabel("Họ và tên").fill("Trần Văn Gửi Lại");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Nhập lại mật khẩu").fill(PASSWORD);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Tạo tài khoản" }).click();
  await expect(page.getByRole("status")).toContainText("Đã gửi thư xác nhận");
}

test.describe("Đăng ký lại cùng email (ADR-012)", () => {
  test.describe.configure({ timeout: 60_000 }); // 2 lượt đăng ký + chờ thư
  test("chưa xác nhận: đăng ký lại nhận link kích hoạt mới và dùng được", async ({ page }) => {
    const email = uniqueEmail("e2e.resend");
    await submitRegister(page, email);
    await waitForEmailCount(email, 1);
    await submitRegister(page, email); // ví dụ: lỡ xóa thư đầu
    expect(await waitForEmailCount(email, 2)).toBe("Xác nhận email để kích hoạt tài khoản FoodSave");
    await page.goto(await waitForEmailLink(email));
    await expect(page).toHaveURL(/\/onboarding/);
  });

  test("đã xác nhận: đăng ký lại chỉ nhận thư 'đã có tài khoản', giao diện không lộ điều đó", async ({
    page,
  }) => {
    const email = uniqueEmail("e2e.exists");
    await submitRegister(page, email);
    await page.goto(await waitForEmailLink(email));
    await expect(page).toHaveURL(/\/onboarding/);
    await page.getByRole("button", { name: "Đăng xuất" }).click();
    await expect(page).toHaveURL(/\/login/); // chờ đăng xuất xong, tránh /register chuyển hướng
    await submitRegister(page, email);
    expect(await waitForEmailCount(email, 2)).toBe("Bạn đã có tài khoản FoodSave");
  });
});

test.describe("Đăng ký → xác nhận email → đăng nhập", () => {
  test("người dùng mới hoàn tất luồng và vào được /onboarding", async ({ page }) => {
    const email = uniqueEmail("e2e.register");

    await page.goto("/register");
    await page.getByLabel("Họ và tên").fill("Nguyễn Thị Kiểm Thử");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Mật khẩu", { exact: true }).fill(PASSWORD);
    await page.getByLabel("Nhập lại mật khẩu").fill(PASSWORD);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Tạo tài khoản" }).click();
    await expect(page.getByRole("status")).toContainText("Đã gửi thư xác nhận");

    // Chưa xác nhận email thì chưa đăng nhập được
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Mật khẩu").fill(PASSWORD);
    await page.getByRole("button", { name: "Đăng nhập" }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText("chưa xác nhận email");

    // Bấm liên kết trong email ⇒ vào /onboarding
    const link = await waitForEmailLink(email);
    await page.goto(link);
    await expect(page).toHaveURL(/\/onboarding/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Nguyễn Thị Kiểm Thử");

    // Đăng xuất rồi đăng nhập lại bằng mật khẩu
    await page.getByRole("button", { name: "Đăng xuất" }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Mật khẩu").fill(PASSWORD);
    await page.getByRole("button", { name: "Đăng nhập" }).click();
    await expect(page).toHaveURL(/\/onboarding/);
  });

  test("báo lỗi rõ ràng bằng tiếng Việt khi dữ liệu sai", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Email").fill("khong-phai-email");
    await page.getByLabel("Mật khẩu", { exact: true }).fill("ngan");
    await page.getByRole("button", { name: "Tạo tài khoản" }).click();
    await expect(page.getByText("Email không hợp lệ.")).toBeVisible();
    await expect(page.getByText("Mật khẩu cần ít nhất 8 ký tự.")).toBeVisible();
    await expect(page.getByText("Bạn cần đồng ý Điều khoản và Chính sách bảo mật.")).toBeVisible();
  });

  test("sai mật khẩu không lộ việc email có tồn tại", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(uniqueEmail("nobody"));
    await page.getByLabel("Mật khẩu").fill("SaiMatKhau123");
    await page.getByRole("button", { name: "Đăng nhập" }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText("Email hoặc mật khẩu không đúng.");
  });

  test("/onboarding yêu cầu đăng nhập", async ({ page }) => {
    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/login\?next=%2Fonboarding/);
  });

  test("trang đăng nhập và đăng ký đạt a11y", async ({ page }) => {
    for (const path of ["/login", "/register", "/forgot-password"]) {
      await page.goto(path);
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
      const serious = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(serious, `${path}: ${JSON.stringify(serious.map((v) => v.id))}`).toEqual([]);
    }
  });
});
