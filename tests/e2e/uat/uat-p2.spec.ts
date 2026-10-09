import { randomUUID } from "node:crypto";

import { devices, expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";

import { loginAdminWithMfa, revokeAdmin } from "../fixtures/admin";
import { accessTokenOf, addMember, adminPatch, createSite, rpcAs, seedSensitive } from "../fixtures/orgs";
import {
  createConfirmedUser,
  createOrgFor,
  loginAs,
  serviceKey,
  SUPABASE_URL,
  type TestUser,
} from "../fixtures/users";
import { writeQrVideo } from "../handover/scenario";
import { EXIF_MARKER, makePng } from "../onboarding/helpers";
import {
  journeyStore,
  literal,
  MOJIBAKE,
  note,
  roundUp,
  shot,
  startDispatchPump,
  tag,
  vnParts,
  waitForMail,
} from "./helpers";
import { jitteredCenter, retireOldUatWorlds } from "./world";

/**
 * UAT P2 — Vòng lõi MVP (docs/uat/P2-core-loop.md) trên bản build production LOCAL + Supabase local + Mailpit.
 * Phần H (prod, tài khoản giám khảo) nằm ở uat-prod.spec.ts. Thao tác của người dùng đi qua giao diện; fixture chỉ
 * dựng tổ chức/điểm đã duyệt, TNV, lô nền quanh tổ chức (để có đủ nhãn trên bản đồ) và Admin.
 * pg_cron/pg_net của Supabase local không gọi được máy chủ UAT ⇒ test chạy "máy bơm" dispatcher (startDispatchPump).
 */

const H = 3_600_000;
const MIN = 60_000;

type Org = { user: TestUser; orgId: string; orgName: string; siteId: string };
type Lot = { offerId: string; title: string };

async function serviceRest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const key = serviceKey();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : null) as T;
}

async function approvedOrg(
  kind: "store" | "charity",
  name: string,
  at: { lat: number; lng: number },
  fullName: string,
): Promise<Org> {
  const user = await createConfirmedUser({ prefix: `uat2-${kind}`, fullName });
  const org = await createOrgFor(user, { kind, status: "approved", name });
  await seedSensitive(org.id, { contact_phone: kind === "store" ? "0901234567" : "0912345678" });
  const site = await createSite(org.id, {
    name: kind === "store" ? `Chi nhánh ${name.split(" ").at(-1)}` : `Điểm nhận ${name.split(" ").at(-1)}`,
    ...at,
    address: kind === "store" ? "12 Đường Số 7" : "45 Đường Số 9",
  });
  return { user, orgId: org.id, orgName: name, siteId: site.id };
}

/** Lô nền (fixture, RPC thật dưới quyền chủ cửa hàng) — chỉ để kho tặng có đủ nhãn/danh mục. */
async function lotViaApi(
  store: Org,
  opts: { title: string; category: string; quantity: number; hours: number; unit?: string },
): Promise<Lot> {
  const token = await accessTokenOf(store.user);
  const now = Date.now();
  const offerId = await rpcAs<string>(token, "create_offer", {
    p_payload: {
      site_id: store.siteId,
      category_code: opts.category,
      title: opts.title,
      quantity: opts.quantity,
      ...(opts.unit ? { unit: opts.unit } : {}),
      expiry: { datetime: new Date(now + opts.hours * H).toISOString() },
      pickup_start: new Date(now - 5 * MIN).toISOString(),
      pickup_end: new Date(now + opts.hours * H).toISOString(),
    },
    p_client_op_id: randomUUID(),
  });
  await rpcAs(token, "publish_offer", {
    p_offer_id: offerId,
    p_safety_attested: true,
    p_client_op_id: randomUUID(),
  });
  return { offerId, title: opts.title };
}

function offset(c: { lat: number; lng: number }, km: number, bearing: number) {
  const rad = (bearing * Math.PI) / 180;
  return {
    lat: Math.round((c.lat + (km * Math.cos(rad)) / 111.32) * 1e6) / 1e6,
    lng:
      Math.round((c.lng + (km * Math.sin(rad)) / (111.32 * Math.cos((c.lat * Math.PI) / 180))) * 1e6) / 1e6,
  };
}

/** Form "Đăng lô mới" như cửa hàng điền tay. */
async function fillOffer(
  page: Page,
  o: {
    category: string;
    title: string;
    quantity: string;
    unit?: string;
    expiry?: number | "today" | "tomorrow";
    pickupStart?: number;
    pickupEnd?: number;
  },
) {
  await page.goto("/store/inventory/new");
  await expect(page.getByRole("heading", { level: 1, name: "Đăng lô mới" })).toBeVisible();
  await page.locator("label", { hasText: o.category }).first().click();
  await page.getByLabel("Tên lô").fill(o.title);
  if (o.unit) await page.getByLabel("Đơn vị").selectOption(o.unit);
  await page.getByRole("textbox", { name: "Số lượng", exact: true }).fill(o.quantity);
  if (o.expiry === "today") await page.getByRole("button", { name: "Hôm nay" }).click();
  else if (o.expiry === "tomorrow") await page.getByRole("button", { name: "Ngày mai" }).click();
  else if (typeof o.expiry === "number") {
    const e = vnParts(o.expiry);
    await page.getByLabel("Hạn sử dụng (ngày)").fill(e.date);
    await page.getByLabel("Giờ hết hạn").fill(e.hhmm);
  }
  if (o.pickupStart) {
    const s = vnParts(o.pickupStart);
    await page.locator("#offer-start-date").fill(s.date);
    await page.locator("#offer-start-time").fill(s.hhmm);
  }
  if (o.pickupEnd) {
    const e = vnParts(o.pickupEnd);
    await page.locator("#offer-end-date").fill(e.date);
    await page.locator("#offer-end-time").fill(e.hhmm);
    await page.locator("#offer-end-time").blur();
  }
}

async function attestAndPublish(page: Page) {
  await page.getByRole("checkbox", { name: /Tôi cam kết thực phẩm còn an toàn/ }).click();
  await page.getByRole("button", { name: "Đăng lô" }).click();
  await expect(page).toHaveURL(/\/store\/inventory$/, { timeout: 30_000 });
}

async function inventoryCard(page: Page, title: string) {
  await page.goto("/store/inventory");
  const card = page.getByRole("article").filter({ hasText: title }).first();
  await expect(card).toBeVisible({ timeout: 20_000 });
  return card;
}

async function bell(page: Page): Promise<number> {
  const label =
    (await page
      .getByRole("button", { name: /^Thông báo/ })
      .first()
      .getAttribute("aria-label")) ?? "";
  return Number(label.match(/(\d+) chưa đọc/)?.[1] ?? 0);
}

/** Điện thoại TNV/tổ chức (Pixel 7 = 🤖, iPhone 13 kích thước/UA trên Chromium = 🍎). */
async function phone(browser: Browser, testInfo: TestInfo, kind: "android" | "iphone") {
  return browser.newContext({
    ...devices[kind === "android" ? "Pixel 7" : "iPhone 13"],
    baseURL: testInfo.project.use.baseURL,
    locale: "vi-VN",
    timezoneId: "Asia/Ho_Chi_Minh",
    reducedMotion: "reduce",
  });
}

/** Chrome có camera giả phát đúng mã QR đang hiển thị (máy quét thật ZXing đọc từ khung hình). */
async function cameraBrowser(testInfo: TestInfo, qrPage: Page, dialogName: string, file: string) {
  const qr = qrPage.getByRole("dialog", { name: dialogName }).locator("svg[data-qr-size]");
  await expect(qr).toBeVisible();
  const video = testInfo.outputPath(file);
  writeQrVideo(
    video,
    (await qr.locator("path").getAttribute("d"))!,
    Number(await qr.getAttribute("data-qr-size")),
  );
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-video-capture=${video}`,
    ],
  });
  const ctx = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    locale: "vi-VN",
    timezoneId: "Asia/Ho_Chi_Minh",
    viewport: { width: 1440, height: 900 },
    permissions: ["camera"],
    reducedMotion: "reduce",
  });
  return { browser, page: await ctx.newPage() };
}

// ---------------------------------------------------------------------------------------------------------------
// A + B. Đăng lô và nhãn tươi (cửa hàng)
// ---------------------------------------------------------------------------------------------------------------

type JA = { t: string; storeA?: Org; storeClose?: Org & { closeAt: number }; lots: Record<string, string> };
let A: JA;
let saveA = () => {};

test.describe("UAT P2 — A/B đăng lô và nhãn tươi", () => {
  test.describe.configure({ mode: "default", timeout: 240_000 });

  test.beforeAll(async ({ browserName: _b }, testInfo) => {
    const s = journeyStore<JA>("uat-p2a", testInfo, () => ({ t: tag(testInfo), lots: {} }));
    A = s.state;
    saveA = s.save;
    if (!A.storeA) {
      const base =
        testInfo.project.name === "mobile" ? { lat: 10.66, lng: 106.6 } : { lat: 10.66, lng: 106.55 };
      A.storeA = await approvedOrg("store", `Tiệm bánh UAT Hạt Lúa ${A.t}`, base, "Nguyễn Thị Thu Lan");
      saveA();
    }
  });
  test.afterEach(() => saveA());

  test("P2-01 danh mục Bánh mì, 20, đơn vị cái ⇒ khối lượng mỗi cái tự điền, sửa được", async ({
    page,
  }, testInfo) => {
    await loginAs(page, A.storeA!.user, "/store/inventory/new");
    await page.locator("label", { hasText: "Bánh mì & bakery" }).first().click();
    await expect(page.getByText("Ước tính theo danh mục")).toBeVisible();
    const defaultUnit = await page.getByLabel("Đơn vị").inputValue();
    const defaultWeight = await page.getByLabel(/Khối lượng mỗi/).inputValue();
    await page.getByLabel("Đơn vị").selectOption("piece");
    const weight = page.getByLabel(/Khối lượng mỗi cái/);
    await expect(weight).toBeVisible();
    const filled = await weight.inputValue();
    note(
      testInfo,
      "P2-01",
      `đơn vị mặc định của Bánh mì: ${defaultUnit} (tự điền ${defaultWeight} kg, “Ước tính theo danh mục”); đổi sang “cái” ⇒ khối lượng mỗi cái = “${filled}”`,
    );
    expect(defaultWeight).toMatch(/^\d+(,\d+)?$/);
    expect.soft(filled, "đổi sang “cái” vẫn có khối lượng mặc định").toMatch(/^\d+(,\d+)?$/);
    await weight.fill("0,08");
    await expect(weight).toHaveValue("0,08");
    await expect(page.getByText("Ước tính theo danh mục")).toHaveCount(0);
    await page.getByRole("textbox", { name: "Số lượng", exact: true }).fill("20");
    await shot(page, testInfo, "P2-01-weight-default");
  });

  test("P2-02/03 hạn hôm nay, khung lấy 2 giờ tới; chưa tick cam kết ⇒ không đăng; tick ⇒ lô có nhãn chữ + đếm ngược", async ({
    page,
  }, testInfo) => {
    await loginAs(page, A.storeA!.user, "/store/inventory/new");
    const title = `Bánh mì que ${A.t}`;
    await fillOffer(page, {
      category: "Bánh mì & bakery",
      title,
      quantity: "20",
      unit: "piece",
      expiry: "today",
    });
    await page.getByLabel(/Khối lượng mỗi cái/).fill("0,08");
    const publish = page.getByRole("button", { name: "Đăng lô" });
    await expect(publish).toBeDisabled();
    await expect(page.getByText("Tick ô cam kết an toàn thực phẩm để bật nút “Đăng lô”.")).toBeVisible();
    await publish.click({ force: true }).catch(() => undefined);
    await expect(page).toHaveURL(/\/store\/inventory\/new$/);
    await shot(page, testInfo, "P2-02-attest-required");
    await attestAndPublish(page);
    const card = await inventoryCard(page, title);
    await expect(card.getByText(/Nhãn (Xanh|Vàng|Đỏ)/)).toBeVisible();
    const text = await card.innerText();
    note(testInfo, "P2-03 thẻ lô", text.replace(/\n+/g, " | ").slice(0, 300));
    expect(text).toMatch(/còn \d|\d+:\d\d/);
    A.lots.p203 = title;
    await shot(page, testInfo, "P2-03-inventory-label-countdown");
  });

  test("P2-04 cửa hàng đóng cửa sớm hơn hạn dùng ⇒ đếm ngược tới giờ đóng cửa", async ({
    page,
  }, testInfo) => {
    const now = Date.now();
    const close = roundUp(now + 3 * H, 60);
    test.skip(
      vnParts(close).hm >= "23:00" || vnParts(close).date !== vnParts(now).date,
      "Giờ đóng cửa thử phải trong hôm nay",
    );
    if (!A.storeClose) {
      const at =
        testInfo.project.name === "mobile" ? { lat: 10.67, lng: 106.6 } : { lat: 10.67, lng: 106.55 };
      const org = await approvedOrg("store", `Bếp UAT Đóng Sớm ${A.t}`, at, "Trần Văn Bếp");
      // Giờ mở cửa mọi ngày 06:00 → giờ đóng thử (cách bây giờ ~3 giờ)
      const closes = `${vnParts(close).hm}:00`;
      await serviceRest("site_hours", {
        method: "POST",
        body: JSON.stringify(
          [0, 1, 2, 3, 4, 5, 6].map((dow) => ({ site_id: org.siteId, dow, opens: "06:00:00", closes })),
        ),
      });
      A.storeClose = { ...org, closeAt: close };
    }
    await loginAs(page, A.storeClose.user, "/store/inventory/new");
    const title = `Bánh bao ${A.t}`;
    await fillOffer(page, {
      category: "Bánh mì & bakery",
      title,
      quantity: "10",
      expiry: "today",
      pickupStart: roundUp(now + 5 * MIN, 5),
      pickupEnd: A.storeClose.closeAt,
    });
    const preview = page.getByRole("complementary", { name: "Xem trước lô" });
    await expect(preview.getByText("(giờ đóng cửa)")).toBeVisible();
    note(testInfo, "P2-04 xem trước", (await preview.innerText()).replace(/\n+/g, " | ").slice(0, 300));
    await shot(page, testInfo, "P2-04-preview-close");
    await attestAndPublish(page);
    const card = await inventoryCard(page, title);
    const text = await card.innerText();
    note(testInfo, "P2-04 thẻ lô", text.replace(/\n+/g, " | ").slice(0, 300));
    const [o] = await serviceRest<{ effective_deadline: string; expires_at: string }[]>(
      `offers?select=effective_deadline,expires_at&org_id=eq.${A.storeClose.orgId}&title=eq.${encodeURIComponent(title)}`,
    );
    expect(new Date(o!.effective_deadline).getTime()).toBe(A.storeClose.closeAt);
    expect(new Date(o!.expires_at).getTime()).toBeGreaterThan(A.storeClose.closeAt);
    // Đếm ngược ~3 giờ (tới giờ đóng cửa), không phải tới 23:59
    const m = text.match(/còn (\d+) giờ/);
    if (m) expect(Number(m[1])).toBeLessThanOrEqual(3);
    expect(text).toContain(vnParts(A.storeClose.closeAt).hm);
    await shot(page, testInfo, "P2-04-inventory-close");
  });

  test("P2-05 2,5 cái bị từ chối; đổi sang kg thì 2,5 hợp lệ", async ({ page }, testInfo) => {
    await loginAs(page, A.storeA!.user, "/store/inventory/new");
    await page.locator("label", { hasText: "Bánh mì & bakery" }).first().click();
    await page.getByLabel("Đơn vị").selectOption("piece");
    const qty = page.getByRole("textbox", { name: "Số lượng", exact: true });
    await qty.fill("2,5");
    await qty.blur();
    await expect(page.getByText("Số lượng phải là số nguyên với đơn vị cái.")).toBeVisible();
    await shot(page, testInfo, "P2-05-integer-required");
    await page.getByLabel("Đơn vị").selectOption("kg");
    await qty.fill("2,5");
    await qty.blur();
    await expect(page.getByText(/Số lượng phải là số nguyên/)).toHaveCount(0);
  });

  test("P2-06 bấm Đăng 3 lần thật nhanh ⇒ chỉ 1 lô", async ({ page }) => {
    await loginAs(page, A.storeA!.user, "/store/inventory/new");
    const title = `Bánh mì bấm nhanh ${A.t}`;
    await fillOffer(page, { category: "Bánh mì & bakery", title, quantity: "6", expiry: "tomorrow" });
    await page.getByRole("checkbox", { name: /Tôi cam kết thực phẩm còn an toàn/ }).click();
    const btn = page.getByRole("button", { name: "Đăng lô" });
    await expect(btn).toBeEnabled();
    // 3 cú bấm liền nhau trong cùng một nhịp
    await btn.evaluate((b: HTMLButtonElement) => {
      b.click();
      b.click();
      b.click();
    });
    await expect(page).toHaveURL(/\/store\/inventory$/, { timeout: 30_000 });
    const rows = await serviceRest<{ id: string }[]>(
      `offers?select=id&org_id=eq.${A.storeA!.orgId}&title=eq.${encodeURIComponent(title)}`,
    );
    expect(rows).toHaveLength(1);
  });

  test("P2-07/08 đăng lô bằng ảnh (AI) ⇒ tự điền, sửa được, có ghi chú AI; ảnh lưu không còn EXIF/GPS", async ({
    page,
  }, testInfo) => {
    await loginAs(page, A.storeA!.user, "/store/inventory/new");
    const ai = page.getByRole("button", { name: "Chụp ảnh để điền nhanh" });
    const aiOn = (await ai.count()) > 0;
    note(
      testInfo,
      "P2-07 AI",
      aiOn ? "nút AI có trên máy chủ UAT" : "FEATURE_AI tắt trên máy chủ UAT local ⇒ chỉ kiểm phần ảnh",
    );
    if (aiOn) {
      const chooser = page.waitForEvent("filechooser");
      const t0 = Date.now();
      await ai.click();
      await (
        await chooser
      ).setFiles({ name: "banh-mi.png", mimeType: "image/png", buffer: makePng(320, 240) });
      await expect(page.getByText(/AI đã (điền gợi ý|gợi ý nhưng chưa chắc chắn)/)).toBeVisible({
        timeout: 15_000,
      });
      note(testInfo, "P2-07 thời gian AI", `${Date.now() - t0} ms (provider của máy chủ UAT)`);
      await expect(page.getByText("AI gợi ý — kiểm tra lại").first()).toBeVisible();
      await page.getByLabel("Tên lô").fill(`Bánh mì AI ${A.t}`);
      await expect(page.getByLabel("Tên lô")).toHaveValue(`Bánh mì AI ${A.t}`);
    } else {
      await page.locator("label", { hasText: "Bánh mì & bakery" }).first().click();
      await page.getByLabel("Tên lô").fill(`Bánh mì có ảnh ${A.t}`);
      await page
        .locator('input[type="file"]')
        .first()
        .setInputFiles({
          name: "banh-mi-co-gps.png",
          mimeType: "image/png",
          buffer: makePng(320, 240),
        });
      await expect(page.getByRole("img", { name: "Ảnh lô đã chọn" })).toBeVisible({ timeout: 20_000 });
    }
    await page.getByRole("textbox", { name: "Số lượng", exact: true }).fill("8");
    await page.getByRole("button", { name: "Ngày mai" }).click();
    await shot(page, testInfo, "P2-07-photo-form");
    await page.getByRole("button", { name: "Lưu nháp" }).click();
    await expect(page).toHaveURL(/\/store\/inventory\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    const id = page.url().split("/").pop()!;
    const [o] = await serviceRest<{ photo_paths: string[]; ai_assisted: boolean }[]>(
      `offers?select=photo_paths,ai_assisted&id=eq.${id}`,
    );
    expect(o!.photo_paths.length).toBe(1);
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/public/media/${o!.photo_paths[0]}`);
    expect(res.ok).toBe(true);
    const bytes = Buffer.from(await res.arrayBuffer());
    note(
      testInfo,
      "P2-08",
      `ảnh lưu ${o!.photo_paths[0]} (${bytes.length} byte), có chuỗi EXIF gốc: ${bytes.includes(Buffer.from(EXIF_MARKER))}`,
    );
    expect(bytes.includes(Buffer.from(EXIF_MARKER))).toBe(false);
    expect(bytes.includes(Buffer.from("Exif"))).toBe(false);
  });

  test("P2-09/10 nhãn theo nhóm hàng: cơm +20h/+8h/+3h = Xanh/Vàng/Đỏ; rau +48h, mì gói +5 ngày = Vàng", async ({
    page,
  }, testInfo) => {
    test.setTimeout(360_000);
    await loginAs(page, A.storeA!.user, "/store/inventory");
    const now = Date.now();
    const cases: [string, string, number, string, string?][] = [
      ["Cơm hộp & món chế biến", `Cơm hộp +20h ${A.t}`, 20, "Xanh"],
      ["Cơm hộp & món chế biến", `Cơm hộp +8h ${A.t}`, 8, "Vàng"],
      ["Cơm hộp & món chế biến", `Cơm hộp +3h ${A.t}`, 3, "Đỏ"],
      ["Rau củ tươi", `Rau muống +48h ${A.t}`, 48, "Vàng"],
      ["Đồ khô", `Mì gói +5 ngày ${A.t}`, 120, "Vàng"],
    ];
    const got: string[] = [];
    for (const [cat, title, hours, expected] of cases) {
      // Khung lấy kéo tới hạn dùng (hạn hiệu lực = mốc sớm nhất của hạn dùng, cuối khung lấy, giờ đóng cửa)
      const expiry = roundUp(now + hours * H, 5);
      await fillOffer(page, {
        category: cat,
        title,
        quantity: "10",
        expiry,
        pickupStart: roundUp(now + 5 * MIN, 5),
        pickupEnd: expiry,
      });
      await attestAndPublish(page);
      const card = await inventoryCard(page, title);
      const label = (
        await card
          .getByText(/Nhãn (Xanh|Vàng|Đỏ)/)
          .first()
          .innerText()
      )
        .replace("Nhãn", "")
        .trim();
      got.push(`${title.replace(` ${A.t}`, "")} ⇒ ${label}`);
      expect.soft(label, title).toBe(expected);
    }
    // Quan sát: cùng lô cơm +20h nhưng để khung lấy mặc định (2 giờ) ⇒ nhãn theo cuối khung lấy
    await fillOffer(page, {
      category: "Cơm hộp & món chế biến",
      title: `Cơm hộp +20h khung mặc định ${A.t}`,
      quantity: "10",
      expiry: roundUp(now + 20 * H, 5),
    });
    await attestAndPublish(page);
    const dflt = await inventoryCard(page, `Cơm hộp +20h khung mặc định ${A.t}`);
    got.push(
      `Cơm +20h (khung mặc định 2 giờ) ⇒ ${(
        await dflt
          .getByText(/Nhãn (Xanh|Vàng|Đỏ)/)
          .first()
          .innerText()
      )
        .replace("Nhãn", "")
        .trim()}`,
    );
    note(testInfo, "P2-09/10", got.join(" · "));
    await page.goto("/store/inventory");
    await shot(page, testInfo, "P2-09-labels");
  });

  test("P2-11/12 tên nhãn thống nhất Xanh/Vàng/Đỏ; Admin “Giám sát lô” có nhãn và lọc theo nhãn", async ({
    page,
    browser,
  }, testInfo) => {
    await loginAs(page, A.storeA!.user, "/store/inventory");
    await expect(page.getByText(/Nhãn (Xanh|Vàng|Đỏ)/).first()).toBeVisible({ timeout: 30_000 });
    const storeText = await page.locator("main").innerText();
    expect(storeText).toMatch(/Nhãn (Xanh|Vàng|Đỏ)/);
    expect(storeText).not.toMatch(/Còn hạn|Cận hạn|Sắp hết hạn/);
    // Admin
    const ctx = await browser.newContext({
      ...testInfo.project.use,
      locale: "vi-VN",
      timezoneId: "Asia/Ho_Chi_Minh",
    });
    const adminPage = await ctx.newPage();
    const { admin } = await loginAdminWithMfa(adminPage);
    try {
      await adminPage.goto("/admin/offers");
      await expect(adminPage.getByRole("heading", { level: 1 })).toBeVisible();
      const placeholder = adminPage.getByRole("heading", { name: /Tính năng mở ở giai đoạn/ });
      const text = await adminPage.locator("main").innerText();
      note(testInfo, "P2-12 /admin/offers", text.replace(/\n+/g, " | ").slice(0, 300));
      await shot(adminPage, testInfo, "P2-12-admin-offers");
      expect(text).not.toMatch(/Còn hạn|Cận hạn|Sắp hết hạn/);
      await expect(placeholder, "Admin có màn Giám sát lô (không phải trang giữ chỗ)").toHaveCount(0);
      await expect(adminPage.getByText(/Nhãn (Xanh|Vàng|Đỏ)/).first()).toBeVisible();
    } finally {
      await revokeAdmin(admin);
      await ctx.close();
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------
// C–G. Kho tặng, yêu cầu ↔ xác nhận, bàn giao QR / mã 6 số, tác động
// ---------------------------------------------------------------------------------------------------------------

type JC = {
  t: string;
  center: { lat: number; lng: number };
  storeA?: Org;
  charity?: Org;
  volunteer?: TestUser;
  lotA?: Lot & { weight: number };
  bg?: Record<string, Lot>;
  allocation15?: string;
  pickupId?: string;
  impactBefore?: { charityKg: string; storeKg: string };
  done?: Record<string, boolean>;
};
let C: JC;
let saveC = () => {};

test.describe("UAT P2 — C…G kho tặng, yêu cầu, bàn giao, tác động", () => {
  test.describe.configure({ mode: "default", timeout: 300_000 });

  test.beforeAll(async ({ browserName: _b }, testInfo) => {
    const s = journeyStore<JC>("uat-p2c", testInfo, () => ({
      t: tag(testInfo),
      // Mỗi lượt chạy một ô riêng (desktop/mobile cách nhau ≥ 11 km), lượt cũ cùng project bị tạm ngưng
      center: jitteredCenter(
        testInfo.project.name === "mobile" ? { lat: 11.15, lng: 106.9 } : { lat: 11.15, lng: 106.75 },
        0.2,
      ),
      done: {},
    }));
    C = s.state;
    saveC = s.save;
    if (C.charity) return;
    const retired = await retireOldUatWorlds(
      testInfo.project.name,
      C.t,
      /^(Mái ấm UAT Hướng Dương|Tiệm bánh UAT Mây|Siêu thị UAT Lá Xanh|Cửa hàng UAT Phố Lá|Tiệm UAT Xa Xôi)/,
    );
    note(testInfo, "cô lập", `tạm ngưng ${retired} tổ chức UAT của lượt trước`);
    const c = C.center;
    // Tổ chức [TC] (bán kính 5 km, không nhận Thịt & hải sản) + TNV1; cửa hàng [CH-A] ~1 km
    C.charity = await approvedOrg("charity", `Mái ấm UAT Hướng Dương ${C.t}`, c, "Võ Thị Hạnh");
    await adminPatch(`sites?id=eq.${C.charity.siteId}`, {
      radius_km: 5,
      accepted_categories: [
        "bread",
        "cooked_meal",
        "pastry",
        "vegetables",
        "fruit",
        "dairy",
        "beverage",
        "dry_goods",
      ],
    });
    C.volunteer = await createConfirmedUser({ prefix: "uat2-tnv", fullName: `Lê Minh Khoa ${C.t}` });
    await addMember(C.charity.orgId, C.volunteer, "volunteer");
    await rpcAs(await accessTokenOf(C.volunteer), "upsert_volunteer_profile", {
      p_payload: {
        vehicle: "motorbike",
        capacity_kg: 25,
        lat: c.lat + 0.005,
        lng: c.lng,
        base_area_label: "Phường Tân Hưng",
      },
    });
    C.storeA = await approvedOrg("store", `Tiệm bánh UAT Mây ${C.t}`, offset(c, 1, 45), "Nguyễn Thị Thu Lan");
    // Lô nền quanh tổ chức: Xanh/Vàng (trong bán kính), Thịt (danh mục không nhận), một cửa hàng ngoài bán kính
    const near1 = await approvedOrg(
      "store",
      `Siêu thị UAT Lá Xanh ${C.t}`,
      offset(c, 2, 150),
      "Phạm Văn Hải",
    );
    const near2 = await approvedOrg(
      "store",
      `Cửa hàng UAT Phố Lá ${C.t}`,
      offset(c, 2.1, 160),
      "Trần Thị Bích",
    );
    const far = await approvedOrg("store", `Tiệm UAT Xa Xôi ${C.t}`, offset(c, 7, 90), "Đỗ Văn Xa");
    C.bg = {
      green: await lotViaApi(near1, {
        title: `Mì gói thùng ${C.t}`,
        category: "dry_goods",
        quantity: 5,
        hours: 24 * 10,
      }),
      yellow: await lotViaApi(near2, {
        title: `Rau cải ${C.t}`,
        category: "vegetables",
        quantity: 6,
        hours: 48,
      }),
      meat: await lotViaApi(near1, {
        title: `Thịt heo xay ${C.t}`,
        category: "meat_seafood",
        quantity: 3,
        hours: 10,
      }),
      far: await lotViaApi(far, { title: `Bánh mì xa ${C.t}`, category: "bread", quantity: 10, hours: 6 }),
    };
    saveC();
  });
  test.afterEach(() => saveC());
  const need = (cond: unknown, what: string) => test.skip(!cond, `⛔ bị chặn: thiếu ${what} từ bước trước`);

  test("P2-13/14/15/16 kho tặng: danh sách + bản đồ, marker màu theo nhãn, thẻ lô km/phút/đếm ngược, lọc Đỏ & ≤ 3 km, ẩn lô không nhận/ngoài bán kính", async ({
    page,
  }, testInfo) => {
    // [CH-A] đăng lô 20 bánh mì (đơn vị cái, 0,08 kg/cái) bằng form — lô dùng tiếp ở phần D–G
    if (!C.lotA) {
      await loginAs(page, C.storeA!.user, "/store/inventory/new");
      const title = `Bánh mì que UAT ${C.t}`;
      await fillOffer(page, {
        category: "Bánh mì & bakery",
        title,
        quantity: "20",
        unit: "piece",
        expiry: "tomorrow",
      });
      await page.getByLabel(/Khối lượng mỗi cái/).fill("0,08");
      await attestAndPublish(page);
      const [o] = await serviceRest<{ id: string }[]>(
        `offers?select=id&title=eq.${encodeURIComponent(title)}`,
      );
      C.lotA = { offerId: o!.id, title, weight: 0.08 };
      saveC();
      await page.context().clearCookies();
    }
    await loginAs(page, C.charity!.user, "/charity/donations");
    await expect(page.getByRole("heading", { level: 1, name: "Kho tặng" })).toBeVisible();
    const list = page
      .locator("main")
      .getByRole("article")
      .filter({ has: page.getByRole("button", { name: "Xin nhận" }) });
    await expect(list.filter({ hasText: C.lotA.title })).toBeVisible({ timeout: 30_000 });
    const titles = await list.allInnerTexts();
    // P2-16: lô Thịt (danh mục không nhận) và lô ngoài bán kính không hiện
    expect(titles.join("\n")).not.toContain(C.bg!.meat!.title);
    expect(titles.join("\n")).not.toContain(C.bg!.far!.title);
    expect(titles.join("\n")).toContain(C.bg!.green!.title);
    note(
      testInfo,
      "P2-16",
      `kho tặng có ${titles.length} lô; không có “${C.bg!.meat!.title}” (Thịt) và “${C.bg!.far!.title}” (7 km)`,
    );

    // P2-13: bản đồ (desktop: cạnh danh sách; mobile: chuyển tab)
    if (testInfo.project.name === "mobile")
      await page.getByRole("button", { name: "Bản đồ", exact: true }).click();
    const map = page.getByRole("region", { name: /Bản đồ kho tặng/ });
    await expect(map.locator(".maplibregl-canvas")).toBeVisible({ timeout: 30_000 });
    const markers = map.getByRole("button", { name: /gấp nhất: Nhãn/ });
    await expect(markers.first()).toBeVisible({ timeout: 30_000 });
    const info = await markers.evaluateAll((bs) =>
      bs.map((b) => ({ label: b.getAttribute("aria-label") ?? "", bg: getComputedStyle(b).backgroundColor })),
    );
    note(testInfo, "P2-13 marker", info.map((m) => `${m.label.slice(0, 70)} [${m.bg}]`).join(" || "));
    const colors = new Map<string, string>();
    for (const m of info) {
      const l = m.label.match(/gấp nhất: Nhãn (Xanh|Vàng|Đỏ)/)?.[1];
      if (l) colors.set(l, m.bg);
    }
    expect(new Set(colors.values()).size).toBe(colors.size);
    await shot(page, testInfo, "P2-13-map", false);

    // P2-14: bấm marker của [CH-A] ⇒ thẻ lô có khoảng cách, phút xe máy, đếm ngược
    const markerA = map.getByRole("button", { name: literal(C.storeA!.orgName) });
    if ((await markerA.count()) === 0) await map.getByRole("button", { name: /^Cụm/ }).first().click();
    await markerA.click();
    const selected =
      testInfo.project.name === "mobile"
        ? page.getByRole("region", { name: `Lô của ${C.storeA!.orgName}` })
        : list.filter({ hasText: C.lotA.title });
    await expect(selected).toBeVisible();
    const cardText = await selected.innerText();
    note(testInfo, "P2-14 thẻ", cardText.replace(/\n+/g, " | ").slice(0, 300));
    expect.soft(cardText).toMatch(/\d+(,\d+)? km|\d+ m/);
    expect.soft(cardText).toMatch(/~\d+ phút/);
    expect.soft(cardText).toMatch(/còn \d/);
    await shot(page, testInfo, "P2-14-marker-card", false);

    // P2-15: lọc chỉ Đỏ + ≤ 3 km bằng bộ lọc
    await page.goto(`/charity/donations?labels=red&maxKm=3`);
    await expect(page.getByRole("button", { name: "Nhãn Đỏ", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const red = await list.allInnerTexts();
    for (const t of red) expect(t).toMatch(/Nhãn\s*Đỏ/);
    expect(red.join("\n")).not.toContain(C.bg!.green!.title);
    note(testInfo, "P2-15", `${red.length} lô Đỏ ≤ 3 km`);
    await shot(page, testInfo, "P2-15-filter");
    C.done!.c = true;
  });

  test("P2-18/19/20 [TC] xin 15 cái ⇒ [CH-A] thấy thông báo ≤ 5 s không tải lại, còn 5; xác nhận ⇒ [TC] nhận thông báo", async ({
    page,
    browser,
    baseURL,
  }, testInfo) => {
    need(C.lotA, "lô 20 bánh mì của CH-A (P2-13)");
    const stop = startDispatchPump(baseURL!);
    const tcCtx = await phone(browser, testInfo, "android");
    const tc = await tcCtx.newPage();
    try {
      await loginAs(page, C.storeA!.user, "/store");
      await expect(page.getByRole("heading", { level: 1, name: "Tổng quan" })).toBeVisible();
      await page.waitForLoadState("networkidle").catch(() => undefined);
      const before = await bell(page);
      await page.evaluate(() => ((window as unknown as { __noReload: boolean }).__noReload = true));

      await loginAs(tc, C.charity!.user, "/charity/donations");
      const card = tc.getByRole("article").filter({ hasText: C.lotA!.title });
      await card.getByRole("button", { name: "Xin nhận" }).click();
      const dialog = tc.getByRole("dialog");
      await dialog.getByLabel(/Số lượng xin nhận/).fill("15");
      await dialog.getByRole("button", { name: "Gửi yêu cầu" }).click();
      await expect(tc.getByText(/Đã gửi yêu cầu nhận 15 cái/)).toBeVisible({ timeout: 30_000 });
      const t0 = Date.now();
      await expect.poll(() => bell(page), { timeout: 30_000, intervals: [200] }).toBeGreaterThan(before);
      const latency = Date.now() - t0;
      note(testInfo, "P2-19 độ trễ", `${latency} ms (local: máy bơm dispatcher 1 s thay pg_net)`);
      expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(
        true,
      );
      expect.soft(latency, "thông báo ≤ 5 s").toBeLessThanOrEqual(5_000);
      await shot(page, testInfo, "P2-19-store-bell", false);
      const [alloc] = await serviceRest<{ id: string; qty_reserved: number }[]>(
        `allocations?select=id,qty_reserved&offer_id=eq.${C.lotA!.offerId}&status=eq.requested`,
      );
      C.allocation15 = alloc!.id;
      const inv = await inventoryCard(page, C.lotA!.title);
      note(testInfo, "P2-19 lô", (await inv.innerText()).replace(/\n+/g, " | ").slice(0, 250));
      await expect.soft(inv).toContainText(/5 cái/);

      // P2-20: xác nhận ⇒ tổ chức nhận thông báo không cần tải lại
      await tc.goto("/charity");
      await tc.waitForLoadState("networkidle").catch(() => undefined);
      const tcBefore = await bell(tc);
      await page.goto("/store");
      const req = page
        .locator("#cho-xac-nhan")
        .getByRole("article")
        .filter({ hasText: C.lotA!.title })
        .first();
      await req.getByRole("button", { name: "Xác nhận" }).click();
      await expect(page.getByText(new RegExp(`Đã xác nhận 15 cái cho ${C.charity!.orgName}`))).toBeVisible({
        timeout: 20_000,
      });
      const t1 = Date.now();
      await expect.poll(() => bell(tc), { timeout: 30_000, intervals: [200] }).toBeGreaterThan(tcBefore);
      note(testInfo, "P2-20 độ trễ", `${Date.now() - t1} ms`);
      await shot(tc, testInfo, "P2-20-charity-bell", false);
      C.done!.d = true;
    } finally {
      stop();
      await tcCtx.close();
    }
  });

  test("P2-21/22/23 xin thêm 10 khi còn 5 ⇒ tối đa 5; tự động chấp nhận; email cho [TC]", async ({
    page,
    baseURL,
  }, testInfo) => {
    need(C.allocation15, "yêu cầu 15 cái đã xác nhận (P2-18…20)");
    const stop = startDispatchPump(baseURL!);
    try {
      // P2-22: tìm cài đặt "Tự động chấp nhận" ở Cài đặt cửa hàng
      await loginAs(page, C.storeA!.user, "/store/settings");
      const tabs = await page
        .getByRole("navigation", { name: "Các mục cài đặt" })
        .getByRole("link")
        .allInnerTexts();
      const auto = page.getByText(/Tự động chấp nhận|tự động chấp nhận/);
      let autoFound = (await auto.count()) > 0;
      for (const href of ["/store/settings?tab=sites", "/store/settings?tab=members"]) {
        if (autoFound) break;
        await page.goto(href);
        autoFound = (await page.getByText(/Tự động chấp nhận|tự động chấp nhận/).count()) > 0;
      }
      note(
        testInfo,
        "P2-22",
        `tab cài đặt: ${tabs.join(" | ")} · có tùy chọn “Tự động chấp nhận”: ${autoFound}`,
      );
      await shot(page, testInfo, "P2-22-store-settings", false);

      // P2-21
      await page.context().clearCookies();
      await loginAs(page, C.charity!.user, "/charity/donations");
      const card = page.getByRole("article").filter({ hasText: C.lotA!.title });
      await expect(card).toContainText("5 cái");
      await card.getByRole("button", { name: "Xin nhận" }).click();
      const dialog = page.getByRole("dialog");
      const qty = dialog.getByLabel(/Số lượng xin nhận/);
      await expect(qty).toHaveValue("5");
      await qty.fill("10");
      await dialog.getByRole("button", { name: "Gửi yêu cầu" }).click();
      const err = dialog.getByText(/Chỉ còn 5|tối đa 5|vượt|không quá 5/i).first();
      await expect(err).toBeVisible({ timeout: 20_000 });
      note(testInfo, "P2-21", await err.innerText());
      await shot(page, testInfo, "P2-21-over-request", false);
      await qty.fill("5");
      await dialog.getByRole("button", { name: "Gửi yêu cầu" }).click();
      await expect(page.getByText(/Đã gửi yêu cầu nhận 5 cái|tự động xác nhận 5 cái/)).toBeVisible({
        timeout: 30_000,
      });
      const auto5 = (await page.getByText(/tự động xác nhận 5 cái/).count()) > 0;
      note(
        testInfo,
        "P2-22 kết quả",
        auto5 ? "được xác nhận ngay" : "chờ cửa hàng xác nhận (không có tự động chấp nhận)",
      );
      // Cửa hàng xác nhận tay để đi tiếp
      if (!auto5) {
        const [a5] = await serviceRest<{ id: string }[]>(
          `allocations?select=id&offer_id=eq.${C.lotA!.offerId}&status=eq.requested`,
        );
        await rpcAs(await accessTokenOf(C.storeA!.user), "confirm_allocation", {
          p_allocation_id: a5!.id,
          p_client_op_id: randomUUID(),
        });
      }
      const [offer] = await serviceRest<{ status: string; qty_available: number }[]>(
        `offers?select=status,qty_available&id=eq.${C.lotA!.offerId}`,
      );
      note(testInfo, "P2-22 lô", `${offer!.status}, còn ${offer!.qty_available}`);
      expect(offer!.status).toBe("fully_allocated");

      // P2-23: email tới [TC]
      const mail = await waitForMail(C.charity!.user.email, /.+/, 90_000);
      note(testInfo, "P2-23 email", `“${mail.Subject}” từ ${mail.From.Name} <${mail.From.Address}>`);
      expect(`${mail.Subject}\n${mail.Text}`).not.toMatch(MOJIBAKE);
      expect(mail.Subject).toMatch(/[ăâđêôơưáàảãạéèẻẽẹíìỉĩịóòỏõọúùủũụýỳỷỹỵ]/i);
      expect(autoFound, "Cài đặt cửa hàng có “Tự động chấp nhận”").toBe(true);
    } finally {
      stop();
    }
  });

  test("P2-24…29 TNV hiện QR (mã 6 số, 15 phút, Tạo mã mới) → cửa hàng quét → TNV tự cập nhật → quét lại bị chặn → giao về: nhận 12, từ chối 3 vì chất lượng", async ({
    page,
    browser,
    baseURL,
  }, testInfo) => {
    test.setTimeout(420_000);
    need(C.allocation15, "phân bổ 15 cái đã xác nhận (P2-20)");
    const stop = startDispatchPump(baseURL!);
    const vCtx = await phone(browser, testInfo, "iphone");
    const tnv = await vCtx.newPage();
    try {
      // [TC] giao chuyến cho TNV1 (chỉ lô 15 cái)
      const kgBefore = await charityStoreKg(page, C);
      C.impactBefore = kgBefore;
      await loginAs(page, C.charity!.user, "/charity/pickups");
      const planner = page.getByRole("region", { name: /^Giao về / }).first();
      await expect(planner).toBeVisible({ timeout: 30_000 });
      const boxes = planner.getByRole("checkbox");
      for (let i = 0; i < (await boxes.count()); i++) {
        const b = boxes.nth(i);
        const id = await b.getAttribute("id");
        const label = id
          ? await page
              .locator(`label[for="${id}"]`)
              .innerText()
              .catch(() => "")
          : "";
        if ((await b.isChecked()) && !/15 cái/.test(label)) await b.click();
      }
      await planner.getByRole("radio", { name: "Tình nguyện viên" }).click();
      await planner.getByRole("checkbox", { name: literal(C.volunteer!.fullName) }).check();
      await planner.getByRole("button", { name: `Giao chuyến cho ${C.volunteer!.fullName}` }).click();
      await expect(page.getByText(/Đã giao chuyến cho/).first()).toBeVisible({ timeout: 60_000 });
      const [trip] = await serviceRest<{ id: string }[]>(
        `pickups?select=id&assignee_user_id=eq.${C.volunteer!.id}&status=eq.assigned&order=created_at.desc&limit=1`,
      );
      C.pickupId = trip!.id;
      saveC();

      // P2-24: TNV1 trên iPhone (giả lập): nhận, bắt đầu, check-in tại cửa hàng, hiện QR
      const storeAt = offset(C.center, 1, 45);
      await vCtx.grantPermissions(["geolocation"]);
      await vCtx.setGeolocation({ latitude: storeAt.lat + 0.00003, longitude: storeAt.lng, accuracy: 8 });
      await loginAs(tnv, C.volunteer!, "/volunteer");
      const tripCard = tnv.locator(`[data-trip-card="${C.pickupId}"]`);
      await tripCard.getByRole("button", { name: "Nhận chuyến" }).click();
      await expect(tripCard).toContainText("Đã nhận");
      await tripCard.getByRole("button", { name: "Bắt đầu chuyến" }).click();
      await tnv
        .getByRole("dialog", { name: "Chia sẻ vị trí khi chuyến đang chạy" })
        .getByRole("button", { name: "Không, chỉ dùng check-in" })
        .click();
      const current = tnv.locator("[data-current-stop]").first();
      await current.getByRole("button", { name: "Tôi đã tới" }).click();
      await expect(current).toContainText("Đã tới nơi", { timeout: 20_000 });
      const stopId = await current.getAttribute("data-current-stop");
      await current.getByRole("button", { name: "Hiện mã cho cửa hàng" }).click();
      const qrDialog = tnv.getByRole("dialog", { name: "Mã bàn giao" });
      await expect(qrDialog.getByRole("img", { name: /Mã QR/ })).toBeVisible();
      const code = (await qrDialog.locator("[data-handover-code]").innerText()).replace(/\D/g, "");
      expect(code).toMatch(/^\d{6}$/);
      await expect(qrDialog.getByText(/còn 1[45]:\d\d/)).toBeVisible();
      await expect(qrDialog.getByRole("button", { name: "Tạo mã mới" })).toBeEnabled();
      const box = await qrDialog.boundingBox();
      const vp = tnv.viewportSize()!;
      note(
        testInfo,
        "P2-24 QR",
        `mã ${code.slice(0, 2)}•••• · hộp thoại ${Math.round(box!.width)}×${Math.round(box!.height)} trên ${vp.width}×${vp.height}`,
      );
      expect.soft(box!.width, "QR toàn màn hình").toBeGreaterThanOrEqual(vp.width - 2);
      await shot(tnv, testInfo, "P2-24-volunteer-qr", false);

      // P2-25/26: cửa hàng quét QR bằng webcam (Chrome camera giả) ⇒ dòng hàng, nhập 15, xác nhận
      const cam = await cameraBrowser(testInfo, tnv, "Mã bàn giao", "pickup-qr.y4m");
      try {
        await loginAs(cam.page, C.storeA!.user, "/store/handover");
        await cam.page.getByRole("button", { name: "Quét mã QR" }).click();
        const review = cam.page.getByRole("dialog", { name: "Xác nhận bàn giao" });
        await expect(review).toBeVisible({ timeout: 30_000 });
        await expect(review).toContainText(C.lotA!.title);
        await expect(review).toContainText(/Đã đặt\s*15 cái/);
        const qty = review.getByLabel(/Số thực giao/);
        await expect(qty).toHaveValue("15");
        await shot(cam.page, testInfo, "P2-25-store-scanned", false);
        await review.getByRole("button", { name: "Xác nhận bàn giao" }).click();
        const done = cam.page.getByRole("dialog", { name: "Đã bàn giao" });
        await expect(done).toBeVisible({ timeout: 30_000 });
        // P2-26: điện thoại TNV tự đổi (không tải lại)
        await expect(qrDialog).toBeHidden({ timeout: 20_000 });
        await expect(tnv.locator(`[data-stop="${stopId}"]`)).toHaveAttribute("data-stop-status", "done", {
          timeout: 20_000,
        });
        await shot(tnv, testInfo, "P2-26-volunteer-picked", false);
        // P2-27: quét lại đúng QR cũ
        await done.getByRole("button", { name: "Quét lượt tiếp theo" }).click();
        const blocked = cam.page.getByRole("dialog", { name: "Chưa bàn giao được" });
        await expect(blocked).toContainText(/Mã này đã được dùng/, { timeout: 30_000 });
        await shot(cam.page, testInfo, "P2-27-reused-qr", false);
      } finally {
        await cam.browser.close();
      }

      // P2-28: TNV hiện QR giao hàng; [TC] quét, nhận 12, 3 không đạt chất lượng (bắt buộc ghi chú)
      const drop = tnv.locator("[data-current-stop]").filter({ hasText: "Giao về" }).first();
      await drop.getByRole("button", { name: "Hiện mã giao hàng" }).click();
      const cam2 = await cameraBrowser(testInfo, tnv, "Mã giao hàng", "dropoff-qr.y4m");
      try {
        await loginAs(cam2.page, C.charity!.user, "/charity/receive");
        await cam2.page.getByRole("button", { name: "Quét mã QR" }).click();
        const dlg = cam2.page.getByRole("dialog", { name: "Xác nhận nhận hàng" });
        await expect(dlg).toBeVisible({ timeout: 30_000 });
        await dlg.getByRole("textbox", { name: /Số thực nhận/ }).fill("12");
        await dlg.getByLabel("Không đạt chất lượng").check();
        await dlg.getByRole("button", { name: "Xác nhận đã nhận hàng" }).click();
        await expect(dlg.getByText("Vui lòng mô tả ngắn vì sao hàng không đạt chất lượng.")).toBeVisible();
        await dlg.getByRole("textbox", { name: /Ghi chú|Mô tả/ }).fill("bánh bị ẩm");
        await shot(cam2.page, testInfo, "P2-28-receive-quality", false);
        await dlg.getByRole("button", { name: "Xác nhận đã nhận hàng" }).click();
        await expect(cam2.page.getByRole("dialog", { name: "Đã nhận hàng" })).toBeVisible({
          timeout: 30_000,
        });
      } finally {
        await cam2.browser.close();
      }
      const [a] = await serviceRest<
        { status: string; qty_picked: number; qty_delivered: number; shortfall_reason: string }[]
      >(`allocations?select=status,qty_picked,qty_delivered,shortfall_reason&id=eq.${C.allocation15}`);
      expect(a).toMatchObject({ status: "delivered", qty_delivered: 12, shortfall_reason: "quality_reject" });

      // P2-29: 3 cái không quay lại lô; cửa hàng được báo dòng bị từ chối vì chất lượng
      const [offer] = await serviceRest<{ qty_available: number; status: string }[]>(
        `offers?select=qty_available,status&id=eq.${C.lotA!.offerId}`,
      );
      expect(Number(offer!.qty_available)).toBe(0);
      const storeNotes = await serviceRest<{ title: string; body: string }[]>(
        `notifications?select=title,body&user_id=eq.${C.storeA!.user.id}&order=created_at.desc&limit=10`,
      );
      await expect
        .poll(
          async () =>
            (
              await serviceRest<{ title: string }[]>(
                `notifications?select=title&user_id=eq.${C.storeA!.user.id}&title=eq.${encodeURIComponent("Hàng đã tới tổ chức")}`,
              )
            ).length,
          { timeout: 30_000 },
        )
        .toBeGreaterThan(0);
      const latest = await serviceRest<{ title: string; body: string }[]>(
        `notifications?select=title,body&user_id=eq.${C.storeA!.user.id}&order=created_at.desc&limit=3`,
      );
      note(testInfo, "P2-29 thông báo cửa hàng", latest.map((n) => `${n.title}: ${n.body}`).join(" || "));
      void storeNotes;
      await page.context().clearCookies();
      await loginAs(page, C.storeA!.user, `/store/inventory/${C.lotA!.offerId}`);
      const detail = await page.locator("main").innerText();
      note(testInfo, "P2-29 chi tiết lô", detail.replace(/\n+/g, " | ").slice(0, 400));
      await shot(page, testInfo, "P2-29-store-lot", true);
      C.done!.e = true;
      saveC();
      expect(
        latest.some((n) => /chất lượng/i.test(`${n.title} ${n.body}`)) || /chất lượng/i.test(detail),
        "cửa hàng được báo có dòng bị từ chối vì chất lượng",
      ).toBe(true);
    } finally {
      stop();
      await vCtx.close();
    }
  });

  test("P2-33 tác động [TC] và [CH-A] tăng đúng 12 × 0,08 kg (không tính 3 cái bị từ chối), có “Cập nhật lúc”", async ({
    page,
  }, testInfo) => {
    need(C.done?.e && C.impactBefore, "bàn giao P2-24…28");
    const after = await charityStoreKg(page, C);
    note(
      testInfo,
      "P2-33",
      `TC kg: ${C.impactBefore!.charityKg} → ${after.charityKg} · CH-A kg: ${C.impactBefore!.storeKg} → ${after.storeKg}`,
    );
    const num = (s: string) => Number(s.replace(/\./g, "").replace(",", ".")) || 0;
    expect(num(after.charityKg) - num(C.impactBefore!.charityKg)).toBeCloseTo(0.96, 1);
    const ledger = await serviceRest<{ kg: number; co2e_kg: number; meals: number }[]>(
      `impact_ledger?select=kg,co2e_kg,meals&allocation_id=eq.${C.allocation15}`,
    );
    note(testInfo, "P2-33 sổ", JSON.stringify(ledger));
    expect(Number(ledger[0]!.kg)).toBeCloseTo(0.96, 3);
    expect(Number(ledger[0]!.co2e_kg)).toBeCloseTo(1.92, 3);
    await loginAs(page, C.charity!.user, "/charity");
    const impact = page
      .getByRole("region", { name: "Tác động của tổ chức từ khi tham gia" })
      .or(page.locator('section[aria-label="Tác động của tổ chức từ khi tham gia"]'));
    const text = await impact.innerText();
    note(testInfo, "P2-33 khối tác động", text.replace(/\n+/g, " | ").slice(0, 300));
    await expect(page.getByText(/Cập nhật lúc/).first()).toBeVisible();
    await shot(page, testInfo, "P2-33-charity-impact");
  });

  test("P2-30/31 mã 6 số: sai 5 lần ⇒ khóa, phải tạo mã mới; mã mới đúng ⇒ bàn giao thành công", async ({
    page,
    browser,
  }, testInfo) => {
    need(C.storeA && C.charity, "thế giới P2");
    // Yêu cầu khác 5 cái, tổ chức tự đến lấy (🤖 làm máy của cửa hàng)
    const lot = await lotViaApi(
      { ...C.storeA!, siteId: C.storeA!.siteId },
      { title: `Bánh mì mã 6 số ${C.t}`, category: "bread", quantity: 5, hours: 6 },
    );
    const ctoken = await accessTokenOf(C.charity!.user);
    const req = await rpcAs<{ allocation_id: string; status: string }>(ctoken, "request_offer", {
      p_offer_id: lot.offerId,
      p_qty: 5,
      p_charity_site_id: C.charity!.siteId,
      p_client_op_id: randomUUID(),
    });
    await rpcAs(await accessTokenOf(C.storeA!.user), "confirm_allocation", {
      p_allocation_id: req.allocation_id,
      p_client_op_id: randomUUID(),
    });
    await loginAs(page, C.charity!.user, "/charity/pickups");
    const planner = page.getByRole("region", { name: /^Giao về / }).first();
    const boxes = planner.getByRole("checkbox");
    for (let i = 0; i < (await boxes.count()); i++) {
      const b = boxes.nth(i);
      const id = await b.getAttribute("id");
      const label = id
        ? await page
            .locator(`label[for="${id}"]`)
            .innerText()
            .catch(() => "")
        : "";
      if ((await b.isChecked()) !== label.includes(lot.title)) await b.click();
    }
    await planner.getByRole("button", { name: "Tạo chuyến tự đến lấy" }).click();
    await expect(page).toHaveURL(/\/charity\/pickups\/[0-9a-f-]{36}$/, { timeout: 60_000 });
    const storeStop = page
      .getByRole("region", { name: "Điểm dừng theo thứ tự" })
      .getByRole("article")
      .first();
    await storeStop.getByRole("link", { name: "Mở mã bàn giao" }).click();
    await page.getByRole("button", { name: "Hiện mã bàn giao" }).click();
    const qr = page.getByRole("dialog", { name: "Mã bàn giao" });
    const code1 = (await qr.locator("[data-handover-code]").innerText()).replace(/\D/g, "");
    const stopId = /\/stops\/([0-9a-f-]{36})\/handover$/.exec(page.url())![1]!;

    const sCtx = await phone(browser, testInfo, "android");
    const store = await sCtx.newPage();
    try {
      await loginAs(store, C.storeA!.user, "/store/handover");
      const pending = store.locator(`[data-pending-stop="${stopId}"]`);
      await pending.getByRole("button", { name: "Nhập mã 6 số" }).click();
      const review = store.getByRole("dialog", { name: "Xác nhận bàn giao" });
      const input = review.getByLabel("Mã 6 số trên điện thoại người nhận");
      const wrong = code1 === "111111" ? "222222" : "111111";
      const msgs: string[] = [];
      for (let i = 1; i <= 5; i++) {
        await input.fill(wrong);
        await review.getByRole("button", { name: "Xác nhận bàn giao" }).click();
        // Lần 5: máy chuyển sang màn "Chưa bàn giao được" với thông báo khóa
        const msg =
          i < 5
            ? review.getByText(new RegExp(`Mã chưa đúng\\. Bạn còn ${5 - i} lần thử`))
            : store.getByRole("dialog", { name: "Chưa bàn giao được" }).getByText(/Mã đã bị khóa/);
        await expect(msg).toBeVisible({ timeout: 15_000 });
        msgs.push((await msg.innerText()).trim());
      }
      note(testInfo, "P2-30 thông báo", msgs.join(" → "));
      await shot(store, testInfo, "P2-30-locked", false);
      // Mã đúng nhưng chưa tạo mã mới ⇒ vẫn bị khóa
      await store.keyboard.press("Escape");
      await store.reload();
      const lockedCard = store.locator(`[data-pending-stop="${stopId}"]`);
      note(
        testInfo,
        "P2-30 thẻ lượt chờ sau khi khóa",
        (await lockedCard.innerText()).replace(/\n+/g, " | ").slice(0, 200),
      );
      const enter = lockedCard.getByRole("button", { name: "Nhập mã 6 số" });
      if (await enter.isEnabled()) {
        await enter.click();
        await review.getByLabel("Mã 6 số trên điện thoại người nhận").fill(code1);
        await review.getByRole("button", { name: "Xác nhận bàn giao" }).click();
        await expect(store.getByText(/Mã đã bị khóa/).first()).toBeVisible({ timeout: 15_000 });
        note(testInfo, "P2-30 mã đúng sau khi khóa", "bị từ chối: mã đã bị khóa");
        await store.keyboard.press("Escape");
      } else
        note(
          testInfo,
          "P2-30 mã đúng sau khi khóa",
          "nút “Nhập mã 6 số” bị khóa tới khi người nhận tạo mã mới",
        );
      // P2-31: tổ chức tạo mã mới, cửa hàng nhập đúng
      await qr.getByRole("button", { name: "Tạo mã mới" }).click();
      await expect
        .poll(async () => (await qr.locator("[data-handover-code]").innerText()).replace(/\D/g, ""), {
          timeout: 15_000,
        })
        .not.toBe(code1);
      const code2 = (await qr.locator("[data-handover-code]").innerText()).replace(/\D/g, "");
      await store.keyboard.press("Escape");
      await store.reload();
      await store
        .locator(`[data-pending-stop="${stopId}"]`)
        .getByRole("button", { name: "Nhập mã 6 số" })
        .click();
      await store
        .getByRole("dialog", { name: "Xác nhận bàn giao" })
        .getByLabel("Mã 6 số trên điện thoại người nhận")
        .fill(code2);
      await store
        .getByRole("dialog", { name: "Xác nhận bàn giao" })
        .getByRole("button", { name: "Xác nhận bàn giao" })
        .click();
      await expect(store.getByRole("dialog", { name: "Đã bàn giao" })).toBeVisible({ timeout: 30_000 });
      await shot(store, testInfo, "P2-31-new-code-ok", false);
    } finally {
      await sCtx.close();
    }
  });
});

/** Số kg trên khối tác động của [TC] (Tổng quan) và [CH-A] (Tổng quan). */
async function charityStoreKg(page: Page, c: JC): Promise<{ charityKg: string; storeKg: string }> {
  const read = async (user: TestUser, path: string, label: string) => {
    await page.context().clearCookies();
    await loginAs(page, user, path);
    const sec = page.locator(`section[aria-label="${label}"]`);
    await sec.waitFor({ timeout: 30_000 });
    const v = sec.locator('[data-metric="kg"] [data-value]');
    return (await v.count()) ? (await v.innerText()).trim() : "0";
  };
  const charityKg = await read(c.charity!.user, "/charity", "Tác động của tổ chức từ khi tham gia");
  const storeKg = await read(c.storeA!.user, "/store", "Tác động của cửa hàng từ khi tham gia");
  await page.context().clearCookies();
  return { charityKg, storeKg };
}

// ---------------------------------------------------------------------------------------------------------------
// F. P2-32 — mã hết hạn sau 15 phút (chờ thật 16 phút, chỉ chạy ở project desktop)
// ---------------------------------------------------------------------------------------------------------------

test.describe("UAT P2 — P2-32 mã QR quá 15 phút", () => {
  test("P2-32 hiện QR rồi chờ > 15 phút mới quét ⇒ báo hết hạn; Tạo mã mới ⇒ quét được", async ({
    page,
    browser,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop" || !!process.env.UAT_SKIP_LONG,
      "Chờ thật 16 phút — chạy một lần (desktop)",
    );
    test.setTimeout(30 * 60_000);
    const t = tag(testInfo);
    const store = await approvedOrg(
      "store",
      `Tiệm UAT Chờ Lâu ${t}`,
      { lat: 10.62, lng: 106.62 },
      "Hồ Văn Chờ",
    );
    const charity = await approvedOrg(
      "charity",
      `Bếp UAT Chờ Lâu ${t}`,
      { lat: 10.625, lng: 106.62 },
      "Mai Thị Đợi",
    );
    const lot = await lotViaApi(store, {
      title: `Bánh mì chờ ${t}`,
      category: "bread",
      quantity: 4,
      hours: 3,
    });
    const ctoken = await accessTokenOf(charity.user);
    const req = await rpcAs<{ allocation_id: string }>(ctoken, "request_offer", {
      p_offer_id: lot.offerId,
      p_qty: 4,
      p_charity_site_id: charity.siteId,
      p_client_op_id: randomUUID(),
    });
    await rpcAs(await accessTokenOf(store.user), "confirm_allocation", {
      p_allocation_id: req.allocation_id,
      p_client_op_id: randomUUID(),
    });
    const pickupId = await rpcAs<string>(ctoken, "assign_pickup", {
      p_plan: { allocation_ids: [req.allocation_id], mode: "self", charity_site_id: charity.siteId },
      p_client_op_id: randomUUID(),
    });
    const [stop] = await serviceRest<{ id: string }[]>(
      `pickup_stops?select=id&pickup_id=eq.${pickupId}&kind=eq.pickup`,
    );
    const pCtx = await phone(browser, testInfo, "iphone");
    const carrier = await pCtx.newPage();
    try {
      await loginAs(carrier, charity.user, `/charity/pickups/${pickupId}/stops/${stop!.id}/handover`);
      await carrier.getByRole("button", { name: "Hiện mã bàn giao" }).click();
      const qrDialog = carrier.getByRole("dialog", { name: "Mã bàn giao" });
      const code = (await qrDialog.locator("[data-handover-code]").innerText()).replace(/\D/g, "");
      const shownAt = Date.now();
      // Ghi lại đúng mã QR đang hiện (như chụp màn hình) để quét sau 16 phút
      const qr = qrDialog.locator("svg[data-qr-size]");
      const oldVideo = testInfo.outputPath("p2-32-old-qr.y4m");
      writeQrVideo(
        oldVideo,
        (await qr.locator("path").getAttribute("d"))!,
        Number(await qr.getAttribute("data-qr-size")),
      );
      await shot(carrier, testInfo, "P2-32-qr-start", false);
      await new Promise((r) => setTimeout(r, 16 * 60_000)); // chờ thật > 15 phút
      await shot(carrier, testInfo, "P2-32-qr-after-16min", false);
      note(
        testInfo,
        "P2-32 điện thoại sau 16 phút",
        (await qrDialog.innerText().catch(() => "(đã đóng)")).replace(/\n+/g, " | ").slice(0, 200),
      );
      // Máy cửa hàng: lượt chờ không cho nhập mã cũ; quét QR cũ ⇒ báo hết hạn
      await loginAs(page, store.user, "/store/handover");
      const pending = page.locator(`[data-pending-stop="${stop!.id}"]`);
      await expect(pending).toBeVisible({ timeout: 30_000 });
      note(testInfo, "P2-32 thẻ lượt chờ", (await pending.innerText()).replace(/\n+/g, " | ").slice(0, 200));
      const { chromium } = await import("@playwright/test");
      const cam = await chromium.launch({
        args: [
          "--use-fake-ui-for-media-stream",
          "--use-fake-device-for-media-stream",
          `--use-file-for-fake-video-capture=${oldVideo}`,
        ],
      });
      try {
        const camCtx = await cam.newContext({
          baseURL: testInfo.project.use.baseURL,
          locale: "vi-VN",
          timezoneId: "Asia/Ho_Chi_Minh",
          viewport: { width: 1440, height: 900 },
          permissions: ["camera"],
        });
        const scanner = await camCtx.newPage();
        await loginAs(scanner, store.user, "/store/handover");
        await scanner.getByRole("button", { name: "Quét mã QR" }).click();
        const blocked = scanner.getByRole("dialog", { name: "Chưa bàn giao được" });
        await expect(blocked).toBeVisible({ timeout: 30_000 });
        const msg = await blocked.innerText();
        note(
          testInfo,
          "P2-32 quét QR cũ",
          `${msg.replace(/\n+/g, " | ").slice(0, 200)} (sau ${Math.round((Date.now() - shownAt) / 60_000)} phút)`,
        );
        await shot(scanner, testInfo, "P2-32-expired", false);
        expect(msg).toMatch(/hết hạn/i);
      } finally {
        await cam.close();
      }
      void code;
      // Tạo mã mới ⇒ dùng được
      await qrDialog
        .getByRole("button", { name: "Tạo mã mới" })
        .click({ timeout: 10_000 })
        .catch(async () => {
          await carrier.reload();
          await carrier
            .getByRole("button", { name: /Hiện mã bàn giao|Tạo mã mới/ })
            .first()
            .click();
        });
      const fresh = carrier.getByRole("dialog", { name: "Mã bàn giao" });
      await expect
        .poll(async () => (await fresh.locator("[data-handover-code]").innerText()).replace(/\D/g, ""), {
          timeout: 20_000,
        })
        .not.toBe(code);
      const code2 = (await fresh.locator("[data-handover-code]").innerText()).replace(/\D/g, "");
      await page.keyboard.press("Escape");
      await page.reload();
      await page
        .locator(`[data-pending-stop="${stop!.id}"]`)
        .getByRole("button", { name: "Nhập mã 6 số" })
        .click();
      await page
        .getByRole("dialog", { name: "Xác nhận bàn giao" })
        .getByLabel("Mã 6 số trên điện thoại người nhận")
        .fill(code2);
      await page
        .getByRole("dialog", { name: "Xác nhận bàn giao" })
        .getByRole("button", { name: "Xác nhận bàn giao" })
        .click();
      await expect(page.getByRole("dialog", { name: "Đã bàn giao" })).toBeVisible({ timeout: 30_000 });
    } finally {
      await pCtx.close();
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------
// G. P2-34 — bộ đếm công khai không cộng dữ liệu demo
// ---------------------------------------------------------------------------------------------------------------

test.describe("UAT P2 — P2-34 bộ đếm trang chủ", () => {
  test("P2-34 bộ đếm tác động trang chủ chỉ tính dữ liệu thật (không cộng demo)", async ({
    page,
  }, testInfo) => {
    const rows = await serviceRest<{ kg: number; entry_type: string; is_demo: boolean }[]>(
      "impact_ledger?select=kg,entry_type,is_demo",
    );
    const sum = (demo: boolean) =>
      rows
        .filter((r) => r.is_demo === demo)
        .reduce((a, r) => a + (r.entry_type === "credit" ? 1 : -1) * Math.abs(Number(r.kg)), 0);
    const real = sum(false);
    const demo = sum(true);
    await page.goto("/");
    const section = page.getByRole("region", { name: "Bộ đếm tác động của FoodSave" });
    await expect(section).toBeVisible({ timeout: 30_000 });
    // Trang chủ mới tải số liệu phía trình duyệt: chờ hết trạng thái "đang tải"
    await expect(section).not.toHaveAttribute("data-impact-state", "loading", { timeout: 30_000 });
    const v = section.locator('[data-metric="kg"] [data-value]');
    await section.scrollIntoViewIfNeeded(); // khối ở dưới màn hình đầu: innerText rỗng khi chưa hiển thị
    const raw = (await v.count()) ? ((await v.first().textContent()) ?? "").trim() : "0";
    const shown = Number(raw.replace(/\./g, "").replace(",", "."));
    note(
      testInfo,
      "P2-34",
      `trang chủ ${shown} kg · sổ thật ${real.toFixed(1)} kg · sổ demo ${demo.toFixed(1)} kg`,
    );
    await shot(page, testInfo, "P2-34-landing-local");
    expect(Math.abs(shown - real)).toBeLessThan(Math.max(1, real * 0.01) + 5); // làm tròn + lượt E2E khác đang chạy
    if (demo > 1) expect(Math.abs(shown - (real + demo))).toBeGreaterThan(Math.min(demo, 1));
  });
});
