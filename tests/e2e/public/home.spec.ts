import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/** Bộ đếm lấy số phía trình duyệt (landing tĩnh) ⇒ chờ hết trạng thái "loading" trước khi đọc. */
async function impactBoard(page: Page) {
  const board = page.getByRole("region", { name: "Bộ đếm tác động của FoodSave" });
  await expect(board).toHaveAttribute("data-impact-state", /^(ready|empty|unavailable)$/, {
    timeout: 20_000,
  });
  return board;
}

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

  test("có đủ các khối: cách hoạt động 5 bước, sản phẩm, tác động, minh bạch, dành cho ai", async ({
    page,
  }) => {
    await page.goto("/");
    const steps = page.getByRole("region", { name: "Từ quầy bánh tới bữa ăn, năm bước có dấu vết" });
    await expect(steps.getByRole("listitem")).toHaveCount(5);
    for (const step of ["Đăng lô", "Xin nhận", "Xác nhận", "Bàn giao QR", "Ghi tác động"]) {
      await expect(steps.getByRole("heading", { name: new RegExp(step) })).toBeVisible();
    }
    const product = page.getByRole("region", { name: /Một nhu cầu, ba phương án ghép/ });
    await expect(
      product.getByRole("img", { name: /Ảnh chụp màn hình FoodSave, dữ liệu demo/ }),
    ).toBeVisible();
    await expect(page.getByRole("region", { name: "Tác động đã ghi nhận" })).toBeVisible();
    const trust = page.getByRole("region", { name: "Tin được vì kiểm chứng được" });
    await expect(trust.getByRole("img", { name: /mã bàn giao gồm mã QR và mã 6 số/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Ba vai trò, một vòng thực phẩm/ })).toBeVisible();
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
    await expect(ledger).toContainText(/kg|Chưa có lần bàn giao nào|chưa tải được/, { timeout: 20_000 });
    // Mọi giao diện minh họa đang hiển thị đều có nhãn; ảnh chụp màn hình thật ghi "dữ liệu demo"
    const illustrative = page.locator("[data-illustrative]").filter({ visible: true });
    expect(await illustrative.count()).toBeGreaterThanOrEqual(2);
    for (const card of await illustrative.all()) {
      await expect(card.getByText("Minh họa", { exact: true })).toBeVisible();
    }
    for (const img of await page.getByRole("img", { name: /^Ảnh chụp màn hình/ }).all()) {
      expect(await img.getAttribute("alt")).toMatch(/dữ liệu demo/);
    }
  });

  test("bộ đếm tác động: số thật luôn có trong DOM (không phụ thuộc hiệu ứng đếm)", async ({ page }) => {
    await page.goto("/");
    const section = await impactBoard(page);
    const value = section.locator('[data-metric="kg"] [data-value]');
    if ((await value.count()) === 0) {
      await expect(section.locator("[data-impact-empty], [role=status]")).toContainText(
        /Chưa có lần bàn giao nào|chưa tải được/,
      );
      return;
    }
    const before = await value.innerText();
    expect(before).toMatch(/^\d{1,3}(\.\d{3})*,\d$/);
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1500); // đếm lên ≤ 1,2 s
    expect(await value.innerText()).toBe(before);
    await expect(value).toHaveCSS("opacity", "1");
  });

  test("landing tĩnh (CDN), số tác động qua /api/public-impact không cache", async ({ request }) => {
    const home = await request.get("/");
    expect(home.ok()).toBeTruthy();
    expect(home.headers()["cache-control"] ?? "").toMatch(/s-maxage=/);
    const api = await request.get("/api/public-impact");
    expect([200, 503]).toContain(api.status());
    expect(api.headers()["cache-control"]).toBe("no-store");
    const body = (await api.json()) as { status: string; totals?: { kg: number } };
    expect(["ok", "unavailable"]).toContain(body.status);
    if (body.status === "ok") expect(typeof body.totals?.kg).toBe("number");
  });

  test("ảnh qua next/image: có alt, chỉ ảnh nền hero được preload, phục vụ AVIF", async ({
    page,
    request,
  }) => {
    await page.goto("/");
    const imgs = page.locator("main img");
    expect(await imgs.count()).toBeGreaterThanOrEqual(8);
    for (const img of await imgs.all()) expect(await img.getAttribute("alt")).not.toBeNull();
    const hero = page.getByRole("img", { name: /Hai bàn tay trao nhận một hộp giấy/ });
    await expect(hero).toBeVisible();
    await expect
      .poll(() => hero.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0))
      .toBe(true);
    // Một preload ảnh duy nhất (ảnh LCP); ảnh dưới màn đầu tải lười
    await expect(page.locator('head link[rel="preload"][as="image"]')).toHaveCount(1);
    expect(await hero.getAttribute("fetchpriority")).toBe("high");
    const src = await hero.getAttribute("src");
    expect(src).toContain("/_next/image");
    const res = await request.get(src!, { headers: { Accept: "image/avif,image/webp,*/*" } });
    expect(res.ok()).toBeTruthy();
    expect(res.headers()["content-type"]).toBe("image/avif");
  });

  test("chữ trên ảnh nền hero đạt ≥ 4,5:1 (đo điểm ảnh thật sau lớp phủ)", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const hero = page.locator("section[aria-labelledby=hero-heading]");
    const bg = hero.getByRole("img", { name: /Hai bàn tay trao nhận/ });
    await expect
      .poll(() => bg.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0))
      .toBe(true);
    // Mọi khối chữ của cột nội dung hero (nhãn đầu, h1, đoạn dẫn, dấu tin cậy) — không gồm nút có nền riêng
    const targets = page.locator("section[aria-labelledby=hero-heading] > div:first-child :is(h1, p, li)");
    const boxes = await targets.evaluateAll((els) =>
      els
        .map((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, w: r.width, h: r.height, color: getComputedStyle(el).color };
        })
        .filter((b) => b.w > 0 && b.h > 0 && b.y + b.h <= window.innerHeight),
    );
    expect(boxes.length).toBeGreaterThanOrEqual(3);
    // Ẩn chữ (giữ bố cục) để chụp đúng phần nền nằm sau chữ
    await page.addStyleTag({
      content:
        "section[aria-labelledby=hero-heading] > div:first-child *{color:transparent!important;border-color:transparent!important}",
    });
    // Chờ 2 khung hình để lớp ẩn chữ chắc chắn đã được vẽ trước khi chụp
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await expect(page.locator("h1")).toHaveCSS("color", "rgba(0, 0, 0, 0)");
    const shot = (await page.screenshot()).toString("base64");
    const worst = await page.evaluate(
      async ({ shot, boxes }) => {
        const img = new Image();
        img.src = `data:image/png;base64,${shot}`;
        await img.decode();
        const scale = img.naturalWidth / window.innerWidth;
        const c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const ctx = c.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0);
        const lum = ([r, g, b]: number[]) => {
          const f = (v: number) => {
            const s = v / 255;
            return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          };
          return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
        };
        const swatch = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
        let min = Infinity;
        for (const b of boxes) {
          const data = ctx.getImageData(
            b.x * scale,
            b.y * scale,
            Math.max(1, b.w * scale),
            Math.max(1, b.h * scale),
          );
          let brightest = [0, 0, 0];
          let bl = -1;
          for (let i = 0; i < data.data.length; i += 8) {
            const px = [data.data[i]!, data.data[i + 1]!, data.data[i + 2]!];
            const l = lum(px);
            if (l > bl) [bl, brightest] = [l, px];
          }
          // Màu chữ thật (có alpha) phủ lên điểm nền sáng nhất
          swatch.fillStyle = `rgb(${brightest.join(",")})`;
          swatch.fillRect(0, 0, 1, 1);
          swatch.fillStyle = b.color;
          swatch.fillRect(0, 0, 1, 1);
          const t = swatch.getImageData(0, 0, 1, 1).data;
          const lt = lum([t[0]!, t[1]!, t[2]!]);
          const ratio = (Math.max(lt, bl) + 0.05) / (Math.min(lt, bl) + 0.05);
          min = Math.min(min, ratio);
        }
        return min;
      },
      { shot, boxes },
    );
    expect(worst, `tương phản tối thiểu ${worst.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });

  test("không có vi phạm a11y nghiêm trọng", async ({ page }) => {
    await page.goto("/");
    await impactBoard(page);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([]);
  });
});

test.describe("Trang chủ — chuyển động", () => {
  test("giảm chuyển động: tắt màn mở đầu, parallax và đường nối", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    for (const sel of [".fs-enter", ".fs-pop", ".fs-parallax", ".fs-drift", ".fs-draw-x", ".fs-draw-y"]) {
      const els = page.locator(sel);
      expect(await els.count(), sel).toBeGreaterThan(0);
      for (const el of await els.all()) await expect(el).toHaveCSS("animation-name", "none");
    }
  });

  test("tiêu đề hero (ứng viên LCP) không có hiệu ứng vào", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveCSS("animation-name", "none");
  });

  test("không có JavaScript: mọi nội dung vẫn hiện ở trạng thái nghỉ", async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForTimeout(1500); // sau màn mở đầu (≤ 1,2 s)
    for (const sel of [".fs-enter", ".fs-pop"]) {
      // Phần tử ẩn theo kích thước màn hình (display: none) không chạy hiệu ứng — chỉ xét phần tử đang hiển thị
      for (const el of await page.locator(sel).filter({ visible: true }).all()) {
        await expect(el).toHaveCSS("opacity", "1");
      }
    }
    await expect(page.getByRole("link", { name: "Đăng ký cửa hàng" })).toBeVisible();
    // Không có JS ⇒ bộ đếm nói rõ cần JS (thẻ <noscript>), không hiện số giả
    expect(await page.content()).toContain("Bật JavaScript để xem số liệu tác động mới nhất.");
    await ctx.close();
  });
});
