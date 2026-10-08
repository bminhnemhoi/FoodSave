import { expect, test } from "@playwright/test";

import { expectNoA11yViolations } from "../fixtures/a11y";
import { uniqueEmail, waitForEmailLink, waitForInviteLink } from "../fixtures/mailpit";
import { adminPatch, createSite, inviteViaApi, seedSensitive } from "../fixtures/orgs";
import { createConfirmedUser, createOrgFor, E2E_PASSWORD, loginAs, uniqueSuffix } from "../fixtures/users";
import { adminSelect } from "../onboarding/helpers";

/**
 * F-09, F-32, US-STO-06, US-CHA-14, US-VOL-01: chủ cửa hàng mời qua email → thư trong Mailpit → người được
 * mời tạo tài khoản → nhận lời mời → vào cổng với đúng vai trò; nhân viên không mở được Cài đặt; chủ đổi
 * quyền và gỡ thành viên. Các ca lỗi của trang /invite/[token].
 */
test.describe("Mời thành viên (F-09)", () => {
  test.setTimeout(180_000);

  test("mời nhân viên → email → đăng ký → nhận lời mời → đổi quyền → gỡ", async ({ page, browser }) => {
    const owner = await createConfirmedUser({ prefix: "invite-owner", fullName: "Nguyễn Thị Thu Lan" });
    const org = await createOrgFor(owner, {
      kind: "store",
      status: "approved",
      name: `Tiệm bánh Hạt Lúa ${uniqueSuffix()}`,
    });
    await seedSensitive(org.id, { legal_name: "Hộ kinh doanh Hạt Lúa", contact_phone: "0901234567" });
    await createSite(org.id, { name: "Chi nhánh Bến Thành" });
    await createSite(org.id, { name: "Chi nhánh Gia Định", lat: 10.8, lng: 106.69, primary: false });

    // Chủ cửa hàng gửi lời mời (nhân viên, chỉ chi nhánh Gia Định)
    await loginAs(page, owner, "/store/settings?tab=members");
    await expect(page.getByRole("heading", { name: "Mời nhân viên" })).toBeVisible();
    await expectNoA11yViolations(page, "/store/settings?tab=members");
    const email = uniqueEmail("e2e.invitee");
    await page.getByLabel("Email người được mời").fill(email);
    await expect(page.getByRole("radio", { name: /Nhân viên/ })).toBeChecked();
    await page.getByRole("radio", { name: "Chỉ một số điểm" }).check();
    await page.getByRole("checkbox", { name: "Chi nhánh Gia Định" }).check();
    await page.getByRole("button", { name: "Gửi lời mời" }).click();
    await expect(page.getByText(`Đã gửi lời mời tới ${email}.`)).toBeVisible();
    const pending = page.getByRole("listitem", { name: email });
    await expect(pending).toBeVisible();
    await expect(pending.getByText("Chi nhánh Gia Định")).toBeVisible();

    // DB chỉ lưu sha256 của token; payload outbox không chứa token
    const [inv] = await adminSelect<{ id: string; role: string; token_hash: string }[]>(
      `org_invitations?select=id,role,token_hash&org_id=eq.${org.id}&email=eq.${encodeURIComponent(email)}`,
    );
    expect(inv!.role).toBe("staff");
    const link = await waitForInviteLink(email);
    const token = link.split("/invite/")[1]!;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(inv!.token_hash).not.toContain(token);
    const outbox = await adminSelect<{ payload: unknown }[]>(
      `notification_outbox?select=payload&aggregate_id=eq.${inv!.id}`,
    );
    expect(outbox).toHaveLength(1);
    expect(JSON.stringify(outbox)).not.toContain(token);

    // Người được mời: chưa có tài khoản ⇒ tạo tài khoản rồi quay lại trang nhận lời mời
    const ctx = await browser.newContext({ locale: "vi-VN", timezoneId: "Asia/Ho_Chi_Minh" });
    const invitee = await ctx.newPage();
    await invitee.goto(link);
    await expect(invitee.getByRole("heading", { level: 1 })).toHaveText("Bạn được mời tham gia FoodSave");
    await expectNoA11yViolations(invitee, "/invite/[token] (chưa đăng nhập)");
    await invitee.getByRole("link", { name: "Tạo tài khoản mới" }).click();
    await expect(invitee).toHaveURL(/\/register\?next=%2Finvite%2F/);
    await invitee.getByLabel("Họ và tên").fill("Trần Minh Ca Tối");
    await invitee.getByLabel("Email").fill(email);
    await invitee.getByLabel("Mật khẩu", { exact: true }).fill(E2E_PASSWORD);
    await invitee.getByLabel("Nhập lại mật khẩu").fill(E2E_PASSWORD);
    await invitee.getByRole("checkbox").check();
    await invitee.getByRole("button", { name: "Tạo tài khoản" }).click();
    await expect(invitee.getByRole("status")).toContainText("Đã gửi thư xác nhận");

    await invitee.goto(await waitForEmailLink(email));
    await expect(invitee).toHaveURL(new RegExp(`/invite/${token}$`));
    await expect(invitee.getByRole("heading", { level: 1 })).toHaveText("Nhận lời mời");
    await expect(invitee.getByText(email)).toBeVisible();
    await expectNoA11yViolations(invitee, "/invite/[token] (đã đăng nhập)");
    await invitee.getByRole("button", { name: "Nhận lời mời" }).click();
    await expect(invitee).toHaveURL(/\/store$/, { timeout: 20_000 });
    await expect(invitee.getByRole("heading", { level: 1 })).toHaveText("Tổng quan");

    // Nhân viên không mở được Cài đặt (US-STO-06 AC2)
    await invitee.goto("/store/settings?tab=members");
    await expect(invitee.getByRole("heading", { name: "Bạn chưa có quyền mở Cài đặt" })).toBeVisible();

    // Chủ cửa hàng thấy thành viên mới với đúng vai trò và phạm vi; lời mời không còn chờ
    await page.reload();
    const row = page.getByRole("listitem", { name: "Trần Minh Ca Tối" });
    await expect(row.getByText("Nhân viên")).toBeVisible();
    await expect(row.getByText("Chi nhánh Gia Định")).toBeVisible();
    await expect(page.getByText("Không có lời mời nào đang chờ.")).toBeVisible();
    const [member] = await adminSelect<{ role: string; site_ids: string[] }[]>(
      `org_members?select=role,site_ids&org_id=eq.${org.id}&role=eq.staff`,
    );
    expect(member!.role).toBe("staff");
    expect(member!.site_ids).toHaveLength(1);

    // Đổi quyền thành Quản lý (mọi điểm) ⇒ người đó mở được Cài đặt
    await row.getByRole("button", { name: /Sửa quyền/ }).click();
    const dialog = page.getByRole("dialog", { name: "Sửa quyền của Trần Minh Ca Tối" });
    await dialog.getByRole("radio", { name: /Quản lý/ }).check();
    await dialog.getByRole("radio", { name: "Mọi điểm" }).check();
    await dialog.getByRole("button", { name: "Lưu thay đổi" }).click();
    await expect(page.getByText("Đã cập nhật quyền của Trần Minh Ca Tối.")).toBeVisible();
    await expect(row.getByText("Quản lý")).toBeVisible();
    await invitee.goto("/store/settings");
    await expect(invitee.getByRole("heading", { level: 1 })).toHaveText("Cài đặt");
    await expect(invitee.getByRole("navigation", { name: "Các mục cài đặt" })).toBeVisible();

    // Gỡ thành viên (xác nhận) ⇒ phiên sau không còn vào cổng
    await row.getByRole("button", { name: /^Gỡ/ }).click();
    const confirm = page.getByRole("alertdialog");
    await expect(confirm.getByRole("button", { name: "Quay lại" })).toBeFocused();
    await confirm.getByRole("button", { name: "Gỡ thành viên" }).click();
    await expect(page.getByText(/^Đã gỡ Trần Minh Ca Tối/)).toBeVisible();
    await expect(page.getByRole("listitem", { name: "Trần Minh Ca Tối" })).toHaveCount(0);
    await invitee.goto("/store");
    await expect(invitee).toHaveURL(/\/onboarding$/);
    await ctx.close();
  });

  test("người đã có tài khoản: đăng nhập rồi nhận lời mời tình nguyện viên → /volunteer", async ({
    page,
  }) => {
    const owner = await createConfirmedUser({ prefix: "vol-owner" });
    const org = await createOrgFor(owner, { kind: "charity", status: "approved" });
    const volunteer = await createConfirmedUser({ prefix: "vol-invitee", fullName: "Lê Minh Khoa" });
    const { token } = await inviteViaApi(owner, org.id, volunteer.email, "volunteer");

    await page.goto(`/invite/${token}`);
    await page.getByRole("link", { name: "Đăng nhập để nhận lời mời" }).click();
    await expect(page).toHaveURL(/\/login\?next=%2Finvite%2F/);
    const form = page.locator("form").filter({ has: page.getByLabel("Mật khẩu") });
    await form.getByLabel("Email").fill(volunteer.email);
    await form.getByLabel("Mật khẩu").fill(volunteer.password);
    await form.getByRole("button", { name: "Đăng nhập" }).click();
    await expect(page).toHaveURL(new RegExp(`/invite/${token}$`));
    await page.getByRole("button", { name: "Nhận lời mời" }).click();
    await expect(page).toHaveURL(/\/volunteer$/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hôm nay");

    // Bấm lại link đã dùng: cùng người ⇒ vẫn vào được (idempotent), không lỗi
    await page.goto(`/invite/${token}`);
    await page.getByRole("button", { name: "Nhận lời mời" }).click();
    await expect(page).toHaveURL(/\/volunteer$/, { timeout: 20_000 });
  });

  test("lỗi tiếng Việt: link sai, sai email, hết hạn", async ({ page }) => {
    await page.goto("/invite/abc");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Liên kết mời không hợp lệ");

    const owner = await createConfirmedUser({ prefix: "err-owner" });
    const org = await createOrgFor(owner, { kind: "store", status: "approved" });
    const other = await createConfirmedUser({ prefix: "err-other" });

    // Sai email: lời mời gửi tới địa chỉ khác
    const { token } = await inviteViaApi(owner, org.id, uniqueEmail("e2e.someone"));
    await loginAs(page, other, `/invite/${token}`);
    await page.getByRole("button", { name: "Nhận lời mời" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "địa chỉ email khác" })).toBeVisible();
    await expectNoA11yViolations(page, "/invite/[token] (sai email)");
    await page.getByRole("button", { name: "Đăng xuất để đăng nhập bằng email khác" }).click();
    await expect(page).toHaveURL(new RegExp(`/login\\?next=%2Finvite%2F${token}$`));

    // Hết hạn (sau 7 ngày)
    const expiredFor = await createConfirmedUser({ prefix: "err-expired" });
    const expired = await inviteViaApi(owner, org.id, expiredFor.email);
    await adminPatch(`org_invitations?id=eq.${expired.invitationId}`, {
      expires_at: new Date(Date.now() - 60_000).toISOString(),
    });
    await loginAs(page, expiredFor, `/invite/${expired.token}`);
    await page.getByRole("button", { name: "Nhận lời mời" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Lời mời đã hết hạn" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Về trang của bạn" })).toBeVisible();
  });
});
