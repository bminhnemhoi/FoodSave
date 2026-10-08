import { expect, test } from "@playwright/test";

import { expectNoA11yViolations } from "../fixtures/a11y";
import { addMember } from "../fixtures/orgs";
import { createConfirmedUser, createOrgFor, loginAs } from "../fixtures/users";

import { serviceGet, setPhonePosition, shot, volunteerProfileOf } from "./scenario";

/**
 * P3-08 (phía TNV) — "Hôm nay" khi chưa có chuyến + hồ sơ tình nguyện viên (PRD US-VOL-01 AC2, US-VOL-03 AC3):
 * phương tiện, sức chở, khu vực gần đúng (làm tròn ô 0,01°), SĐT; quyền chia sẻ vị trí đang tắt.
 */
test.describe("PWA tình nguyện viên — hồ sơ (P3-08)", () => {
  test.describe.configure({ timeout: 120_000 });

  test("chưa có chuyến ⇒ trạng thái rỗng; lưu hồ sơ với khu vực làm tròn", async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const coordinator = await createConfirmedUser({ prefix: "vol-prof-coord" });
    const org = await createOrgFor(coordinator, { kind: "charity", status: "approved" });
    const volunteer = await createConfirmedUser({ prefix: "vol-prof", fullName: "Trần Thu Hà" });
    await addMember(org.id, volunteer, "volunteer");
    await setPhonePosition(page, { lat: 10.776912, lng: 106.700981 });

    // --- "Hôm nay" rỗng + gợi ý hoàn thiện hồ sơ
    await loginAs(page, volunteer, "/volunteer");
    await expect(page.getByRole("heading", { name: "Hôm nay bạn chưa có chuyến nào" })).toBeVisible();
    await expect(page.getByText("Chuyến đầu tiên của bạn sẽ hiện ở đây.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Hoàn thiện hồ sơ tình nguyện viên" })).toBeVisible();
    await expectNoA11yViolations(page, "Hôm nay — rỗng");
    await shot(page, testInfo, "today-empty");

    await page.getByRole("link", { name: "Cập nhật hồ sơ" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Tài khoản" })).toBeVisible();
    await expect(page.getByLabel(/Tên hiển thị/)).toHaveValue("Trần Thu Hà");
    await expect(page.locator('[data-consent-state="off"]')).toContainText("đang tắt");
    await expect(page.getByRole("region", { name: "Tổ chức bạn tham gia" })).toContainText(org.name);

    // Lỗi tại trường
    await page.getByLabel(/Sức chở mỗi chuyến/).fill("900");
    await page.getByRole("button", { name: "Lưu hồ sơ" }).click();
    await expect(page.getByText("Sức chở từ 1 đến 500 kg.")).toBeVisible();

    // SĐT là duy nhất toàn hệ thống ⇒ mỗi lần chạy một số khác (gõ có khoảng trắng như người dùng thật)
    const digits = String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
    await page
      .getByLabel(/Số điện thoại/)
      .fill(`09${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5)}`);
    await page.getByRole("radio", { name: "Xe đạp" }).check();
    await page.getByLabel(/Sức chở mỗi chuyến/).fill("12,5");
    await page.getByRole("button", { name: "Dùng vị trí hiện tại" }).click();
    await expect(page.getByText("Đã chọn khu vực (làm tròn khoảng 1 km).")).toBeVisible();
    await page.getByLabel("Tên khu vực").fill("Phường Bến Thành");
    await page.getByLabel("Lịch rảnh").fill("Tối thứ 2–6 sau 18:00");
    await expectNoA11yViolations(page, "hồ sơ TNV");
    await page.getByRole("button", { name: "Lưu hồ sơ" }).click();
    await expect(page.getByText("Đã lưu hồ sơ tình nguyện viên.")).toBeVisible();
    await shot(page, testInfo, "profile");

    const [prof] = await serviceGet<{ phone: string | null }[]>(
      `profiles?select=phone&id=eq.${volunteer.id}`,
    );
    expect(prof!.phone).toBe(`09${digits}`);
    const vp = await volunteerProfileOf(volunteer.id);
    expect(vp).toMatchObject({
      vehicle: "bicycle",
      base_area_label: "Phường Bến Thành",
      availability_note: "Tối thứ 2–6 sau 18:00",
    });
    expect(Number(vp!.capacity_kg)).toBe(12.5);
    // Khu vực chỉ là ô ~1 km (0,01°), không bao giờ là toạ độ chính xác
    expect(vp!.area!.lat).toBeCloseTo(10.78, 6);
    expect(vp!.area!.lng).toBeCloseTo(106.7, 6);

    // Đã có hồ sơ ⇒ "Hôm nay" không còn nhắc
    await page.goto("/volunteer");
    await expect(page.getByRole("heading", { name: "Hôm nay bạn chưa có chuyến nào" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Hoàn thiện hồ sơ tình nguyện viên" })).toHaveCount(0);
  });
});
