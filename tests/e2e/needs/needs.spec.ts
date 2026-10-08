import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { expectNoA11yViolations } from "../fixtures/a11y";
import { rpcAs } from "../fixtures/orgs";
import { loginAs } from "../fixtures/users";
import {
  allocationsOf,
  literal,
  publishNeedViaApi,
  retireWorld,
  serviceGet,
  setupWorld,
  type World,
} from "./helpers";

/**
 * P3-05 / P3-07 — "50 bánh từ 3 cửa hàng trên bản đồ" (PRD US-CHA-09…13, US-STO-20/21):
 * tổ chức đăng nhu cầu 50 ổ → 3 phương án (phương án 1 = 20 + 18 + 12) → chọn ⇒ 3 phân bổ `requested`
 * → cửa hàng C từ chối ⇒ thiếu 12 → ghép lại đúng 12 từ cửa hàng thứ tư → hủy nhu cầu (C12).
 * Cửa hàng thấy nhu cầu ở "Nhu cầu gần bạn" mà không lộ toạ độ chính xác của điểm nhận.
 */

const SHOTS = process.env.P3_SHOTS_DIR ?? null;

let world: World | null = null;
test.afterEach(async () => {
  await retireWorld(world);
  world = null;
});

async function shot(page: import("@playwright/test").Page, name: string, fullPage = true) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  // Ảnh chụp: chờ tile bản đồ vẽ xong (không ảnh hưởng kết quả kiểm thử)
  await page.waitForTimeout(3_000);
  await page.screenshot({ path: path.join(SHOTS, name), fullPage });
}

test.describe("Nhu cầu & phương án ghép", () => {
  test("đăng 50 ổ → phương án 1 = 20 + 18 + 12 → chọn → C từ chối → bổ sung 12 từ cửa hàng thứ tư", async ({
    page,
  }, testInfo) => {
    test.setTimeout(300_000);
    world = await setupWorld(testInfo, 0);
    const { charity, stores } = world;
    const mobile = testInfo.project.name === "mobile";

    // ---- Đăng nhu cầu qua form ----
    await loginAs(page, charity.user, "/charity/needs");
    await page.goto("/charity/needs");
    await expect(page.getByRole("heading", { level: 1, name: "Nhu cầu" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Chưa có nhu cầu nào" })).toBeVisible();
    await expectNoA11yViolations(page, "nhu cầu — rỗng");

    await page.getByRole("button", { name: "Đăng nhu cầu đầu tiên" }).click();
    const dialog = page.getByRole("dialog", { name: "Đăng nhu cầu" });
    await expect(dialog).toBeVisible();
    // Gửi form trống ⇒ lỗi tại trường, focus lỗi đầu tiên
    await dialog.getByRole("button", { name: "Đăng nhu cầu" }).click();
    await expect(dialog.getByText("Vui lòng chọn ít nhất một danh mục.").first()).toBeVisible();
    await dialog.getByRole("checkbox", { name: "Bánh mì & bakery" }).click();
    await expect(dialog.getByLabel("Đơn vị")).toHaveValue("loaf");
    await dialog.getByLabel("Số lượng cần").fill("50");
    await dialog.getByLabel("Số người được hỗ trợ").fill("45");
    await expectNoA11yViolations(page, "form đăng nhu cầu");
    await dialog.getByRole("button", { name: "Đăng nhu cầu" }).click();
    await expect(page).toHaveURL(/\/charity\/needs\/[0-9a-f-]{36}$/, { timeout: 45_000 });
    const needId = page.url().split("/").pop()!;

    // ---- 3 phương án trên bản đồ ----
    await expect(page.getByRole("heading", { level: 1, name: "Nhu cầu 50 ổ" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Phương án ghép" })).toBeVisible();
    const plan1 = page.getByRole("article", { name: "Phương án 1", exact: true });
    await expect(plan1).toContainText("Đáp ứng 50/50");
    await expect(plan1).toContainText("3 cửa hàng");
    await expect(plan1).toContainText("Đề xuất");
    for (const [key, qty] of [
      ["A", "20 ổ"],
      ["B", "18 ổ"],
      ["C", "12 ổ"],
    ] as const) {
      const stop = plan1.getByRole("listitem").filter({ hasText: literal(stores[key].org.name) });
      await expect(stop).toContainText(qty);
      await expect(stop).toContainText(stores[key].title);
    }
    await expect(plan1.getByRole("listitem").filter({ hasText: literal(stores.D.org.name) })).toHaveCount(0);
    await expect(plan1).toContainText("1 lô"); // A còn 3 giờ ⇒ Đỏ
    await expect(plan1).toContainText("vị trí gần đúng"); // C
    await expect(page.getByRole("region", { name: /Bản đồ phương án 1/ })).toBeVisible();
    await expect(page.locator(".maplibregl-canvas").first()).toBeVisible({ timeout: 30_000 });
    if (!mobile) {
      await expect(page.getByRole("article", { name: "Phương án 2", exact: true })).toBeVisible();
      await expect(page.getByRole("article", { name: "Phương án 2", exact: true })).toContainText(
        stores.D.org.name,
      );
    } else {
      await page.getByRole("button", { name: /^Phương án 2/ }).click();
      await expect(page.getByRole("article", { name: "Phương án 2", exact: true })).toBeVisible();
      await page.getByRole("button", { name: /^Phương án 1/ }).click();
    }
    await expectNoA11yViolations(page, "phương án ghép");
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await shot(page, `plans-${testInfo.project.name}.png`);

    // ---- Chọn phương án 1 ⇒ 3 phân bổ requested trong một giao dịch ----
    await plan1.getByRole("button", { name: "Chọn phương án này" }).click();
    const chosen = page.getByRole("region", { name: "Phương án đã chọn", exact: true });
    await expect(chosen).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText(/Đã gửi yêu cầu giữ 50 ổ tới 3 cửa hàng/)).toBeVisible();
    const first = await allocationsOf(needId);
    expect(first.map((a) => a.status).sort()).toEqual(["requested", "requested", "requested"]);
    expect(Object.fromEntries(first.map((a) => [a.offer_id, Number(a.qty_reserved)]))).toEqual({
      [stores.A.offerId]: 20,
      [stores.B.offerId]: 18,
      [stores.C.offerId]: 12,
    });
    expect(new Set(first.map((a) => a.bundle_id)).size).toBe(1);
    await expect(chosen).toContainText("0/3 cửa hàng đã xác nhận · 3 đang chờ");
    await expect(page.getByText(/Cập nhật lúc/)).toBeVisible(); // tự làm mới khi còn yêu cầu chờ
    await expectNoA11yViolations(page, "phương án đã chọn");
    await shot(page, `bundle-${testInfo.project.name}.png`);

    // Danh sách nhu cầu: trạng thái bằng chữ + tiến độ ba lớp (US-CHA-13 AC1)
    await page.goto("/charity/needs");
    const listCard = page.getByRole("article", { name: /^50 ổ/ });
    await expect(listCard).toContainText("Đã ghép đủ");
    await expect(listCard).toContainText("Đang giữ");
    await expect(listCard.getByRole("link", { name: "Xem chi tiết" })).toHaveAttribute(
      "href",
      `/charity/needs/${needId}`,
    );
    await expectNoA11yViolations(page, "danh sách nhu cầu");
    await shot(page, `needs-list-${testInfo.project.name}.png`);
    await page.goto(`/charity/needs/${needId}`);

    // ---- A xác nhận, C từ chối ⇒ thiếu 12 ----
    const alloc = await serviceGet<{ id: string; offer_id: string }[]>(
      `allocations?select=id,offer_id&need_id=eq.${needId}`,
    );
    const idOf = (offerId: string) => alloc.find((a) => a.offer_id === offerId)!.id;
    await rpcAs(stores.A.token, "confirm_allocation", {
      p_allocation_id: idOf(stores.A.offerId),
      p_client_op_id: randomUUID(),
    });
    await rpcAs(stores.C.token, "reject_allocation", {
      p_allocation_id: idOf(stores.C.offerId),
      p_reason: "Lò bị hỏng, không đủ bánh",
      p_client_op_id: randomUUID(),
    });
    await page.reload();
    await expect(page.getByRole("heading", { name: "Còn thiếu 12 ổ" })).toBeVisible();
    await expect(chosen).toContainText("Cửa hàng từ chối: “Lò bị hỏng, không đủ bánh”");
    await expect(chosen).toContainText("1/3 cửa hàng đã xác nhận · 1 đang chờ");

    await page.getByRole("button", { name: "Còn thiếu 12 ổ — tìm phương án bổ sung" }).click();
    await expect(page.getByRole("heading", { name: "Phương án bổ sung cho 12 ổ còn thiếu" })).toBeVisible({
      timeout: 30_000,
    });
    const extra = page.getByRole("article", { name: "Phương án 1", exact: true });
    await expect(extra).toContainText("Đáp ứng 12/12");
    await expect(extra).toContainText(stores.D.org.name);
    await expect(extra).not.toContainText(stores.C.org.name); // đã từ chối ⇒ không đề xuất lại
    await expect(extra).not.toContainText(stores.A.org.name); // đang giữ ⇒ không đụng tới
    await expectNoA11yViolations(page, "phương án bổ sung");
    await extra.getByRole("button", { name: "Chọn phương án này" }).click();
    await expect(page.getByRole("article", { name: /Phương án bổ sung · 1 cửa hàng/ })).toBeVisible({
      timeout: 45_000,
    });
    const second = await allocationsOf(needId);
    expect(second).toHaveLength(4);
    const dRow = second.find((a) => a.offer_id === stores.D.offerId)!;
    expect(dRow).toMatchObject({ status: "requested" });
    expect(Number(dRow.qty_reserved)).toBe(12);
    const bundles = await serviceGet<{ id: string; rematch_of: string | null; qty_target: number }[]>(
      `need_bundles?select=id,rematch_of,qty_target&need_id=eq.${needId}&order=created_at`,
    );
    expect(bundles).toHaveLength(2);
    expect(bundles[1]!.rematch_of).toBe(bundles[0]!.id);
    expect(Number(bundles[1]!.qty_target)).toBe(12);
    await expect(page.getByRole("heading", { name: /^Còn thiếu/ })).toHaveCount(0);

    // ---- Hủy nhu cầu (C12): yêu cầu chưa lấy bị hủy, số lượng trả về lô ----
    await page.getByRole("button", { name: "Hủy nhu cầu" }).first().click();
    const confirm = page.getByRole("alertdialog");
    await expect(confirm.getByRole("button", { name: "Quay lại" })).toBeFocused();
    await confirm.getByRole("button", { name: "Hủy nhu cầu" }).click();
    await expect(confirm.getByText("Vui lòng chọn hoặc nhập lý do hủy.")).toBeVisible();
    await confirm.getByLabel("Kế hoạch phát suất ăn thay đổi").check();
    await confirm.getByRole("button", { name: "Hủy nhu cầu" }).click();
    await expect(page.getByText(/Đã hủy nhu cầu 50 ổ/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Nhu cầu đã hủy/)).toBeVisible();
    const after = await allocationsOf(needId);
    expect(Object.fromEntries(after.map((a) => [a.offer_id, a.status]))).toEqual({
      [stores.A.offerId]: "cancelled",
      [stores.B.offerId]: "cancelled",
      [stores.C.offerId]: "rejected",
      [stores.D.offerId]: "cancelled",
    });
    await page.goto("/charity/needs");
    await expect(page.getByRole("region", { name: "Đã đóng trong 30 ngày qua" })).toContainText("Đã hủy");
  });

  test("cửa hàng thấy nhu cầu gần bạn — chỉ vị trí gần đúng, CTA đăng lô phù hợp", async ({
    page,
  }, testInfo) => {
    test.setTimeout(240_000);
    world = await setupWorld(testInfo, 1);
    const { charity, stores } = world;
    const needId = await publishNeedViaApi(charity, { quantity: 50, hours: 5, people: 45 });

    // RPC trả toạ độ lưới ~550 m, km nguyên — không bao giờ ghim thật
    const rows = await rpcAs<
      { need_id: string; site_lat: number; site_lng: number; distance_km: number; site_visibility: string }[]
    >(stores.A.token, "needs_nearby", {});
    const mine = rows.find((r) => r.need_id === needId)!;
    expect(mine.site_visibility).toBe("approximate");
    expect(mine.site_lat).not.toBe(charity.at.lat);
    expect(mine.site_lng).not.toBe(charity.at.lng);
    expect(Math.abs(mine.site_lat - charity.at.lat)).toBeLessThan(0.005);
    expect(Number.isInteger(Number(mine.distance_km))).toBe(true);

    await loginAs(page, stores.A.owner, "/store/connect");
    await page.goto("/store/connect");
    await expect(page.getByRole("heading", { level: 1, name: "Nhu cầu gần bạn" })).toBeVisible();
    const card = page.getByRole("article", { name: literal(charity.org.name) });
    await expect(card).toContainText("Cần 50 ổ");
    await expect(card).toContainText("còn thiếu 50");
    await expect(card).toContainText("Bánh mì & bakery");
    await expect(card).toContainText("cách ~1 km");
    await expect(card).toContainText("vị trí gần đúng");
    await expect(card).toContainText("45 người");
    // US-STO-21 AC1: CTA mở form đăng lô đã điền sẵn danh mục của nhu cầu
    await expect(card.getByRole("link", { name: "Đăng lô phù hợp" })).toHaveAttribute(
      "href",
      "/store/inventory/new?category=bread",
    );
    const html = await page.content();
    expect(html).not.toContain(String(charity.at.lat));
    expect(html).not.toContain(String(charity.at.lng));
    expect(html).not.toContain("8 Đường Số 1"); // địa chỉ điểm nhận
    if (testInfo.project.name === "mobile") {
      await page.getByRole("button", { name: "Bản đồ", exact: true }).click();
    }
    await expect(page.getByRole("region", { name: /Bản đồ nhu cầu gần bạn/ })).toBeVisible();
    await expect(page.getByRole("button", { name: literal(`${charity.org.name}: cần 50 ổ`) })).toBeVisible({
      timeout: 30_000,
    });
    await expectNoA11yViolations(page, "nhu cầu gần bạn");
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await shot(page, `store-connect-${testInfo.project.name}.png`, false);

    // Lọc danh mục khác ⇒ rỗng có giải thích, "Xóa lọc" khôi phục
    if (testInfo.project.name === "mobile") await page.getByRole("button", { name: /^Danh sách/ }).click();
    await page.getByRole("button", { name: "Sữa & sản phẩm sữa" }).click();
    await expect(page).toHaveURL(/cat=dairy/);
    await expect(page.getByRole("heading", { name: "Không có nhu cầu khớp bộ lọc" })).toBeVisible();
    await page.getByRole("button", { name: "Xóa lọc" }).first().click();
    await expect(card).toBeVisible();

    // Ghép đủ ⇒ nút đáp ứng vô hiệu kèm giải thích (US-STO-21 AC3)
    await rpcAs(await charity.token(), "reserve_bundle", {
      p_need_id: needId,
      p_lines: [
        { offer_id: stores.A.offerId, qty: 20 },
        { offer_id: stores.B.offerId, qty: 18 },
        { offer_id: stores.C.offerId, qty: 12 },
      ],
      p_client_op_id: randomUUID(),
      p_meta: {},
    });
    await page.reload();
    await expect(card).toContainText("Đã ghép đủ");
    await expect(card.getByRole("button", { name: "Đăng lô phù hợp" })).toBeDisabled();
    await expect(card).toContainText("Đã có cửa hàng giữ đủ cho nhu cầu này");
  });
});
