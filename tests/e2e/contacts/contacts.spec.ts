import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page, type TestInfo } from "@playwright/test";

import { setupCharity, setupStoreOffer, literal } from "../charity/helpers";
import { expectNoA11yViolations } from "../fixtures/a11y";
import { accessTokenOf, adminPatch, createSite, rpcAs, seedSensitive } from "../fixtures/orgs";
import { createConfirmedUser, createOrgFor, loginAs } from "../fixtures/users";
import { acceptAndStart, createVolunteerTripScenario, serviceGet } from "../volunteer/scenario";

/**
 * B1/B3 — liên hệ giữa các bên và chính sách 2026-10-v2 (Supabase LOCAL):
 * - cửa hàng khai hotline trong Cài đặt ⇒ tổ chức đã duyệt thấy nút Gọi/Email trên thẻ lô (get_org_contact, tải khi bấm);
 * - TNV chưa bật "cho phép gọi" ⇒ cửa hàng được giải thích + hotline điều phối; bật ⇒ cửa hàng thấy số đầy đủ khi
 *   chuyến đang chạy (reveal_trip_contact, có nhật ký);
 * - người đã đồng ý chính sách bản cũ thấy banner v2 (không chặn), "Đồng ý" ghi consent terms v2.
 */

const POLICY_V2 = "2026-10-v2";

/** Ảnh để duyệt giao diện: `B_SHOTS_DIR` nếu có, ngược lại thư mục kết quả của test. */
async function snap(page: Page, testInfo: TestInfo, name: string) {
  const dir = process.env.B_SHOTS_DIR;
  const file = `contacts-${name}-${testInfo.project.name}.png`;
  if (dir) mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: dir ? join(dir, file) : testInfo.outputPath(file), fullPage: true });
}

test.describe("Liên hệ trong trao nhận (B1) và chính sách v2 (B3)", () => {
  test.describe.configure({ timeout: 240_000 });

  test("hotline khai trong Cài đặt ⇒ tổ chức thấy Gọi/Email trên thẻ lô", async ({ page }, testInfo) => {
    const store = await setupStoreOffer({ quantity: 12 });
    await seedSensitive(store.org.id, {
      legal_name: "Hộ kinh doanh thử",
      contact_email: "chu.tiem@example.com",
      contact_phone: "0901234567",
    });
    const charity = await setupCharity();

    // --- cửa hàng: thẻ nhắc trên Tổng quan ⇒ Cài đặt › Hồ sơ ⇒ khai hotline
    await loginAs(page, store.owner, "/store");
    const reminder = page.locator("[data-hotline-reminder]");
    await expect(reminder).toBeVisible();
    await reminder.getByRole("link", { name: "Thêm hotline" }).click();
    await expect(page).toHaveURL(/\/store\/settings\?tab=profile/);
    await expect(
      page.getByText("Số này hiển thị cho các cửa hàng và tổ chức đã được duyệt").first(),
    ).toBeVisible();
    await page.getByLabel("Số hotline").fill("12345");
    await page.getByRole("button", { name: "Lưu hồ sơ" }).click();
    await expect(page.getByText(/Hotline cần 10 số di động/).first()).toBeVisible();
    await page.getByLabel("Số hotline").fill("028 3823 4567");
    await page.getByLabel("Email công việc").fill("Lien.He@TiemThu.example.com");
    await expectNoA11yViolations(page, "Cài đặt — hotline");
    await snap(page, testInfo, "settings-hotline");
    await page.getByRole("button", { name: "Lưu hồ sơ" }).click();
    await expect(page.getByText("Đã lưu hồ sơ.")).toBeVisible();
    const [row] = await serviceGet<{ hotline_phone: string; hotline_email: string }[]>(
      `org_contacts?select=hotline_phone,hotline_email&org_id=eq.${store.org.id}`,
    );
    expect(row).toEqual({ hotline_phone: "02838234567", hotline_email: "lien.he@tiemthu.example.com" });
    await page.goto("/store");
    await expect(page.locator("[data-hotline-reminder]")).toHaveCount(0);

    // --- tổ chức: thẻ lô ⇒ "Liên hệ" (tải khi mở) ⇒ nút gọi + email
    await page.context().clearCookies();
    await loginAs(page, charity.user, "/charity/donations");
    const card = page.getByRole("article", { name: literal(store.title) });
    await expect(card).toBeVisible({ timeout: 20_000 });
    await card.getByRole("button", { name: `Liên hệ ${store.org.name}` }).click();
    const call = page.getByRole("link", { name: /Gọi 028 3823 4567/ });
    await expect(call).toBeVisible();
    await expect(call).toHaveAttribute("href", "tel:02838234567");
    await expect(page.getByRole("link", { name: /Email lien\.he@tiemthu\.example\.com/ })).toHaveAttribute(
      "href",
      /^mailto:lien\.he@tiemthu\.example\.com/,
    );
    await expectNoA11yViolations(page, "Kho tặng — liên hệ cửa hàng");
    await snap(page, testInfo, "offer-contact");
  });

  test("TNV bật cho phép gọi ⇒ cửa hàng thấy số khi chuyến đang chạy; chưa bật ⇒ giải thích + hotline", async ({
    page,
  }, testInfo) => {
    const s = await createVolunteerTripScenario({ tag: `call-${randomUUID().slice(0, 6)}` });
    const phone = `09${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
    await adminPatch(`profiles?id=eq.${s.volunteer.id}`, { phone });
    await acceptAndStart(s);

    // --- cửa hàng: TNV chưa bật ⇒ không hiện số, gợi ý hotline điều phối
    await loginAs(page, s.store, "/store/handover");
    const stopCard = page.locator(`[data-pending-stop="${s.pickupStopId}"]`);
    await expect(stopCard).toBeVisible({ timeout: 20_000 });
    await stopCard.getByRole("button", { name: "Gọi tình nguyện viên" }).click();
    let dialog = page.getByRole("dialog", { name: "Gọi tình nguyện viên của chuyến" });
    await dialog.getByRole("button", { name: "Hiện số điện thoại" }).click();
    await expect(dialog.getByRole("alert")).toContainText("chưa bật");
    await expect(dialog.getByRole("button", { name: /Hotline điều phối/ })).toBeVisible();
    await dialog.getByRole("button", { name: "Đóng" }).last().click();

    // --- TNV: bật công tắc trong Tài khoản (mặc định TẮT)
    await page.context().clearCookies();
    await loginAs(page, s.volunteer, "/volunteer/profile");
    const toggle = page.getByRole("switch", {
      name: "Cho phép cửa hàng và điều phối viên gọi tôi khi chuyến đang chạy",
    });
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await toggle.click();
    await expect(page.getByText("Đã cho phép gọi bạn khi chuyến đang chạy.")).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    const consents = await serviceGet<{ policy_version: string; withdrawn_at: string | null }[]>(
      `consents?select=policy_version,withdrawn_at&user_id=eq.${s.volunteer.id}&purpose=eq.trip_contact`,
    );
    expect(consents).toEqual([{ policy_version: POLICY_V2, withdrawn_at: null }]);

    // --- cửa hàng: xác nhận ⇒ số đầy đủ + nút gọi; mỗi lần xem có nhật ký
    await page.context().clearCookies();
    await loginAs(page, s.store, "/store/handover");
    await page
      .locator(`[data-pending-stop="${s.pickupStopId}"]`)
      .getByRole("button", { name: "Gọi tình nguyện viên" })
      .click();
    dialog = page.getByRole("dialog", { name: "Gọi tình nguyện viên của chuyến" });
    await expect(
      dialog.getByText("Mỗi lần xem số đều được FoodSave ghi nhật ký", { exact: false }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Hiện số điện thoại" }).click();
    const shown = `${phone.slice(0, 4)} ${phone.slice(4, 7)} ${phone.slice(7)}`;
    await expect(dialog.locator("[data-volunteer-phone]")).toHaveText(shown);
    await expect(dialog.getByRole("link", { name: `Gọi ${shown}` })).toHaveAttribute("href", `tel:${phone}`);
    await expectNoA11yViolations(page, "Bàn giao — gọi tình nguyện viên");
    await snap(page, testInfo, "call-volunteer");
    const audit = await serviceGet<{ entity_id: string; after: { side: string } }[]>(
      `audit_logs?select=entity_id,after&action=eq.contact.reveal&entity_id=eq.${s.pickupId}`,
    );
    expect(audit).toEqual([{ entity_id: s.pickupId, after: expect.objectContaining({ side: "store" }) }]);
    expect(JSON.stringify(audit)).not.toContain(phone);
  });

  test("banner chính sách v2: không chặn, xem điểm thay đổi, Đồng ý ghi consent mới", async ({
    page,
  }, testInfo) => {
    const owner = await createConfirmedUser({ prefix: "policy-v2", fullName: "Lê Văn Tâm" });
    const org = await createOrgFor(owner, { kind: "store", status: "approved" });
    await createSite(org.id, { name: "Chi nhánh 1" });
    // Đã đồng ý bản cũ (2026-10-v1)
    await rpcAs(await accessTokenOf(owner), "grant_consent", {
      p_purpose: "terms",
      p_policy_version: "2026-10-v1",
      p_text_hash: "b".repeat(64),
      p_source: "web",
    });

    await loginAs(page, owner, "/store");
    const banner = page.locator("[data-policy-banner]");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(`Chính sách bảo mật đã cập nhật (phiên bản ${POLICY_V2})`);
    // Không chặn: nội dung trang vẫn hiện và thao tác được bình thường
    await expect(page.getByRole("heading", { level: 1, name: "Tổng quan" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Đăng lô mới" }).first()).toBeEnabled();
    await banner.getByText("Xem điểm thay đổi").click();
    await expect(banner.getByText(/FoodSave không thu ảnh CCCD/)).toBeVisible();
    await expect(banner.getByRole("link", { name: "Đọc toàn bộ Chính sách bảo mật" })).toHaveAttribute(
      "href",
      "/privacy#thay-doi",
    );
    await expectNoA11yViolations(page, "Tổng quan + banner chính sách");
    await snap(page, testInfo, "policy-banner");

    await banner.getByRole("button", { name: "Đồng ý" }).click();
    await expect(page.locator("[data-policy-banner]")).toHaveCount(0);
    const rows = await serviceGet<{ policy_version: string; withdrawn_at: string | null }[]>(
      `consents?select=policy_version,withdrawn_at&user_id=eq.${owner.id}&purpose=eq.terms&order=granted_at`,
    );
    expect(rows.map((r) => [r.policy_version, r.withdrawn_at === null])).toEqual([
      ["2026-10-v1", false],
      [POLICY_V2, true],
    ]);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Tổng quan" })).toBeVisible();
    await expect(page.locator("[data-policy-banner]")).toHaveCount(0);

    // Trang chủ công khai không bao giờ có banner
    await page.goto("/");
    await expect(page.locator("[data-policy-banner]")).toHaveCount(0);
  });
});
