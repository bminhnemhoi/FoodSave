import { expect, test } from "@playwright/test";

test.describe("PWA (ADR-013)", () => {
  test("manifest hợp lệ: tên, start_url, icon 192/512 + maskable", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.ok()).toBeTruthy();
    const m = await res.json();
    expect(m.short_name).toBe("FoodSave");
    expect(m.start_url).toBe("/volunteer");
    expect(m.display).toBe("standalone");
    const sizes = m.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes}:${i.purpose}`);
    expect(sizes).toEqual(expect.arrayContaining(["192x192:any", "512x512:any", "512x512:maskable"]));
    for (const icon of m.icons) expect((await request.get(icon.src)).ok()).toBeTruthy();
  });

  test("service worker được kích hoạt và hiện trang ngoại tuyến khi mất mạng", async ({ page, context }) => {
    await page.goto("/");
    // ready ⇒ có worker active; chờ thêm tới trạng thái "activated" (có thể đang "activating").
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      const sw = reg.active;
      if (sw && sw.state !== "activated") {
        await new Promise<void>((resolve) =>
          sw.addEventListener("statechange", () => sw.state === "activated" && resolve()),
        );
      }
    });
    await page.reload(); // để trang được service worker kiểm soát
    await context.setOffline(true);
    await page.goto("/terms").catch(() => undefined);
    await expect(page.getByRole("heading", { name: "Bạn đang ngoại tuyến" })).toBeVisible();
    await context.setOffline(false);
  });

  test("header bảo mật có mặt", async ({ request }) => {
    const res = await request.get("/");
    const h = res.headers();
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["permissions-policy"]).toContain("geolocation=(self)");
    expect(h["x-powered-by"]).toBeUndefined();
  });
});
