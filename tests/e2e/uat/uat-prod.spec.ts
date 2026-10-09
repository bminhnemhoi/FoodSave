import { mkdirSync } from "node:fs";
import path from "node:path";

import {
  devices,
  expect,
  test,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  type Page,
  type TestInfo,
} from "@playwright/test";

import { writeQrVideo } from "../handover/scenario";

/**
 * UAT trên PRODUCTION (https://foodsave-psi.vercel.app) — chỉ đọc, hoặc thao tác bằng TÀI KHOẢN GIÁM KHẢO trên
 * dữ liệu demo (`is_demo`). Không tạo người dùng/tổ chức mới, không gửi email tới địa chỉ thật, không dùng Admin.
 *
 * Chạy (Git Bash):
 *   UAT_PROD=1 E2E_BASE_URL=https://foodsave-psi.vercel.app DEMO_JUDGE_PASSWORD=… \
 *     npx playwright test tests/e2e/uat/uat-prod.spec.ts --project=desktop --workers=1 --output=test-results-uat
 *
 * Mỗi test mang mã bước UAT (docs/uat/P1-onboarding.md, P2-core-loop.md). Ảnh chụp: UAT_SHOTS_DIR (nếu đặt).
 */

const ENABLED = !!process.env.UAT_PROD;
/** Trang công khai (P1-01…06) chạy được cả với bản build local (UAT_PUBLIC=1) lẫn production. */
const PUBLIC_ENABLED = ENABLED || !!process.env.UAT_PUBLIC;
const PASSWORD = process.env.DEMO_JUDGE_PASSWORD ?? "";
const STORE_EMAIL = "giamkhao.cuahang@foodsave.test";
const CHARITY_EMAIL = "giamkhao.tochuc@foodsave.test";
const VOLUNTEER_EMAIL = "giamkhao.tnv@foodsave.test";
const STORE_NAME = "Cửa hàng tiện lợi Phố Xanh";
const CHARITY_NAME = "Mái ấm Hướng Dương";
const VOLUNTEER_NAME = "Giám khảo · Tình nguyện viên";

/** Thương hiệu thật hay gặp ở TP.HCM — tên cửa hàng demo không được trùng (CLAUDE.md: tên hư cấu). */
const REAL_BRANDS = [
  "Bách Hóa Xanh",
  "Co.op",
  "WinMart",
  "Circle K",
  "FamilyMart",
  "GS25",
  "7-Eleven",
  "Ministop",
  "Highlands",
  "Phúc Long",
  "ABC Bakery",
  "Tous les Jours",
  "Paris Baguette",
  "Kinh Đô",
  "Givral",
  "Lotte",
  "Aeon",
  "Big C",
  "GO!",
  "Satra",
];

const MOJIBAKE = /Ã[\u0080-\u00bf¡-ÿ]|Â[\u0080-\u00bf¡-¿]|â€|Æ°|Ä‘|á»|á º|\uFFFD/;

const literal = (s: string) => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

const vnContext: BrowserContextOptions = { locale: "vi-VN", timezoneId: "Asia/Ho_Chi_Minh" };

async function shot(page: Page, testInfo: TestInfo, name: string, fullPage = true) {
  const dir = process.env.UAT_SHOTS_DIR;
  if (dir) mkdirSync(dir, { recursive: true });
  const file = dir ? path.join(dir, `prod-${name}.png`) : testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path: file, fullPage }).catch(() => undefined);
  testInfo.annotations.push({ type: "screenshot", description: file });
}

function note(testInfo: TestInfo, type: string, description: string) {
  testInfo.annotations.push({ type, description });
}

async function login(page: Page, email: string, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  const form = page.locator("form").filter({ has: page.getByLabel("Mật khẩu") });
  await form.getByLabel("Email").fill(email);
  await form.getByLabel("Mật khẩu").fill(PASSWORD);
  await form.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).not.toHaveURL(/\/login(\?|$)/, { timeout: 45_000 });
}

/** Đọc kích thước JPEG từ marker SOFn. */
function jpegSize(buf: Buffer): { width: number; height: number } | null {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1]!;
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}

/** Điện thoại Android cấu hình thấp (giả lập): Pixel 7 + CPU chậm 4× + mạng "Fast 3G" của DevTools. */
async function lowEndAndroid(
  browser: Browser,
  baseURL: string,
): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ ...devices["Pixel 7"], ...vnContext, baseURL });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 562.5,
    downloadThroughput: (1.6 * 1024 * 1024 * 0.9) / 8,
    uploadThroughput: (750 * 1024 * 0.9) / 8,
  });
  return { ctx, page };
}

/** Không kéo ngang được: chiều rộng nội dung ≤ chiều rộng khung nhìn (+1 px làm tròn). */
async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/**
 * Cỡ chữ nhỏ nhất (px) trong các phần tử có chữ đang hiển thị, và cỡ chữ "thân bài" = trung vị theo số ký tự
 * (phần lớn chữ người dùng đọc có cỡ này).
 */
async function fontSizes(page: Page): Promise<{ min: number; minSample: string; body: number }> {
  return page.evaluate(() => {
    let min = 999;
    let minSample = "";
    const weighted: [number, number][] = [];
    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
      const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? "").trim());
      if (!own) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) continue;
      if (el.closest("[aria-hidden=true], .sr-only")) continue;
      const size = parseFloat(cs.fontSize);
      const chars = Array.from(el.childNodes)
        .filter((n) => n.nodeType === 3)
        .reduce((a, n) => a + (n.textContent ?? "").trim().length, 0);
      weighted.push([size, chars]);
      if (size < min) {
        min = size;
        minSample = (el.textContent ?? "").trim().slice(0, 40);
      }
    }
    weighted.sort((a, b) => a[0] - b[0]);
    const total = weighted.reduce((a, [, c]) => a + c, 0);
    let acc = 0;
    let body = 0;
    for (const [size, c] of weighted) {
      acc += c;
      if (acc >= total / 2) {
        body = size;
        break;
      }
    }
    return { min, minSample, body };
  });
}

async function landingKg(page: Page): Promise<number | null> {
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 60_000 });
  const section = page.getByRole("region", { name: "Bộ đếm tác động của FoodSave" });
  if (
    !(await section
      .waitFor({ timeout: 30_000 })
      .then(() => true)
      .catch(() => false))
  )
    return null;
  await expect(section).not.toHaveAttribute("data-impact-state", "loading", { timeout: 30_000 });
  const value = section.locator('[data-metric="kg"] [data-value]');
  if ((await value.count()) === 0) return 0;
  await section.scrollIntoViewIfNeeded();
  return Number(((await value.first().textContent()) ?? "0").trim().replace(/\./g, "").replace(",", "."));
}

/** Số trên chuông thông báo ("Thông báo, 3 chưa đọc" ⇒ 3). */
async function unread(page: Page): Promise<number> {
  const name =
    (await page
      .getByRole("button", { name: /^Thông báo/ })
      .first()
      .getAttribute("aria-label")) ?? "";
  return Number(name.match(/(\d+) chưa đọc/)?.[1] ?? 0);
}

/** Mốc ban đầu của chuông: đợi số chưa đọc ổn định (đã tải xong + kênh Realtime đã nối) trước khi đo. */
async function stableUnread(page: Page): Promise<number> {
  await page
    .getByRole("button", { name: /^Thông báo/ })
    .first()
    .waitFor();
  let prev = -1;
  for (let i = 0; i < 20; i++) {
    const n = await unread(page);
    if (n === prev) return n;
    prev = n;
    await page.waitForTimeout(2_000);
  }
  return prev;
}

/** Giá trị "Thực phẩm được cứu" (kg) trên Tổng quan tổ chức. */
async function charityKg(page: Page): Promise<string> {
  await page.goto("/charity", { waitUntil: "domcontentloaded" });
  const block = page.locator("section").filter({ hasText: "Thực phẩm được cứu" }).last();
  await block.waitFor({ timeout: 30_000 });
  const text = await block.innerText();
  return text.match(/Thực phẩm được cứu\s*([\d.,]+)\s*kg/)?.[1] ?? text.slice(0, 80);
}

test.describe("UAT trên production — trang công khai (P1)", () => {
  test.skip(!PUBLIC_ENABLED, "Chỉ chạy khi UAT_PROD=1 (production) hoặc UAT_PUBLIC=1 (bản build local)");
  test.beforeEach(({ browserName: _b }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Chạy một lần; thiết bị di động giả lập trong test");
  });

  test("P1-01 trang chủ tiếng Việt có dấu, có tiêu đề tab, không lỗi font", async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const res = await page.goto("/");
    expect(res?.status()).toBe(200);
    await expect(page).toHaveTitle(/FoodSave/);
    const title = await page.title();
    note(testInfo, "title", title);
    const text = await page.locator("body").innerText();
    expect(text).toMatch(/thực phẩm/i);
    expect(text, "không có chuỗi lỗi mã hóa kiểu “Ã¡”").not.toMatch(MOJIBAKE);
    expect(await page.locator("html").getAttribute("lang")).toBe("vi");
    expect(errors, "không có lỗi JavaScript").toEqual([]);
    await shot(page, testInfo, "P1-01-home-desktop");
  });

  test("P1-02 mọi liên kết và nút trên trang chủ: không 404, không trang trắng", async ({
    page,
    request,
  }, testInfo) => {
    await page.goto("/");
    const origin = new URL(page.url()).origin;
    const hrefs = await page
      .locator("a[href]")
      .evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href));
    const internal = [...new Set(hrefs.filter((h) => h.startsWith(origin)).map((h) => h.split("#")[0]!))];
    const external = [...new Set(hrefs.filter((h) => /^https?:/.test(h) && !h.startsWith(origin)))];
    note(testInfo, "links", `${internal.length} nội bộ, ${external.length} ngoài: ${internal.join(" ")}`);
    expect(internal.length).toBeGreaterThanOrEqual(5);
    for (const href of internal) {
      const r = await request.get(href);
      expect(r.status(), href).toBeLessThan(400);
      // Mở như người dùng: trang đích có tiêu đề cấp 1 và có nội dung (không trắng, không phải trang 404)
      await page.goto(href);
      const h1 = page.getByRole("heading", { level: 1 }).first();
      await expect(h1, `${href} có tiêu đề`).toBeVisible();
      await expect(h1, `${href} không phải trang 404`).not.toHaveText("Không tìm thấy trang");
      expect((await page.locator("body").innerText()).length, `${href} không trắng`).toBeGreaterThan(100);
    }
    for (const href of external) {
      const r = await request.get(href, { failOnStatusCode: false, timeout: 20_000 }).catch(() => null);
      note(testInfo, "external", `${href} → ${r?.status() ?? "lỗi mạng"}`);
    }

    // Bấm các nút chính như người dùng (CTA, pháp lý) ⇒ trang đích có tiêu đề cấp 1
    const targets: [RegExp, RegExp][] = [
      [/^Đăng nhập$/, /\/login/],
      [/^Đăng ký cửa hàng/, /\/register\?next=%2Fonboarding%2Fstore/],
      [/^Đăng ký tổ chức/, /\/register\?next=%2Fonboarding%2Fcharity/],
      [/^Điều khoản/, /\/terms/],
      [/^(Chính sách bảo mật|Quyền riêng tư)/, /\/privacy/],
    ];
    for (const [name, url] of targets) {
      await page.goto("/");
      const link = page.getByRole("link", { name }).first();
      await expect(link, `có liên kết ${name}`).toBeVisible();
      await link.click();
      await expect(page).toHaveURL(url);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }

    // Mọi <button> hiển thị trên trang chủ bấm được, không làm trang lỗi
    await page.goto("/");
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const buttons = page.locator("main button:visible, header button:visible, footer button:visible");
    const n = await buttons.count();
    note(testInfo, "buttons", String(n));
    for (let i = 0; i < n; i++) {
      const b = buttons.nth(i);
      if (!(await b.isVisible()) || !(await b.isEnabled())) continue;
      await b.click({ timeout: 5_000 }).catch(() => undefined);
      await page.keyboard.press("Escape");
      if (new URL(page.url()).pathname !== "/") await page.goto("/");
    }
    expect(errors).toEqual([]);
  });

  test("P1-03 /terms và /privacy: có nội dung, phiên bản, ngày hiệu lực; mục ATTP và miễn trừ bên tặng", async ({
    page,
  }, testInfo) => {
    for (const p of ["/terms", "/privacy"]) {
      const res = await page.goto(p);
      expect(res?.status(), p).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const text = await page.locator("main").innerText();
      expect(text.length, `${p} có nội dung`).toBeGreaterThan(2000);
      expect(text, `${p} ghi phiên bản`).toMatch(/Phiên bản\s*\S+/);
      expect(text, `${p} ghi ngày hiệu lực`).toMatch(
        /hiệu lực từ\s*\d{1,2}\/\d{1,2}\/\d{4}|hiệu lực từ\s*\S+/i,
      );
      note(testInfo, p, (text.match(/Phiên bản[^\n]*/)?.[0] ?? "").slice(0, 120));
      await shot(page, testInfo, `P1-03${p.replace("/", "-")}`);
    }
    await page.goto("/terms");
    await expect(page.getByRole("heading", { name: /Cam kết an toàn thực phẩm/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Miễn trừ cho bên tặng/ }).first()).toBeVisible();
  });

  test("P1-04 /store, /charity, /volunteer, /admin khi chưa đăng nhập ⇒ trang Đăng nhập", async ({
    page,
  }) => {
    for (const p of ["/store", "/charity", "/volunteer", "/admin"]) {
      await page.goto(p);
      await expect(page, p).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(p)}$`));
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Đăng nhập");
      // Không lộ nội dung bên trong cổng
      await expect(page.getByRole("navigation", { name: "Điều hướng chính" })).toHaveCount(0);
    }
  });

  test("P1-05 (giả lập) trang chủ trên iPhone 13 và Pixel 7: không kéo ngang, chữ đủ lớn", async ({
    browser,
    baseURL,
  }, testInfo) => {
    test.setTimeout(180_000);
    for (const device of ["iPhone 13", "Pixel 7"] as const) {
      // WebKit chưa cài trên máy kiểm thử ⇒ dùng Chromium với kích thước/UA/tỉ lệ điểm ảnh của thiết bị
      const ctx = await browser.newContext({ ...devices[device], ...vnContext, baseURL });
      const page = await ctx.newPage();
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.evaluate(() => window.scrollTo(0, 0));
      expect(await horizontalOverflow(page), `${device}: không có thanh cuộn ngang`).toBeLessThanOrEqual(1);
      const fs = await fontSizes(page);
      note(
        testInfo,
        `${device} font`,
        `nhỏ nhất ${fs.min}px (“${fs.minSample}”), trung vị theo ký tự ${fs.body}px`,
      );
      expect(fs.body, `${device}: phần lớn chữ ≥ 14 px`).toBeGreaterThanOrEqual(14);
      expect(fs.min, `${device}: không chữ nào < 11 px`).toBeGreaterThanOrEqual(11);
      await shot(page, testInfo, `P1-05-home-${device.replace(" ", "")}`);
      await ctx.close();
    }
  });

  test("P1-06 Open Graph: tiêu đề, mô tả, ảnh 1200×630 tải được", async ({ page, request }, testInfo) => {
    await page.goto("/");
    const meta = async (prop: string) =>
      page.locator(`meta[property="${prop}"], meta[name="${prop}"]`).first().getAttribute("content");
    const ogTitle = await meta("og:title");
    const ogDesc = await meta("og:description");
    const ogImage = await meta("og:image");
    expect(ogTitle).toMatch(/FoodSave/);
    expect(ogDesc?.length ?? 0).toBeGreaterThan(40);
    // og:image là URL tuyệt đối trên đúng tên miền đang chạy (NEXT_PUBLIC_APP_URL)
    expect(ogImage!.startsWith(`${new URL(page.url()).origin}/`)).toBe(true);
    expect(await meta("twitter:card")).toBe("summary_large_image");
    const img = await request.get(ogImage!);
    expect(img.status()).toBe(200);
    expect(img.headers()["content-type"]).toMatch(/image\/(jpeg|png)/);
    const body = await img.body();
    const size = jpegSize(body);
    note(testInfo, "og", `${ogTitle} | ${ogImage} | ${size?.width}×${size?.height} | ${body.length} byte`);
    expect(size).toEqual({ width: 1200, height: 630 });
    expect(body.length, "ảnh < 5 MB (Zalo/Messenger bỏ qua ảnh quá lớn)").toBeLessThan(5 * 1024 * 1024);
  });
});

test.describe("UAT trên production — tài khoản giám khảo (P1-36, P2)", () => {
  test.skip(!ENABLED, "Chỉ chạy khi UAT_PROD=1 (trỏ E2E_BASE_URL tới production)");
  test.skip(!PASSWORD, "Thiếu DEMO_JUDGE_PASSWORD");
  test.beforeEach(({ browserName: _b }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Chạy một lần; thiết bị di động giả lập trong test");
  });

  test("P1-36 (giả lập Android yếu) cửa hàng demo: tải ≤ 5 s, tab bar bấm được, không vỡ bố cục", async ({
    browser,
    baseURL,
  }, testInfo) => {
    test.setTimeout(240_000);
    const { ctx, page } = await lowEndAndroid(browser, baseURL!);
    try {
      await page.goto(`/login?next=${encodeURIComponent("/store")}`);
      const form = page.locator("form").filter({ has: page.getByLabel("Mật khẩu") });
      await form.getByLabel("Email").fill(STORE_EMAIL);
      await form.getByLabel("Mật khẩu").fill(PASSWORD);
      const t0 = Date.now();
      await form.getByRole("button", { name: "Đăng nhập" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Tổng quan" })).toBeVisible({
        timeout: 30_000,
      });
      const loginMs = Date.now() - t0;

      // Mở lại một trang trong cổng (bấm tab) và đo thời gian tới khi nội dung hiện
      const tabs = page.getByRole("navigation", { name: "Điều hướng nhanh" });
      await expect(tabs).toBeVisible();
      const t1 = Date.now();
      await tabs.getByRole("link", { name: "Lô tặng" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Lô tặng" })).toBeVisible({ timeout: 30_000 });
      const tabMs = Date.now() - t1;
      const t2 = Date.now();
      await page.reload();
      await expect(page.getByRole("heading", { level: 1, name: "Lô tặng" })).toBeVisible({ timeout: 30_000 });
      const reloadMs = Date.now() - t2;
      note(
        testInfo,
        "timing",
        `đăng nhập→Tổng quan ${loginMs} ms · bấm tab Lô tặng ${tabMs} ms · tải lại ${reloadMs} ms`,
      );
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
      await shot(page, testInfo, "P1-36-store-lowend", false);
      expect(Math.max(tabMs, reloadMs), "trang trong cổng hiện trong ≤ 5 s").toBeLessThanOrEqual(5_000);
    } finally {
      await ctx.close();
    }
  });

  test("P2-36 kho tặng giám khảo: đủ Xanh/Vàng/Đỏ, không lô hết hạn, đếm ngược, tên hư cấu, dải Dữ liệu demo", async ({
    page,
  }, testInfo) => {
    await login(page, CHARITY_EMAIL, "/charity/donations");
    await expect(page.getByRole("heading", { level: 1, name: "Kho tặng" })).toBeVisible();
    await expect(page.getByText(/Dữ liệu demo|dữ liệu demo/).first()).toBeVisible();
    const cards = page
      .locator("main")
      .getByRole("article")
      .filter({ has: page.getByRole("button", { name: "Xin nhận" }) });
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });
    const texts = await cards.allInnerTexts();
    const count = (l: string) =>
      texts.filter((t) => t.includes(`Nhãn ${l}`) || t.includes(`Nhãn\n${l}`)).length;
    note(
      testInfo,
      "labels",
      `${texts.length} lô: Xanh ${count("Xanh")} · Vàng ${count("Vàng")} · Đỏ ${count("Đỏ")}`,
    );
    expect(count("Xanh")).toBeGreaterThan(0);
    expect(count("Vàng")).toBeGreaterThan(0);
    expect(count("Đỏ")).toBeGreaterThan(0);
    for (const t of texts) {
      expect(t, "không có lô hết hạn trong kho tặng").not.toMatch(/Hết hạn|Đã hết hạn/);
      expect(t, "mỗi lô có đếm ngược").toMatch(/còn \d/);
    }
    const names = [
      ...new Set(
        texts.map(
          (t) =>
            t
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean)[1] ?? "",
        ),
      ),
    ];
    note(testInfo, "stores", names.join(" | "));
    for (const n of names)
      for (const brand of REAL_BRANDS)
        expect(n.toLowerCase(), `tên hư cấu: ${n}`).not.toContain(brand.toLowerCase());
    await shot(page, testInfo, "P2-36-donations");
  });

  test("P2-13/14/15 bản đồ kho tặng: marker màu theo nhãn, cụm có số, thẻ lô (km, phút, đếm ngược), lọc Đỏ và ≤ 3 km", async ({
    page,
  }, testInfo) => {
    await login(page, CHARITY_EMAIL, "/charity/donations");
    const map = page.getByRole("region", { name: /Bản đồ kho tặng/ });
    await expect(map).toBeVisible();
    await expect(map.locator(".maplibregl-canvas")).toBeVisible({ timeout: 30_000 });
    const markers = map.getByRole("button", { name: /gấp nhất: Nhãn/ });
    await expect(markers.first()).toBeVisible({ timeout: 30_000 });
    // Cụm được tính sau khi source cluster của MapLibre sẵn sàng; chưa có thì thu nhỏ một mức
    const clusterButtons = map.getByRole("button", { name: /^Cụm \d+ cửa hàng/ });
    if (
      !(await clusterButtons
        .first()
        .waitFor({ timeout: 15_000 })
        .then(() => true)
        .catch(() => false))
    ) {
      await map.getByRole("button", { name: "Thu nhỏ" }).click();
      await clusterButtons
        .first()
        .waitFor({ timeout: 15_000 })
        .catch(() => undefined);
    }
    const info = await markers.evaluateAll((bs) =>
      bs.map((b) => ({
        label: b.getAttribute("aria-label") ?? "",
        bg: getComputedStyle(b).backgroundColor,
        text: (b.textContent ?? "").trim(),
      })),
    );
    note(testInfo, "markers", info.map((m) => `${m.label.slice(0, 60)} [${m.bg}] ${m.text}`).join(" || "));
    const clusters = info.filter((m) => m.label.startsWith("Cụm"));
    const colorBy = new Map<string, Set<string>>();
    for (const m of info) {
      const l = m.label.match(/gấp nhất: Nhãn (Xanh|Vàng|Đỏ)/)?.[1];
      if (l) colorBy.set(l, (colorBy.get(l) ?? new Set()).add(m.bg));
    }
    note(testInfo, "colors", [...colorBy].map(([l, s]) => `${l}: ${[...s].join(",")}`).join(" · "));
    // Mỗi nhãn một màu, các nhãn khác nhau khác màu
    const palette = [...colorBy.values()].map((s) => [...s][0]);
    expect(new Set(palette).size).toBe(palette.length);
    expect(clusters.length, "có cụm (cluster) hiển thị số cửa hàng").toBeGreaterThan(0);
    for (const c of clusters) expect(c.text).toMatch(/^\d+$/);
    await shot(page, testInfo, "P2-13-map", false);

    // P2-14: bấm một marker (không phải cụm) ⇒ thẻ lô có km, phút xe máy, đếm ngược
    const single = map.getByRole("button", { name: /^(?!Cụm).*gấp nhất: Nhãn/ });
    if ((await single.count()) === 0) await map.getByRole("button", { name: /^Cụm/ }).first().click();
    await single.first().click();
    const selected = page.locator("main").getByRole("article").filter({ hasText: /km/ }).first();
    await expect(selected).toBeVisible();
    const card = await selected.innerText();
    note(testInfo, "card", card.replace(/\n+/g, " | ").slice(0, 300));
    expect(card).toMatch(/\d+(,\d+)? km|\d+ m/);
    expect(card).toMatch(/~\d+ phút/);
    expect(card).toMatch(/còn \d/);
    await shot(page, testInfo, "P2-14-marker-card", false);

    // P2-15: chỉ Đỏ + ≤ 3 km ⇒ danh sách và bản đồ cùng đổi
    await page.goto("/charity/donations?labels=red&maxKm=3");
    await expect(page.getByRole("button", { name: "Nhãn Đỏ", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const list = page
      .locator("main")
      .getByRole("article")
      .filter({ has: page.getByRole("button", { name: "Xin nhận" }) });
    await expect(list.first().or(page.getByRole("heading", { name: /Không có lô/ }))).toBeVisible({
      timeout: 30_000,
    });
    const filtered = await list.allInnerTexts();
    note(testInfo, "filter", `${filtered.length} lô Đỏ ≤ 3 km`);
    for (const t of filtered) {
      expect(t).toMatch(/Nhãn\s*Đỏ/);
      const km = t.match(/(\d+(?:,\d+)?) km/)?.[1];
      if (km) expect(Number(km.replace(",", "."))).toBeLessThanOrEqual(3);
    }
    const mapMarkers = await page
      .getByRole("region", { name: /Bản đồ kho tặng/ })
      .getByRole("button", { name: /gấp nhất: Nhãn/ })
      .evaluateAll((bs) => bs.map((b) => b.getAttribute("aria-label") ?? ""));
    for (const m of mapMarkers) expect(m).toContain("Nhãn Đỏ");
    await shot(page, testInfo, "P2-15-filter-red-3km");
  });

  test("P2-17 (giả lập Android yếu) kho tặng: chuyển Danh sách/Bản đồ, bản đồ ≤ 8 s", async ({
    browser,
    baseURL,
  }, testInfo) => {
    test.setTimeout(240_000);
    const { ctx, page } = await lowEndAndroid(browser, baseURL!);
    try {
      await login(page, CHARITY_EMAIL, "/charity/donations");
      await expect(page.getByRole("heading", { level: 1, name: "Kho tặng" })).toBeVisible({
        timeout: 30_000,
      });
      const t0 = Date.now();
      await page.getByRole("button", { name: "Bản đồ", exact: true }).click();
      await expect(
        page.getByRole("region", { name: /Bản đồ kho tặng/ }).locator(".maplibregl-canvas"),
      ).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByRole("button", { name: /gấp nhất: Nhãn/ }).first()).toBeVisible({
        timeout: 30_000,
      });
      const mapMs = Date.now() - t0;
      // Kéo bản đồ: đo thời gian một thao tác kéo (CPU chậm 4×)
      const canvas = page.locator(".maplibregl-canvas").first();
      const box = (await canvas.boundingBox())!;
      const t1 = Date.now();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 - 120, box.y + box.height / 2 - 60, { steps: 12 });
      await page.mouse.up();
      const dragMs = Date.now() - t1;
      await page.getByRole("button", { name: /^Danh sách/ }).click();
      await expect(page.getByRole("button", { name: "Xin nhận" }).first()).toBeVisible({ timeout: 15_000 });
      note(testInfo, "timing", `bản đồ hiện marker sau ${mapMs} ms · kéo 12 bước ${dragMs} ms`);
      await shot(page, testInfo, "P2-17-lowend-list", false);
      expect(mapMs, "bản đồ tải ≤ 8 s").toBeLessThanOrEqual(8_000);
    } finally {
      await ctx.close();
    }
  });

  test("P2-07 (chỉ đọc) form Đăng lô của cửa hàng demo có nút “Chụp ảnh để điền nhanh” (AI) hay không", async ({
    page,
  }, testInfo) => {
    await login(page, STORE_EMAIL, "/store/inventory/new");
    await expect(page.getByRole("heading", { level: 1, name: "Đăng lô mới" })).toBeVisible();
    const ai = await page.getByRole("button", { name: "Chụp ảnh để điền nhanh" }).count();
    note(
      testInfo,
      "P2-07 prod",
      ai ? "nút AI có trên production (FEATURE_AI bật)" : "không có nút AI trên production (FEATURE_AI tắt)",
    );
    await shot(page, testInfo, "P2-07-prod-offer-form", false);
  });

  test("P2-37 không có nút chuyển vai trò (role switcher) — tính năng P6-02 chưa làm", async ({
    page,
  }, testInfo) => {
    await login(page, STORE_EMAIL, "/store");
    await expect(page.getByRole("heading", { level: 1, name: "Tổng quan" })).toBeVisible();
    await page.getByRole("button", { name: /^Tài khoản:/ }).click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    const items = await menu.getByRole("menuitem").allInnerTexts();
    note(testInfo, "menu", items.join(" | "));
    expect(items.join(" ")).not.toMatch(/Chuyển vai trò|Chuyển sang/);
  });

  test("P2-38 + P2-19/20/34 luồng M1 bằng tài khoản giám khảo: đăng → xin → xác nhận → TNV hiện QR → cửa hàng quét → giao → tác động", async ({
    browser,
    page,
    playwright,
    baseURL,
  }, testInfo) => {
    test.setTimeout(600_000);
    const started = Date.now();
    const marks: string[] = [];
    const mark = (s: string) => marks.push(`${((Date.now() - started) / 1000).toFixed(1)} s · ${s}`);
    const title = `Bánh mì UAT ${new Date().toISOString().slice(11, 19).replace(/:/g, "")}`;

    // P2-34: bộ đếm công khai trước
    const landing = await browser.newPage({ baseURL, ...vnContext });
    const kgBefore = await landingKg(landing);
    note(testInfo, "landing-before", String(kgBefore));

    // 1. Cửa hàng (laptop) đăng lô 2 ổ bằng form
    const store = page;
    await login(store, STORE_EMAIL, "/store/inventory/new");
    await expect(store.getByRole("heading", { level: 1, name: "Đăng lô mới" })).toBeVisible();
    await store.locator("label", { hasText: "Bánh mì & bakery" }).click();
    await store.getByLabel("Tên lô").fill(title);
    await store.getByRole("textbox", { name: "Số lượng", exact: true }).fill("2");
    await store.getByRole("button", { name: "Ngày mai" }).click();
    await store.getByRole("checkbox", { name: /Tôi cam kết thực phẩm còn an toàn/ }).click();
    await store.getByRole("button", { name: "Đăng lô" }).click();
    await expect(store).toHaveURL(/\/store\/inventory$/, { timeout: 30_000 });
    await expect(store.getByRole("article").filter({ hasText: title })).toBeVisible();
    mark("cửa hàng đăng lô");
    await store.goto("/store");
    await expect(store.getByRole("heading", { level: 1, name: "Tổng quan" })).toBeVisible();
    const storeUnreadBefore = await stableUnread(store);

    // 2. Tổ chức (điện thoại) xin nhận 2 ổ
    const charityCtx = await browser.newContext({ ...devices["Pixel 7"], ...vnContext, baseURL });
    const charity = await charityCtx.newPage();
    const volunteerCtx = await browser.newContext({ ...devices["iPhone 13"], ...vnContext, baseURL });
    const volunteer = await volunteerCtx.newPage();
    try {
      await login(charity, CHARITY_EMAIL, "/charity/donations");
      const card = charity.getByRole("article").filter({ hasText: title });
      await expect(card).toBeVisible({ timeout: 30_000 });
      const charityUnreadBefore = await stableUnread(charity);
      await card.getByRole("button", { name: "Xin nhận" }).click();
      const dialog = charity.getByRole("dialog");
      await dialog.getByLabel(/Số lượng xin nhận/).fill("2");
      const tRequested = Date.now(); // đo từ lúc bấm "Gửi yêu cầu"
      await dialog.getByRole("button", { name: "Gửi yêu cầu" }).click();
      await expect(charity.getByText(/Đã gửi yêu cầu nhận 2 ổ/)).toBeVisible({ timeout: 30_000 });
      note(
        testInfo,
        "P2-18 toast",
        `${Date.now() - tRequested} ms từ lúc bấm tới thông báo "Đã gửi yêu cầu"`,
      );
      mark("tổ chức xin nhận 2 ổ");

      // P2-19: chuông cửa hàng tăng mà không tải lại trang
      await expect
        .poll(() => unread(store), { timeout: 60_000, intervals: [250] })
        .toBeGreaterThan(storeUnreadBefore);
      const storeLatency = Date.now() - tRequested;
      note(testInfo, "P2-19 latency", `${storeLatency} ms (yêu cầu → chuông cửa hàng, không tải lại)`);
      mark(`chuông cửa hàng sau ${storeLatency} ms`);
      await shot(store, testInfo, "P2-19-store-bell", false);

      // 3. Cửa hàng xác nhận
      await store.reload();
      const request = store
        .locator("#cho-xac-nhan")
        .getByRole("article")
        .filter({ has: store.getByRole("heading", { name: CHARITY_NAME }) })
        .filter({ hasText: title })
        .first();
      await expect(request).toBeVisible({ timeout: 30_000 });
      const tConfirmed = Date.now(); // đo từ lúc bấm "Xác nhận"
      await request.getByRole("button", { name: "Xác nhận" }).click();
      await expect(store.getByText(new RegExp(`Đã xác nhận 2 ổ cho ${CHARITY_NAME}`))).toBeVisible({
        timeout: 30_000,
      });
      mark("cửa hàng xác nhận");

      // P2-20: chuông tổ chức tăng mà không tải lại trang
      await expect
        .poll(() => unread(charity), { timeout: 60_000, intervals: [250] })
        .toBeGreaterThan(charityUnreadBefore);
      const charityLatency = Date.now() - tConfirmed;
      note(testInfo, "P2-20 latency", `${charityLatency} ms (xác nhận → chuông tổ chức, không tải lại)`);
      mark(`chuông tổ chức sau ${charityLatency} ms`);

      // 4. Tổ chức giao chuyến cho TNV giám khảo (chỉ lô vừa xin)
      await charity.goto("/charity/pickups");
      const planner = charity.getByRole("region", { name: /^Giao về / }).first();
      await expect(planner).toBeVisible({ timeout: 30_000 });
      const boxes = planner.getByRole("checkbox");
      const n = await boxes.count();
      for (let i = 0; i < n; i++) {
        const box = boxes.nth(i);
        const label = (await box.getAttribute("aria-label")) ?? "";
        const id = await box.getAttribute("id");
        const text = id
          ? await charity
              .locator(`label[for="${id}"]`)
              .innerText()
              .catch(() => "")
          : "";
        const name = `${label} ${text}`;
        if (name.includes(VOLUNTEER_NAME)) continue;
        if ((await box.isChecked()) && !name.includes(title)) await box.click();
      }
      const mine = planner.getByRole("checkbox", { name: literal(title) }).first();
      if (!(await mine.isChecked())) await mine.click();
      await planner.getByRole("radio", { name: "Tình nguyện viên" }).click();
      await planner.getByRole("checkbox", { name: literal(VOLUNTEER_NAME) }).check();
      await shot(charity, testInfo, "P2-38-assign-volunteer");
      await planner.getByRole("button", { name: `Giao chuyến cho ${VOLUNTEER_NAME}` }).click();
      await expect(charity.getByText(/Đã giao chuyến/).first()).toBeVisible({ timeout: 60_000 });
      mark("tổ chức giao chuyến cho TNV");

      // 5. TNV (iPhone giả lập): nhận chuyến, bắt đầu, check-in thủ công, hiện QR
      await login(volunteer, VOLUNTEER_EMAIL, "/volunteer/trips");
      await volunteer.goto("/volunteer");
      const cards = volunteer.locator("[data-trip-card]");
      await expect(cards.first()).toBeVisible({ timeout: 30_000 });
      let pickupId: string | null = null;
      for (const id of await cards.evaluateAll((els) => els.map((e) => e.getAttribute("data-trip-card")))) {
        if (!id) continue;
        const res = await volunteer.request.get(`/volunteer/trips/${id}`);
        if ((await res.text()).includes(title)) pickupId = id;
      }
      expect(pickupId, "TNV thấy chuyến mới").not.toBeNull();
      const tripCard = volunteer.locator(`[data-trip-card="${pickupId}"]`);
      await tripCard.getByRole("button", { name: "Nhận chuyến" }).click();
      await expect(tripCard).toContainText("Đã nhận", { timeout: 30_000 });
      await tripCard.getByRole("button", { name: "Bắt đầu chuyến" }).click();
      const consent = volunteer.getByRole("dialog", { name: "Chia sẻ vị trí khi chuyến đang chạy" });
      if (
        await consent
          .waitFor({ timeout: 10_000 })
          .then(() => true)
          .catch(() => false)
      ) {
        await consent.getByRole("button", { name: "Không, chỉ dùng check-in" }).click();
      }
      await expect(volunteer).toHaveURL(new RegExp(`/volunteer/trips/${pickupId}$`), { timeout: 30_000 });
      const current = volunteer.locator("[data-current-stop]").first();
      await expect(current).toContainText(STORE_NAME);
      const stopId = await current.getAttribute("data-current-stop");
      await current.getByRole("button", { name: "Tôi đã tới" }).click();
      const sheet = volunteer.getByRole("dialog", { name: /Không lấy được vị trí|Bạn chưa ở gần điểm này/ });
      await expect(sheet).toBeVisible({ timeout: 30_000 });
      await sheet.getByRole("radio").first().check();
      await sheet.getByRole("button", { name: "Check-in thủ công" }).click();
      const tCheck = Date.now();
      const showCode = volunteer.getByRole("button", { name: "Hiện mã cho cửa hàng" });
      if (
        !(await showCode
          .waitFor({ timeout: 30_000 })
          .then(() => true)
          .catch(() => false))
      ) {
        note(testInfo, "check-in", "thẻ điểm dừng chưa đổi sau 30 s ⇒ tải lại trang");
        await volunteer.reload();
      }
      await expect(showCode).toBeVisible({ timeout: 30_000 });
      note(testInfo, "check-in-ms", String(Date.now() - tCheck));
      await showCode.click();
      const qrDialog = volunteer.getByRole("dialog", { name: "Mã bàn giao" });
      const qr = qrDialog.locator("svg[data-qr-size]");
      await expect(qr).toBeVisible();
      const code = (await qrDialog.locator("[data-handover-code]").innerText()).replace(/\D/g, "");
      expect(code).toMatch(/^\d{6}$/);
      await shot(volunteer, testInfo, "P2-38-volunteer-qr", false);
      mark("TNV hiện QR");

      // 6. Cửa hàng (laptop) quét QR bằng webcam (camera giả phát đúng QR đang hiện trên điện thoại TNV)
      const video = testInfo.outputPath("prod-qr.y4m");
      writeQrVideo(
        video,
        (await qr.locator("path").getAttribute("d"))!,
        Number(await qr.getAttribute("data-qr-size")),
      );
      const camBrowser = await playwright.chromium.launch({
        args: [
          "--use-fake-ui-for-media-stream",
          "--use-fake-device-for-media-stream",
          `--use-file-for-fake-video-capture=${video}`,
        ],
      });
      let scanned = false;
      try {
        const camCtx = await camBrowser.newContext({
          ...vnContext,
          baseURL,
          viewport: { width: 1440, height: 900 },
          permissions: ["camera"],
        });
        const scanner = await camCtx.newPage();
        await login(scanner, STORE_EMAIL, "/store/handover");
        await expect(scanner.getByRole("heading", { level: 1, name: "Bàn giao" })).toBeVisible();
        await scanner.getByRole("button", { name: "Quét mã QR" }).click();
        const review = scanner.getByRole("dialog", { name: "Xác nhận bàn giao" });
        const tScan = Date.now();
        scanned = await review
          .waitFor({ state: "visible", timeout: 30_000 })
          .then(() => true)
          .catch(() => false);
        note(testInfo, "scan-ms", scanned ? String(Date.now() - tScan) : "không đọc được trong 30 s");
        if (!scanned) {
          await scanner.keyboard.press("Escape");
          const pending = scanner.locator(`[data-pending-stop="${stopId}"]`);
          await pending.getByRole("button", { name: "Nhập mã 6 số" }).click({ timeout: 30_000 });
          await review.getByLabel("Mã 6 số trên điện thoại người nhận").fill(code);
        }
        await expect(review).toContainText(title);
        await shot(scanner, testInfo, "P2-38-store-review", false);
        await review.getByRole("button", { name: "Xác nhận bàn giao" }).click();
        await expect(scanner.getByRole("dialog", { name: "Đã bàn giao" })).toBeVisible({ timeout: 30_000 });
        await shot(scanner, testInfo, "P2-38-store-done", false);
      } finally {
        await camBrowser.close();
      }
      note(testInfo, "scan", scanned ? "quét QR bằng camera" : "camera không đọc được ⇒ nhập mã 6 số");
      mark(scanned ? "cửa hàng quét QR" : "cửa hàng nhập mã 6 số");

      // 7. Điện thoại TNV tự sang điểm giao (không tải lại), hiện mã giao hàng
      await expect(qrDialog).toBeHidden({ timeout: 30_000 });
      const dropoff = volunteer.locator("[data-current-stop]").filter({ hasText: "Giao về" }).first();
      await expect(dropoff).toBeVisible({ timeout: 30_000 });
      await dropoff.getByRole("button", { name: "Hiện mã giao hàng" }).click();
      const dropDialog = volunteer.getByRole("dialog", { name: "Mã giao hàng" });
      const dropCode = (await dropDialog.locator("[data-handover-code]").innerText()).replace(/\D/g, "");
      mark("TNV hiện mã giao hàng");

      // 8. Tổ chức nhận hàng (nhập mã 6 số), sổ tác động tăng
      const impactBefore = await charityKg(charity);
      await charity.goto(`/charity/receive?trip=${pickupId}`);
      const recv = charity.locator(`[data-pending-dropoff="${pickupId}"]`);
      await expect(recv).toBeVisible({ timeout: 30_000 });
      await recv.getByRole("button", { name: "Nhập mã 6 số" }).click();
      const confirm = charity.getByRole("dialog", { name: "Xác nhận nhận hàng" });
      await confirm.getByLabel("Mã 6 số trên điện thoại tình nguyện viên").fill(dropCode);
      await confirm.getByRole("button", { name: "Xác nhận đã nhận hàng" }).click();
      const done = charity.getByRole("dialog", { name: "Đã nhận hàng" });
      await expect(done).toBeVisible({ timeout: 30_000 });
      await expect(done.locator("[data-ledger]")).toContainText("Đã ghi vào sổ tác động");
      await shot(charity, testInfo, "P2-38-charity-received", false);
      mark("tổ chức nhận hàng, ghi sổ tác động");
      await expect(volunteer.locator("[data-trip-done]")).toBeVisible({ timeout: 30_000 });
      await shot(volunteer, testInfo, "P2-38-volunteer-done", false);

      const impactAfter = await charityKg(charity);
      note(testInfo, "impact", `Thực phẩm được cứu (kg) trước: ${impactBefore} · sau: ${impactAfter}`);
      await shot(charity, testInfo, "P2-38-charity-impact");
      const elapsed = Date.now() - started;
      note(testInfo, "P2-38 timeline", marks.join(" → "));
      note(testInfo, "P2-38 elapsed", `${(elapsed / 1000).toFixed(0)} s (máy tự thao tác)`);

      // P2-34: số demo không cộng vào bộ đếm công khai
      const kgAfter = await landingKg(landing);
      note(testInfo, "landing-after", String(kgAfter));
      expect(kgAfter).toBe(kgBefore);
      await shot(landing, testInfo, "P2-34-landing-counter");
      expect(elapsed, "chạy hết ≤ 5 phút").toBeLessThanOrEqual(5 * 60_000);
    } finally {
      await charityCtx.close();
      await volunteerCtx.close();
      await landing.close();
    }
  });
});
