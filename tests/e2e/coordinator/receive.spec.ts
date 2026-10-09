import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { literal } from "../charity/helpers";
import { expectNoA11yViolations } from "../fixtures/a11y";
import { callDispatch } from "../fixtures/jobs";
import { rpcAs } from "../fixtures/orgs";
import { loginAs } from "../fixtures/users";
import {
  addVolunteer,
  assignViaApi,
  confirmedLot,
  issueDropoffCode,
  pickUpAll,
  serviceGet,
  setupCharity,
  shot,
} from "./helpers";

/**
 * Nhận hàng tại tổ chức (PRD US-CHA-21): TNV đã lấy hàng ở cửa hàng và mở mã giao về ⇒ điều phối viên nhập mã
 * 6 số, nhận ít hơn 2 ổ vì không đạt chất lượng (bắt buộc mô tả) ⇒ phân bổ `delivered` đúng số, sổ tác động
 * ghi credit cho phần nhận, chuyến hoàn tất.
 */

const STORE_AT = { lat: 10.7801, lng: 106.6992 };

test.describe("Điều phối — nhận hàng (dropoff)", () => {
  test("nhập mã 6 số, từ chối 2 ổ vì chất lượng ⇒ ghi nhận đúng và cộng sổ tác động", async ({
    page,
    baseURL,
  }, testInfo) => {
    test.setTimeout(300_000);
    const charity = await setupCharity("owner");
    const suffix = charity.org.name.split(" ").at(-1)!;
    const vol = await addVolunteer(charity, { name: `Hoàng Nam ${suffix}` });
    const lot = await confirmedLot(charity, { at: STORE_AT, title: `Bánh mì nhận hàng ${suffix}`, qty: 10 });
    const pickupId = await assignViaApi(charity, [lot.allocationId], vol);
    await rpcAs(await vol.token(), "respond_pickup", {
      p_pickup_id: pickupId,
      p_accept: true,
      p_reason: null,
      p_client_op_id: randomUUID(),
    });
    await pickUpAll(pickupId, vol, [{ ...lot, qty: 10 }]);

    await loginAs(page, charity.user, "/charity/receive");
    // Trang chuyến: đã lấy xong ⇒ lối tắt "Nhận hàng"
    await page.goto(`/charity/pickups/${pickupId}`);
    await expect(page.getByRole("link", { name: "Nhận hàng" }).last()).toHaveAttribute(
      "href",
      `/charity/receive?trip=${pickupId}`,
    );
    // Tổng quan: khối "Chờ nhận hàng"
    await page.goto("/charity");
    await expect(page.getByRole("region", { name: /Chờ nhận hàng/ })).toContainText(`Hoàng Nam ${suffix}`);

    const code = await issueDropoffCode(pickupId, vol);
    await page.goto(`/charity/receive?trip=${pickupId}`);
    await expect(page.getByRole("heading", { level: 1, name: "Nhận hàng" })).toBeVisible();
    const card = page.locator(`[data-pending-dropoff="${pickupId}"]`);
    await expect(card).toContainText("Mã đang mở");
    await expect(card).toContainText("Đã lấy 10 ổ");
    await expectNoA11yViolations(page, "nhận hàng");
    await shot(page, testInfo, "receive-board");

    await card.getByRole("button", { name: "Nhập mã 6 số" }).click();
    const dialog = page.getByRole("dialog", { name: "Xác nhận nhận hàng" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Mã 6 số trên điện thoại tình nguyện viên").fill(code);

    // Nhận 8/10: phải chọn lý do "Không đạt chất lượng" và mô tả
    const qty = dialog.getByRole("textbox", { name: /Số thực nhận/ });
    await qty.fill("8");
    await dialog.getByRole("button", { name: "Xác nhận đã nhận hàng" }).click();
    await expect(dialog.getByText("Vui lòng chọn lý do thiếu.")).toBeVisible();
    await dialog.getByLabel("Không đạt chất lượng").check();
    await dialog.getByRole("button", { name: "Xác nhận đã nhận hàng" }).click();
    await expect(dialog.getByText("Vui lòng mô tả ngắn vì sao hàng không đạt chất lượng.")).toBeVisible();
    await dialog.getByRole("textbox", { name: /Ghi chú|Mô tả/ }).fill("2 ổ bị dập, có mùi lạ");
    await shot(page, testInfo, "receive-review");
    await dialog.getByRole("button", { name: "Xác nhận đã nhận hàng" }).click();

    const done = page.getByRole("dialog", { name: "Đã nhận hàng" });
    await expect(done).toBeVisible({ timeout: 30_000 });
    await expect(done.locator("[data-dropoff-success]")).toContainText("Đã nhận hàng lúc");
    await expect(done.locator("[data-ledger]")).toContainText("Đã ghi vào sổ tác động");
    await shot(page, testInfo, "receive-success");

    type AllocRow = {
      status: string;
      qty_picked: number;
      qty_delivered: number;
      shortfall_reason: string | null;
    };
    const [alloc] = await serviceGet<AllocRow[]>(
      `allocations?id=eq.${lot.allocationId}&select=status,qty_picked,qty_delivered,shortfall_reason`,
    );
    expect(alloc).toMatchObject({
      status: "delivered",
      qty_delivered: 8,
      shortfall_reason: "quality_reject",
    });
    expect(Number(alloc!.qty_picked)).toBe(10);
    type LedgerRow = { entry_type: string; kg: number; charity_org_id: string };
    const ledger = await serviceGet<LedgerRow[]>(
      `impact_ledger?allocation_id=eq.${lot.allocationId}&select=entry_type,kg,charity_org_id`,
    );
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ entry_type: "credit", charity_org_id: charity.org.id });
    expect(Number(ledger[0]!.kg)).toBeGreaterThan(0);
    const [trip] = await serviceGet<{ status: string }[]>(`pickups?id=eq.${pickupId}&select=status`);
    expect(trip!.status).toBe("completed");

    await done.getByRole("button", { name: "Xong" }).click();
    await expect(page.getByRole("region", { name: /Đã nhận trong 24 giờ qua/ })).toContainText(
      literal(`Hoàng Nam ${suffix}`),
    );

    // Cửa hàng được báo phần bị từ chối: số lượng + loại lý do, không bao giờ ghi chú tự do (UAT 09/10 m3)
    type NoteRow = { title: string; body: string; link_path: string | null };
    const storeNote = async () => {
      await callDispatch(baseURL!);
      const rows = await serviceGet<NoteRow[]>(
        `notifications?user_id=eq.${lot.store.owner.id}&title=eq.${encodeURIComponent("Hàng đã tới tổ chức")}&select=title,body,link_path`,
      );
      return rows[0] ?? null;
    };
    await expect.poll(storeNote, { timeout: 30_000 }).not.toBeNull();
    const note = (await storeNote())!;
    expect(note.body).toContain("1 dòng hàng bị từ chối khi nhận: 2 ổ (không đạt chất lượng).");
    expect(note.body).not.toContain("dập");
    expect(note.link_path).toBe(`/store/inventory/${lot.store.offerId}`);

    // Trang lô của cửa hàng: dòng bị từ chối kèm lý do
    await page.context().clearCookies();
    await loginAs(page, lot.store.owner, note.link_path!);
    const requests = page.locator("#yeu-cau");
    const allocCard = requests.getByRole("article").filter({ hasText: charity.org.name });
    await expect(allocCard.getByText("Tổ chức đã nhận")).toBeVisible();
    await expect(allocCard).toContainText("8 ổ");
    await expect(allocCard.getByText("Bị từ chối khi nhận")).toBeVisible();
    await expect(allocCard).toContainText("2 ổ · Lý do: Không đạt chất lượng");
    await expect(allocCard).not.toContainText("dập");
    await expectNoA11yViolations(page, "/store/inventory/[id] (bị từ chối khi nhận)");
    await shot(page, testInfo, "store-lot-rejected");
  });
});
