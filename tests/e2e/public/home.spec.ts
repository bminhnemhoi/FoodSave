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

  test("có đủ các khối: cách hoạt động 5 bước, tác động, dành cho ai, minh bạch", async ({ page }) => {
    await page.goto("/");
    const steps = page.getByRole("region", { name: "Từ quầy bánh tới bữa ăn, năm bước có dấu vết" });
    await expect(steps.getByRole("listitem")).toHaveCount(5);
    for (const step of ["Đăng lô", "Xin nhận", "Xác nhận", "Bàn giao QR", "Ghi tác động"]) {
      await expect(steps.getByRole("heading", { name: new RegExp(step) })).toBeVisible();
    }
    await expect(page.getByRole("region", { name: "Tác động đã ghi nhận" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Ba vai trò, một vòng thực phẩm/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Tin được vì kiểm/ })).toBeVisible();
  });

  test("giao diện minh họa luôn gắn nhãn “Minh họa”, số trong hero là số thật từ sổ tác động", async ({
    page,
  }) => {
    await page.goto("/");
    const collage = page.getByRole("group", { name: "Ảnh và giao diện minh họa" });
    // Thẻ lô Đỏ là minh họa ⇒ phải có nhãn ngay trong thẻ
    const redCard = collage.locator("div").filter({ hasText: "Còn 1 giờ 58 phút" }).last();
    await expect(redCard.getByText("Minh họa", { exact: true })).toBeVisible();
    // Thẻ sổ tác động: số thật (hoặc câu trung thực khi sổ trống), không có nhãn minh họa
    const ledger = collage.locator("div").filter({ hasText: "Sổ tác động" }).last();
    await expect(ledger).toBeVisible();
    await expect(ledger.getByText("Minh họa", { exact: true })).toHaveCount(0);
    await expect(ledger).toContainText(/kg|Chưa có lần bàn giao nào|chưa tải được/);
    // Mọi giao diện minh họa trên trang đều có nhãn
    expect(await page.getByText("Minh họa", { exact: true }).count()).toBeGreaterThanOrEqual(4);
  });

  test("bộ đếm tác động: số thật luôn có trong DOM (không phụ thuộc hiệu ứng đếm)", async ({ page }) => {
    await page.goto("/");
    const section = page.getByRole("region", { name: "Bộ đếm tác động của FoodSave" });
    await expect(section).toBeAttached();
    const value = section.locator('[data-metric="kg"] [data-value]');
    if ((await value.count()) === 0) {
      await expect(section.locator("[data-impact-empty]")).toContainText("Chưa có lần bàn giao nào");
      return;
    }
    const before = await value.innerText();
    expect(before).toMatch(/^\d{1,3}(\.\d{3})*,\d$/);
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1500); // đếm lên ≤ 1,2 s
    expect(await value.innerText()).toBe(before);
    await expect(value).toHaveCSS("opacity", "1");
  });

  test("ảnh qua next/image: có alt, ảnh hero tải sớm, phục vụ AVIF", async ({ page, request }) => {
    await page.goto("/");
    const imgs = page.locator("main img");
    expect(await imgs.count()).toBeGreaterThanOrEqual(8);
    for (const img of await imgs.all()) expect(await img.getAttribute("alt")).not.toBeNull();
    const hero = page.getByRole("img", { name: /Cà rốt, cà chua bi/ });
    await expect(hero).toBeVisible();
    await expect
      .poll(() => hero.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0))
      .toBe(true);
    const src = await hero.getAttribute("src");
    expect(src).toContain("/_next/image");
    const res = await request.get(src!, { headers: { Accept: "image/avif,image/webp,*/*" } });
    expect(res.ok()).toBeTruthy();
    expect(res.headers()["content-type"]).toBe("image/avif");
  });

  test("không có vi phạm a11y nghiêm trọng", async ({ page }) => {
    await page.goto("/");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([]);
  });
});

test.describe("Trang chủ — chuyển động", () => {
  test("giảm chuyển động: tắt màn mở đầu và parallax", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    for (const sel of [".fs-enter", ".fs-rise", ".fs-pop", ".fs-parallax"]) {
      const el = page.locator(sel).first();
      await expect(el).toHaveCSS("animation-name", "none");
    }
  });

  test("không có JavaScript: mọi nội dung vẫn hiện ở trạng thái nghỉ", async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForTimeout(1500); // sau màn mở đầu (≤ 1,4 s)
    for (const sel of [".fs-enter", ".fs-pop"]) {
      // Phần tử ẩn theo kích thước màn hình (display: none) không chạy hiệu ứng — chỉ xét phần tử đang hiển thị
      for (const el of await page.locator(sel).filter({ visible: true }).all()) {
        await expect(el).toHaveCSS("opacity", "1");
      }
    }
    await expect(page.getByRole("link", { name: "Đăng ký cửa hàng" })).toBeVisible();
    await ctx.close();
  });
});
