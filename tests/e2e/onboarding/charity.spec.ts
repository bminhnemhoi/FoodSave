import { expect, test } from "@playwright/test";

import { expectNoA11yViolations } from "../fixtures/a11y";
import {
  clickNext,
  createApprovedStoreAt,
  ensureAddress,
  expectSaved,
  makePdf,
  startWizard,
} from "./helpers";

/**
 * US-CHA-01…04, F-04, P1-05: tổ chức — điểm nhận với bán kính phục vụ (vòng tròn + số cửa hàng đã duyệt
 * trong vùng qua count_stores_within), chế độ hiển thị, loại thực phẩm, giờ nhận, sức nhận; gửi duyệt.
 */
test.describe("Wizard tổ chức (F-04)", () => {
  test.setTimeout(180_000);

  test("bán kính phục vụ hiển thị số cửa hàng trong vùng và gửi duyệt được", async ({ page, context }) => {
    // Vị trí ngẫu nhiên quanh Thủ Đức để không trùng dữ liệu của lượt chạy khác
    const lat = 10.84 + Math.random() * 0.03;
    const lng = 106.76 + Math.random() * 0.03;
    await createApprovedStoreAt(lat + 0.02, lng); // ~2,2 km về phía bắc

    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: lat, longitude: lng });

    await startWizard(page, "charity");
    const name = `Bếp ăn Nắng Mai ${Date.now().toString(36)}`;
    await page.getByLabel("Tên tổ chức").fill(name);
    await page.getByRole("radio", { name: "Nhà mở/Tạm lánh" }).check();
    await expect(page.getByText("vị trí điểm nhận sẽ được ẩn theo mặc định")).toBeVisible();
    await page.getByRole("radio", { name: "Bếp ăn từ thiện" }).check();
    await page.getByLabel("Số người được hỗ trợ mỗi ngày").fill("45");
    await page.getByLabel("Số điện thoại liên hệ").fill("0912345678");
    await expectSaved(page);
    await expectNoA11yViolations(page, "wizard charity · basics");
    await clickNext(page);

    // Bước 2 — Điểm nhận
    await expect(page).toHaveURL(/\/onboarding\/charity\/location$/);
    const count = page.getByTestId("store-count");
    await expect(count).toHaveText("Ghim điểm nhận trên bản đồ để xem số cửa hàng trong vùng.");
    await page.getByRole("button", { name: "Dùng vị trí hiện tại" }).click();
    await expect(page.getByTestId("location-coords")).toHaveAttribute("data-lat", String(lat), {
      timeout: 20_000,
    });
    await ensureAddress(page);
    await expectSaved(page);

    // Mặc định 5 km ⇒ thấy cửa hàng cách ~2,2 km
    await expect(count).toContainText(/Có \d+ cửa hàng đã duyệt trong bán kính 5 km/, { timeout: 20_000 });
    const at5 = Number((await count.textContent())?.match(/Có (\d+)/)?.[1]);
    expect(at5).toBeGreaterThanOrEqual(1);

    // Thu bán kính về 1 km bằng ô số (thay thế cho thanh kéo — WCAG 2.5.7)
    const radius = page.getByLabel("Bán kính phục vụ (km)");
    await radius.fill("1");
    await expect(count).toContainText(/bán kính 1 km/, { timeout: 5_000 });
    const text1 = (await count.textContent()) ?? "";
    const at1 = text1.includes("Chưa có cửa hàng") ? 0 : Number(text1.match(/Có (\d+)/)?.[1]);
    expect(at1).toBeLessThan(at5);

    // Thanh kéo cập nhật cùng giá trị
    const slider = page.getByRole("slider", { name: "Thanh kéo bán kính phục vụ" });
    await slider.fill("8");
    await expect(radius).toHaveValue("8");
    await expect(count).toContainText(/bán kính 8 km/, { timeout: 5_000 });

    // Ngoài khoảng 0,5–30 km ⇒ lỗi tiếng Việt
    await radius.fill("45");
    await expect(page.getByText("Bán kính phục vụ từ 0,5 đến 30 km.")).toBeVisible();
    await radius.fill("8");

    // Chế độ hiển thị mặc định "gần đúng" (khuyên dùng); chọn "Ẩn vị trí"
    await expect(page.getByRole("radio", { name: /vùng gần đúng/ })).toBeChecked();
    await page.getByRole("radio", { name: /^Ẩn vị trí/ }).check();

    // Bỏ một loại thực phẩm, khai sức nhận
    await page.getByRole("checkbox", { name: "Thịt & hải sản" }).uncheck();
    await page.getByLabel("Sức nhận mỗi ngày (kg)").fill("30");
    await expectNoA11yViolations(page, "wizard charity · location");
    await clickNext(page);

    // Bước 3 — Pháp lý
    await expect(page).toHaveURL(/\/onboarding\/charity\/legal$/);
    await page.getByLabel("Tên tổ chức theo giấy tờ").fill("Nhóm thiện nguyện Nắng Mai");
    await page.getByLabel("Họ và tên").fill("Võ Thị Hạnh");
    await page.getByLabel("Chức danh").fill("Trưởng nhóm");
    await clickNext(page);

    // Bước 4 — Giấy tờ: quyết định thành lập hoặc giấy phép
    await expect(page).toHaveURL(/\/onboarding\/charity\/documents$/);
    await page.locator("#doc-establishment_decision").setInputFiles({
      name: "quyet-dinh.pdf",
      mimeType: "application/pdf",
      buffer: makePdf(),
    });
    await expect(page.getByTestId("doc-slot-establishment_decision").getByText(/Tệp PDF/)).toBeVisible({
      timeout: 30_000,
    });
    await clickNext(page);

    // Bước 5 — Xem lại phản ánh đúng dữ liệu đã lưu
    await expect(page).toHaveURL(/\/onboarding\/charity\/review$/);
    await expect(page.getByText("8 km", { exact: true })).toBeVisible();
    await expect(page.getByText("Ẩn vị trí, chỉ hiện phường/xã", { exact: true })).toBeVisible();
    await expect(page.getByText(/Bánh mì & bakery, .*Đồ khô/)).toBeVisible();
    await expect(page.getByText("30 kg")).toBeVisible();
    await page.getByRole("checkbox", { name: /Tôi đã đọc và đồng ý/ }).check();
    await page.getByRole("checkbox", { name: /đúng sự thật/ }).check();
    await page.getByRole("checkbox", { name: /kiểm tra thực phẩm khi nhận/ }).check();
    await expectNoA11yViolations(page, "wizard charity · review");
    await page.getByRole("button", { name: "Gửi duyệt" }).click();

    await expect(page).toHaveURL(/\/onboarding\/status\?org=.*&submitted=1$/, { timeout: 30_000 });
    await expect(page.getByText("Đã gửi hồ sơ. Hồ sơ đang chờ duyệt.")).toBeVisible();
    await expect(page.getByRole("article", { name }).getByText("Chờ duyệt", { exact: true })).toBeVisible();
  });
});
