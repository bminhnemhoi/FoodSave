import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { literal } from "../charity/helpers";
import { expectNoA11yViolations } from "../fixtures/a11y";
import { rpcAs } from "../fixtures/orgs";
import { loginAs } from "../fixtures/users";
import { addVolunteer, assignViaApi, confirmedLot, setupCharity, shot, stopsOf } from "./helpers";

/**
 * Bản đồ điều phối trực tiếp (ROADMAP P3-11, PRD US-CHA-18): TNV check-in tại cửa hàng (RPC thật dưới JWT của
 * TNV) ⇒ trang chuyến của điều phối viên đổi trạng thái điểm dừng qua Realtime, KHÔNG tải lại trang. Vị trí TNV
 * chỉ hiện sau khi TNV đồng ý chia sẻ và gửi vị trí; trước đó hiện đúng "chưa chia sẻ vị trí".
 */

const STORE_AT = { lat: 10.7801, lng: 106.6992 };

test.describe("Điều phối — cập nhật trực tiếp", () => {
  test("check-in của TNV hiện ngay trên trang chuyến; vị trí chỉ khi TNV chia sẻ", async ({
    page,
  }, testInfo) => {
    test.setTimeout(300_000);
    const charity = await setupCharity("owner");
    const suffix = charity.org.name.split(" ").at(-1)!;
    const vol = await addVolunteer(charity, {
      name: `Minh Tâm ${suffix}`,
      base: { lat: 10.78, lng: 106.69 },
    });
    const lot = await confirmedLot(charity, { at: STORE_AT, title: `Bánh mì realtime ${suffix}`, qty: 10 });
    const pickupId = await assignViaApi(charity, [lot.allocationId], vol);
    const vToken = await vol.token();
    await rpcAs(vToken, "respond_pickup", {
      p_pickup_id: pickupId,
      p_accept: true,
      p_reason: null,
      p_client_op_id: randomUUID(),
    });
    await rpcAs(vToken, "start_pickup", { p_pickup_id: pickupId, p_client_op_id: randomUUID() });

    await loginAs(page, charity.user, `/charity/pickups/${pickupId}`);
    await page.goto(`/charity/pickups/${pickupId}`);
    await expect(page.getByRole("heading", { level: 1, name: "Chuyến tình nguyện viên" })).toBeVisible();
    const stops = page.getByRole("region", { name: "Điểm dừng theo thứ tự" });
    const storeStop = stops.getByRole("article", { name: literal(lot.store.org.name) });
    await expect(storeStop.getByTestId("stop-status")).toHaveText("Chưa tới");
    await expect(page.getByTestId("position-unshared")).toContainText("Tình nguyện viên chưa chia sẻ vị trí");
    await expect(page.getByText("Cập nhật trực tiếp")).toBeVisible({ timeout: 30_000 });
    await expectNoA11yViolations(page, "bản đồ điều phối");
    await shot(page, testInfo, "dispatch-before");

    // Đánh dấu cửa sổ: nếu trang tải lại, dấu này mất
    await page.evaluate(() => {
      (window as unknown as { __noReload: boolean }).__noReload = true;
    });

    const [store] = (await stopsOf(pickupId)).filter((s) => s.kind === "pickup");
    const res = await rpcAs<{ arrived: boolean; check: string }>(vToken, "check_in_stop", {
      p_stop_id: store!.id,
      p_lat: STORE_AT.lat,
      p_lng: STORE_AT.lng,
      p_client_op_id: randomUUID(),
    });
    expect(res).toMatchObject({ arrived: true, check: "geofence" });

    await expect(storeStop.getByTestId("stop-status")).toHaveText(/Đã đến/, { timeout: 15_000 });
    await expect(storeStop).toHaveAttribute("data-stop-status", "arrived");
    expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true);

    // TNV đồng ý chia sẻ vị trí rồi gửi điểm mới nhất ⇒ điều phối viên thấy vị trí gần đúng (≤ 20 giây)
    await rpcAs(vToken, "grant_consent", {
      p_purpose: "location_trip",
      p_policy_version: "2026-10-v1",
      p_text_hash: "a".repeat(64),
      p_source: "web",
    });
    await rpcAs(vToken, "update_pickup_progress", {
      p_pickup_id: pickupId,
      p_lat: 10.7791,
      p_lng: 106.6985,
      p_accuracy_m: 15,
    });
    await expect(page.getByText(/Vị trí gần đúng của Minh Tâm/)).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId("position-unshared")).toHaveCount(0);
    await expect(page.getByRole("img", { name: /Vị trí gần đúng của Minh Tâm/ })).toBeVisible();
    await shot(page, testInfo, "dispatch-live");

    // Liên hệ trong chuyến: chỉ số đã che (get_pickup_contacts)
    const contacts = page.getByRole("region", { name: "Liên hệ trong chuyến" });
    await expect(contacts).toContainText(`Minh Tâm ${suffix}`);
  });
});
