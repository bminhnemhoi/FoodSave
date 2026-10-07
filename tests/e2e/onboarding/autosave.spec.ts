import { expect, test } from "@playwright/test";

import { adminSelect, expectSaved, startWizard } from "./helpers";

/** US-STO-01 AC1–AC3: tự lưu nháp, mở lại đúng bước, một nháp mỗi loại (L5), lỗi tiếng Việt. */
test.describe("Tự lưu nháp và kiểm tra dữ liệu (P1-02)", () => {
  test.setTimeout(120_000);

  test("tải lại trang vẫn còn dữ liệu; mở lại wizard vào đúng bước đang làm", async ({ page }) => {
    const user = await startWizard(page, "store");
    const name = `Tiệm Tự Lưu ${Date.now().toString(36)}`;
    await page.getByLabel("Tên cửa hàng").fill(name);
    await page.getByRole("radio", { name: "Siêu thị" }).check();
    await expectSaved(page);

    await page.reload();
    await expect(page.getByLabel("Tên cửa hàng")).toHaveValue(name);
    await expect(page.getByRole("radio", { name: "Siêu thị" })).toBeChecked();

    // Sửa tên ⇒ tự lưu lại (debounce) mà không cần bấm gì; tải lại vẫn đúng giá trị mới
    await page.getByLabel("Tên cửa hàng").fill(`${name} 2`);
    await expect
      .poll(
        async () =>
          (
            await adminSelect<{ name: string }[]>(
              `organizations?select=name&kind=eq.store&created_by=eq.${user.id}`,
            )
          )[0]?.name,
        { timeout: 15_000 },
      )
      .toBe(`${name} 2`);
    await expectSaved(page);
    await page.reload();
    await expect(page.getByLabel("Tên cửa hàng")).toHaveValue(`${name} 2`);

    // Hoàn tất bước 1 rồi "Lưu và thoát": /onboarding hiện hồ sơ nháp, mở lại vào bước 2
    await page.getByLabel("Số điện thoại liên hệ").fill("0987654321");
    await expectSaved(page);
    await page.getByRole("button", { name: "Lưu và thoát" }).click();
    await expect(page).toHaveURL(/\/onboarding$/);
    const draft = page.getByRole("listitem").filter({ hasText: `${name} 2` });
    await expect(draft.getByText("Nháp", { exact: true })).toBeVisible();
    await draft.getByRole("link", { name: /Tiếp tục hồ sơ/ }).click();
    await expect(page).toHaveURL(/\/onboarding\/store\/location$/);
    await expect(page.getByText("1/4 bước đã xong").filter({ visible: true })).toHaveCount(1);

    // Nút Back của trình duyệt khôi phục trang cũ từ bộ nhớ đệm ⇒ wizard tự tải lại dữ liệu mới nhất
    await page.goBack();
    await expect(page).toHaveURL(/\/onboarding$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/onboarding\/store\/basics$/);
    await expect(page.getByLabel("Số điện thoại liên hệ")).toHaveValue("0987654321");
    await expect(page.getByLabel("Tên cửa hàng")).toHaveValue(`${name} 2`);

    // Một chủ chỉ có một nháp cửa hàng (hồi quy L5)
    const orgs = await adminSelect<{ id: string }[]>(
      `organizations?select=id&kind=eq.store&created_by=eq.${user.id}`,
    );
    expect(orgs).toHaveLength(1);
  });

  test("thiếu trường bắt buộc: lỗi tiếng Việt, focus trường lỗi đầu tiên, không sang bước sau", async ({
    page,
  }) => {
    await startWizard(page, "store");
    await page.getByLabel("Email liên hệ").fill("");
    await page.getByRole("button", { name: "Tiếp tục" }).click();

    await expect(page).toHaveURL(/\/onboarding\/store\/basics$/);
    await expect(page.getByText("Vui lòng nhập tên cửa hàng.").first()).toBeVisible();
    await expect(page.getByText("Vui lòng chọn loại hình.").first()).toBeVisible();
    await expect(page.getByText("Vui lòng nhập số điện thoại.").first()).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: /mục cần sửa/ })).toBeVisible();
    await expect(page.getByLabel("Tên cửa hàng")).toBeFocused();
    await expect(page.getByLabel("Tên cửa hàng")).toHaveAttribute("aria-invalid", "true");

    await page.getByLabel("Email liên hệ").fill("khong-phai-email");
    await page.getByLabel("Email liên hệ").blur();
    await expect(page.locator("#basics-contactEmail-error")).toHaveText(
      "Email chưa đúng định dạng, ví dụ: ten@tochuc.vn.",
    );
    await page.getByLabel("Số điện thoại liên hệ").fill("12345");
    await page.getByLabel("Số điện thoại liên hệ").blur();
    await expect(page.locator("#basics-contactPhone-error")).toHaveText(
      "Số điện thoại cần 10 chữ số, bắt đầu bằng 0.",
    );

    // Chưa có nháp thì các bước sau chưa mở được
    await page.goto("/onboarding/store/documents");
    await expect(page).toHaveURL(/\/onboarding\/store\/basics$/);
  });
});
