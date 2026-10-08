import { expect, test } from "@playwright/test";

import { bestOrder } from "../../../src/core/routing";
import { literal } from "../charity/helpers";
import { expectNoA11yViolations } from "../fixtures/a11y";
import { loginAs } from "../fixtures/users";
import { addVolunteer, confirmedLot, serviceGet, setupCharity, shot, stopsOf } from "./helpers";

/**
 * "2 tình nguyện viên chia tuyến" (PRD US-CHA-16/17; ROADMAP P3-09): điều phối viên chọn 3 lô ở 3 cửa hàng,
 * chọn 2 TNV ⇒ FoodSave chia tuyến (TNV ở phía bắc lấy 2 cửa hàng phía bắc, TNV phía tây nam lấy cửa hàng
 * còn lại), giao chuyến ⇒ đúng 2 chuyến với điểm dừng theo thứ tự tối ưu, điểm cuối là điểm nhận.
 */

// Điểm nhận ở chợ Bến Thành (CHARITY_AT); hai cửa hàng phía bắc, một cửa hàng phía tây nam
const NORTH_A = { lat: 10.7801, lng: 106.6992 };
const NORTH_B = { lat: 10.7838, lng: 106.7046 };
const SOUTH_WEST = { lat: 10.7641, lng: 106.6889 };
// Khu vực gần đúng của TNV (DB làm tròn 0,01°)
const KHOA_BASE = { lat: 10.79, lng: 106.7 };
const VY_BASE = { lat: 10.76, lng: 106.68 };

test.describe("Điều phối — chia tuyến cho 2 tình nguyện viên", () => {
  test("3 cửa hàng, 2 TNV ⇒ 2 chuyến, thứ tự điểm dừng đúng, giao về điểm nhận", async ({
    page,
  }, testInfo) => {
    test.setTimeout(300_000);
    const charity = await setupCharity("owner");
    const suffix = charity.org.name.split(" ").at(-1)!;
    const khoa = await addVolunteer(charity, {
      name: `Khoa ${suffix}`,
      base: KHOA_BASE,
      capacityKg: 30,
      area: "Phường Bến Nghé",
    });
    const vy = await addVolunteer(charity, {
      name: `Vy ${suffix}`,
      base: VY_BASE,
      capacityKg: 30,
      area: "Phường Chợ Quán",
    });
    const [a, b, c] = await Promise.all([
      confirmedLot(charity, { at: NORTH_A, title: `Bánh mì A ${suffix}`, qty: 20 }),
      confirmedLot(charity, { at: NORTH_B, title: `Bánh bao B ${suffix}`, qty: 18 }),
      confirmedLot(charity, { at: SOUTH_WEST, title: `Bánh ngọt C ${suffix}`, qty: 12 }),
    ]);

    await loginAs(page, charity.user, "/charity/pickups");
    await page.goto("/charity/pickups");
    const planner = page.getByRole("region", { name: `Giao về ${charity.site.name}` });
    for (const lot of [a, b, c]) await expect(planner).toContainText(lot.store.title);

    await planner.getByRole("radio", { name: "Tình nguyện viên" }).click();
    await expect(planner.getByRole("radio", { name: "Tình nguyện viên" })).toBeChecked();
    await planner.getByRole("checkbox", { name: literal(`Khoa ${suffix}`) }).check();
    await planner.getByRole("checkbox", { name: literal(`Vy ${suffix}`) }).check();

    const preview = planner.getByRole("region", { name: "Phương án chia 2 tuyến" });
    await expect(preview).toBeVisible();
    const route1 = preview.getByRole("article", { name: literal(`Tuyến 1 · Khoa ${suffix}`) });
    const route2 = preview.getByRole("article", { name: literal(`Tuyến 2 · Vy ${suffix}`) });
    await expect(route1).toContainText(a.store.org.name);
    await expect(route1).toContainText(b.store.org.name);
    await expect(route2).toContainText(c.store.org.name);
    await expect(route2).not.toContainText(a.store.org.name);
    await expect(page.getByRole("region", { name: /Bản đồ phương án: 2 tuyến/ })).toBeVisible();
    await expect(page.getByRole("list", { name: "Chú thích tuyến" })).toContainText(`Tuyến 2 · Vy ${suffix}`);
    await expectNoA11yViolations(page, "lập chuyến 2 TNV");
    await shot(page, testInfo, "split-plan");

    await planner
      .getByRole("button", { name: literal(`Giao 2 chuyến cho Khoa ${suffix} và Vy ${suffix}`) })
      .click();
    await expect(page.getByText(/Đã giao 2 chuyến cho/)).toBeVisible({ timeout: 60_000 });

    // Hai chuyến TNV đúng người, đúng tập cửa hàng, điểm cuối là điểm nhận
    type PickupRow = { id: string; assignee_user_id: string; status: string; mode: string };
    const trips = await serviceGet<PickupRow[]>(
      `pickups?charity_org_id=eq.${charity.org.id}&select=id,assignee_user_id,status,mode`,
    );
    expect(trips).toHaveLength(2);
    expect(trips.every((t) => t.mode === "volunteer" && t.status === "assigned")).toBe(true);
    const khoaTrip = trips.find((t) => t.assignee_user_id === khoa.user.id)!;
    const vyTrip = trips.find((t) => t.assignee_user_id === vy.user.id)!;
    expect(khoaTrip && vyTrip).toBeTruthy();

    const khoaStops = await stopsOf(khoaTrip.id);
    const vyStops = await stopsOf(vyTrip.id);
    expect(khoaStops.at(-1)).toMatchObject({ kind: "dropoff", site_id: charity.site.id, seq: 3 });
    expect(vyStops.map((s) => [s.kind, s.site_id])).toEqual([
      ["pickup", c.store.site.id],
      ["dropoff", charity.site.id],
    ]);

    // Thứ tự của Khoa = thứ tự tối ưu của engine tuyến (xuất phát từ khu vực của Khoa, kết thúc ở điểm nhận)
    const expected = bestOrder({
      stops: [
        { id: a.store.site.id, location: NORTH_A },
        { id: b.store.site.id, location: NORTH_B },
      ],
      dropoff: { id: charity.site.id, location: { lat: 10.7725, lng: 106.698 } },
      start: { id: "base", location: KHOA_BASE },
      departAt: Date.now(),
      objective: "duration",
    }).order;
    expect(khoaStops.filter((s) => s.kind === "pickup").map((s) => s.site_id)).toEqual(expected);

    type AllocRow = { id: string; status: string; pickup_id: string };
    const allocs = await serviceGet<AllocRow[]>(
      `allocations?id=in.(${[a.allocationId, b.allocationId, c.allocationId].join(",")})&select=id,status,pickup_id`,
    );
    expect(allocs.every((x) => x.status === "assigned")).toBe(true);
    expect(allocs.find((x) => x.id === c.allocationId)!.pickup_id).toBe(vyTrip.id);

    // Danh sách chuyến đang chạy: cả hai TNV, chờ nhận chuyến
    const running = page.getByRole("region", { name: "Chuyến đang chạy" });
    await expect(running.getByRole("link", { name: literal(`Khoa ${suffix}`) })).toBeVisible();
    await expect(running.getByRole("link", { name: literal(`Vy ${suffix}`) })).toBeVisible();
    await shot(page, testInfo, "pickups-list");
  });
});
