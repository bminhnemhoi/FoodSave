import { expect, test, type Page } from "@playwright/test";

import { expectNoA11yViolations } from "../fixtures/a11y";
import { createSite, seedSensitive, vnDatePlus } from "../fixtures/orgs";
import { createConfirmedUser, createOrgFor, loginAs, uniqueSuffix } from "../fixtures/users";
import { adminSelect } from "../onboarding/helpers";

/**
 * P1-06, US-STO-05, US-STO-27, US-CHA-34/37: trang Cài đặt của cửa hàng đã duyệt —
 * hồ sơ (lưu ngay) + đề nghị sửa pháp lý (vẫn approved), giờ 24 giờ (qua nửa đêm), lịch ngày nghỉ, tạm ngưng.
 */

const WEEKDAY = ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];

function dayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
  return `${WEEKDAY[dow]}, ${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/** Mở đúng tháng trên lịch ngày nghỉ rồi trả nút của ngày. */
async function dayButton(page: Page, iso: string) {
  const label = `Tháng ${Number(iso.slice(5, 7))}/${iso.slice(0, 4)}`;
  for (let i = 0; i < 3; i++) {
    if ((await page.getByText(label, { exact: true }).count()) > 0) break;
    await page.getByRole("button", { name: "Tháng sau" }).click();
  }
  await expect(page.getByText(label, { exact: true })).toBeVisible();
  return page.getByRole("gridcell").getByRole("button", { name: new RegExp(`^${dayLabel(iso)}`) });
}

async function setupStore() {
  const owner = await createConfirmedUser({ prefix: "settings-store", fullName: "Nguyễn Thị Thu Lan" });
  const org = await createOrgFor(owner, {
    kind: "store",
    status: "approved",
    name: `Tiệm bánh Hạt Lúa ${uniqueSuffix()}`,
  });
  await seedSensitive(org.id, {
    legal_name: "Hộ kinh doanh Hạt Lúa",
    tax_code: "0312345678",
    representative_name: "Nguyễn Thị Thu Lan",
    representative_title: "Chủ hộ kinh doanh",
    contact_email: "lien.he@hatlua.vn",
    contact_phone: "0901234567",
  });
  const site = await createSite(org.id, { name: "Chi nhánh Bến Thành" });
  return { owner, org, site };
}

test.describe("Cài đặt cửa hàng (P1-06, F-10)", () => {
  test.setTimeout(150_000);

  test("hồ sơ lưu ngay; sửa pháp lý thành đề nghị chờ duyệt, tổ chức vẫn đã duyệt", async ({ page }) => {
    const { owner, org } = await setupStore();
    await loginAs(page, owner, "/store/settings");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Cài đặt");
    const tabs = page.getByRole("navigation", { name: "Các mục cài đặt" });
    await expect(tabs.getByRole("link", { name: "Hồ sơ" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByLabel("Tên cửa hàng")).toHaveValue(org.name);
    await expectNoA11yViolations(page, "/store/settings (Hồ sơ)");

    // Trường không pháp lý: lưu ngay
    await page.getByLabel("Mô tả ngắn").fill("Tiệm bánh mì gia đình, dư 20–40 ổ mỗi tối.");
    await page.getByLabel("Số điện thoại liên hệ").fill("0912 345 678");
    await page.getByRole("button", { name: "Lưu hồ sơ" }).click();
    await expect(page.getByText("Đã lưu hồ sơ.")).toBeVisible();
    const [saved] = await adminSelect<{ description: string; status: string }[]>(
      `organizations?select=description,status&id=eq.${org.id}`,
    );
    expect(saved!.description).toBe("Tiệm bánh mì gia đình, dư 20–40 ổ mỗi tối.");
    const [sens] = await adminSelect<{ contact_phone: string }[]>(
      `org_sensitive?select=contact_phone&org_id=eq.${org.id}`,
    );
    expect(sens!.contact_phone).toBe("0912345678");

    // Trường pháp lý: đề nghị chờ Admin duyệt
    await page.getByRole("button", { name: "Đề nghị sửa thông tin pháp lý" }).click();
    await page.getByLabel("Mã số thuế").fill("12345");
    await page.getByRole("button", { name: "Gửi đề nghị" }).click();
    await expect(
      page.getByText("Mã số thuế gồm 10 chữ số, hoặc 13 ký tự dạng 0123456789-001."),
    ).toBeVisible();
    await page.getByLabel("Mã số thuế").fill("0312345678");
    await page.getByLabel("Tên pháp lý").fill("Công ty TNHH Hạt Lúa");
    await page.getByLabel("Lý do thay đổi").fill("Chuyển từ hộ kinh doanh sang công ty TNHH.");
    await page.getByRole("button", { name: "Gửi đề nghị" }).click();
    await expect(page.getByText("Đề nghị sửa thông tin pháp lý đang chờ FoodSave duyệt")).toBeVisible();
    await expect(page.getByText("Tên pháp lý: Công ty TNHH Hạt Lúa")).toBeVisible();
    await expect(page.getByText("vẫn ở trạng thái đã duyệt")).toBeVisible();

    const requests = await adminSelect<{ status: string; changes: Record<string, string> }[]>(
      `org_change_requests?select=status,changes&org_id=eq.${org.id}`,
    );
    expect(requests).toEqual([{ status: "pending", changes: { legal_name: "Công ty TNHH Hạt Lúa" } }]);
    const [after] = await adminSelect<{ status: string }[]>(`organizations?select=status&id=eq.${org.id}`);
    expect(after!.status).toBe("approved");
    const [legal] = await adminSelect<{ legal_name: string }[]>(
      `org_sensitive?select=legal_name&org_id=eq.${org.id}`,
    );
    expect(legal!.legal_name).toBe("Hộ kinh doanh Hạt Lúa");
  });

  test("giờ mở cửa 24 giờ (qua nửa đêm) và lịch ngày nghỉ", async ({ page }) => {
    const { owner, site } = await setupStore();
    await loginAs(page, owner, "/store/settings?tab=sites");

    await expect(page.getByRole("heading", { level: 2, name: site.name })).toBeVisible();
    await expect(page.getByText("12 Lê Lợi, Phường Bến Thành")).toBeVisible();

    // Điểm chưa khai giờ = 24/7; bỏ chọn để khai từng ngày
    const always = page.getByRole("checkbox", { name: "Mở cả ngày, mọi ngày (24/7)" });
    await expect(always).toBeChecked();
    await always.uncheck();

    // Ô giờ 24 giờ: gõ "730" rời ô ⇒ 07:30; phím ↑ ⇒ 07:45; "0200" tự thành 02:00
    const monOpen = page.getByLabel("Thứ Hai: giờ bắt đầu");
    await expect(monOpen).toHaveAttribute("inputmode", "numeric");
    await monOpen.fill("730");
    await monOpen.blur();
    await expect(monOpen).toHaveValue("07:30");
    await monOpen.press("ArrowUp");
    await expect(monOpen).toHaveValue("07:45");

    const satClose = page.getByLabel("Thứ Bảy: giờ kết thúc");
    await satClose.fill("0200");
    await expect(satClose).toHaveValue("02:00");
    await expect(page.getByText("Giờ kết thúc phải sau giờ bắt đầu, hoặc chọn “Qua nửa đêm”.")).toBeVisible();
    await page.getByRole("checkbox", { name: "Thứ Bảy: qua nửa đêm" }).check();
    await expect(page.getByText("Giờ kết thúc phải sau giờ bắt đầu, hoặc chọn “Qua nửa đêm”.")).toHaveCount(
      0,
    );
    await expectNoA11yViolations(page, "/store/settings?tab=sites");

    await page.getByRole("button", { name: "Lưu giờ hoạt động" }).click();
    await expect(page.getByText("Đã lưu giờ hoạt động.")).toBeVisible();
    const hours = await adminSelect<
      { dow: number; opens: string; closes: string; closes_next_day: boolean }[]
    >(`site_hours?select=dow,opens,closes,closes_next_day&site_id=eq.${site.id}&order=dow`);
    expect(hours).toHaveLength(7);
    expect(hours.find((h) => h.dow === 1)).toMatchObject({ opens: "07:45:00", closes: "21:00:00" });
    expect(hours.find((h) => h.dow === 6)).toMatchObject({ closes: "02:00:00", closes_next_day: true });

    await page.reload();
    await expect(page.getByLabel("Thứ Hai: giờ bắt đầu")).toHaveValue("07:45");
    await expect(page.getByLabel("Thứ Bảy: giờ kết thúc")).toHaveValue("02:00");
    await expect(page.getByRole("checkbox", { name: "Thứ Bảy: qua nửa đêm" })).toBeChecked();

    // Lịch ngày nghỉ: chọn ngày (chuột + bàn phím), ghi chú, thêm rồi bỏ
    const date = vnDatePlus(20);
    const day = await dayButton(page, date);
    await day.click();
    await expect(day).toBeFocused();
    await day.press("ArrowRight");
    await expect(
      page.getByRole("button", { name: new RegExp(`^${dayLabel(vnDatePlus(21))}`) }),
    ).toBeFocused();
    await day.click();
    await page.getByLabel("Ghi chú (không bắt buộc)").fill("Sửa bếp");
    await page.getByRole("button", { name: "Đánh dấu ngày nghỉ" }).click();
    await expect(page.getByText(`Đã đánh dấu nghỉ ${dayLabel(date)}.`)).toBeVisible();
    const list = page.getByRole("region", { name: /Ngày nghỉ sắp tới/ });
    await expect(list.getByText(dayLabel(date))).toBeVisible();
    await expect(list.getByText("Sửa bếp")).toBeVisible();
    await expect(day).toHaveAccessibleName(new RegExp(`ngày nghỉ: Sửa bếp`));
    expect(
      await adminSelect<{ closed_on: string; reason: string }[]>(
        `site_closures?select=closed_on,reason&site_id=eq.${site.id}`,
      ),
    ).toEqual([{ closed_on: date, reason: "Sửa bếp" }]);

    await list.getByRole("button", { name: `Bỏ ngày nghỉ ${dayLabel(date)}` }).click();
    await expect(page.getByText(`Đã bỏ ngày nghỉ ${dayLabel(date)}.`)).toBeVisible();
    await expect(list.getByText("Chưa có ngày nghỉ nào sắp tới")).toBeVisible();
    expect(await adminSelect(`site_closures?select=closed_on&site_id=eq.${site.id}`)).toEqual([]);

    // Không lùi về trước tháng hiện tại; ngày đã qua không chọn được
    const prev = page.getByRole("button", { name: "Tháng trước" });
    while (await prev.isEnabled()) await prev.click();
    await expect(prev).toBeDisabled();
    await expect(page.getByRole("button", { name: new RegExp(`^${dayLabel(vnDatePlus(0))}`) })).toBeEnabled();
    const yesterday = vnDatePlus(-1);
    if (yesterday.slice(0, 7) === vnDatePlus(0).slice(0, 7)) {
      await expect(page.getByRole("button", { name: new RegExp(`^${dayLabel(yesterday)}`) })).toBeDisabled();
    }
  });

  test("tạm ngưng và bật lại (set_org_paused)", async ({ page }) => {
    const { owner, org } = await setupStore();
    await loginAs(page, owner, "/store/settings?tab=pause");
    await expect(page.getByText("Cửa hàng đang hoạt động bình thường.")).toBeVisible();
    await page.getByLabel("Lý do tạm ngưng").fill("Sửa chữa mặt bằng tới hết tháng.");
    await page.getByRole("button", { name: "Tạm ngưng cửa hàng" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Tạm ngưng cửa hàng trên FoodSave?" });
    await expect(dialog.getByRole("button", { name: "Quay lại" })).toBeFocused();
    await dialog.getByRole("button", { name: "Tạm ngưng", exact: true }).click();
    await expect(page.getByText("Lý do: Sửa chữa mặt bằng tới hết tháng.")).toBeVisible();
    const [paused] = await adminSelect<{ is_paused: boolean; paused_reason: string }[]>(
      `organizations?select=is_paused,paused_reason&id=eq.${org.id}`,
    );
    expect(paused).toEqual({ is_paused: true, paused_reason: "Sửa chữa mặt bằng tới hết tháng." });
    await expectNoA11yViolations(page, "/store/settings?tab=pause (đang tạm ngưng)");

    // Banner ở các tab khác
    await page.goto("/store/settings");
    await expect(page.getByText("Cửa hàng đang tạm ngưng")).toBeVisible();
    await page.goto("/store/settings?tab=pause");
    await page.getByRole("button", { name: "Bật lại" }).click();
    await expect(page.getByText("Cửa hàng đang hoạt động bình thường.")).toBeVisible();
    const [resumed] = await adminSelect<{ is_paused: boolean }[]>(
      `organizations?select=is_paused&id=eq.${org.id}`,
    );
    expect(resumed!.is_paused).toBe(false);
  });
});
