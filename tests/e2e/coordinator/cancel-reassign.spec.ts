import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { literal } from "../charity/helpers";
import { expectNoA11yViolations } from "../fixtures/a11y";
import { rpcAs } from "../fixtures/orgs";
import { loginAs } from "../fixtures/users";
import { addVolunteer, assignViaApi, confirmedLot, serviceGet, setupCharity, shot } from "./helpers";

/**
 * Ma trận hủy C5 (DATA-MODEL §7; PRD US-CHA-23): hủy chuyến TNV trước khi lấy ⇒ phân bổ về `confirmed`, giữ
 * nguyên số lượng, lô quay lại khung lập chuyến. TNV từ chối ⇒ điều phối viên giao lại cho người khác (lên lại
 * kế hoạch qua `assign_pickup` p_plan.pickup_id — US-CHA-16 AC4).
 */

const STORE_AT = { lat: 10.7801, lng: 106.6992 };

test.describe("Điều phối — hủy chuyến và giao lại", () => {
  test("hủy chuyến (TNV không đến) ⇒ phân bổ trở về đã xác nhận", async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const charity = await setupCharity("owner");
    const suffix = charity.org.name.split(" ").at(-1)!;
    const vol = await addVolunteer(charity, { name: `Quốc Bảo ${suffix}` });
    const lot = await confirmedLot(charity, { at: STORE_AT, title: `Bánh mì hủy chuyến ${suffix}`, qty: 6 });
    const pickupId = await assignViaApi(charity, [lot.allocationId], vol);

    await loginAs(page, charity.user, `/charity/pickups/${pickupId}`);
    await page.goto(`/charity/pickups/${pickupId}`);
    await expect(page.getByText(`Đã giao, chờ Quốc Bảo ${suffix} bấm “Nhận chuyến”.`)).toBeVisible();
    await page.getByRole("button", { name: "Hủy chuyến" }).click();
    const dialog = page.getByRole("dialog", { name: "Hủy chuyến này?" });
    await expect(dialog).toContainText("các lô trở về trạng thái “Đã xác nhận”");
    await dialog.getByLabel("Tình nguyện viên không đến").check();
    await expectNoA11yViolations(page, "hộp thoại hủy chuyến");
    await shot(page, testInfo, "cancel-dialog");
    await dialog.getByRole("button", { name: "Hủy chuyến" }).click();
    await expect(page.getByText(/Đã hủy chuyến/).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Chuyến đã hủy.*lý do: Tình nguyện viên không đến/)).toBeVisible({
      timeout: 30_000,
    });

    type AllocRow = { status: string; pickup_id: string | null; qty_reserved: number; qty_released: number };
    const [alloc] = await serviceGet<AllocRow[]>(
      `allocations?id=eq.${lot.allocationId}&select=status,pickup_id,qty_reserved,qty_released`,
    );
    expect(alloc).toMatchObject({ status: "confirmed", pickup_id: null });
    expect(Number(alloc!.qty_reserved) - Number(alloc!.qty_released)).toBe(6);
    const [trip] = await serviceGet<{ status: string; cancel_reason: string }[]>(
      `pickups?id=eq.${pickupId}&select=status,cancel_reason`,
    );
    expect(trip).toMatchObject({ status: "cancelled", cancel_reason: "Tình nguyện viên không đến" });

    // Lô quay lại khung lập chuyến
    await page.goto("/charity/pickups");
    const planner = page.getByRole("region", { name: `Giao về ${charity.site.name}` });
    await expect(planner.getByRole("checkbox", { name: literal(lot.store.title) })).toBeChecked();
  });

  test("TNV từ chối ⇒ giao lại cho TNV khác từ trang chuyến", async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const charity = await setupCharity("owner");
    const suffix = charity.org.name.split(" ").at(-1)!;
    const first = await addVolunteer(charity, { name: `An Nhiên ${suffix}` });
    const second = await addVolunteer(charity, { name: `Bảo Ngọc ${suffix}` });
    const lot = await confirmedLot(charity, { at: STORE_AT, title: `Bánh mì giao lại ${suffix}`, qty: 5 });
    const pickupId = await assignViaApi(charity, [lot.allocationId], first);
    await rpcAs(await first.token(), "respond_pickup", {
      p_pickup_id: pickupId,
      p_accept: false,
      p_reason: "Bận việc đột xuất",
      p_client_op_id: randomUUID(),
    });

    await loginAs(page, charity.user, `/charity/pickups/${pickupId}`);
    await page.goto(`/charity/pickups/${pickupId}`);
    await expect(page.getByRole("heading", { name: "Chưa có người nhận chuyến" })).toBeVisible();
    const panel = page.getByRole("region", { name: "Giao lại chuyến" });
    await panel.getByRole("radio", { name: literal(`Bảo Ngọc ${suffix}`) }).check();
    await shot(page, testInfo, "reassign");
    await panel.getByRole("button", { name: "Giao cho người này" }).click();
    await expect(page.getByText(`Đã giao, chờ Bảo Ngọc ${suffix} bấm “Nhận chuyến”.`)).toBeVisible({
      timeout: 30_000,
    });

    const [trip] = await serviceGet<{ status: string; assignee_user_id: string }[]>(
      `pickups?id=eq.${pickupId}&select=status,assignee_user_id`,
    );
    expect(trip).toMatchObject({ status: "assigned", assignee_user_id: second.user.id });
    const [alloc] = await serviceGet<{ status: string; pickup_id: string }[]>(
      `allocations?id=eq.${lot.allocationId}&select=status,pickup_id`,
    );
    expect(alloc).toMatchObject({ status: "assigned", pickup_id: pickupId });
  });
});
