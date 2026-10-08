import { randomUUID } from "node:crypto";

import { expect as baseExpect, test, type Page } from "@playwright/test";

import { expectNoA11yViolations } from "../fixtures/a11y";
import { accessTokenOf, adminPatch, createSite, rpcAs, vnDatePlus } from "../fixtures/orgs";
import { createConfirmedUser, createOrgFor, loginAs, uniqueSuffix, type TestUser } from "../fixtures/users";
import { adminSelect, EXIF_MARKER, makePng } from "../onboarding/helpers";

/**
 * P2-04, P2-06, P2-10 (phía cửa hàng) — US-STO-07, -09, -10, -11, -13, -16:
 * chủ cửa hàng lưu nháp → đăng lô (cam kết an toàn) → thấy lô với nhãn trong "Lô tặng";
 * tổ chức gửi yêu cầu (RPC thật `request_offer`) → cửa hàng xác nhận / từ chối có lý do; điểm nhận ẩn vị trí
 * không lộ địa chỉ; "Đã đóng gói" + hoàn tác. Kiểm axe ở mỗi màn.
 */

// Server Action + render lại trang có thể chậm khi máy chạy nhiều E2E song song (dev server, DB dùng chung)
const expect = baseExpect.configure({ timeout: 30_000 });

async function setupStore(prefix: string) {
  const owner = await createConfirmedUser({ prefix, fullName: "Nguyễn Thị Thu Lan" });
  const org = await createOrgFor(owner, {
    kind: "store",
    status: "approved",
    name: `Tiệm bánh Hạt Lúa ${uniqueSuffix()}`,
  });
  const site = await createSite(org.id, { name: "Chi nhánh Bến Thành" });
  return { owner, org, site };
}

async function setupCharity(prefix: string, name: string, visibility: "public" | "approximate" | "hidden") {
  const user = await createConfirmedUser({ prefix, fullName: "Trần Văn Bếp" });
  const org = await createOrgFor(user, {
    kind: "charity",
    status: "approved",
    name: `${name} ${uniqueSuffix()}`,
  });
  const site = await createSite(org.id, {
    name: "Điểm nhận chính",
    lat: 10.776,
    lng: 106.7,
    address: "99 Nguyễn Huệ",
  });
  if (visibility !== "public") await adminPatch(`sites?id=eq.${site.id}`, { visibility });
  return { user, org, site, token: await accessTokenOf(user) };
}

/** Lô đang mở tạo bằng RPC thật dưới quyền chủ cửa hàng (bánh mì, khung lấy 3 giờ từ bây giờ). */
async function publishOfferViaApi(owner: TestUser, siteId: string, title: string) {
  const token = await accessTokenOf(owner);
  const start = new Date(Date.now() - 5 * 60_000);
  const end = new Date(Date.now() + 3 * 60 * 60_000);
  const offerId = await rpcAs<string>(token, "create_offer", {
    p_payload: {
      site_id: siteId,
      category_code: "bread",
      title,
      quantity: 30,
      expiry: { date: vnDatePlus(1) },
      pickup_start: start.toISOString(),
      pickup_end: end.toISOString(),
    },
    p_client_op_id: randomUUID(),
  });
  await rpcAs(token, "publish_offer", {
    p_offer_id: offerId,
    p_safety_attested: true,
    p_client_op_id: randomUUID(),
  });
  return offerId;
}

async function requestOffer(token: string, offerId: string, siteId: string, qty: number): Promise<string> {
  const res = await rpcAs<{ allocation_id: string; status: string }>(token, "request_offer", {
    p_offer_id: offerId,
    p_qty: qty,
    p_charity_site_id: siteId,
    p_client_op_id: randomUUID(),
  });
  expect(res.status).toBe("requested");
  return res.allocation_id;
}

function requestCard(page: Page, charityName: string) {
  return page.getByRole("article").filter({ has: page.getByRole("heading", { name: charityName }) });
}

test.describe("Lô tặng của cửa hàng (P2-04, P2-06)", () => {
  test.setTimeout(180_000);

  test("lưu nháp, đăng lô với cam kết an toàn, thấy lô và nhãn trong kho", async ({ page }) => {
    const { owner, org } = await setupStore("store-offer");
    await loginAs(page, owner, "/store/inventory");

    await expect(page.getByRole("heading", { level: 1, name: "Lô tặng" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Chưa có lô nào đang mở" })).toBeVisible();
    await expectNoA11yViolations(page, "/store/inventory (rỗng)");

    await page.getByRole("link", { name: "Đăng lô mới" }).first().click();
    await expect(page).toHaveURL(/\/store\/inventory\/new$/);
    await expect(page.getByRole("heading", { level: 1, name: "Đăng lô mới" })).toBeVisible();

    // US-STO-07 AC1: chọn danh mục ⇒ đơn vị + khối lượng mặc định "ước tính theo danh mục"
    await page.locator("label", { hasText: "Bánh mì & bakery" }).click();
    await expect(page.getByLabel("Đơn vị")).toHaveValue("loaf");
    await expect(page.getByLabel(/Khối lượng mỗi ổ/)).toHaveValue("0,12");
    await expect(page.getByText("Ước tính theo danh mục")).toBeVisible();

    await page.getByLabel("Tên lô").fill("Bánh mì thịt nướng");
    // US-STO-07 AC2: số lẻ với đơn vị đếm
    await page.getByRole("textbox", { name: "Số lượng", exact: true }).fill("12,5");
    await page.getByRole("textbox", { name: "Số lượng", exact: true }).blur();
    await expect(page.getByText("Số lượng phải là số nguyên với đơn vị ổ.")).toBeVisible();
    await page.getByRole("textbox", { name: "Số lượng", exact: true }).fill("20");
    await page.getByRole("button", { name: "Ngày mai" }).click();

    // Xem trước: nhãn + hạn hiệu lực (khung lấy mặc định 2 giờ ⇒ bánh mì Đỏ)
    const preview = page.getByRole("complementary", { name: "Xem trước lô" });
    await expect(preview.getByText("Hạn hiệu lực", { exact: true })).toBeVisible();
    await expect(preview.getByText(/Nhãn (Xanh|Vàng|Đỏ)/)).toBeVisible();
    // US-STO-07 AC4: chưa tick cam kết ⇒ nút Đăng bị vô hiệu và có giải thích
    await expect(page.getByRole("button", { name: "Đăng lô" })).toBeDisabled();
    await expect(page.getByText("Tick ô cam kết an toàn thực phẩm để bật nút “Đăng lô”.")).toBeVisible();
    await expectNoA11yViolations(page, "/store/inventory/new");

    await page.getByRole("button", { name: "Lưu nháp" }).click();
    await expect(page).toHaveURL(/\/store\/inventory\/[0-9a-f-]{36}$/, { timeout: 20_000 });
    const offerId = page.url().split("/").pop()!;
    await expect(page.getByRole("heading", { level: 1, name: "Bánh mì thịt nướng" })).toBeVisible();
    await expect(page.getByText("Bản nháp chưa hiển thị với tổ chức nào.", { exact: false })).toBeVisible();
    await expectNoA11yViolations(page, "/store/inventory/[id] (nháp)");

    const [draft] = await adminSelect<
      {
        status: string;
        quantity: number;
        weight_source: string;
        expiry_is_date_only: boolean;
        org_id: string;
      }[]
    >(`offers?select=status,quantity,weight_source,expiry_is_date_only,org_id&id=eq.${offerId}`);
    expect(draft).toMatchObject({
      status: "draft",
      quantity: 20,
      weight_source: "category_default",
      expiry_is_date_only: true,
      org_id: org.id,
    });

    // Đăng nháp: hộp thoại có cam kết an toàn (US-STO-11 AC1)
    await page.getByRole("button", { name: "Đăng lô" }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: "Đăng lô" })).toBeDisabled();
    await dialog
      .getByText("Tôi cam kết thực phẩm còn an toàn để sử dụng và được bảo quản đúng cách.")
      .click();
    await dialog.getByRole("button", { name: "Đăng lô" }).click();
    await expect(page.getByText(/Đã đăng lô “Bánh mì thịt nướng”/)).toBeVisible();
    await expect(page.getByText("Đang mở").first()).toBeVisible();

    const [published] = await adminSelect<
      { status: string; safety_attested_at: string | null; effective_deadline: string }[]
    >(`offers?select=status,safety_attested_at,effective_deadline&id=eq.${offerId}`);
    expect(published!.status).toBe("open");
    expect(published!.safety_attested_at).not.toBeNull();

    await page.goto("/store/inventory");
    const card = page.getByRole("article").filter({ hasText: "Bánh mì thịt nướng" });
    await expect(card).toBeVisible();
    await expect(card.getByText(/Nhãn (Xanh|Vàng|Đỏ)/)).toBeVisible();
    await expect(card.getByText("Còn lại")).toBeVisible();
    await expect(page.getByRole("link", { name: /Đang mở/ })).toHaveAttribute("aria-current", "page");
    await expectNoA11yViolations(page, "/store/inventory (có lô)");

    // Sửa lô đã đăng (chưa có phân bổ): đổi tên
    await page.goto(`/store/inventory/${offerId}/edit`);
    await expect(page.getByRole("heading", { level: 1, name: "Sửa lô" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Số lượng", exact: true })).toBeDisabled();
    await expectNoA11yViolations(page, "/store/inventory/[id]/edit");
    await page.getByLabel("Tên lô").fill("Bánh mì thịt nướng (ổ lớn)");
    await page.getByRole("button", { name: "Lưu thay đổi" }).click();
    await expect(page).toHaveURL(new RegExp(`/store/inventory/${offerId}$`), { timeout: 20_000 });
    await expect(page.getByRole("heading", { level: 1, name: "Bánh mì thịt nướng (ổ lớn)" })).toBeVisible();
  });

  test("đăng thẳng từ form: khung lấy sau hạn dùng bị chặn, sửa giờ rồi đăng", async ({ page }) => {
    const { owner, org } = await setupStore("store-publish");
    const tomorrow = vnDatePlus(1);
    await loginAs(page, owner, "/store/inventory/new");

    await page.locator("label", { hasText: "Sữa & sản phẩm sữa" }).click();
    await expect(page.getByLabel("Đơn vị")).toHaveValue("bottle");
    await page.getByLabel("Tên lô").fill("Sữa tươi tiệt trùng 1 lít");
    await page.getByRole("textbox", { name: "Số lượng", exact: true }).fill("12");
    await page.getByLabel("Hạn sử dụng (ngày)").fill(tomorrow);
    await page.getByLabel("Giờ hết hạn").fill("0900");
    await page.locator("#offer-start-date").fill(tomorrow);
    await page.locator("#offer-start-time").fill("0800");
    await page.locator("#offer-end-date").fill(tomorrow);
    await page.locator("#offer-end-time").fill("1000");
    await page.locator("#offer-end-time").blur();
    await page.getByRole("checkbox", { name: /Tôi cam kết thực phẩm còn an toàn/ }).click();
    await page.getByRole("button", { name: "Đăng lô" }).click();
    // US-STO-07 AC5: khung lấy kết thúc sau hạn dùng ⇒ báo lỗi tại trường, không gửi
    await expect(
      page.getByText("Khung giờ lấy phải kết thúc trước hạn sử dụng (09:00 ngày mai)."),
    ).toBeVisible();
    expect(await adminSelect<{ id: string }[]>(`offers?select=id&org_id=eq.${org.id}`)).toEqual([]);

    await page.getByLabel("Giờ hết hạn").fill("2000");
    await page.getByLabel("Giờ hết hạn").blur();
    await page.getByRole("button", { name: "Đăng lô" }).click();
    await expect(page).toHaveURL(/\/store\/inventory$/);
    await expect(
      page.getByText("Đã đăng lô. Các tổ chức phù hợp quanh cửa hàng sẽ thấy lô ngay."),
    ).toBeVisible();
    const card = page.getByRole("article").filter({ hasText: "Sữa tươi tiệt trùng 1 lít" });
    await expect(card.getByText(/Nhãn (Xanh|Vàng|Đỏ)/)).toBeVisible();
    await expect(card.getByText("10:00 ngày mai")).toBeVisible();

    const [o] = await adminSelect<{ status: string; expiry_is_date_only: boolean; weight_source: string }[]>(
      `offers?select=status,expiry_is_date_only,weight_source&org_id=eq.${org.id}`,
    );
    expect(o).toEqual({ status: "open", expiry_is_date_only: false, weight_source: "category_default" });
  });
});

test.describe("AI chụp ảnh để điền nhanh (P2-05)", () => {
  test.setTimeout(180_000);

  // Chỉ chạy khi máy chủ test bật AI (FEATURE_AI=true, AI_PROVIDER=fake ⇒ kết quả xác định, không gọi mạng)
  test("điền gợi ý, đánh dấu “AI gợi ý — kiểm tra lại”, không tự đăng; ảnh tải lên đã xóa EXIF", async ({
    page,
  }) => {
    const { owner, org } = await setupStore("store-ai");
    await loginAs(page, owner, "/store/inventory/new");
    await expect(page.getByRole("heading", { level: 1, name: "Đăng lô mới" })).toBeVisible();
    const aiButton = page.getByRole("button", { name: "Chụp ảnh để điền nhanh" });
    test.skip((await aiButton.count()) === 0, "Máy chủ test chưa bật AI (FEATURE_AI)");

    const chooser = page.waitForEvent("filechooser");
    await aiButton.click();
    await (
      await chooser
    ).setFiles({ name: "khay-banh.png", mimeType: "image/png", buffer: makePng(320, 240) });
    await expect(page.getByText(/AI đã (điền gợi ý|gợi ý nhưng chưa chắc chắn)/)).toBeVisible();
    await expect(page.getByText("AI gợi ý — kiểm tra lại").first()).toBeVisible();
    await expect(page.getByLabel("Tên lô")).not.toHaveValue("");
    await expect(page.getByRole("radio", { name: "Bánh mì & bakery" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    // AI không bao giờ tự lưu/đăng
    await expect(page).toHaveURL(/\/store\/inventory\/new$/);
    expect(await adminSelect<{ id: string }[]>(`offers?select=id&org_id=eq.${org.id}`)).toEqual([]);

    await page.getByLabel("Tên lô").fill("Bánh mì thịt nướng");
    await page.getByRole("button", { name: "Hôm nay" }).click();
    await page.getByRole("button", { name: "Lưu nháp" }).click();
    await expect(page).toHaveURL(/\/store\/inventory\/[0-9a-f-]{36}$/);
    const [saved] = await adminSelect<{ ai_assisted: boolean; photo_paths: string[] }[]>(
      `offers?select=ai_assisted,photo_paths&org_id=eq.${org.id}`,
    );
    expect(saved!.ai_assisted).toBe(true);
    expect(saved!.photo_paths[0]).toMatch(new RegExp(`^org/${org.id}/offer/[0-9a-f-]{36}\.(webp|jpg)$`));
    const res = await fetch(`http://127.0.0.1:54321/storage/v1/object/public/media/${saved!.photo_paths[0]}`);
    expect(res.ok).toBe(true);
    expect(Buffer.from(await res.arrayBuffer()).includes(Buffer.from(EXIF_MARKER))).toBe(false);
  });
});

test.describe("Yêu cầu nhận lô phía cửa hàng (P2-10)", () => {
  test.setTimeout(180_000);

  test("tổ chức yêu cầu → cửa hàng xác nhận, đóng gói; yêu cầu khác bị từ chối kèm lý do", async ({
    page,
  }) => {
    const { owner, site } = await setupStore("store-req");
    const offerId = await publishOfferViaApi(owner, site.id, "Bánh mì que bơ tỏi");
    const nangMai = await setupCharity("store-req-c1", "Bếp ăn Nắng Mai", "approximate");
    const anNhien = await setupCharity("store-req-c2", "Mái ấm An Nhiên", "hidden");
    const allocA = await requestOffer(nangMai.token, offerId, nangMai.site.id, 5);
    const allocB = await requestOffer(anNhien.token, offerId, anNhien.site.id, 3);

    await loginAs(page, owner, "/store");
    await expect(page.getByRole("heading", { level: 1, name: "Tổng quan" })).toBeVisible();
    const pending = page.locator("#cho-xac-nhan");
    await expect(pending.getByRole("heading", { name: /Chờ xác nhận/ })).toBeVisible();
    const cardA = requestCard(page, nangMai.org.name);
    const cardB = requestCard(page, anNhien.org.name);
    await expect(cardA.getByText("5 ổ")).toBeVisible();
    await expect(cardB.getByText("3 ổ")).toBeVisible();
    // Riêng tư: điểm nhận approximate/hidden chỉ hiện phường, không lộ địa chỉ
    await expect(cardA.getByText(/vị trí gần đúng/)).toBeVisible();
    await expect(cardB.getByText(/vị trí được ẩn/)).toBeVisible();
    await expect(page.getByText("99 Nguyễn Huệ")).toHaveCount(0);
    await expectNoA11yViolations(page, "/store (yêu cầu chờ)");

    // Xác nhận (US-STO-13 AC2)
    await cardA.getByRole("button", { name: "Xác nhận" }).click();
    await expect(page.getByText(new RegExp(`Đã xác nhận 5 ổ cho ${nangMai.org.name}`))).toBeVisible();
    await expect(cardA.getByText("Đã xác nhận").first()).toBeVisible();
    const [a] = await adminSelect<{ status: string }[]>(`allocations?select=status&id=eq.${allocA}`);
    expect(a!.status).toBe("confirmed");

    // Đã đóng gói + hoàn tác trong 2 phút (US-STO-16)
    await cardA.getByRole("button", { name: "Đánh dấu đã đóng gói" }).click();
    await expect(cardA.getByText(/Đã đóng gói lúc/)).toBeVisible();
    const [packed] = await adminSelect<{ packed_at: string | null }[]>(
      `allocations?select=packed_at&id=eq.${allocA}`,
    );
    expect(packed!.packed_at).not.toBeNull();
    await cardA.getByRole("button", { name: "Hoàn tác" }).click();
    await expect(cardA.getByRole("button", { name: "Đánh dấu đã đóng gói" })).toBeVisible();

    // Từ chối có lý do (US-STO-13 AC3)
    await cardB.getByRole("button", { name: "Từ chối" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(
      dialog.getByRole("heading", { name: new RegExp(`Từ chối yêu cầu của ${anNhien.org.name}`) }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Từ chối yêu cầu" }).click();
    await expect(dialog.getByText("Vui lòng chọn hoặc nhập lý do từ chối.")).toBeVisible();
    await expectNoA11yViolations(page, "/store (hộp thoại từ chối)");
    await dialog.getByText("Hàng không còn đủ số lượng").click();
    await dialog.getByRole("button", { name: "Từ chối yêu cầu" }).click();
    await expect(page.getByText(new RegExp(`Đã từ chối yêu cầu của ${anNhien.org.name}`))).toBeVisible();
    const [b] = await adminSelect<{ status: string; cancel_reason: string; qty_released: number }[]>(
      `allocations?select=status,cancel_reason,qty_released&id=eq.${allocB}`,
    );
    expect(b).toMatchObject({
      status: "rejected",
      cancel_reason: "Hàng không còn đủ số lượng",
      qty_released: 3,
    });

    // Chi tiết lô: phân bổ theo nhóm, số lượng còn lại đúng (30 − 5)
    await page.goto(`/store/inventory/${offerId}`);
    await expect(page.getByRole("heading", { level: 1, name: "Bánh mì que bơ tỏi" })).toBeVisible();
    const requests = page.locator("#yeu-cau");
    await expect(requests.getByRole("heading", { name: /Đang chuẩn bị bàn giao/ })).toBeVisible();
    await expect(requests.getByRole("heading", { name: /Đã kết thúc/ })).toBeVisible();
    await expect(requests.getByText("Hàng không còn đủ số lượng")).toBeVisible();
    await expect(page.getByText("25 ổ").first()).toBeVisible();
    await expectNoA11yViolations(page, "/store/inventory/[id] (phân bổ)");
  });

  test("hủy lô giải thích hệ quả và yêu cầu lý do", async ({ page }) => {
    const { owner, site } = await setupStore("store-cancel");
    const offerId = await publishOfferViaApi(owner, site.id, "Cơm hộp gà xối mỡ");
    const charity = await setupCharity("store-cancel-c", "Bếp ăn Hướng Dương", "public");
    await requestOffer(charity.token, offerId, charity.site.id, 4);

    await loginAs(page, owner, `/store/inventory/${offerId}`);
    await page.getByRole("button", { name: "Thao tác khác với lô Cơm hộp gà xối mỡ" }).click();
    await page.getByRole("menuitem", { name: "Hủy lô" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog.getByText(/1 yêu cầu đang chờ sẽ bị từ chối/)).toBeVisible();
    await dialog.getByRole("button", { name: "Hủy lô" }).click();
    await expect(dialog.getByText("Vui lòng chọn hoặc nhập lý do hủy lô.")).toBeVisible();
    await dialog.getByText("Lý do khác").click();
    await dialog.getByLabel("Nhập lý do").fill("Tủ mát hỏng, không bảo quản được");
    await dialog.getByRole("button", { name: "Hủy lô" }).click();
    await expect(page.getByText("Đã hủy lô “Cơm hộp gà xối mỡ”.")).toBeVisible();

    const [offer] = await adminSelect<{ status: string; cancel_reason: string }[]>(
      `offers?select=status,cancel_reason&id=eq.${offerId}`,
    );
    expect(offer).toMatchObject({ status: "cancelled", cancel_reason: "Tủ mát hỏng, không bảo quản được" });
    const allocs = await adminSelect<{ status: string }[]>(
      `allocations?select=status&offer_id=eq.${offerId}`,
    );
    expect(allocs.map((x) => x.status)).toEqual(["rejected"]);
  });
});
