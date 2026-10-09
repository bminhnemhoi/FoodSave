import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import { expectNoA11yViolations } from "../fixtures/a11y";
import { accessTokenOf, rpcAs } from "../fixtures/orgs";
import { loginAs } from "../fixtures/users";

import {
  acceptAndStart,
  CHARITY_POS,
  consentsOf,
  createVolunteerTripScenario,
  handoverIdOf,
  pickupOf,
  setPhonePosition,
  shot,
  STORE_POS,
  stopOf,
} from "./scenario";

/**
 * P3-10 / P3-08 (phía TNV) — PWA tình nguyện viên (PRD US-VOL-02…09, 12): điều phối viên giao chuyến ⇒ TNV nhận,
 * bắt đầu, check-in trong geofence, hiện QR cho cửa hàng (cửa hàng nhập mã qua RPC), sang điểm giao, hiện mã giao
 * hàng (tổ chức ghi nhận qua RPC `record_dropoff`) ⇒ chuyến hoàn tất. Thêm: check-in ngoài 100 m bắt buộc lý do,
 * từ chối chuyến bắt buộc lý do, vị trí chỉ được gửi khi đã đồng ý.
 */

const tripUrl = (id: string) => `/volunteer/trips/${id}`;

/** Chờ khung hình kế tiếp và mọi transition kết thúc rồi mới chạy axe (nút vừa hết trạng thái chờ). */
async function a11y(page: Page, label: string) {
  await page.evaluate(async () => {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined)));
  });
  await expectNoA11yViolations(page, label);
}

/** Đọc mã 6 số trên lớp phủ QR đang mở. */
async function readCode(page: Page, dialogName: string): Promise<string> {
  const dialog = page.getByRole("dialog", { name: dialogName });
  await expect(dialog.getByRole("img", { name: /Mã QR/ })).toBeVisible();
  const code = (await dialog.locator("[data-handover-code]").innerText()).replace(/\D/g, "");
  expect(code).toMatch(/^\d{6}$/);
  return code;
}

test.describe("PWA tình nguyện viên — chuyến lấy hàng (P3-10)", () => {
  test.describe.configure({ timeout: 180_000 });

  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("nhận → bắt đầu → check-in geofence → QR cửa hàng → mã giao hàng → chuyến hoàn tất", async ({
    page,
  }, testInfo) => {
    const s = await createVolunteerTripScenario({ tag: `flow-${testInfo.project.name}` });
    // Đứng ngay trước cửa hàng (~5 m)
    await setPhonePosition(page, { lat: STORE_POS.lat + 0.00004, lng: STORE_POS.lng + 0.00002 });

    // --- "Hôm nay": chuyến chờ nhận lời (US-VOL-03, US-VOL-04)
    await loginAs(page, s.volunteer, "/volunteer");
    await expect(page.getByRole("heading", { level: 1, name: "Hôm nay" })).toBeVisible();
    const card = page.locator(`[data-trip-card="${s.pickupId}"]`);
    await expect(card).toContainText("Chờ nhận lời");
    await expect(card).toContainText(`Chuyến cho ${s.charityName}`);
    await expect(card).toContainText("1 điểm lấy hàng");
    await expect(card).toContainText("Khoảng 2,4 kg");
    await a11y(page, "Hôm nay — chờ nhận lời");
    await shot(page, testInfo, "today");

    await card.getByRole("button", { name: "Nhận chuyến" }).click();
    await expect(card).toContainText("Đã nhận");
    expect((await pickupOf(s.pickupId)).accepted_at).not.toBeNull();

    // --- Bắt đầu chuyến: lần đầu ⇒ giải thích vị trí (US-VOL-02 AC1), chọn "chỉ dùng check-in"
    await card.getByRole("button", { name: "Bắt đầu chuyến" }).click();
    const consent = page.getByRole("dialog", { name: "Chia sẻ vị trí khi chuyến đang chạy" });
    await expect(consent).toBeVisible();
    await expect(consent).toContainText("Cửa hàng chỉ thấy giờ dự kiến tới");
    await a11y(page, "màn đồng ý vị trí");
    await shot(page, testInfo, "consent", false);
    await consent.getByRole("button", { name: "Không, chỉ dùng check-in" }).click();

    await expect(page).toHaveURL(new RegExp(`${tripUrl(s.pickupId)}$`));
    await expect(page.getByRole("heading", { level: 1, name: `Chuyến cho ${s.charityName}` })).toBeVisible();
    await expect(page.locator('[data-phase="in_progress"]').first()).toBeVisible();
    expect((await pickupOf(s.pickupId)).status).toBe("in_progress");
    expect(await consentsOf(s.volunteer.id)).toEqual([]); // không đồng ý ⇒ không ghi gì
    // Trang hiện mã dùng một lần: không gửi Referer, không index (C10)
    await expect(page.locator('meta[name="referrer"]')).toHaveAttribute("content", "no-referrer");

    // --- Điểm kế tiếp: cửa hàng, hàng cần lấy, liên hệ đã che, chỉ đường kèm điểm giao
    const current = page.locator(`[data-current-stop="${s.pickupStopId}"]`);
    await expect(current).toContainText(s.storeName);
    await expect(current).toContainText(s.offerTitle);
    await expect(current).toContainText("20 ổ");
    await expect(current).toContainText("090****567");
    const directions = current.getByRole("link", { name: /Chỉ đường/ });
    await expect(directions).toHaveAttribute("href", /google\.com\/maps\/dir\/.*travelmode=two-wheeler/);
    await expect(directions).toHaveAttribute(
      "href",
      new RegExp(`destination=${CHARITY_POS.lat.toFixed(6)}%2C${CHARITY_POS.lng.toFixed(6)}`),
    );
    await expect(current.getByRole("link", { name: /Apple Maps/ })).toHaveAttribute(
      "href",
      /maps\.apple\.com/,
    );
    await expect(page.getByRole("region", { name: /Bản đồ chuyến/ })).toBeVisible();
    await a11y(page, "màn chuyến — điểm kế tiếp");
    await shot(page, testInfo, "trip");

    // --- "Tôi đã tới" trong 100 m ⇒ check-in geofence (US-VOL-06 AC1)
    await current.getByRole("button", { name: "Tôi đã tới" }).click();
    await expect(current).toContainText("Đã tới nơi");
    await expect(current).toContainText("trong phạm vi 100 m");
    expect(await stopOf(s.pickupStopId)).toMatchObject({ status: "arrived", arrival_check: "geofence" });

    // --- Hiện mã cho cửa hàng (US-VOL-07) ⇒ cửa hàng nhập mã 6 số
    await current.getByRole("button", { name: "Hiện mã cho cửa hàng" }).click();
    const pickupCode = await readCode(page, "Mã bàn giao");
    await a11y(page, "QR cho cửa hàng");
    await shot(page, testInfo, "qr", false);
    const storeToken = await accessTokenOf(s.store);
    const consumed = await rpcAs<{ ok: boolean }>(storeToken, "consume_handover_code", {
      p_handover_id: await handoverIdOf(s.pickupStopId),
      p_code: pickupCode,
      p_lines: [{ allocation_id: s.allocationId, qty: s.qty, reason: null, note: null }],
      p_client_op_id: randomUUID(),
    });
    expect(consumed.ok).toBe(true);

    // Máy TNV tự nhận ra (hỏi trạng thái mỗi 3 giây) ⇒ sang điểm giao về
    await expect(page.getByRole("dialog", { name: "Mã bàn giao" })).toBeHidden({ timeout: 20_000 });
    const dropoff = page.locator(`[data-current-stop="${s.dropoffStopId}"]`);
    await expect(dropoff).toBeVisible({ timeout: 20_000 });
    await expect(dropoff).toContainText("Giao về");
    await expect(dropoff).toContainText("Hàng mang về");
    await expect(page.locator(`[data-stop="${s.pickupStopId}"]`)).toHaveAttribute("data-stop-status", "done");
    await a11y(page, "điểm giao về");
    await shot(page, testInfo, "dropoff");

    // --- Hiện mã giao hàng (US-VOL-09) ⇒ tổ chức ghi nhận bằng record_dropoff
    await dropoff.getByRole("button", { name: "Hiện mã giao hàng" }).click();
    const dropCode = await readCode(page, "Mã giao hàng");
    await expect(page.getByRole("dialog", { name: "Mã giao hàng" })).toContainText(
      "Hoặc đọc mã 6 số cho điều phối viên tổ chức",
    );
    await shot(page, testInfo, "dropoff-qr", false);
    const charityToken = await accessTokenOf(s.charity);
    const recorded = await rpcAs<{ ok: boolean }>(charityToken, "record_dropoff", {
      p_handover_id: await handoverIdOf(s.dropoffStopId),
      p_secret: dropCode,
      p_lines: [{ allocation_id: s.allocationId, qty: s.qty, reason: null, note: null }],
      p_client_op_id: randomUUID(),
    });
    expect(recorded.ok).toBe(true);

    const done = page.locator("[data-trip-done]");
    await expect(done).toBeVisible({ timeout: 20_000 });
    await expect(done).toContainText(`Bạn vừa giúp chuyển 20 ổ bánh mì sandwich`);
    await expect(done).toContainText(s.charityName);
    const trip = await pickupOf(s.pickupId);
    expect(trip.status).toBe("completed");
    expect(trip.last_location).toBeNull();
    await a11y(page, "chuyến hoàn tất");
    await shot(page, testInfo, "done");
  });

  test("check-in ngoài 100 m bắt buộc lý do ⇒ check-in thủ công có cờ", async ({ page }, testInfo) => {
    const s = await createVolunteerTripScenario({ tag: `fence-${testInfo.project.name}` });
    await acceptAndStart(s);
    // Cách cửa hàng ~600 m
    await setPhonePosition(page, { lat: STORE_POS.lat + 0.0054, lng: STORE_POS.lng });

    await loginAs(page, s.volunteer, tripUrl(s.pickupId));
    const current = page.locator(`[data-current-stop="${s.pickupStopId}"]`);
    await current.getByRole("button", { name: "Tôi đã tới" }).click();

    const sheet = page.getByRole("dialog", { name: "Bạn chưa ở gần điểm này" });
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText(/cách .* khoảng (5|6)\d0 m/);
    expect((await stopOf(s.pickupStopId)).status).toBe("pending"); // chưa đổi gì

    await sheet.getByRole("button", { name: "Check-in thủ công" }).click();
    await expect(sheet.getByText("Vui lòng chọn hoặc ghi lý do.")).toBeVisible();
    await sheet.getByRole("radio", { name: "GPS không chính xác" }).check();
    await a11y(page, "lý do check-in thủ công");
    await shot(page, testInfo, "checkin-reason", false);
    await sheet.getByRole("button", { name: "Check-in thủ công" }).click();

    await expect(sheet).toBeHidden();
    await expect(current).toContainText("Đã tới nơi");
    await expect(current).toContainText("check-in thủ công");
    expect(await stopOf(s.pickupStopId)).toEqual({
      status: "arrived",
      arrival_check: "manual",
      arrival_note: "GPS không chính xác",
    });
  });

  test("không có quyền vị trí ⇒ check-in thủ công, cờ “chưa xác minh vị trí”", async ({ page }, testInfo) => {
    const s = await createVolunteerTripScenario({ tag: `noloc-${testInfo.project.name}` });
    await acceptAndStart(s);
    await page.context().clearPermissions(); // trình duyệt từ chối (hoặc không trả) vị trí

    await loginAs(page, s.volunteer, tripUrl(s.pickupId));
    const current = page.locator(`[data-current-stop="${s.pickupStopId}"]`);
    await current.getByRole("button", { name: "Tôi đã tới" }).click();

    const sheet = page.getByRole("dialog", { name: "Không lấy được vị trí" });
    await expect(sheet).toBeVisible({ timeout: 25_000 });
    await expect(sheet).toContainText("check-in chưa xác minh vị trí");
    await sheet.getByRole("radio", { name: "Đã tắt quyền vị trí cho FoodSave" }).check();
    await sheet.getByRole("button", { name: "Check-in thủ công" }).click();

    await expect(sheet).toBeHidden();
    await expect(current).toContainText("chưa xác minh vị trí");
    expect(await stopOf(s.pickupStopId)).toEqual({
      status: "arrived",
      arrival_check: "no_location",
      arrival_note: "Đã tắt quyền vị trí cho FoodSave",
    });
  });

  test("không thể nhận chuyến: bắt buộc lý do, chuyến về chờ phân công", async ({ page }, testInfo) => {
    const s = await createVolunteerTripScenario({ tag: `decline-${testInfo.project.name}` });
    await loginAs(page, s.volunteer, tripUrl(s.pickupId));
    await expect(page.locator('[data-phase="awaiting_response"]').first()).toBeVisible();

    await page.getByRole("button", { name: "Không thể nhận" }).click();
    const sheet = page.getByRole("dialog", { name: "Không thể nhận chuyến này?" });
    await sheet.getByRole("button", { name: "Báo không thể nhận" }).click();
    await expect(sheet.getByText(/Vui lòng chọn hoặc ghi lý do/)).toBeVisible();
    await sheet.getByRole("radio", { name: "Khác" }).check();
    await sheet.getByLabel("Ghi rõ lý do").fill("Xe đang sửa, mai mới lấy được");
    await sheet.getByRole("button", { name: "Báo không thể nhận" }).click();

    await expect(page).toHaveURL(/\/volunteer$/);
    await expect(page.locator(`[data-trip-card="${s.pickupId}"]`)).toHaveCount(0);
    expect(await pickupOf(s.pickupId)).toMatchObject({ status: "planned", assignee_user_id: null });
  });

  test("vị trí chỉ được gửi khi đã đồng ý; dừng và rút lại đồng ý", async ({ page }, testInfo) => {
    const s = await createVolunteerTripScenario({ tag: `geo-${testInfo.project.name}` });
    await acceptAndStart(s);
    await setPhonePosition(page, { lat: 10.77612, lng: 106.69857 });
    const updates: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/rest/v1/rpc/update_pickup_progress")) updates.push(r.url());
    });

    await loginAs(page, s.volunteer, tripUrl(s.pickupId));
    const card = page.getByRole("region", { name: "Vị trí trong chuyến" });
    await expect(card.getByRole("button", { name: "Bật chia sẻ vị trí" })).toBeVisible();
    // Chưa đồng ý: không một yêu cầu gửi vị trí nào, DB không có điểm
    await page.waitForTimeout(3000);
    expect(updates).toHaveLength(0);
    expect((await pickupOf(s.pickupId)).last_location).toBeNull();

    await card.getByRole("button", { name: "Bật chia sẻ vị trí" }).click();
    const consent = page.getByRole("dialog", { name: "Chia sẻ vị trí khi chuyến đang chạy" });
    await consent.getByRole("button", { name: "Đồng ý chia sẻ vị trí" }).click();

    const banner = page.locator("[data-location-banner]");
    await expect(banner).toContainText("Đang chia sẻ vị trí");
    await expect(banner).toContainText(/Cập nhật lúc \d\d:\d\d/, { timeout: 20_000 });
    expect(updates.length).toBeGreaterThanOrEqual(1);
    const shared = await pickupOf(s.pickupId);
    // Chỉ điểm mới nhất, làm tròn 4 chữ số (~11 m)
    expect(shared.lastLocation).toEqual({ lat: 10.7761, lng: 106.6986 });
    expect(await consentsOf(s.volunteer.id)).toEqual([
      expect.objectContaining({ purpose: "location_trip", withdrawn_at: null, policy_version: "2026-10-v2" }),
    ]);
    await expect(page.getByRole("region", { name: /có vị trí của bạn/ })).toBeVisible();
    // Về đầu trang trước khi quét: khi trang đang cuộn, bản đồ trượt dưới thanh "Đang chia sẻ vị trí" (sticky) và
    // axe tính nút phóng to 44 px bị nút "Dừng" che một phần — trạng thái cuộn, không phải lỗi bố cục.
    await page.evaluate(() => window.scrollTo(0, 0));
    await a11y(page, "đang chia sẻ vị trí");
    await shot(page, testInfo, "sharing");

    // "Dừng" ⇒ banner biến mất ngay, không gửi thêm
    await banner.getByRole("button", { name: "Dừng" }).click();
    await expect(banner).toHaveCount(0);
    const afterStop = updates.length;
    await page.waitForTimeout(1500);
    expect(updates.length).toBe(afterStop);

    // Rút lại đồng ý ⇒ DB xóa điểm đã lưu ngay
    await card.getByRole("button", { name: "Rút lại đồng ý chia sẻ vị trí" }).click();
    await expect(card.getByRole("button", { name: "Bật chia sẻ vị trí" })).toBeVisible();
    await expect.poll(async () => (await pickupOf(s.pickupId)).last_location).toBeNull();
    expect((await consentsOf(s.volunteer.id))[0]!.withdrawn_at).not.toBeNull();
  });
});
