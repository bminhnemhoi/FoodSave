import { expect, test } from "@playwright/test";

import { expectNoA11yViolations } from "../fixtures/a11y";
import {
  adminSelect,
  clickNext,
  downloadKyc,
  EXIF_MARKER,
  expectSaved,
  makePdf,
  makePng,
  pickLocationBySearch,
  startWizard,
} from "./helpers";

/**
 * US-STO-01…04, F-03, F-06, F-07: cửa hàng đi hết wizard — tạo nháp → địa điểm + giờ → pháp lý →
 * giấy tờ (ảnh được mã hóa lại, PDF) → cam kết → gửi duyệt → trang "Đang chờ duyệt".
 */
test.describe("Wizard cửa hàng (F-03)", () => {
  test.setTimeout(180_000);

  test("đi hết các bước và gửi duyệt", async ({ page }) => {
    await startWizard(page, "store");
    await expectNoA11yViolations(page, "wizard store · basics");

    // Bước 1 — Thông tin cơ bản
    const name = `Tiệm bánh Hạt Lúa ${Date.now().toString(36)}`;
    await page.getByLabel("Tên cửa hàng").fill(name);
    await page.getByRole("radio", { name: "Tiệm bánh" }).check();
    await page.getByLabel("Mô tả ngắn").fill("Tiệm bánh mì gia đình, thường dư 20–40 ổ mỗi tối.");
    await page.getByLabel("Số điện thoại liên hệ").fill("0901 234 567");
    await expectSaved(page);
    await clickNext(page);

    // Bước 2 — Địa điểm & giờ mở cửa
    await expect(page).toHaveURL(/\/onboarding\/store\/location$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Địa điểm & giờ mở cửa");
    await expect(page.getByLabel("Tên điểm cửa hàng")).toHaveValue(name);
    await pickLocationBySearch(page, "Chợ Bến Thành");
    await expectSaved(page);
    // Thứ Bảy mở tới 02:00 hôm sau (qua nửa đêm)
    await page.getByLabel("Thứ Bảy: giờ kết thúc").fill("02:00");
    await expect(page.getByText("Giờ kết thúc phải sau giờ bắt đầu, hoặc chọn “Qua nửa đêm”.")).toBeVisible();
    await page.getByRole("checkbox", { name: "Thứ Bảy: qua nửa đêm" }).check();
    await expect(page.getByText("Giờ kết thúc phải sau giờ bắt đầu, hoặc chọn “Qua nửa đêm”.")).toHaveCount(
      0,
    );
    await expectNoA11yViolations(page, "wizard store · location");
    await clickNext(page);

    // Bước 3 — Pháp lý (không có ô CCCD)
    await expect(page).toHaveURL(/\/onboarding\/store\/legal$/);
    await expect(page.getByText("FoodSave không thu số hay ảnh CCCD")).toBeVisible();
    await expect(page.getByLabel(/CCCD/)).toHaveCount(0);
    await page.getByLabel("Tên doanh nghiệp / hộ kinh doanh").fill("Hộ kinh doanh Hạt Lúa");
    await page.getByLabel("Mã số thuế").fill("12345");
    await page.getByLabel("Mã số thuế").blur();
    await expect(
      page.getByText("Mã số thuế gồm 10 chữ số, hoặc 13 ký tự dạng 0123456789-001."),
    ).toBeVisible();
    await page.getByLabel("Mã số thuế").fill("0312345678");
    await page.getByLabel("Họ và tên").fill("Phạm Thu Hà");
    await page.getByLabel("Chức danh").fill("Chủ hộ kinh doanh");
    await expectNoA11yViolations(page, "wizard store · legal");
    await clickNext(page);

    // Bước 4 — Giấy tờ: thiếu GPKD thì không đi tiếp
    await expect(page).toHaveURL(/\/onboarding\/store\/documents$/);
    await clickNext(page);
    await expect(
      page.getByText("Còn thiếu giấy tờ bắt buộc. Vui lòng tải lên trước khi tiếp tục."),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/onboarding\/store\/documents$/);

    const license = page.getByTestId("doc-slot-business_license");
    await page.locator("#doc-business_license").setInputFiles({
      name: "giay-phep.png",
      mimeType: "image/png",
      buffer: makePng(),
    });
    await expect(license.getByText(/Ảnh \(đã xóa thông tin vị trí\)/)).toBeVisible({ timeout: 30_000 });

    // Sai định dạng bị từ chối bằng tiếng Việt
    const food = page.getByTestId("doc-slot-food_safety_cert");
    await page.locator("#doc-food_safety_cert").setInputFiles({
      name: "virus.exe",
      mimeType: "application/x-msdownload",
      buffer: Buffer.from("MZ"),
    });
    await expect(food.getByText("Chỉ nhận ảnh JPG, PNG, WebP hoặc PDF.")).toBeVisible();
    await page.locator("#doc-food_safety_cert").setInputFiles({
      name: "attp.pdf",
      mimeType: "application/pdf",
      buffer: makePdf(),
    });
    await expect(food.getByText(/Tệp PDF/)).toBeVisible({ timeout: 30_000 });
    await expectNoA11yViolations(page, "wizard store · documents");

    // Ảnh lưu trong kyc đã được mã hóa lại: WebP, không còn chunk EXIF
    const orgs = await adminSelect<{ id: string }[]>(
      `organizations?select=id&name=eq.${encodeURIComponent(name)}`,
    );
    expect(orgs).toHaveLength(1);
    const docs = await adminSelect<{ doc_type: string; mime_type: string; storage_path: string }[]>(
      `org_documents?select=doc_type,mime_type,storage_path&org_id=eq.${orgs[0]!.id}`,
    );
    const image = docs.find((d) => d.doc_type === "business_license")!;
    expect(image.mime_type).toBe("image/webp");
    expect(image.storage_path).toMatch(new RegExp(`^${orgs[0]!.id}/business_license/[0-9a-f-]{36}\\.webp$`));
    const bytes = await downloadKyc(image.storage_path);
    expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
    expect(bytes.includes(Buffer.from(EXIF_MARKER))).toBe(false);
    await clickNext(page);

    // Bước 5 — Cam kết & gửi duyệt
    await expect(page).toHaveURL(/\/onboarding\/store\/review$/);
    await expect(page.getByRole("heading", { level: 2, name: "Thông tin cơ bản" })).toBeVisible();
    await expect(page.getByText(name).first()).toBeVisible();
    await expect(page.getByText("Thứ Bảy: 07:00–02:00 (hôm sau)")).toBeVisible();
    await page.getByRole("button", { name: "Gửi duyệt" }).click();
    await expect(page.getByText("Vui lòng đồng ý Điều khoản sử dụng và Chính sách bảo mật.")).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /Tôi đã đọc và đồng ý/ })).toBeFocused();
    await expectNoA11yViolations(page, "wizard store · review");

    await page.getByRole("checkbox", { name: /Tôi đã đọc và đồng ý/ }).check();
    await page.getByRole("checkbox", { name: /đúng sự thật/ }).check();
    await page.getByRole("checkbox", { name: /chỉ tặng thực phẩm còn hạn/ }).check();
    await page.getByRole("button", { name: "Gửi duyệt" }).click();

    await expect(page).toHaveURL(new RegExp(`/onboarding/status\\?org=${orgs[0]!.id}&submitted=1$`), {
      timeout: 30_000,
    });
    await expect(page.getByText("Đã gửi hồ sơ. Hồ sơ đang chờ duyệt.")).toBeVisible();
    const card = page.getByRole("article", { name });
    await expect(card.getByText("Chờ duyệt", { exact: true })).toBeVisible();
    await expectNoA11yViolations(page, "/onboarding/status (vừa gửi)");

    // Đồng ý được ghi đúng phiên bản; hồ sơ đã khóa — mở lại wizard chuyển về trang trạng thái
    const consents = await adminSelect<{ policy_version: string; text_hash: string }[]>(
      `consents?select=policy_version,text_hash&purpose=eq.terms&withdrawn_at=is.null&user_id=in.(${await userIdOf(name)})`,
    );
    expect(consents[0]?.policy_version).toBe("2026-10-v1");
    expect(consents[0]?.text_hash).toMatch(/^[0-9a-f]{64}$/);
    await page.goto("/onboarding/store/basics");
    await expect(page).toHaveURL(/\/onboarding\/status\?org=/);
  });
});

async function userIdOf(orgName: string): Promise<string> {
  const rows = await adminSelect<{ created_by: string }[]>(
    `organizations?select=created_by&name=eq.${encodeURIComponent(orgName)}`,
  );
  return rows[0]!.created_by;
}
