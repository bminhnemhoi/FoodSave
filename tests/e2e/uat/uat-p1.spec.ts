import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { createAdminUser, freshCode, revokeAdmin } from "../fixtures/admin";
import { accessTokenOf, anonKey, vnDatePlus } from "../fixtures/orgs";
import { E2E_PASSWORD, SUPABASE_URL, type TestUser } from "../fixtures/users";
import { adminSelect, createApprovedStoreAt, makePdf } from "../onboarding/helpers";
import {
  isMobile,
  journeyStore,
  linkIn,
  loginUi,
  logoutUi,
  MOJIBAKE,
  note,
  shot,
  tag,
  waitForMail,
} from "./helpers";

/**
 * UAT P1 — Onboarding & Tin cậy (docs/uat/P1-onboarding.md), chạy trên bản build production LOCAL + Supabase
 * local + Mailpit. Đi đúng các bước người dùng: bấm CTA ở trang chủ → đăng ký → mở link trong email → wizard →
 * gửi duyệt → Admin (MFA) duyệt → vào cổng. Fixture chỉ dùng để dựng Admin (script cấp quyền thật) và cửa hàng
 * lân cận cho bộ đếm bán kính.
 *
 * Khác biệt đã biết so với checklist (ADR-011/012, đổi route): không có staging.<DOMAIN> — chạy local; email
 * xác thực do ứng dụng gửi qua SMTP (local = Mailpit); mật khẩu đặt ở form đăng ký (link trong thư chỉ kích hoạt);
 * `/store/offers` đã đổi thành `/store/inventory`.
 */

type Journey = {
  t: string;
  store: TestUser & { orgName: string; orgId?: string };
  charity: TestUser & { orgName: string; orgId?: string };
  admin?: TestUser;
  totpSecret?: string;
  totpUsedAt?: number;
  signedUrl?: string;
};

const PASSWORD = E2E_PASSWORD;
let J: Journey;
let saveJourney = () => {};

async function newVnContext(page: Page): Promise<BrowserContext> {
  const browser = page.context().browser()!;
  const opts = test.info().project.use;
  return browser.newContext({
    ...opts,
    baseURL: opts.baseURL,
    locale: "vi-VN",
    timezoneId: "Asia/Ho_Chi_Minh",
  });
}

/** Trang chủ → CTA đăng ký → form đăng ký (họ tên, email, mật khẩu, đồng ý) → "Đã gửi thư xác nhận". */
async function registerFromHome(page: Page, cta: "Đăng ký cửa hàng" | "Đăng ký tổ chức", u: TestUser) {
  await page.goto("/");
  await page.getByRole("link", { name: cta }).first().click();
  await expect(page).toHaveURL(/\/register\?next=%2Fonboarding%2F(store|charity)$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tạo tài khoản FoodSave");
  await page.getByLabel("Họ và tên").fill(u.fullName);
  await page.getByLabel("Email").fill(u.email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(u.password);
  await page.getByLabel("Nhập lại mật khẩu").fill(u.password);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Tạo tài khoản" }).click();
  await expect(page.getByRole("status")).toContainText("Đã gửi thư xác nhận");
}

async function pickAddress(page: Page, query: string) {
  const box = page.getByRole("combobox", { name: /Tìm địa chỉ/ });
  const options = page.getByRole("listbox", { name: "Gợi ý địa chỉ" }).getByRole("option");
  let suggestions: string[] = [];
  // Dịch vụ bản đồ (Goong) đôi khi quá thời gian ⇒ người dùng gõ lại một lần
  for (let attempt = 0; attempt < 2; attempt++) {
    await box.fill(attempt ? `${query} ` : query);
    await expect(options.first()).toBeVisible({ timeout: 20_000 });
    suggestions = await options.allInnerTexts();
    await options.first().click();
    const ok = await page
      .getByTestId("location-coords")
      .waitFor({ timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    if (ok) break;
  }
  await expect(page.getByTestId("location-coords")).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText("Đang xác định địa chỉ…")).toHaveCount(0, { timeout: 20_000 });
  return suggestions;
}

async function coords(page: Page) {
  const el = page.getByTestId("location-coords");
  return { lat: Number(await el.getAttribute("data-lat")), lng: Number(await el.getAttribute("data-lng")) };
}

function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

async function expectSaved(page: Page) {
  await expect(page.getByTestId("autosave-status").filter({ visible: true })).toContainText(
    /Đã lưu nháp lúc \d{2}:\d{2}/,
    { timeout: 20_000 },
  );
}

async function openQueue(page: Page, name: string) {
  await page.goto(`/admin/reviews?q=${encodeURIComponent(name)}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hàng đợi duyệt");
}

async function openReview(page: Page, name: string) {
  await openQueue(page, name);
  await page.getByRole("link", { name, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
}

/** Admin đăng nhập; trang MFA thử thách ⇒ nhập mã mới. */
async function adminSignIn(page: Page) {
  await page.goto("/login?next=%2Fadmin%2Freviews");
  await loginUi(page, J.admin!.email, J.admin!.password);
  await expect(page).toHaveURL(/\/admin\/mfa/);
  const next = await freshCode(J.totpSecret!, J.totpUsedAt);
  await page.getByLabel("Mã xác thực 6 số").fill(next.code);
  await page.getByRole("button", { name: "Xác thực" }).click();
  J.totpUsedAt = next.at;
  await expect(page).toHaveURL((u) => u.pathname === "/admin/reviews", { timeout: 20_000 });
}

test.describe("UAT P1 — đăng ký, wizard, Admin duyệt (theo thứ tự checklist)", () => {
  // Theo thứ tự, một worker; bước lỗi không chặn các bước sau (trạng thái lưu ra file, xem journeyStore)
  test.describe.configure({ mode: "default", timeout: 240_000 });

  test.beforeAll(({ browserName: _b }, testInfo) => {
    const t = tag(testInfo);
    const store = journeyStore<Journey>("uat-p1", testInfo, () => ({
      t,
      store: {
        id: "",
        email: `uat.ch.${t}@example.com`,
        password: PASSWORD,
        fullName: "Phạm Thu Hà",
        orgName: `Tiệm bánh UAT Hạt Lúa ${t}`,
      },
      charity: {
        id: "",
        email: `uat.tc.${t}@example.com`,
        password: PASSWORD,
        fullName: "Võ Thị Hạnh",
        orgName: `Mái ấm UAT Nắng Mai ${t}`,
      },
    }));
    J = store.state;
    saveJourney = store.save;
    saveJourney();
  });

  test.afterEach(() => saveJourney());

  const need = (cond: unknown, what: string) => test.skip(!cond, `⛔ bị chặn: thiếu ${what} từ bước trước`);

  test("P1-07 đăng ký cửa hàng từ trang chủ ⇒ thư xác nhận tiếng Việt trong ≤ 1 phút", async ({
    page,
  }, testInfo) => {
    const sentAt = Date.now();
    await registerFromHome(page, "Đăng ký cửa hàng", J.store);
    const mail = await waitForMail(J.store.email, /Xác nhận email/, 60_000);
    const delay = new Date(mail.Created).getTime() - sentAt;
    note(testInfo, "email", `“${mail.Subject}” từ ${mail.From.Name} <${mail.From.Address}> sau ${delay} ms`);
    expect(delay).toBeLessThan(60_000);
    expect(mail.Subject).toBe("Xác nhận email để kích hoạt tài khoản FoodSave");
    expect(mail.From.Name).toBe("FoodSave");
    expect(`${mail.Subject}\n${mail.Text}`).not.toMatch(MOJIBAKE);
    expect(mail.Text).toMatch(/Xin chào|kích hoạt/);
    await shot(page, testInfo, "P1-07-register-sent");
  });

  test("P1-08 bấm link trong email ⇒ đăng nhập, vào wizard cửa hàng ở bước 1", async ({ page }, testInfo) => {
    const mail = await waitForMail(J.store.email, /Xác nhận email/);
    const link = linkIn(mail, /https?:\/\/[^\s"'<>]+\/auth\/confirm\?[^\s"'<>]+/);
    await page.goto(link);
    await expect(page).toHaveURL(/\/onboarding\/store\/basics$/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Thông tin cơ bản");
    if (isMobile(page)) await expect(page.getByText("Bước 1/5")).toBeVisible();
    else
      await expect(
        page
          .getByText(/0\/4 bước đã xong/)
          .filter({ visible: true })
          .first(),
      ).toBeVisible();
    await shot(page, testInfo, "P1-08-wizard-step1");
  });

  test("P1-09 điền tên + loại hình, sang bước 2, đóng tab, đăng nhập lại ⇒ còn dữ liệu, đúng bước", async ({
    page,
  }, testInfo) => {
    await page.goto(J.store.email ? "/login?next=%2Fonboarding%2Fstore" : "/");
    await loginUi(page, J.store.email, J.store.password);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Thông tin cơ bản");
    await page.getByLabel("Tên cửa hàng").fill(J.store.orgName);
    await page.getByRole("radio", { name: "Tiệm bánh" }).check();
    await page.getByLabel("Số điện thoại liên hệ").fill("0901 234 567");
    await expectSaved(page);
    await page.getByRole("button", { name: "Tiếp tục" }).click();
    await expect(page).toHaveURL(/\/onboarding\/store\/location$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Địa điểm & giờ mở cửa");
    await page.close(); // đóng tab

    // Mở lại trang (phiên mới, như mở trình duyệt khác) và đăng nhập
    const ctx = await newVnContext(page);
    const again = await ctx.newPage();
    try {
      await again.goto("/");
      await again.getByRole("link", { name: "Đăng nhập" }).first().click();
      await loginUi(again, J.store.email, J.store.password);
      await expect(again).toHaveURL(/\/onboarding$/);
      const draft = again.getByRole("listitem").filter({ hasText: J.store.orgName });
      await expect(draft.getByText("Nháp", { exact: true })).toBeVisible();
      await draft.getByRole("link", { name: /Tiếp tục hồ sơ/ }).click();
      await expect(again).toHaveURL(/\/onboarding\/store\/location$/);
      await expect(again.getByLabel("Tên điểm cửa hàng")).toHaveValue(J.store.orgName);
      await again.getByRole("button", { name: "Quay lại" }).click();
      await expect(again).toHaveURL(/\/onboarding\/store\/basics$/);
      await expect(again.getByLabel("Tên cửa hàng")).toHaveValue(J.store.orgName);
      await expect(again.getByRole("radio", { name: "Tiệm bánh" })).toBeChecked();
      await shot(again, testInfo, "P1-09-resume");
    } finally {
      await ctx.close();
    }
    const [org] = await adminSelect<{ id: string }[]>(
      `organizations?select=id&name=eq.${encodeURIComponent(J.store.orgName)}`,
    );
    J.store.orgId = org!.id;
  });

  test("P1-10/11/12 địa chỉ: gợi ý khi gõ, ghim + phường tự điền; kéo ghim ~100 m; dùng vị trí hiện tại", async ({
    page,
    context,
  }, testInfo) => {
    need(J.store.orgId, "hồ sơ nháp cửa hàng (P1-09)");
    await page.goto("/login?next=%2Fonboarding%2Fstore%2Flocation");
    await loginUi(page, J.store.email, J.store.password);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Địa điểm & giờ mở cửa");

    // P1-10: gõ một địa chỉ thật (trường đại học)
    const suggestions = await pickAddress(page, "Trường Đại học Khoa học Tự nhiên Nguyễn Văn Cừ");
    note(testInfo, "P1-10 gợi ý", suggestions.slice(0, 3).join(" | ").replace(/\n/g, " "));
    const first = await coords(page);
    const ward = page.getByText("Phường/xã").locator("xpath=following-sibling::dd[1]");
    await expect(ward).not.toHaveText(/Chưa xác định|Đang xác định/);
    const wardText = await ward.innerText();
    note(testInfo, "P1-10 phường", `${wardText} @ ${first.lat},${first.lng}`);
    expect(wardText.length).toBeGreaterThan(2);
    expect(wardText).not.toMatch(/Quận|Huyện/);
    await expect(page.locator("[data-pin]")).toBeVisible();
    await shot(page, testInfo, "P1-10-address-pin");

    // P1-11: kéo ghim sang vị trí khác (~100 m)
    const pin = page.locator("[data-pin]");
    await pin.scrollIntoViewIfNeeded();
    const box = (await pin.boundingBox())!;
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height - 4;
    if (isMobile(page)) {
      // P1-11 là bước 💻; kéo bằng ngón tay là P1-37 (người thử). Trên điện thoại giả lập dùng cách thay thế
      // của ghim (WCAG 2.5.7): chọn ghim rồi Shift + mũi tên (~110 m mỗi lần)
      await pin.focus();
      await page.keyboard.down("Shift");
      await page.keyboard.press("ArrowRight");
      await page.keyboard.up("Shift");
      note(testInfo, "P1-11 mobile", "dịch ghim bằng bàn phím (Shift + →), không kéo chuột");
    } else {
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX + 40, startY + 10, { steps: 5 });
      await page.mouse.move(startX + 80, startY + 20, { steps: 5 });
      await page.mouse.up();
    }
    await expect.poll(async () => metres(first, await coords(page)), { timeout: 10_000 }).toBeGreaterThan(20);
    const moved = await coords(page);
    const dist = metres(first, moved);
    await expect(page.getByText("Ghim trên bản đồ", { exact: true })).toBeVisible();
    await expect(page.getByText("Đang xác định địa chỉ…")).toHaveCount(0, { timeout: 20_000 });
    const address = await page.getByLabel("Số nhà, tên đường").inputValue();
    note(testInfo, "P1-11 kéo ghim", `dịch ${dist.toFixed(0)} m; địa chỉ sau khi thả: “${address}”`);
    expect(dist).toBeGreaterThan(20);
    expect(dist).toBeLessThan(600);
    await shot(page, testInfo, "P1-11-dragged-pin");

    // P1-12 (giả lập GPS — Safari thật cần người thử): "Dùng vị trí hiện tại"
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 10.762622, longitude: 106.682189, accuracy: 15 });
    await page.getByRole("button", { name: "Dùng vị trí hiện tại" }).click();
    await expect.poll(async () => (await coords(page)).lat, { timeout: 20_000 }).toBeCloseTo(10.762622, 5);
    await expect(page.getByText("Vị trí hiện tại (GPS)", { exact: true })).toBeVisible();
    await expect(page.getByText("Đang xác định địa chỉ…")).toHaveCount(0, { timeout: 20_000 });
    const addr = page.getByLabel("Số nhà, tên đường");
    if ((await addr.inputValue()).trim().length < 3) await addr.fill("227 Nguyễn Văn Cừ");
    await expectSaved(page);
    await page.getByRole("button", { name: "Tiếp tục" }).click();
    await expect(page).toHaveURL(/\/onboarding\/store\/legal$/);
  });

  test("P1-13/14 giấy tờ: PDF lên được; > 10 MB, .exe, .zip bị từ chối tiếng Việt; không có ô ảnh CCCD", async ({
    page,
  }, testInfo) => {
    need(J.store.orgId, "hồ sơ nháp cửa hàng (P1-09)");
    await page.goto("/login?next=%2Fonboarding%2Fstore%2Flegal");
    await loginUi(page, J.store.email, J.store.password);
    // P1-14 (cập nhật B2): bước pháp lý không bao giờ đòi ảnh CCCD; chỉ có ô SỐ CCCD (không bắt buộc)
    await expect(page.getByText("FoodSave không thu ảnh CCCD")).toBeVisible();
    await expect(page.getByLabel(/Số CCCD người đại diện/)).toHaveCount(1);
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
    await page.getByLabel("Tên doanh nghiệp / hộ kinh doanh").fill(`Hộ kinh doanh ${J.store.orgName}`);
    await page.getByLabel("Mã số thuế").fill("0312345678");
    await page.getByLabel("Họ và tên").fill(J.store.fullName);
    await page.getByLabel("Chức danh").fill("Chủ hộ kinh doanh");
    await shot(page, testInfo, "P1-14-legal-no-cccd");
    await page.getByRole("button", { name: "Tiếp tục" }).click();
    await expect(page).toHaveURL(/\/onboarding\/store\/documents$/);
    await expect(
      page.locator('input[type="file"][id*="cccd" i], input[type="file"][id*="id_card" i]'),
    ).toHaveCount(0);

    const slot = page.getByTestId("doc-slot-business_license");
    const input = page.locator("#doc-business_license");
    const big = Buffer.concat([makePdf(), Buffer.alloc(10 * 1024 * 1024 + 4096, 0x20)]);
    await input.setInputFiles({ name: "giay-phep-lon.pdf", mimeType: "application/pdf", buffer: big });
    await expect(slot.getByText("Tệp lớn hơn 10 MB. Vui lòng chọn tệp nhỏ hơn.")).toBeVisible();
    await input.setInputFiles({
      name: "setup.exe",
      mimeType: "application/x-msdownload",
      buffer: Buffer.from("MZ"),
    });
    await expect(slot.getByText("Chỉ nhận ảnh JPG, PNG, WebP hoặc PDF.")).toBeVisible();
    await input.setInputFiles({
      name: "giay-to.zip",
      mimeType: "application/zip",
      buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    });
    await expect(slot.getByText("Chỉ nhận ảnh JPG, PNG, WebP hoặc PDF.")).toBeVisible();
    await input.setInputFiles({
      name: "giay-phep-kinh-doanh.pdf",
      mimeType: "application/pdf",
      buffer: makePdf(),
    });
    await expect(slot.getByText(/Tệp PDF/)).toBeVisible({ timeout: 30_000 });
    const row = await slot.getByRole("listitem").first().innerText();
    note(testInfo, "P1-13 dòng tệp đã tải", row.replace(/\n+/g, " | "));
    expect.soft(row, "hiện tên tệp đã tải lên").toContain("giay-phep-kinh-doanh.pdf");
    await shot(page, testInfo, "P1-13-documents");
    await page.getByRole("button", { name: "Tiếp tục" }).click();
    await expect(page).toHaveURL(/\/onboarding\/store\/review$/);
  });

  test("P1-15/16 chưa tick Điều khoản ⇒ không nộp được; bấm Gửi duyệt 3 lần nhanh ⇒ chỉ 1 hồ sơ", async ({
    page,
  }, testInfo) => {
    need(J.store.orgId, "hồ sơ nháp cửa hàng (P1-09)");
    await page.goto("/login?next=%2Fonboarding%2Fstore%2Freview");
    await loginUi(page, J.store.email, J.store.password);
    await page.getByRole("button", { name: "Gửi duyệt" }).click();
    await expect(page.getByText("Vui lòng đồng ý Điều khoản sử dụng và Chính sách bảo mật.")).toBeVisible();
    await expect(page).toHaveURL(/\/onboarding\/store\/review$/);
    await page.getByRole("checkbox", { name: /Tôi đã đọc và đồng ý/ }).check();
    await page.getByRole("checkbox", { name: /đúng sự thật/ }).check();
    await page.getByRole("checkbox", { name: /chỉ tặng thực phẩm còn hạn/ }).check();
    const submit = page.getByRole("button", { name: "Gửi duyệt" });
    await expect(submit).toBeEnabled();
    // 3 cú bấm liền nhau trong cùng một nhịp (như bấm nhanh/bấm đúp trên điện thoại)
    await submit.evaluate((b: HTMLButtonElement) => {
      b.click();
      b.click();
      b.click();
    });
    await expect(page).toHaveURL(/\/onboarding\/status\?org=.*submitted=1$/, { timeout: 30_000 });
    await expect(page.getByText("Đã gửi hồ sơ. Hồ sơ đang chờ duyệt.")).toBeVisible();
    await expect(
      page.getByRole("article", { name: J.store.orgName }).getByText("Chờ duyệt", { exact: true }),
    ).toBeVisible();
    await shot(page, testInfo, "P1-15-submitted");

    // Tải lại trang rồi thử nộp lần nữa: wizard đã khóa, quay về trang trạng thái
    await page.reload();
    await page.goto("/onboarding/store/review");
    await expect(page).toHaveURL(/\/onboarding\/status\?org=/);
    const orgs = await adminSelect<{ id: string; status: string }[]>(
      `organizations?select=id,status&kind=eq.store&name=eq.${encodeURIComponent(J.store.orgName)}`,
    );
    expect(orgs).toEqual([{ id: J.store.orgId, status: "submitted" }]);
    const submits = await adminSelect<{ id: string }[]>(
      `audit_logs?select=id,action&entity_id=eq.${J.store.orgId}&action=like.*submit*`,
    );
    note(testInfo, "P1-16", `${orgs.length} hồ sơ, ${submits.length} dòng audit “gửi duyệt”`);
    expect(submits.length).toBeLessThanOrEqual(1);
  });

  test("P1-17 chưa duyệt: gõ /store/offers (nay /store/inventory) vẫn ở màn chờ duyệt", async ({
    page,
  }, testInfo) => {
    need(J.store.orgId, "hồ sơ cửa hàng đã gửi (P1-15)");
    await page.goto("/login?next=%2Fstore");
    await loginUi(page, J.store.email, J.store.password);
    // Đường dẫn cũ /store/offers không còn tồn tại ⇒ trang 404 (không lộ gì); route mới bị chặn ở màn chờ duyệt
    await page.goto("/store/offers");
    const offersH1 = await page.getByRole("heading", { level: 1 }).innerText();
    note(testInfo, "P1-17 /store/offers", `${page.url()} · “${offersH1}”`);
    expect(["Trạng thái hồ sơ", "Không tìm thấy trang"]).toContain(offersH1);
    for (const p of ["/store/inventory", "/store/inventory/new", "/store"]) {
      await page.goto(p);
      await expect(page, p).toHaveURL(new RegExp(`/onboarding/status\\?org=${J.store.orgId}`));
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Trạng thái hồ sơ");
    }
    await expect(page.getByRole("link", { name: "Đăng lô mới" })).toHaveCount(0);
    await shot(page, testInfo, "P1-17-pending-guard");
  });

  test("P1-18…22 đăng ký tổ chức (cửa sổ ẩn danh): bán kính 2→8 km đổi số cửa hàng, danh mục, giờ 7 ngày, điểm Ẩn, gửi duyệt", async ({
    page,
    context,
  }, testInfo) => {
    // Hai cửa hàng đã duyệt quanh điểm nhận: ~1,1 km và ~5,5 km
    const at = { lat: 10.8 + Math.random() * 0.02, lng: 106.64 + Math.random() * 0.02 };
    await createApprovedStoreAt(at.lat + 0.01, at.lng);
    await createApprovedStoreAt(at.lat - 0.05, at.lng);

    // P1-18: tài khoản mới, đi hết wizard
    await registerFromHome(page, "Đăng ký tổ chức", J.charity);
    const mail = await waitForMail(J.charity.email, /Xác nhận email/);
    await page.goto(linkIn(mail, /https?:\/\/[^\s"'<>]+\/auth\/confirm\?[^\s"'<>]+/));
    await expect(page).toHaveURL(/\/onboarding\/charity\/basics$/, { timeout: 30_000 });
    await page.getByLabel("Tên tổ chức").fill(J.charity.orgName);
    await page.getByRole("radio", { name: "Nhà mở/Tạm lánh" }).check();
    await page.getByLabel("Số người được hỗ trợ mỗi ngày").fill("40");
    await page.getByLabel("Số điện thoại liên hệ").fill("0912 345 678");
    await expectSaved(page);
    await page.getByRole("button", { name: "Tiếp tục" }).click();
    await expect(page).toHaveURL(/\/onboarding\/charity\/location$/);

    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: at.lat, longitude: at.lng, accuracy: 10 });
    await page.getByRole("button", { name: "Dùng vị trí hiện tại" }).click();
    await expect(page.getByTestId("location-coords")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Đang xác định địa chỉ…")).toHaveCount(0, { timeout: 20_000 });
    const addr = page.getByLabel("Số nhà, tên đường");
    if ((await addr.inputValue()).trim().length < 3) await addr.fill("8 Đường Số 1");

    // P1-19: bán kính 2 km → 8 km
    const radius = page.getByLabel("Bán kính phục vụ (km)");
    const count = page.getByTestId("store-count");
    await radius.fill("2");
    await expect(count).toContainText(/bán kính 2 km/, { timeout: 20_000 });
    const at2 = await count.innerText();
    await shot(page, testInfo, "P1-19-radius-2km", false);
    await page.getByRole("slider", { name: "Thanh kéo bán kính phục vụ" }).fill("8");
    await expect(radius).toHaveValue("8");
    await expect(count).toContainText(/bán kính 8 km/, { timeout: 20_000 });
    const at8 = await count.innerText();
    await expect(page.getByText(/Vòng nét đứt là bán kính phục vụ 8 km/)).toBeVisible();
    await shot(page, testInfo, "P1-19-radius-8km", false);
    const n = (s: string) => (s.includes("Chưa có cửa hàng") ? 0 : Number(s.match(/Có (\d+)/)?.[1] ?? 0));
    note(testInfo, "P1-19", `2 km: “${at2}” · 8 km: “${at8}”`);
    expect(n(at8)).toBeGreaterThan(n(at2));

    // P1-20: chỉ Bánh mì + Rau củ; giờ nhận 7 ngày
    for (const c of [
      "Cơm hộp & món chế biến",
      "Bánh ngọt & dessert",
      "Trái cây",
      "Sữa & sản phẩm sữa",
      "Thịt & hải sản",
      "Đồ uống",
      "Đồ khô",
    ]) {
      const box = page.getByRole("checkbox", { name: c, exact: true });
      if (await box.isChecked()) await box.uncheck();
    }
    for (const c of ["Bánh mì & bakery", "Rau củ tươi"]) {
      const box = page.getByRole("checkbox", { name: c, exact: true });
      if (!(await box.isChecked())) await box.check();
    }
    const always = page.getByRole("checkbox", { name: "Mở cả ngày, mọi ngày (24/7)" });
    if (await always.isChecked()) await always.uncheck();
    for (const day of ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ nhật"]) {
      const open = page.getByRole("checkbox", { name: new RegExp(`^${day}: (nhận|mở)`) });
      if (!(await open.isChecked())) await open.check();
      await page.getByLabel(`${day}: giờ bắt đầu`).fill("0800");
      await page.getByLabel(`${day}: giờ kết thúc`).fill("2000");
    }

    // P1-21: "Ẩn vị trí" có giải thích
    await page.getByRole("radio", { name: /^Ẩn vị trí/ }).check();
    await expect(page.getByText(/chỉ thấy tên phường\/xã, không thấy vị trí trên bản đồ/)).toBeVisible();
    await expectSaved(page);
    await shot(page, testInfo, "P1-20-21-categories-hours-hidden");
    await page.getByRole("button", { name: "Tiếp tục" }).click();
    await expect(page).toHaveURL(/\/onboarding\/charity\/legal$/);
    // Quay lại: vẫn đúng
    await page.getByRole("button", { name: "Quay lại" }).click();
    await expect(page).toHaveURL(/\/onboarding\/charity\/location$/);
    await expect(page.getByRole("checkbox", { name: "Bánh mì & bakery", exact: true })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Rau củ tươi", exact: true })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Đồ khô", exact: true })).not.toBeChecked();
    await expect(page.getByLabel("Chủ nhật: giờ kết thúc")).toHaveValue("20:00");
    await expect(page.getByRole("radio", { name: /^Ẩn vị trí/ })).toBeChecked();
    await expect(radius).toHaveValue("8");
    await page.getByRole("button", { name: "Tiếp tục" }).click();

    await page.getByLabel("Tên tổ chức theo giấy tờ").fill(`Nhóm thiện nguyện ${J.charity.orgName}`);
    await page.getByLabel("Họ và tên").fill(J.charity.fullName);
    await page.getByLabel("Chức danh").fill("Trưởng nhóm");
    await page.getByRole("button", { name: "Tiếp tục" }).click();
    await expect(page).toHaveURL(/\/onboarding\/charity\/documents$/);
    await page.locator("#doc-establishment_decision").setInputFiles({
      name: "quyet-dinh-thanh-lap.pdf",
      mimeType: "application/pdf",
      buffer: makePdf(),
    });
    await expect(page.getByTestId("doc-slot-establishment_decision").getByText(/Tệp PDF/)).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole("button", { name: "Tiếp tục" }).click();
    await expect(page).toHaveURL(/\/onboarding\/charity\/review$/);
    await expect(page.getByText("Ẩn vị trí, chỉ hiện phường/xã", { exact: true })).toBeVisible();
    await expect(page.getByText(/Bánh mì & bakery, Rau củ tươi/)).toBeVisible();

    // P1-22: gửi duyệt ⇒ chờ duyệt; /charity bị chặn ở màn chờ
    await page.getByRole("checkbox", { name: /Tôi đã đọc và đồng ý/ }).check();
    await page.getByRole("checkbox", { name: /đúng sự thật/ }).check();
    await page.getByRole("checkbox", { name: /kiểm tra thực phẩm khi nhận/ }).check();
    await page.getByRole("button", { name: "Gửi duyệt" }).click();
    await expect(page).toHaveURL(/\/onboarding\/status\?org=.*submitted=1$/, { timeout: 30_000 });
    await expect(page.getByText("Đã gửi hồ sơ. Hồ sơ đang chờ duyệt.")).toBeVisible();
    J.charity.orgId = new URL(page.url()).searchParams.get("org")!;
    for (const p of ["/charity", "/charity/donations"]) {
      await page.goto(p);
      await expect(page).toHaveURL(/\/onboarding\/status/);
    }
    await shot(page, testInfo, "P1-22-charity-pending");
  });

  test("P1-23 Admin lần đầu: bắt buộc cài xác thực 2 lớp, có mã QR, không có nút Bỏ qua", async ({
    page,
  }, testInfo) => {
    J.admin = await createAdminUser(`Lê Khánh UAT ${J.t}`);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin$/);
    await loginUi(page, J.admin.email, J.admin.password);
    await expect(page).toHaveURL(/\/admin\/mfa$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Xác thực hai lớp");
    // (Liên kết a11y “Bỏ qua tới nội dung chính” không phải nút bỏ qua MFA)
    await expect(page.getByRole("button", { name: /^(Bỏ qua|Để sau|Skip)(?! tới nội dung)/i })).toHaveCount(
      0,
    );
    await expect(page.getByRole("link", { name: /^(Bỏ qua|Để sau|Skip)(?! tới nội dung)/i })).toHaveCount(0);
    await page.goto("/admin/reviews");
    await expect(page).toHaveURL(/\/admin\/mfa$/); // không vào được console khi chưa có MFA
    await page.getByRole("button", { name: "Tạo mã QR" }).click();
    await expect(page.getByRole("img", { name: /Mã QR/ })).toBeVisible({ timeout: 20_000 });
    await shot(page, testInfo, "P1-23-mfa-enroll", false);
    const secret = ((await page.getByTestId("mfa-secret").textContent()) ?? "").replace(/\s+/g, "");
    const first = await freshCode(secret);
    await page.getByLabel("Mã xác thực 6 số").fill(first.code);
    await page.getByRole("button", { name: "Xác nhận và vào khu vực quản trị" }).click();
    await expect(page).toHaveURL((u) => u.pathname === "/admin/reviews", { timeout: 20_000 });
    J.totpSecret = secret;
    J.totpUsedAt = first.at;
  });

  test("P1-24 đăng xuất, đăng nhập lại ⇒ phải nhập mã 6 số; mã sai bị từ chối", async ({
    page,
  }, testInfo) => {
    need(J.totpSecret, "admin đã cài MFA (P1-23)");
    await page.goto("/login?next=%2Fadmin%2Freviews");
    await loginUi(page, J.admin!.email, J.admin!.password);
    await expect(page).toHaveURL(/\/admin\/mfa/);
    await expect(page.getByRole("heading", { name: "Nhập mã xác thực" })).toBeVisible();
    await page.getByLabel("Mã xác thực 6 số").fill("000000");
    await page.getByRole("button", { name: "Xác thực" }).click();
    await expect(page.getByText(/Mã chưa đúng/)).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(/\/admin\/mfa/);
    await shot(page, testInfo, "P1-24-wrong-code", false);
    const next = await freshCode(J.totpSecret!, J.totpUsedAt);
    await page.getByLabel("Mã xác thực 6 số").fill(next.code);
    await page.getByRole("button", { name: "Xác thực" }).click();
    J.totpUsedAt = next.at;
    await expect(page).toHaveURL((u) => u.pathname === "/admin/reviews", { timeout: 20_000 });
    // Đăng xuất bằng giao diện rồi đăng nhập lại cũng phải qua mã
    await logoutUi(page);
    await page.goto("/admin/reviews");
    await expect(page).toHaveURL(/\/login\?next=/);
    await adminSignIn(page);
  });

  test("P1-25 Hàng đợi duyệt: thấy 2 hồ sơ vừa nộp ở trạng thái Chờ duyệt, mỗi hồ sơ 1 dòng", async ({
    page,
  }, testInfo) => {
    need(J.totpSecret && J.charity.orgId, "admin MFA + hồ sơ tổ chức (P1-22/23)");
    await adminSignIn(page);
    await openQueue(page, J.t);
    await expect(page.getByRole("link", { name: J.store.orgName, exact: true })).toHaveCount(1);
    await expect(page.getByRole("link", { name: J.charity.orgName, exact: true })).toHaveCount(1);
    const statusNav = page.getByRole("navigation", { name: "Lọc theo trạng thái" });
    await expect(statusNav.getByRole("link", { name: /^Chờ duyệt/ })).toHaveAttribute("aria-current", "page");
    await shot(page, testInfo, "P1-25-queue");
  });

  test("P1-26 mở PDF giấy tờ ⇒ mở được; sau 2 phút dán lại link ⇒ hết hạn", async ({
    page,
    request,
  }, testInfo) => {
    need(J.totpSecret, "admin đã cài MFA (P1-23)");
    test.setTimeout(300_000);
    await adminSignIn(page);
    await openReview(page, J.store.orgName);
    const signed = page.context().waitForEvent("request", (r) => r.url().includes("/object/sign/kyc/"));
    await page.getByRole("button", { name: "Xem Giấy phép kinh doanh" }).click();
    const url = (await signed).url();
    J.signedUrl = url;
    const ok = await request.get(url);
    expect(ok.status()).toBe(200);
    expect((await ok.body()).subarray(0, 5).toString("latin1")).toBe("%PDF-");
    await shot(page, testInfo, "P1-26-doc-opened", false);
    for (const p of page.context().pages()) if (p !== page) await p.close();

    await new Promise((r) => setTimeout(r, 120_000)); // đợi 2 phút như checklist
    // "Dán link vào tab mới" = một yêu cầu GET mới tới đúng URL (không qua trình xem PDF)
    const res = await request.get(url, { failOnStatusCode: false, timeout: 30_000 });
    const body = await res.text();
    note(testInfo, "P1-26 sau 2 phút", `HTTP ${res.status()} · ${body.slice(0, 160)}`);
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test("P1-27 Yêu cầu bổ sung: bắt buộc lý do, rồi gửi", async ({ page }, testInfo) => {
    need(J.totpSecret, "admin đã cài MFA (P1-23)");
    await adminSignIn(page);
    await openReview(page, J.store.orgName);
    await page.getByRole("button", { name: "Yêu cầu bổ sung" }).click();
    const dialog = page.getByRole("alertdialog", { name: `Yêu cầu ${J.store.orgName} bổ sung hồ sơ?` });
    await dialog.getByRole("button", { name: "Gửi yêu cầu bổ sung" }).click();
    await expect(dialog.getByText(/ít nhất 10 ký tự/)).toBeVisible();
    await shot(page, testInfo, "P1-27-reason-required", false);
    await dialog
      .getByLabel(/Nội dung cần bổ sung/)
      .fill("Vui lòng bổ sung mô tả ngắn về lượng bánh dư mỗi tối.");
    await dialog.getByRole("button", { name: "Gửi yêu cầu bổ sung" }).click();
    await expect(page.getByText(`Đã gửi yêu cầu bổ sung cho ${J.store.orgName}.`)).toBeVisible({
      timeout: 20_000,
    });
  });

  test("P1-28 cửa hàng thấy lý do (trang + email), sửa và nộp lại", async ({ page }, testInfo) => {
    need(J.totpSecret, "yêu cầu bổ sung (P1-27)");
    const mail = await waitForMail(J.store.email, /cần bổ sung/);
    note(testInfo, "P1-28 email", `“${mail.Subject}” từ ${mail.From.Name} <${mail.From.Address}>`);
    expect(mail.Text).toContain("lượng bánh dư mỗi tối");
    expect(`${mail.Subject}\n${mail.Text}`).not.toMatch(MOJIBAKE);

    await page.goto("/login?next=%2Fstore");
    await loginUi(page, J.store.email, J.store.password);
    await expect(page).toHaveURL(/\/onboarding\/status/);
    const card = page.getByRole("article", { name: J.store.orgName });
    await expect(card.getByText("Cần bổ sung", { exact: true })).toBeVisible();
    await expect(card.getByText(/lượng bánh dư mỗi tối/)).toBeVisible();
    await shot(page, testInfo, "P1-28-needs-changes");
    await card.getByRole("link", { name: "Sửa hồ sơ" }).click();
    await page
      .getByRole("listitem")
      .filter({ hasText: J.store.orgName })
      .getByRole("link", { name: /Sửa hồ sơ/ })
      .click();
    await expect(page.getByText("FoodSave cần bạn bổ sung")).toBeVisible();
    await page.goto("/onboarding/store/basics");
    await page.getByLabel("Mô tả ngắn").fill("Tiệm bánh mì gia đình, thường dư 20–40 ổ mỗi tối.");
    await expectSaved(page);
    await page.goto("/onboarding/store/review");
    await page
      .getByRole("checkbox", { name: /Tôi đã đọc và đồng ý/ })
      .check()
      .catch(() => undefined);
    await page
      .getByRole("checkbox", { name: /đúng sự thật/ })
      .check()
      .catch(() => undefined);
    await page
      .getByRole("checkbox", { name: /chỉ tặng thực phẩm còn hạn/ })
      .check()
      .catch(() => undefined);
    await page.getByRole("button", { name: "Gửi duyệt" }).click();
    await expect(page).toHaveURL(/\/onboarding\/status\?org=/, { timeout: 30_000 });
    await expect(
      page.getByRole("article", { name: J.store.orgName }).getByText("Chờ duyệt", { exact: true }),
    ).toBeVisible();
  });

  test("P1-29 Admin duyệt cửa hàng và tổ chức ⇒ Đã duyệt; lịch sử ghi tên Admin kèm giờ", async ({
    page,
  }, testInfo) => {
    need(J.totpSecret && J.charity.orgId, "admin MFA + hồ sơ tổ chức");
    await adminSignIn(page);
    for (const name of [J.store.orgName, J.charity.orgName]) {
      await openReview(page, name);
      await page.getByRole("button", { name: "Duyệt", exact: true }).click();
      await page
        .getByRole("alertdialog", { name: `Duyệt hồ sơ ${name}?` })
        .getByRole("button", { name: "Duyệt hồ sơ" })
        .click();
      await expect(page.getByText(`Đã duyệt hồ sơ ${name}.`)).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText(/Đã duyệt/).first()).toBeVisible();
      const history = page
        .getByRole("region", { name: "Lịch sử" })
        .or(page.locator("section").filter({ hasText: "Nhật ký chỉ đọc" }));
      const row = history.getByRole("listitem").filter({ hasText: "Duyệt hồ sơ" }).first();
      await expect(row).toContainText(J.admin!.fullName);
      await expect(row.locator("time")).toHaveAttribute("title", /\d{2}:\d{2}/);
      note(testInfo, `P1-29 ${name}`, (await row.innerText()).replace(/\n/g, " · "));
      await shot(page, testInfo, `P1-29-approved-${name === J.store.orgName ? "store" : "charity"}`);
    }
    // Trang "Nhật ký" riêng của Admin
    await page.goto("/admin/audit");
    const placeholder = await page.getByRole("heading", { name: /Tính năng mở ở giai đoạn/ }).count();
    note(
      testInfo,
      "P1-29 /admin/audit",
      placeholder ? "trang giữ chỗ (chưa có nhật ký toàn hệ thống)" : "có nội dung",
    );
    await shot(page, testInfo, "P1-29-admin-audit-page", false);
    const mail = await waitForMail(J.store.email, /đã được duyệt/);
    expect(mail.Subject).toBe(`Hồ sơ ${J.store.orgName} đã được duyệt`);
  });

  test("P1-30 cửa hàng vào /store với menu đầy đủ", async ({ page }, testInfo) => {
    need(J.totpSecret, "hồ sơ đã duyệt (P1-29)");
    await page.goto("/");
    await page.getByRole("link", { name: "Đăng nhập" }).first().click();
    await loginUi(page, J.store.email, J.store.password);
    await expect(page).toHaveURL(/\/onboarding$/);
    await page.getByRole("link", { name: "Vào cổng Cửa hàng" }).click();
    await expect(page).toHaveURL(/\/store$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tổng quan");
    const labels = ["Lô tặng", "Nhu cầu", "Bàn giao", "Minh chứng"];
    if (isMobile(page)) {
      const tabs = page.getByRole("navigation", { name: "Điều hướng nhanh" });
      for (const l of labels) await expect(tabs.getByRole("link", { name: new RegExp(l) })).toBeVisible();
      await tabs.getByRole("button", { name: "Thêm" }).click();
      const sheet = page.getByRole("dialog", { name: "Các mục khác" });
      await expect(sheet.getByRole("link", { name: /Cài đặt/ })).toBeVisible();
      await expect(sheet.getByRole("link", { name: /ESG/ })).toBeVisible();
      await shot(page, testInfo, "P1-30-store-portal-menu");
      await page.keyboard.press("Escape");
    } else {
      const nav = page.getByRole("navigation", { name: "Điều hướng chính" });
      for (const l of ["Tổng quan", ...labels, "ESG", "Cài đặt"])
        await expect(nav.getByRole("link", { name: new RegExp(l) })).toBeVisible();
      await shot(page, testInfo, "P1-30-store-portal-menu");
    }
  });

  test("P1-31 tài khoản tổ chức gõ /store và /admin ⇒ bị chặn", async ({ page }, testInfo) => {
    need(J.charity.orgId, "hồ sơ tổ chức đã duyệt (P1-29)");
    await page.goto("/login?next=%2Fcharity");
    await loginUi(page, J.charity.email, J.charity.password);
    await expect(page).toHaveURL(/\/charity$/);
    await page.goto("/store");
    await expect(page).not.toHaveURL(/\/store/);
    note(testInfo, "P1-31 /store", page.url());
    await expect(
      page.getByRole("navigation", { name: "Điều hướng chính" }).getByRole("link", { name: /Lô tặng/ }),
    ).toHaveCount(0);
    const res = await page.goto("/admin");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Không tìm thấy trang");
    await shot(page, testInfo, "P1-31-admin-404");
  });

  test("P1-32 cửa hàng không đọc được thông tin nhạy cảm của tổ chức (không có trang hồ sơ công khai)", async ({
    page,
  }, testInfo) => {
    need(J.charity.orgId, "hồ sơ tổ chức (P1-22)");
    const token = await accessTokenOf(J.store);
    const get = async (path: string) => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        headers: { apikey: anonKey(), Authorization: `Bearer ${token}` },
      });
      return { status: res.status, body: (await res.json()) as unknown };
    };
    const sensitive = await get(`org_sensitive?org_id=eq.${J.charity.orgId}`);
    const docs = await get(`org_documents?org_id=eq.${J.charity.orgId}`);
    const card = await get(`public_org_cards?id=eq.${J.charity.orgId}`);
    note(
      testInfo,
      "P1-32",
      `org_sensitive ${JSON.stringify(sensitive.body)} · org_documents ${JSON.stringify(docs.body)} · public_org_cards ${JSON.stringify(card.body).slice(0, 300)}`,
    );
    expect(sensitive.body).toEqual([]);
    expect(docs.body).toEqual([]);
    const text = JSON.stringify(card.body);
    for (const leak of ["0912345678", "tax_code", "representative", "4821", ".pdf"])
      expect(text).not.toContain(leak);
    // Không có route hồ sơ công khai cho tổ chức
    for (const p of [`/org/${J.charity.orgId}`, `/charity/${J.charity.orgId}`, `/orgs/${J.charity.orgId}`]) {
      await page.goto(p);
      await expect(page.getByText(/0912 ?345 ?678|0312345678/)).toHaveCount(0);
    }
  });

  test("P1-33 cửa hàng sửa hồ sơ ngay; không tự sửa được xác minh/uy tín/trạng thái; sửa MST ⇒ chờ Admin, vẫn đăng lô", async ({
    page,
    browser,
  }, testInfo) => {
    need(J.totpSecret && J.store.orgId, "cửa hàng đã duyệt (P1-29)");
    await page.goto("/login?next=%2Fstore%2Fsettings");
    await loginUi(page, J.store.email, J.store.password);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Cài đặt");
    await page.getByLabel("Tên cửa hàng").fill(`${J.store.orgName} (Q.1)`);
    await page.getByLabel("Mô tả ngắn").fill("Bánh mì nướng củi, dư 20–40 ổ mỗi tối sau 20:00.");
    await page.getByRole("button", { name: "Lưu hồ sơ" }).click();
    await expect(page.getByText("Đã lưu hồ sơ.")).toBeVisible();
    const [o] = await adminSelect<{ name: string; status: string }[]>(
      `organizations?select=name,status&id=eq.${J.store.orgId}`,
    );
    expect(o).toEqual({ name: `${J.store.orgName} (Q.1)`, status: "approved" });
    J.store.orgName = `${J.store.orgName} (Q.1)`;
    // Không có ô nhập cho "Đã xác minh", "Điểm uy tín", "Trạng thái"
    for (const l of [/xác minh/i, /uy tín/i, /^Trạng thái/])
      await expect(page.getByRole("textbox", { name: l })).toHaveCount(0);
    await expect(page.getByRole("spinbutton", { name: /uy tín/i })).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: /Trạng thái/ })).toHaveCount(0);
    await shot(page, testInfo, "P1-33-settings-profile");

    // Giờ mở cửa sửa ngay
    await page.goto("/store/settings?tab=sites");
    await page
      .getByRole("button", { name: /Sửa giờ|Sửa thông tin điểm/ })
      .first()
      .click();
    const sunday = page.getByLabel("Chủ nhật: giờ kết thúc").first();
    if (await sunday.isVisible().catch(() => false)) {
      await sunday.fill("2100");
      await page.getByRole("button", { name: /^Lưu/ }).first().click();
      await expect(page.getByText(/Đã lưu/).first()).toBeVisible();
    }
    note(
      testInfo,
      "P1-33 giờ",
      (await sunday.isVisible().catch(() => false)) ? "đã sửa giờ Chủ nhật" : "không tìm thấy ô giờ",
    );

    // Sửa mã số thuế ⇒ đề nghị chờ duyệt, vẫn "đã duyệt"
    await page.goto("/store/settings");
    await page.getByRole("button", { name: "Đề nghị sửa thông tin pháp lý" }).click();
    await page.getByLabel("Mã số thuế").fill("0398765432");
    await page.getByLabel("Lý do thay đổi").fill("Chuyển sang mã số thuế của công ty mới thành lập.");
    await page.getByRole("button", { name: "Gửi đề nghị" }).click();
    await expect(page.getByText("Đề nghị sửa thông tin pháp lý đang chờ FoodSave duyệt")).toBeVisible();
    await expect(page.getByText("vẫn ở trạng thái đã duyệt")).toBeVisible();
    await shot(page, testInfo, "P1-33-legal-change-pending");

    // Vẫn vào cổng và đăng lô được
    await page.goto("/store/inventory/new");
    await page.locator("label", { hasText: "Bánh mì & bakery" }).click();
    await page.getByLabel("Tên lô").fill("Bánh mì trong lúc chờ duyệt MST");
    await page.getByRole("textbox", { name: "Số lượng", exact: true }).fill("5");
    await page.getByRole("button", { name: "Ngày mai" }).click();
    // Khung lấy sáng mai: chạy test sau ~20:30 thì khung mặc định "tới giờ đóng cửa" bị chặn đúng luật
    // (lô phải đăng trước giờ đóng cửa ≥ min_publish_lead_minutes) — test không được phụ thuộc giờ chạy.
    const tomorrow = vnDatePlus(1);
    await page.locator("#offer-start-date").fill(tomorrow);
    await page.locator("#offer-start-time").fill("0900");
    await page.locator("#offer-end-date").fill(tomorrow);
    await page.locator("#offer-end-time").fill("1100");
    await page.locator("#offer-end-time").blur();
    await page.getByRole("checkbox", { name: /Tôi cam kết thực phẩm còn an toàn/ }).click();
    await page.getByRole("button", { name: "Đăng lô" }).click();
    await expect(page).toHaveURL(/\/store\/inventory$/, { timeout: 30_000 });
    await expect(page.getByText("Đã đăng lô.", { exact: false })).toBeVisible();

    // Admin thấy mục "Cập nhật hồ sơ" với giá trị cũ/mới, duyệt ⇒ giá trị mới
    const ctx = await browser.newContext({
      ...test.info().project.use,
      locale: "vi-VN",
      timezoneId: "Asia/Ho_Chi_Minh",
    });
    const admin = await ctx.newPage();
    try {
      await adminSignIn(admin);
      await admin.goto(`/admin/reviews?view=changes&q=${encodeURIComponent(J.t)}`);
      await admin.getByRole("link", { name: J.store.orgName, exact: true }).click();
      const table = admin.getByRole("table", { name: "So sánh giá trị hiện tại và giá trị đề nghị" });
      await expect(table).toContainText("0312345678");
      await expect(table).toContainText("0398765432");
      await shot(admin, testInfo, "P1-33-admin-change-request");
      await admin.getByRole("button", { name: "Duyệt thay đổi" }).click();
      await admin.getByRole("alertdialog").getByRole("button", { name: "Duyệt thay đổi" }).click();
      await expect(admin.getByText(`Đã áp dụng thông tin mới cho ${J.store.orgName}.`)).toBeVisible({
        timeout: 20_000,
      });
    } finally {
      await ctx.close();
    }
    await page.goto("/store/settings");
    await expect(page.getByText("0398765432").first()).toBeVisible();
  });

  test("P1-34 form đăng ký không có lựa chọn vai trò Admin", async ({ page }, testInfo) => {
    await page.context().clearCookies();
    for (const url of ["/register", "/register?role=admin", "/register?next=%2Fadmin"]) {
      await page.goto(url);
      const names = await page
        .locator("form input, form select, form textarea")
        .evaluateAll((els) =>
          els.map((e) => `${(e as HTMLInputElement).type}:${(e as HTMLInputElement).name}`),
        );
      note(testInfo, `P1-34 ${url}`, names.join(", "));
      expect(names.join(" ")).not.toMatch(/role|admin|platform/i);
      await expect(page.locator("form select")).toHaveCount(0);
      await expect(page.locator("form").getByRole("radio")).toHaveCount(0);
      await expect(page.locator("form").getByText(/Quản trị|Admin/)).toHaveCount(0);
    }
    // B1: đăng ký kèm metadata role=admin qua API cũng không thành admin (pgTAP b1) — xác nhận ở DB local
    const [p] = await adminSelect<{ platform_role: string }[]>(
      `profiles?select=platform_role&email=eq.${encodeURIComponent(J.store.email)}`,
    );
    expect(p!.platform_role).toBe("user");
  });

  test("P1-35 Cài đặt → Quyền riêng tư (danh sách đồng ý) — kiểm tra có hay chưa", async ({
    page,
  }, testInfo) => {
    need(J.store.orgId, "cửa hàng (P1-09)");
    await page.goto("/login?next=%2Fstore%2Fsettings");
    await loginUi(page, J.store.email, J.store.password);
    const tabs = page.getByRole("navigation", { name: "Các mục cài đặt" });
    const items = await tabs.getByRole("link").allInnerTexts();
    note(testInfo, "P1-35 tab cài đặt", items.join(" | "));
    await shot(page, testInfo, "P1-35-settings-tabs", false);
    const consents = await adminSelect<{ purpose: string; granted_at: string }[]>(
      `consents?select=purpose,granted_at&user_id=eq.${(await adminSelect<{ id: string }[]>(`profiles?select=id&email=eq.${encodeURIComponent(J.store.email)}`))[0]!.id}`,
    );
    note(testInfo, "P1-35 consents (DB)", JSON.stringify(consents));
    const has = /Quyền riêng tư/.test(items.join(" "));
    note(
      testInfo,
      "P1-35 kết luận",
      has
        ? "có tab Quyền riêng tư"
        : "CHƯA CÓ màn Quyền riêng tư cho cửa hàng/tổ chức (đồng ý vẫn lưu trong DB)",
    );
    expect(consents.length).toBeGreaterThan(0);
  });

  test("P1-38 Quên mật khẩu ⇒ email ⇒ đặt mật khẩu mới ⇒ đăng nhập bằng mật khẩu mới", async ({
    page,
  }, testInfo) => {
    need(J.store.orgId, "tài khoản cửa hàng (P1-08)");
    await page.goto("/login");
    await page.getByRole("link", { name: /Quên mật khẩu/ }).click();
    await expect(page).toHaveURL(/\/forgot-password/);
    await page.getByLabel("Email đã đăng ký").fill(J.store.email);
    await page.getByRole("button", { name: "Gửi liên kết đặt lại" }).click();
    await expect(
      page
        .getByRole("status")
        .or(page.getByText(/Đã gửi/))
        .first(),
    ).toBeVisible();
    const mail = await waitForMail(J.store.email, /Đặt lại mật khẩu/);
    note(testInfo, "P1-38 email", `“${mail.Subject}” từ ${mail.From.Name} <${mail.From.Address}>`);
    expect(`${mail.Subject}\n${mail.Text}`).not.toMatch(MOJIBAKE);
    await page.goto(linkIn(mail, /https?:\/\/[^\s"'<>]+\/auth\/confirm\?[^\s"'<>]+/));
    await expect(page).toHaveURL(/\/reset-password/);
    const newPassword = "MatKhauMoi2026";
    await page.getByLabel("Mật khẩu mới", { exact: true }).fill(newPassword);
    await page.getByLabel("Nhập lại mật khẩu mới").fill(newPassword);
    await page.getByRole("button", { name: "Lưu mật khẩu mới" }).click();
    await expect(page).toHaveURL(/\/onboarding\?password=updated/, { timeout: 20_000 });
    await shot(page, testInfo, "P1-38-password-updated");
    await page.context().clearCookies();
    await page.goto("/login");
    const form = page.locator("form").filter({ has: page.getByLabel("Mật khẩu") });
    await form.getByLabel("Email").fill(J.store.email);
    await form.getByLabel("Mật khẩu").fill(J.store.password);
    await form.getByRole("button", { name: "Đăng nhập" }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText("Email hoặc mật khẩu không đúng.");
    await loginUi(page, J.store.email, newPassword);
    J.store.password = newPassword;
    if (J.admin) await revokeAdmin(J.admin); // dọn admin của lượt UAT (bước cuối)
  });
});
