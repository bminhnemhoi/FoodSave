import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("Trang chủ", () => {
  test("hiển thị thông điệp chính và 3 nhãn tươi có chữ", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Cứu thực phẩm");
    const labels = page.getByRole("list", { name: "Nhãn tươi" });
    for (const text of ["Nhãn Xanh", "Nhãn Vàng", "Nhãn Đỏ"]) {
      await expect(labels.getByText(text)).toBeVisible();
    }
    await expect(page.locator("html")).toHaveAttribute("lang", "vi");
  });

  test("không có vi phạm a11y nghiêm trọng", async ({ page }) => {
    await page.goto("/");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([]);
  });
});
