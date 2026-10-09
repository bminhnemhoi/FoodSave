import { randomUUID } from "node:crypto";

import { devices, expect, type Browser, type Page, type TestInfo } from "@playwright/test";

import { accessTokenOf, createSite, rpcAs, seedSensitive } from "../fixtures/orgs";
import {
  createConfirmedUser,
  createOrgFor,
  loginAs,
  serviceKey,
  SUPABASE_URL,
  type TestUser,
} from "../fixtures/users";
import { writeQrVideo } from "../handover/scenario";

import { vnParts } from "./helpers";

/**
 * Dựng "thế giới" cho UAT P2/P3 trên Supabase LOCAL: tổ chức/cửa hàng đã duyệt (service role, như các fixture
 * khác), lô nền đăng bằng RPC thật dưới quyền chủ cửa hàng ("Minh chuẩn bị trước"), và các thao tác giao diện
 * dùng lại nhiều lần (đăng lô bằng form, nhập mã bàn giao, nhận hàng).
 */

export const H = 3_600_000;
export const MIN = 60_000;

export type Org = {
  user: TestUser;
  orgId: string;
  orgName: string;
  siteId: string;
  at: { lat: number; lng: number };
};
export type Lot = { offerId: string; title: string };

export async function serviceRest<T>(path: string, init: RequestInit = {}): Promise<T> {
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

export async function approvedOrg(
  kind: "store" | "charity",
  name: string,
  at: { lat: number; lng: number },
  fullName: string,
): Promise<Org> {
  const user = await createConfirmedUser({ prefix: `uat-${kind}`, fullName });
  const org = await createOrgFor(user, { kind, status: "approved", name });
  await seedSensitive(org.id, { contact_phone: kind === "store" ? "0901234567" : "0912345678" });
  const site = await createSite(org.id, {
    name: kind === "store" ? `Chi nhánh ${name.split(" ").at(-1)}` : `Điểm nhận ${name.split(" ").at(-1)}`,
    ...at,
    address: kind === "store" ? "12 Đường Số 7" : "45 Đường Số 9",
  });
  return { user, orgId: org.id, orgName: name, siteId: site.id, at };
}

/** Lô nền đăng bằng RPC thật dưới quyền chủ cửa hàng. Khung lấy kéo tới hạn dùng (nhãn theo hạn dùng). */
export async function lotViaApi(
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

export function offset(c: { lat: number; lng: number }, km: number, bearing: number) {
  const rad = (bearing * Math.PI) / 180;
  return {
    lat: Math.round((c.lat + (km * Math.cos(rad)) / 111.32) * 1e6) / 1e6,
    lng:
      Math.round((c.lng + (km * Math.sin(rad)) / (111.32 * Math.cos((c.lat * Math.PI) / 180))) * 1e6) / 1e6,
  };
}

/** Form "Đăng lô mới" như cửa hàng điền tay. */
export async function fillOffer(
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

export async function attestAndPublish(page: Page) {
  await page.getByRole("checkbox", { name: /Tôi cam kết thực phẩm còn an toàn/ }).click();
  await page.getByRole("button", { name: "Đăng lô" }).click();
  await expect(page).toHaveURL(/\/store\/inventory$/, { timeout: 30_000 });
}

export async function inventoryCard(page: Page, title: string) {
  await page.goto("/store/inventory");
  const card = page.getByRole("article").filter({ hasText: title }).first();
  await expect(card).toBeVisible({ timeout: 20_000 });
  return card;
}

/** Số trên chuông thông báo ("Thông báo, 3 chưa đọc" ⇒ 3). */
export async function bell(page: Page): Promise<number> {
  const label =
    (await page
      .getByRole("button", { name: /^Thông báo/ })
      .first()
      .getAttribute("aria-label")) ?? "";
  return Number(label.match(/(\d+) chưa đọc/)?.[1] ?? 0);
}

/** Ngữ cảnh trình duyệt mới cho một người dùng khác (máy khác). */
export async function device(browser: Browser, testInfo: TestInfo, kind: "android" | "iphone" | "laptop") {
  const base = {
    baseURL: testInfo.project.use.baseURL,
    locale: "vi-VN",
    timezoneId: "Asia/Ho_Chi_Minh",
    reducedMotion: "reduce" as const,
  };
  if (kind === "laptop") return browser.newContext({ ...base, viewport: { width: 1440, height: 900 } });
  return browser.newContext({ ...devices[kind === "android" ? "Pixel 7" : "iPhone 13"], ...base });
}

/** Chrome có camera giả phát đúng mã QR đang hiển thị (máy quét thật ZXing đọc từ khung hình). */
export async function cameraBrowser(testInfo: TestInfo, qrPage: Page, dialogName: string, file: string) {
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

/** Máy cửa hàng: mở Bàn giao, chọn đúng lượt đang chờ, nhập mã 6 số, giao đủ. */
export async function storeEnterCode(page: Page, store: TestUser, stopId: string, code: string) {
  await page.context().clearCookies();
  await loginAs(page, store, "/store/handover");
  const pending = page.locator(`[data-pending-stop="${stopId}"]`);
  await expect(pending).toBeVisible({ timeout: 30_000 });
  await pending.getByRole("button", { name: "Nhập mã 6 số" }).click();
  const review = page.getByRole("dialog", { name: "Xác nhận bàn giao" });
  await review.getByLabel("Mã 6 số trên điện thoại người nhận").fill(code);
  await review.getByRole("button", { name: "Xác nhận bàn giao" }).click();
  await expect(page.getByRole("dialog", { name: "Đã bàn giao" })).toBeVisible({ timeout: 30_000 });
}

/** Điều phối viên tổ chức nhận hàng giao về bằng mã 6 số (giao đủ). */
export async function charityReceiveCode(page: Page, charity: TestUser, pickupId: string, code: string) {
  await page.context().clearCookies();
  await loginAs(page, charity, `/charity/receive?trip=${pickupId}`);
  const card = page.locator(`[data-pending-dropoff="${pickupId}"]`);
  await expect(card).toBeVisible({ timeout: 30_000 });
  await card.getByRole("button", { name: "Nhập mã 6 số" }).click();
  const dialog = page.getByRole("dialog", { name: "Xác nhận nhận hàng" });
  await dialog.getByLabel("Mã 6 số trên điện thoại tình nguyện viên").fill(code);
  await dialog.getByRole("button", { name: "Xác nhận đã nhận hàng" }).click();
  await expect(page.getByRole("dialog", { name: "Đã nhận hàng" })).toBeVisible({ timeout: 30_000 });
}

/** TNV đang ở trang chuyến: đứng tại `at`, check-in, mở mã cho cửa hàng ⇒ { stopId, code }. */
export async function volunteerShowCode(tnv: Page, at: { lat: number; lng: number }) {
  await tnv.context().grantPermissions(["geolocation"]);
  await tnv.context().setGeolocation({ latitude: at.lat + 0.00003, longitude: at.lng, accuracy: 8 });
  const current = tnv.locator("[data-current-stop]").first();
  await expect(current).toBeVisible({ timeout: 30_000 });
  const stopId = (await current.getAttribute("data-current-stop"))!;
  const showCode = current.getByRole("button", { name: "Hiện mã cho cửa hàng" });
  if (!(await showCode.isVisible())) {
    await current.getByRole("button", { name: "Tôi đã tới" }).click();
    // Trình duyệt có thể trả vị trí cũ (maximumAge 10 s) khi test "di chuyển" tức thì giữa hai cửa hàng
    const far = tnv.getByRole("dialog", { name: "Bạn chưa ở gần điểm này" });
    const arrived = current.getByText("Đã tới nơi");
    await expect(far.or(arrived).first()).toBeVisible({ timeout: 30_000 });
    if (await far.isVisible()) {
      await tnv.keyboard.press("Escape");
      await tnv.waitForTimeout(11_000); // như thời gian đi đường giữa hai điểm
      await current.getByRole("button", { name: "Tôi đã tới" }).click();
    }
    await expect(current).toContainText("Đã tới nơi", { timeout: 30_000 });
  }
  await showCode.click();
  const dialog = tnv.getByRole("dialog", { name: "Mã bàn giao" });
  const code = (await dialog.locator("[data-handover-code]").innerText()).replace(/\D/g, "");
  expect(code).toMatch(/^\d{6}$/);
  return { stopId, code, checkinText: await current.innerText().catch(() => "") };
}

/** TNV ở điểm giao về: mở mã giao hàng ⇒ mã 6 số. */
export async function volunteerDropoffCode(tnv: Page) {
  const drop = tnv.locator("[data-current-stop]").filter({ hasText: "Giao về" }).first();
  await expect(drop).toBeVisible({ timeout: 30_000 });
  await drop.getByRole("button", { name: "Hiện mã giao hàng" }).click();
  const dialog = tnv.getByRole("dialog", { name: "Mã giao hàng" });
  return (await dialog.locator("[data-handover-code]").innerText()).replace(/\D/g, "");
}

/** Bỏ chọn mọi lô trong khung lập chuyến trừ các lô có tiêu đề nằm trong `keep`. */
export async function selectLots(page: Page, planner: ReturnType<Page["getByRole"]>, keep: string[]) {
  const boxes = planner.getByRole("checkbox");
  const n = await boxes.count();
  for (let i = 0; i < n; i++) {
    const b = boxes.nth(i);
    const id = await b.getAttribute("id");
    const label = id
      ? await page
          .locator(`label[for="${id}"]`)
          .innerText()
          .catch(() => "")
      : "";
    if (!label) continue;
    const want = keep.some((k) => label.includes(k));
    if ((await b.isChecked()) !== want) await b.click();
  }
}

/**
 * Cô lập thế giới UAT giữa các lượt chạy: tạm ngưng tổ chức UAT của các lượt TRƯỚC thuộc cùng project
 * (tên kết thúc bằng hậu tố `d…`/`m…` khác `keepTag`), để ghép đơn/kho tặng của lượt này không lấy lô cũ.
 */
export async function retireOldUatWorlds(project: string, keepTag: string, marker: RegExp): Promise<number> {
  const prefix = project === "mobile" ? "m" : "d";
  const rows = await serviceRest<{ id: string; name: string }[]>(
    "organizations?select=id,name&is_paused=eq.false&name=like.*UAT*",
  );
  const ids = rows
    .filter((r) => marker.test(r.name))
    .filter((r) => {
      const t = r.name.match(/ ([dm][0-9a-z]{5})(?: \(Q\.1\))?$/)?.[1];
      return t && t.startsWith(prefix) && t !== keepTag;
    })
    .map((r) => r.id);
  for (let i = 0; i < ids.length; i += 50) {
    await serviceRest(`organizations?id=in.(${ids.slice(i, i + 50).join(",")})`, {
      method: "PATCH",
      body: JSON.stringify({ is_paused: true, paused_reason: "UAT: dọn thế giới của lượt chạy trước" }),
      headers: { Prefer: "return=minimal" },
    });
  }
  return ids.length;
}

/** Tâm thế giới ngẫu nhiên trong một ô lớn (mỗi lượt chạy một chỗ khác nhau). */
export function jitteredCenter(base: { lat: number; lng: number }, spanDeg = 0.25) {
  return {
    lat: Math.round((base.lat + Math.random() * spanDeg) * 1e6) / 1e6,
    lng: Math.round((base.lng + Math.random() * (spanDeg / 4)) * 1e6) / 1e6,
  };
}
