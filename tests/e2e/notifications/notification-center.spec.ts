import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { expectNoA11yViolations } from "../fixtures/a11y";
import { callDispatch } from "../fixtures/jobs";
import { accessTokenOf, createSite, rpcAs } from "../fixtures/orgs";
import { createConfirmedUser, createOrgFor, loginAs, uniqueSuffix } from "../fixtures/users";
import { adminSelect } from "../onboarding/helpers";

/**
 * P2-14 + P2-15 (F-55, N-07): tổ chức gửi yêu cầu nhận lô ⇒ outbox ⇒ dispatcher (POST có chữ ký HMAC) ⇒
 * thông báo cho nhân viên cửa hàng: chuông có số chưa đọc, Realtime cập nhật khi đang mở trang, mở trung tâm
 * thông báo, bấm ⇒ đánh dấu đã đọc + điều hướng, "Đánh dấu tất cả đã đọc", email N-07 trong Mailpit.
 */

const iso = (ms: number) => new Date(ms).toISOString();

async function setupLoop() {
  const storeOwner = await createConfirmedUser({ prefix: "notif-store", fullName: "Trần Thị Mai" });
  const store = await createOrgFor(storeOwner, {
    kind: "store",
    status: "approved",
    name: `Tiệm bánh Chuông ${uniqueSuffix()}`,
  });
  const storeSite = await createSite(store.id, { name: "Chi nhánh Bến Thành", lat: 10.7725, lng: 106.698 });

  const charityOwner = await createConfirmedUser({ prefix: "notif-charity", fullName: "Lê Văn Hùng" });
  const charity = await createOrgFor(charityOwner, {
    kind: "charity",
    status: "approved",
    name: `Bếp ăn Chuông ${uniqueSuffix()}`,
  });
  // ~700 m: trong bán kính mặc định 5 km, kịp tới trước hạn
  const charitySite = await createSite(charity.id, {
    name: "Điểm nhận Nguyễn Trãi",
    lat: 10.7685,
    lng: 106.6935,
  });

  const storeToken = await accessTokenOf(storeOwner);
  const now = Date.now();
  const offerId = await rpcAs<string>(storeToken, "create_offer", {
    p_payload: {
      site_id: storeSite.id,
      category_code: "bread",
      title: "Bánh mì que",
      quantity: 30,
      expiry: { datetime: iso(now + 6 * 3_600_000) },
      pickup_start: iso(now - 5 * 60_000),
      pickup_end: iso(now + 5 * 3_600_000),
    },
    p_client_op_id: randomUUID(),
  });
  await rpcAs(storeToken, "publish_offer", {
    p_offer_id: offerId,
    p_safety_attested: true,
    p_client_op_id: randomUUID(),
  });

  const charityToken = await accessTokenOf(charityOwner);
  const request = (qty: number) =>
    rpcAs<{ allocation_id: string }>(charityToken, "request_offer", {
      p_offer_id: offerId,
      p_qty: qty,
      p_charity_site_id: charitySite.id,
      p_client_op_id: randomUUID(),
    });

  return { storeOwner, offerId, request };
}

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

/** Tiêu đề các thư Mailpit gửi tới `to`. */
async function mailSubjects(to: string): Promise<string[]> {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { messages?: { Subject: string }[] };
  return (data.messages ?? []).map((m) => m.Subject);
}

type Row = { id: string; title: string; read_at: string | null; link_path: string | null };

/** Gọi dispatcher (lô 50/lần, DB local dùng chung) tới khi người dùng có đủ `count` thông báo. */
async function dispatchUntil(baseURL: string, userId: string, count: number): Promise<Row[]> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const { status, body } = await callDispatch(baseURL);
    expect(status, JSON.stringify(body)).toBe(200);
    const rows = await adminSelect<Row[]>(
      `notifications?select=id,title,read_at,link_path&user_id=eq.${userId}&order=created_at.asc`,
    );
    if (rows.length >= count) return rows;
  }
  throw new Error(`Chưa đủ ${count} thông báo cho ${userId}`);
}

test.describe("Trung tâm thông báo (P2-14, P2-15)", () => {
  test.setTimeout(180_000);

  test("dispatcher từ chối request không có chữ ký hợp lệ", async ({ baseURL }) => {
    const rawBody = JSON.stringify({ job: "dispatch" });
    const unsigned = await fetch(new URL("/api/jobs/dispatch", baseURL), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: rawBody,
    });
    expect(unsigned.status).toBe(401);
    const forged = await fetch(new URL("/api/jobs/dispatch", baseURL), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-fs-timestamp": String(Math.floor(Date.now() / 1000)),
        "x-fs-signature": "0".repeat(64),
      },
      body: rawBody,
    });
    expect(forged.status).toBe(401);
    expect(await forged.json()).toEqual({ error: "unauthorized" });
  });

  test("cửa hàng nhận thông báo khi có yêu cầu nhận lô: chuông, Realtime, đọc, đọc hết", async ({
    page,
    baseURL,
  }) => {
    const { storeOwner, offerId, request } = await setupLoop();

    await request(5);
    const [first] = await dispatchUntil(baseURL!, storeOwner.id, 1);
    expect(first!.title).toMatch(/Yêu cầu nhận lô mới: Bánh mì que$/);
    expect(first!.link_path).toBe(`/store/inventory?offer=${offerId}`);

    await loginAs(page, storeOwner, "/store");
    const bell = page.getByRole("button", { name: /^Thông báo/ });
    await expect(bell).toHaveAccessibleName("Thông báo, 1 chưa đọc");

    // Realtime: yêu cầu thứ hai tới khi trang đang mở ⇒ chuông tự cập nhật, không tải lại trang
    await request(3);
    await dispatchUntil(baseURL!, storeOwner.id, 2);
    await expect(bell).toHaveAccessibleName("Thông báo, 2 chưa đọc", { timeout: 20_000 });

    await bell.click();
    const panel = page.getByRole("dialog", { name: "Thông báo" });
    await expect(panel).toBeVisible();
    const items = panel.getByRole("link", { name: /Yêu cầu nhận lô mới: Bánh mì que/ });
    await expect(items).toHaveCount(2);
    await expect(items.first()).toContainText("muốn nhận 3 ổ");
    await expect(items.first()).toContainText("Chưa đọc");
    await expect(panel.getByRole("button", { name: "Đánh dấu tất cả đã đọc" })).toBeEnabled();
    await expectNoA11yViolations(page, "trung tâm thông báo (mở)");
    await page.screenshot({ path: test.info().outputPath("notification-center-open.png") });

    // Bấm ⇒ đánh dấu đã đọc + điều hướng tới lô
    await items.first().click();
    await expect(page).toHaveURL(new RegExp(`/store/inventory\\?offer=${offerId}$`));
    await expect(panel).toBeHidden();
    await expect(bell).toHaveAccessibleName("Thông báo, 1 chưa đọc");

    // Đánh dấu tất cả đã đọc
    await bell.click();
    await expect(panel).toBeVisible();
    await panel.getByRole("button", { name: "Đánh dấu tất cả đã đọc" }).click();
    await expect(panel.getByRole("button", { name: "Đánh dấu tất cả đã đọc" })).toBeDisabled();
    await expect(panel.getByText("Chưa đọc", { exact: true })).toHaveCount(0);
    // sheet (mobile) là modal: đóng rồi mới kiểm chuông
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(bell).toHaveAccessibleName("Thông báo");
    await page.setViewportSize({ width: 360, height: 740 });
    await expect(bell).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("header-360.png") });

    const rows = await adminSelect<Row[]>(`notifications?select=id,read_at&user_id=eq.${storeOwner.id}`);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.read_at !== null)).toBe(true);

    // N-07 cũng gửi email (mặc định bật cho cửa hàng) — Mailpit local. DB dùng chung có thể còn thư chờ
    // của lượt chạy khác (mỗi lần dispatch gửi tối đa 20) ⇒ gọi dispatcher tới khi thư tới.
    await expect
      .poll(
        async () => {
          await callDispatch(baseURL!);
          return (await mailSubjects(storeOwner.email)).length;
        },
        { timeout: 90_000, intervals: [1_000, 2_000] },
      )
      .toBeGreaterThanOrEqual(2);
    const subjects = await mailSubjects(storeOwner.email);
    expect(subjects.every((s) => /Yêu cầu nhận lô mới: Bánh mì que/.test(s))).toBe(true);
  });
});
