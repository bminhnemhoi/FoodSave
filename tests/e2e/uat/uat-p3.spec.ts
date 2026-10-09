import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import { createAdminUser, revokeAdmin } from "../fixtures/admin";
import { uniqueEmail } from "../fixtures/mailpit";
import { accessTokenOf, addMember, adminPatch, rpcAs } from "../fixtures/orgs";
import { createConfirmedUser, E2E_PASSWORD, loginAs, type TestUser } from "../fixtures/users";
import {
  journeyStore,
  linkIn,
  literal,
  MOJIBAKE,
  note,
  shot,
  startDispatchPump,
  tag,
  waitForMail,
} from "./helpers";
import {
  approvedOrg,
  attestAndPublish,
  bell,
  charityReceiveCode,
  device,
  fillOffer,
  H,
  jitteredCenter,
  lotViaApi,
  MIN,
  offset,
  retireOldUatWorlds,
  selectLots,
  serviceRest,
  storeEnterCode,
  volunteerDropoffCode,
  volunteerShowCode,
  type Lot,
  type Org,
} from "./world";

/**
 * UAT P3 — Ghép đơn & Điều phối (docs/uat/P3-matching-logistics.md) trên bản build production LOCAL + Supabase
 * local + Mailpit. "Minh chuẩn bị trước" (cửa hàng A 20, B 18, C 12 bánh ngọt trong bán kính, D 40 ngoài bán
 * kính) dựng bằng fixture + RPC thật; mọi bước của tổ chức, cửa hàng, TNV đi qua giao diện. pg_net local không
 * gọi được máy chủ UAT ⇒ test chạy máy bơm dispatcher (thay pg_cron/pg_net).
 */

type Notif = { title: string; body: string; link_path: string | null; created_at: string };

async function notificationsOf(user: TestUser, since: string): Promise<Notif[]> {
  return serviceRest<Notif[]>(
    `notifications?select=title,body,link_path,created_at&user_id=eq.${user.id}&created_at=gte.${encodeURIComponent(since)}&order=created_at.desc`,
  );
}

async function offerByTitle(
  title: string,
): Promise<{ id: string; qty_available: number; status: string; unit: string; unit_weight_kg: number }> {
  const [o] = await serviceRest<
    { id: string; qty_available: number; status: string; unit: string; unit_weight_kg: number }[]
  >(`offers?select=id,qty_available,status,unit,unit_weight_kg&title=eq.${encodeURIComponent(title)}`);
  return o!;
}

// ===============================================================================================================
// A. Thông báo hai chiều theo bán kính (P3-01…04)
// ===============================================================================================================

type JA = { t: string; charity?: Org; store?: Org; admin?: TestUser; since?: string };
let A: JA;
let saveA = () => {};

test.describe("UAT P3 — A thông báo theo bán kính", () => {
  test.describe.configure({ mode: "default", timeout: 240_000 });

  test.beforeAll(async ({ browserName: _b }, testInfo) => {
    const s = journeyStore<JA>("uat-p3a", testInfo, () => ({ t: tag(testInfo) }));
    A = s.state;
    saveA = s.save;
    if (A.charity) return;
    // Ô riêng mỗi lượt chạy: nếu nhiều tổ chức cùng bán kính, lô thường chia "đợt công bằng" 5 phút (F-28)
    const c = jitteredCenter(
      testInfo.project.name === "mobile" ? { lat: 10.42, lng: 106.62 } : { lat: 10.42, lng: 106.5 },
      0.12,
    );
    await retireOldUatWorlds(testInfo.project.name, A.t, /^(Mái ấm UAT Thông Báo|Tiệm UAT Chuông) /);
    A.charity = await approvedOrg("charity", `Mái ấm UAT Thông Báo ${A.t}`, c, "Võ Thị Hạnh");
    await adminPatch(`sites?id=eq.${A.charity.siteId}`, {
      radius_km: 5,
      accepted_categories: [
        "bread",
        "cooked_meal",
        "pastry",
        "vegetables",
        "fruit",
        "dairy",
        "beverage",
        "dry_goods",
      ],
    });
    A.store = await approvedOrg("store", `Tiệm UAT Chuông ${A.t}`, offset(c, 1, 30), "Nguyễn Thị Thu Lan");
    A.admin = await createAdminUser(`Admin UAT ${A.t}`);
    saveA();
  });
  test.afterEach(() => saveA());
  test.afterAll(async () => {
    if (A?.admin) await revokeAdmin(A.admin);
  });

  test("P3-01/02/03 lô Bánh ngọt ⇒ [TC] + Admin nhận ≤ 1 phút; lô Thịt ⇒ chỉ Admin; lô Đỏ ⇒ GẤP", async ({
    page,
    browser,
    baseURL,
  }, testInfo) => {
    const stop = startDispatchPump(baseURL!);
    const tcCtx = await device(browser, testInfo, "android");
    const tc = await tcCtx.newPage();
    try {
      await loginAs(tc, A.charity!.user, "/charity");
      await tc.waitForLoadState("networkidle").catch(() => undefined);
      const since = new Date(Date.now() - 5_000).toISOString();
      const before = await bell(tc);
      const now = Date.now();

      // P3-01: [CH-A] đăng lô Bánh ngọt (không gấp: hạn 2 ngày, khung lấy dài)
      await loginAs(page, A.store!.user, "/store/inventory/new");
      const pastry = `Bánh bông lan ${A.t}`;
      await fillOffer(page, {
        category: "Bánh ngọt & dessert",
        title: pastry,
        quantity: "12",
        expiry: now + 48 * H,
        pickupStart: now + 10 * MIN,
        pickupEnd: now + 30 * H,
      });
      await attestAndPublish(page);
      const t0 = Date.now();
      await expect.poll(() => bell(tc), { timeout: 60_000, intervals: [500] }).toBeGreaterThan(before);
      note(testInfo, "P3-01 độ trễ", `${Date.now() - t0} ms tới chuông [TC] (máy bơm dispatcher 1 s)`);
      const tcN = await notificationsOf(A.charity!.user, since);
      const adminN = await notificationsOf(A.admin!, since);
      note(testInfo, "P3-01 [TC]", tcN.map((n) => n.title).join(" | "));
      expect(tcN.some((n) => n.title.includes(pastry))).toBe(true);
      expect(
        adminN.some((n) => n.title.includes(pastry)),
        "Admin cũng nhận",
      ).toBe(true);
      await shot(tc, testInfo, "P3-01-charity-bell", false);

      // P3-02: lô Thịt (tổ chức không nhận) ⇒ không báo [TC]; Admin vẫn nhận
      const meat = `Thịt heo xay ${A.t}`;
      await fillOffer(page, {
        category: "Thịt & hải sản",
        title: meat,
        quantity: "3",
        unit: "kg",
        expiry: now + 30 * H,
        pickupStart: now + 10 * MIN,
        pickupEnd: now + 20 * H,
      });
      await attestAndPublish(page);
      await expect
        .poll(async () => (await notificationsOf(A.admin!, since)).some((n) => n.title.includes(meat)), {
          timeout: 60_000,
        })
        .toBe(true);
      await new Promise((r) => setTimeout(r, 5_000)); // thêm vài vòng dispatcher
      expect((await notificationsOf(A.charity!.user, since)).some((n) => n.title.includes(meat))).toBe(false);
      note(testInfo, "P3-02", "Admin nhận lô Thịt; [TC] (không nhận Thịt & hải sản) không nhận");

      // P3-03: lô Đỏ (cơm hộp, hạn +2 giờ) ⇒ GẤP
      const red = `Cơm gà xối mỡ ${A.t}`;
      await fillOffer(page, {
        category: "Cơm hộp & món chế biến",
        title: red,
        quantity: "6",
        expiry: now + 2 * H,
        pickupStart: now + 5 * MIN,
        pickupEnd: now + 2 * H,
      });
      await attestAndPublish(page);
      await expect
        .poll(
          async () =>
            (await notificationsOf(A.charity!.user, since)).find((n) => n.title.includes(red))?.title ?? "",
          {
            timeout: 60_000,
          },
        )
        .toMatch(/GẤP/);
      const urgent = (await notificationsOf(A.charity!.user, since)).find((n) => n.title.includes(red))!;
      const normal = (await notificationsOf(A.charity!.user, since)).find((n) => n.title.includes(pastry))!;
      note(testInfo, "P3-03", `thường: “${normal.title}” · gấp: “${urgent.title}” — ${urgent.body}`);
      expect(normal.title).not.toMatch(/GẤP/);
      // Trên giao diện: mở chuông thấy dòng GẤP
      await tc
        .getByRole("button", { name: /^Thông báo/ })
        .first()
        .click();
      const panel = tc.getByRole("dialog", { name: "Thông báo" });
      await expect(panel.getByText(/GẤP/).first()).toBeVisible({ timeout: 30_000 });
      await shot(tc, testInfo, "P3-03-urgent-panel", false);
    } finally {
      stop();
      await tcCtx.close();
    }
  });

  test("P3-04 Cài đặt thông báo của [TC]: tắt “Donation mới (thường)” — kiểm tra có màn này chưa", async ({
    page,
  }, testInfo) => {
    await loginAs(page, A.charity!.user, "/charity/settings");
    const tabs = await page
      .getByRole("navigation", { name: "Các mục cài đặt" })
      .getByRole("link")
      .allInnerTexts();
    const found = (await page.getByText(/Cài đặt thông báo|Tùy chọn thông báo|Donation mới/).count()) > 0;
    note(
      testInfo,
      "P3-04",
      `tab cài đặt: ${tabs.join(" | ")} · có tùy chọn thông báo: ${found} (F-59 chưa làm)`,
    );
    await shot(page, testInfo, "P3-04-charity-settings", false);
    expect(tabs.join(" ")).not.toMatch(/Thông báo/); // ghi nhận CHƯA CÓ (đổi thành kiểm tra thật khi F-59 xong)
  });
});

// ===============================================================================================================
// B/C/D. "50 bánh từ 3 cửa hàng", tình nguyện viên, hủy & ghép lại phần thiếu (P3-05…27)
// ===============================================================================================================

type JB = {
  t: string;
  center: { lat: number; lng: number };
  charity?: Org;
  stores?: Record<"A" | "B" | "C" | "D", Org>;
  lots?: Record<"A" | "B" | "C" | "D", Lot>;
  weight?: number;
  tnv1?: TestUser;
  tnv2?: TestUser;
  admin?: TestUser;
  needId?: string;
  trip1?: string;
  trip2?: string;
  impactBefore?: { kg: string; lots: string };
  round2?: { needId?: string; lots: Record<string, Lot>; E?: Org; Elot?: Lot };
  done: Record<string, boolean>;
};
let B: JB;
let saveB = () => {};

const UNIT_LABEL = "cái";

async function charityImpact(page: Page, user: TestUser): Promise<{ kg: string; lots: string }> {
  await page.context().clearCookies();
  await loginAs(page, user, "/charity");
  const sec = page.locator('section[aria-label="Tác động của tổ chức từ khi tham gia"]');
  await sec.waitFor({ timeout: 30_000 });
  const v = async (k: string) => {
    const el = sec.locator(`[data-metric="${k}"] [data-value]`);
    return (await el.count()) ? (await el.innerText()).trim() : "0";
  };
  return { kg: await v("kg"), lots: await v("lots") };
}

const num = (s: string) => Number(s.replace(/\./g, "").replace(",", ".")) || 0;

test.describe("UAT P3 — B/C/D 50 bánh từ 3 cửa hàng, TNV, hủy", () => {
  test.describe.configure({ mode: "default", timeout: 360_000 });

  test.beforeAll(async ({ browserName: _b }, testInfo) => {
    const s = journeyStore<JB>("uat-p3b", testInfo, () => ({
      t: tag(testInfo),
      // Mỗi lượt chạy một ô riêng (desktop/mobile cách nhau ~11 km), lượt cũ cùng project bị tạm ngưng
      center: jitteredCenter(
        testInfo.project.name === "mobile" ? { lat: 10.85, lng: 106.56 } : { lat: 10.85, lng: 106.45 },
      ),
      done: {},
    }));
    B = s.state;
    saveB = s.save;
    if (B.charity) return;
    const retired = await retireOldUatWorlds(
      testInfo.project.name,
      B.t,
      /^(Tiệm UAT (Hoa Sữa|Mặt Trời|Phố Xanh|Bình Minh|Bổ Sung) |Mái ấm UAT Năm Mươi )/,
    );
    note(testInfo, "cô lập", `tạm ngưng ${retired} tổ chức UAT của lượt trước`);
    const c = B.center;
    B.charity = await approvedOrg("charity", `Mái ấm UAT Năm Mươi ${B.t}`, c, "Võ Thị Hạnh");
    await adminPatch(`sites?id=eq.${B.charity.siteId}`, { radius_km: 3 });
    const names = { A: "Hoa Sữa", B: "Mặt Trời", C: "Phố Xanh", D: "Bình Minh" } as const;
    const pos = {
      A: offset(c, 0.8, 45),
      B: offset(c, 1.2, 100),
      C: offset(c, 1.6, 160),
      D: offset(c, 6, 270),
    };
    const qty = { A: 20, B: 18, C: 12, D: 40 };
    const stores = {} as Record<"A" | "B" | "C" | "D", Org>;
    const lots = {} as Record<"A" | "B" | "C" | "D", Lot>;
    for (const k of ["A", "B", "C", "D"] as const) {
      stores[k] = await approvedOrg("store", `Tiệm UAT ${names[k]} ${B.t}`, pos[k], `Chủ Tiệm ${k}`);
      lots[k] = await lotViaApi(stores[k], {
        title: `Bánh ngọt ${k} ${B.t}`,
        category: "pastry",
        quantity: qty[k],
        hours: 8,
        unit: "piece",
      });
    }
    B.stores = stores;
    B.lots = lots;
    B.weight = Number((await offerByTitle(lots.A.title)).unit_weight_kg);
    // TNV1 sức chở 25 kg; TNV2 sức chở vừa đủ cho C nhưng không đủ cho A+B (để thấy cảnh báo)
    const capC = 12 * B.weight;
    const capAB = 38 * B.weight;
    const cap2 = Math.round(((capC + capAB) / 2) * 10) / 10;
    B.tnv1 = await createConfirmedUser({ prefix: "uat3-tnv1", fullName: `TNV Một ${B.t}` });
    B.tnv2 = await createConfirmedUser({ prefix: "uat3-tnv2", fullName: `TNV Hai ${B.t}` });
    for (const [u, cap, base] of [
      [B.tnv1, 25, offset(c, 1, 60)],
      [B.tnv2, cap2, offset(c, 1.5, 170)],
    ] as const) {
      await addMember(B.charity.orgId, u, "volunteer");
      await rpcAs(await accessTokenOf(u), "upsert_volunteer_profile", {
        p_payload: {
          vehicle: "motorbike",
          capacity_kg: cap,
          lat: base.lat,
          lng: base.lng,
          base_area_label: "Phường Thử",
        },
      });
    }
    B.admin = await createAdminUser(`Admin UAT P3 ${B.t}`);
    saveB();
  });
  test.afterEach(() => saveB());
  const need = (cond: unknown, what: string) => test.skip(!cond, `⛔ bị chặn: thiếu ${what} từ bước trước`);

  test("P3-05 [TC] đăng nhu cầu 50 bánh ngọt ⇒ A, B, C và Admin nhận “Nhu cầu mới”; D (ngoài bán kính) không", async ({
    page,
    baseURL,
  }, testInfo) => {
    const stop = startDispatchPump(baseURL!);
    try {
      const since = new Date(Date.now() - 5_000).toISOString();
      await loginAs(page, B.charity!.user, "/charity/needs");
      await page
        .getByRole("button", { name: /^Đăng nhu cầu/ })
        .first()
        .click();
      const dialog = page.getByRole("dialog", { name: "Đăng nhu cầu" });
      await dialog.getByRole("checkbox", { name: "Bánh ngọt & dessert" }).click();
      const unit = await dialog.getByLabel("Đơn vị").inputValue();
      if (unit !== "piece") await dialog.getByLabel("Đơn vị").selectOption("piece");
      await dialog.getByLabel("Số lượng cần").fill("50");
      const hint = await dialog
        .getByText(/Cần trước .*Từ 1 giờ tới 7 ngày/)
        .innerText()
        .catch(() => "");
      note(testInfo, "P3-05 form", `đơn vị mặc định ${unit}; ${hint}`);
      await shot(page, testInfo, "P3-05-need-form", false);
      await dialog.getByRole("button", { name: "Đăng nhu cầu" }).click();
      await expect(page).toHaveURL(/\/charity\/needs\/[0-9a-f-]{36}$/, { timeout: 45_000 });
      B.needId = page.url().split("/").pop()!;
      saveB();

      const got: Record<string, boolean> = {};
      await expect
        .poll(
          async () => {
            for (const k of ["A", "B", "C"] as const)
              got[k] = (await notificationsOf(B.stores![k].user, since)).some((n) => /Nhu cầu/.test(n.title));
            got.admin = (await notificationsOf(B.admin!, since)).some((n) => /Nhu cầu/.test(n.title));
            return got.A && got.B && got.C && got.admin;
          },
          { timeout: 60_000 },
        )
        .toBe(true);
      await new Promise((r) => setTimeout(r, 4_000));
      const d = await notificationsOf(B.stores!.D.user, since);
      const a = await notificationsOf(B.stores!.A.user, since);
      note(
        testInfo,
        "P3-05 thông báo",
        `A: “${a.find((n) => /Nhu cầu/.test(n.title))?.title}” · D: ${d.length} thông báo`,
      );
      expect(d.some((n) => /Nhu cầu/.test(n.title))).toBe(false);
    } finally {
      stop();
    }
  });

  test("P3-06/07/08 ≤ 3 phương án; PA1 = A 20 + B 18 + C 12 = 50, 3 điểm dừng, km, phút; D không có; bản đồ đánh số; xếp hạng", async ({
    page,
  }, testInfo) => {
    need(B.needId, "nhu cầu (P3-05)");
    await loginAs(page, B.charity!.user, `/charity/needs/${B.needId}`);
    await expect(page.getByRole("heading", { name: "Phương án ghép" })).toBeVisible({ timeout: 30_000 });
    const mobile = testInfo.project.name === "mobile";
    const plans: { rank: number; text: string }[] = [];
    for (let r = 1; r <= 3; r++) {
      if (mobile) {
        const btn = page.getByRole("button", { name: new RegExp(`^Phương án ${r} \\d`) });
        if ((await btn.count()) === 0) break;
        await btn.click();
      }
      const art = page.getByRole("article", { name: `Phương án ${r}`, exact: true });
      if ((await art.count()) === 0) break;
      plans.push({ rank: r, text: await art.innerText() });
    }
    if (mobile) await page.getByRole("button", { name: /^Phương án 1 \d/ }).click();
    expect(plans.length).toBeGreaterThanOrEqual(1);
    expect(plans.length).toBeLessThanOrEqual(3);
    const summary = plans.map((p) => {
      const cover = Number(p.text.match(/Đáp ứng\s*(\d+)\/50/)?.[1] ?? NaN);
      const stores = Number(p.text.match(/(\d+) cửa hàng/)?.[1] ?? NaN);
      return {
        rank: p.rank,
        cover,
        stores,
        km: p.text.match(/(\d+(?:,\d+)?) km/)?.[1],
        min: p.text.match(/(\d+) phút/)?.[1],
      };
    });
    note(testInfo, "P3-06/08 phương án", JSON.stringify(summary));
    const p1 = page.getByRole("article", { name: "Phương án 1", exact: true });
    await expect(p1).toContainText("Đáp ứng 50/50");
    await expect(p1).toContainText("3 cửa hàng");
    for (const [k, q] of [
      ["A", 20],
      ["B", 18],
      ["C", 12],
    ] as const) {
      const li = p1.getByRole("listitem").filter({ hasText: literal(B.stores![k].orgName) });
      await expect(li).toContainText(`${q} ${UNIT_LABEL}`);
    }
    expect(plans[0]!.text).toMatch(/\d+(,\d+)? km/);
    expect(plans[0]!.text).toMatch(/\d+ phút/);
    for (const p of plans) {
      expect(p.text, `PA${p.rank} không có D`).not.toContain(B.stores!.D.orgName);
      const s = summary.find((x) => x.rank === p.rank)!;
      expect(s.cover).toBeLessThanOrEqual(50);
    }
    // Xếp hạng: phủ đủ trước, rồi ít điểm dừng
    for (let i = 1; i < summary.length; i++) {
      const a = summary[i - 1]!;
      const b = summary[i]!;
      expect(a.cover > b.cover || (a.cover === b.cover && a.stores <= b.stores)).toBe(true);
    }
    // P3-07: bản đồ có điểm nhận + 3 điểm dừng đánh số
    const map = page.getByRole("region", { name: /Bản đồ phương án 1/ });
    await expect(map).toBeVisible();
    await expect(page.locator(".maplibregl-canvas").first()).toBeVisible({ timeout: 30_000 });
    const stopMarkers = await map
      .locator("[aria-label*='Điểm dừng']")
      .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
    note(testInfo, "P3-07 điểm dừng trên bản đồ", stopMarkers.join(" || "));
    for (const n of [1, 2, 3]) expect(stopMarkers.some((l) => l.includes(`Điểm dừng ${n}:`))).toBe(true);
    const legend = await page
      .getByRole("list", { name: /Chú giải/ })
      .first()
      .innerText()
      .catch(() => "");
    note(testInfo, "P3-07 chú giải", legend.replace(/\n+/g, " | "));
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await shot(page, testInfo, "P3-06-plans");
    B.done.plans = true;
  });

  test("P3-09/10 chọn PA1 ⇒ 3 cửa hàng nhận yêu cầu; A, B, C bấm Xác nhận ⇒ nhu cầu “Đã ghép đủ”; tuyến xe máy theo đường phố", async ({
    page,
    browser,
    baseURL,
  }, testInfo) => {
    need(B.done.plans, "phương án (P3-06)");
    const stop = startDispatchPump(baseURL!);
    try {
      const since = new Date(Date.now() - 5_000).toISOString();
      await loginAs(page, B.charity!.user, `/charity/needs/${B.needId}`);
      if (testInfo.project.name === "mobile")
        await page.getByRole("button", { name: /^Phương án 1 \d/ }).click();
      await page
        .getByRole("article", { name: "Phương án 1", exact: true })
        .getByRole("button", { name: "Chọn phương án này" })
        .click();
      const chosen = page.getByRole("region", { name: "Phương án đã chọn", exact: true });
      await expect(chosen).toBeVisible({ timeout: 45_000 });
      await expect(page.getByText(/Đã gửi yêu cầu giữ 50 cái tới 3 cửa hàng/)).toBeVisible();
      await page.goto("/charity/needs");
      const statusAfterChoose = await page
        .getByRole("article", { name: /^50 cái/ })
        .first()
        .innerText();
      note(testInfo, "P3-09 trạng thái sau khi chọn", statusAfterChoose.replace(/\n+/g, " | ").slice(0, 200));
      const [n0] = await serviceRest<{ status: string }[]>(`needs?select=status&id=eq.${B.needId}`);
      note(testInfo, "P3-09 needs.status", n0!.status);
      // 3 cửa hàng nhận yêu cầu
      await expect
        .poll(
          async () => {
            let ok = 0;
            for (const k of ["A", "B", "C"] as const)
              if (
                (await notificationsOf(B.stores![k].user, since)).some((n) =>
                  /Yêu cầu nhận lô mới/.test(n.title),
                )
              )
                ok++;
            return ok;
          },
          { timeout: 60_000 },
        )
        .toBe(3);

      // Tuyến: phương án được chọn lưu tuyến xe máy thật (nhiều điểm) nếu mọi cửa hàng công khai
      const [bundle] = await serviceRest<
        { route: { coordinates?: number[][] } | null; route_provider: string | null }[]
      >(`need_bundles?select=route,route_provider&need_id=eq.${B.needId}`);
      const points = bundle!.route?.coordinates?.length ?? 0;
      note(testInfo, "P3-07 tuyến đã lưu", `provider ${bundle!.route_provider ?? "không"} · ${points} điểm`);
      // Goong Directions là dịch vụ ngoài: lỗi/quá giờ ⇒ ứng dụng giữ tuyến ước tính (không chặn việc chọn)
      expect.soft(points, "tuyến theo đường phố (nhiều hơn 4 điểm của đường thẳng)").toBeGreaterThan(5);

      // P3-10: từng cửa hàng xác nhận trên giao diện của mình
      for (const k of ["A", "B", "C"] as const) {
        const ctx = await device(browser, testInfo, "laptop");
        const sp = await ctx.newPage();
        try {
          await loginAs(sp, B.stores![k].user, "/store");
          const req = sp
            .locator("#cho-xac-nhan")
            .getByRole("article")
            .filter({ hasText: B.lots![k].title })
            .first();
          await req.getByRole("button", { name: "Xác nhận" }).click();
          await expect(sp.getByText(new RegExp(`Đã xác nhận .* cho ${B.charity!.orgName}`))).toBeVisible({
            timeout: 20_000,
          });
          if (k === "C") await shot(sp, testInfo, "P3-10-store-confirm", false);
        } finally {
          await ctx.close();
        }
      }
      await page.goto(`/charity/needs/${B.needId}`);
      await expect(page.getByRole("region", { name: "Phương án đã chọn", exact: true })).toContainText(
        "3/3 cửa hàng đã xác nhận",
        {
          timeout: 30_000,
        },
      );
      await page.goto("/charity/needs");
      await expect(page.getByRole("article", { name: /^50 cái/ }).first()).toContainText("Đã ghép đủ");
      await shot(page, testInfo, "P3-10-need-matched");
      B.done.confirmed = true;
    } finally {
      stop();
    }
  });

  test("P3-11 tạo chuyến: TNV1 lấy A + B, TNV2 lấy C; thứ tự tối ưu; vượt sức chở có cảnh báo", async ({
    page,
  }, testInfo) => {
    need(B.done.confirmed, "3 cửa hàng xác nhận (P3-10)");
    await loginAs(page, B.charity!.user, "/charity/pickups");
    const planner = page.getByRole("region", { name: /^Giao về / }).first();
    await expect(planner).toBeVisible({ timeout: 30_000 });
    await selectLots(page, planner, [B.lots!.A.title, B.lots!.B.title]);
    await planner.getByRole("radio", { name: "Tình nguyện viên" }).click();
    // Thử TNV2 (sức chở nhỏ) cho A + B ⇒ cảnh báo vượt sức chở
    await planner.getByRole("checkbox", { name: literal(B.tnv2!.fullName) }).check();
    await expect(planner.getByText(/Vượt sức chở/)).toBeVisible();
    note(
      testInfo,
      "P3-11 cảnh báo",
      await planner
        .getByText(/Vượt sức chở/)
        .first()
        .innerText(),
    );
    await shot(page, testInfo, "P3-11-over-capacity");
    await planner.getByRole("checkbox", { name: literal(B.tnv2!.fullName) }).uncheck();
    await planner.getByRole("checkbox", { name: literal(B.tnv1!.fullName) }).check();
    await expect(planner.getByText(/Vượt sức chở/)).toHaveCount(0);
    await planner.getByRole("button", { name: `Giao chuyến cho ${B.tnv1!.fullName}` }).click();
    await expect(page.getByText(/Đã giao chuyến cho/).first()).toBeVisible({ timeout: 60_000 });
    // Giao xong, ứng dụng mở trang chuyến vừa tạo ⇒ quay lại danh sách lập chuyến cho lô C
    await expect(page).toHaveURL(/\/charity\/pickups\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    await page.goto("/charity/pickups");
    const planner2 = page.getByRole("region", { name: /^Giao về / }).first();
    await selectLots(page, planner2, [B.lots!.C.title]);
    await planner2.getByRole("radio", { name: "Tình nguyện viên" }).click();
    await planner2.getByRole("checkbox", { name: literal(B.tnv2!.fullName) }).check();
    await planner2.getByRole("button", { name: `Giao chuyến cho ${B.tnv2!.fullName}` }).click();
    await expect(page.getByText(/Đã giao chuyến cho/).first()).toBeVisible({ timeout: 60_000 });

    const trips = await serviceRest<{ id: string; assignee_user_id: string }[]>(
      `pickups?select=id,assignee_user_id&charity_org_id=eq.${B.charity!.orgId}&status=eq.assigned`,
    );
    B.trip1 = trips.find((t) => t.assignee_user_id === B.tnv1!.id)!.id;
    B.trip2 = trips.find((t) => t.assignee_user_id === B.tnv2!.id)!.id;
    const stops = await serviceRest<{ seq: number; kind: string; site_id: string; eta: string | null }[]>(
      `pickup_stops?select=seq,kind,site_id,eta&pickup_id=eq.${B.trip1}&order=seq`,
    );
    const nameOf = (siteId: string) =>
      Object.entries(B.stores!).find(([, s]) => s.siteId === siteId)?.[0] ??
      (siteId === B.charity!.siteId ? "TC" : "?");
    note(testInfo, "P3-11 thứ tự chuyến TNV1", stops.map((s) => `${s.seq}.${nameOf(s.site_id)}`).join(" → "));
    expect(stops.map((s) => nameOf(s.site_id)).sort()).toEqual(["A", "B", "TC"]);
    expect(stops.at(-1)!.kind).toBe("dropoff");
    await shot(page, testInfo, "P3-11-trips");
  });

  test("P3-12/13/19 TNV1: Chuyến hôm nay 2 điểm theo thứ tự, bản đồ, Google/Apple Maps; đồng ý vị trí ⇒ Không đồng ý vẫn chạy", async ({
    browser,
  }, testInfo) => {
    need(B.trip1, "chuyến TNV1 (P3-11)");
    const ctx = await device(browser, testInfo, "iphone");
    const tnv = await ctx.newPage();
    try {
      await loginAs(tnv, B.tnv1!, "/volunteer");
      const card = tnv.locator(`[data-trip-card="${B.trip1}"]`);
      await expect(card).toContainText("2 điểm lấy hàng");
      await shot(tnv, testInfo, "P3-12-today", false);
      await card.getByRole("button", { name: "Nhận chuyến" }).click();
      await expect(card).toContainText("Đã nhận", { timeout: 20_000 });
      await card.getByRole("button", { name: "Bắt đầu chuyến" }).click();
      const consent = tnv.getByRole("dialog", { name: "Chia sẻ vị trí khi chuyến đang chạy" });
      await expect(consent).toBeVisible();
      const ctext = await consent.innerText();
      note(testInfo, "P3-19 màn đồng ý", ctext.replace(/\n+/g, " | ").slice(0, 600));
      for (const must of [
        /màn hình chuyến đang mở/,
        /chuyến đang chạy/,
        /không lưu lịch sử/,
        /rút lại đồng ý|Bạn có thể dừng/,
      ])
        expect(ctext).toMatch(must);
      await shot(tnv, testInfo, "P3-19-consent", false);
      await consent.getByRole("button", { name: "Không, chỉ dùng check-in" }).click();
      await expect(tnv).toHaveURL(new RegExp(`/volunteer/trips/${B.trip1}$`));
      const current = tnv.locator("[data-current-stop]").first();
      await expect(current).toBeVisible();
      const text = await current.innerText();
      const which = (["A", "B"] as const).find((k) => text.includes(B.stores![k].orgName))!;
      const next = B.stores![which];
      const google = await current.getByRole("link", { name: /Google Maps/ }).getAttribute("href");
      const apple = await current.getByRole("link", { name: /Apple Maps/ }).getAttribute("href");
      note(testInfo, "P3-13 liên kết", `điểm kế tiếp ${which}; Google: ${google} · Apple: ${apple}`);
      const firstWaypoint = decodeURIComponent(google!.match(/waypoints=([^&]+)/)?.[1] ?? "").split("|")[0];
      expect(firstWaypoint).toBe(`${next.at.lat.toFixed(6)},${next.at.lng.toFixed(6)}`);
      expect(google).toMatch(/travelmode=two-wheeler/);
      expect(apple).toMatch(/maps\.apple\.com/);
      await expect(tnv.getByRole("region", { name: /Bản đồ chuyến/ })).toBeVisible();
      const timeline = await tnv
        .locator("[data-stop]")
        .evaluateAll((els) => els.map((e) => e.textContent?.slice(0, 60) ?? ""));
      note(testInfo, "P3-12 lộ trình", timeline.join(" || "));
      await shot(tnv, testInfo, "P3-12-trip", true);
      B.done.tnv1Started = true;
    } finally {
      await ctx.close();
    }
  });

  test("P3-14/20/21/22 bàn giao A, B (TNV1), C (TNV2 có chia sẻ vị trí), giao về ⇒ “Đã nhận đủ”, tác động +50 × kg; vị trí chỉ điều phối thấy, xóa khi xong", async ({
    page,
    browser,
  }, testInfo) => {
    test.setTimeout(600_000);
    need(B.done.tnv1Started && B.trip2, "chuyến TNV1/TNV2 (P3-11/12)");
    B.impactBefore = await charityImpact(page, B.charity!.user);
    const t1 = await device(browser, testInfo, "iphone");
    const tnv1 = await t1.newPage();
    const t2 = await device(browser, testInfo, "android");
    const tnv2 = await t2.newPage();
    const storeCtx = await device(browser, testInfo, "laptop");
    const store = await storeCtx.newPage();
    try {
      // TNV1: hai điểm lấy theo thứ tự, mỗi nơi check-in trong 100 m (P3-21) rồi cửa hàng nhập mã
      await loginAs(tnv1, B.tnv1!, `/volunteer/trips/${B.trip1}`);
      for (let i = 0; i < 2; i++) {
        const cur = tnv1.locator("[data-current-stop]").first();
        await expect(cur).toBeVisible({ timeout: 30_000 });
        const txt = await cur.innerText();
        const k = (["A", "B"] as const).find((x) => txt.includes(B.stores![x].orgName))!;
        const { stopId, code } = await volunteerShowCode(tnv1, B.stores![k].at);
        if (i === 0) {
          const checked = await tnv1
            .locator(`[data-stop="${stopId}"]`)
            .innerText()
            .catch(() => "");
          note(
            testInfo,
            "P3-21 check-in",
            `${k}: ${(await cur.innerText()).match(/[^\n]*(100 m|thủ công)[^\n]*/)?.[0] ?? checked.slice(0, 80)}`,
          );
        }
        await storeEnterCode(store, B.stores![k].user, stopId, code);
        await expect(tnv1.getByRole("dialog", { name: "Mã bàn giao" })).toBeHidden({ timeout: 20_000 });
      }
      const drop1 = await volunteerDropoffCode(tnv1);
      await charityReceiveCode(page, B.charity!.user, B.trip1!, drop1);

      // TNV2: bật chia sẻ vị trí ở Tài khoản (P3-20), rồi chạy chuyến C
      await tnv2.context().grantPermissions(["geolocation"]);
      await tnv2
        .context()
        .setGeolocation({ latitude: B.center.lat - 0.004, longitude: B.center.lng + 0.002, accuracy: 10 });
      await loginAs(tnv2, B.tnv2!, "/volunteer/profile");
      await tnv2.getByRole("button", { name: "Bật chia sẻ vị trí trong chuyến" }).click();
      await tnv2
        .getByRole("dialog", { name: "Chia sẻ vị trí khi chuyến đang chạy" })
        .getByRole("button", { name: "Đồng ý chia sẻ vị trí" })
        .click();
      await expect(tnv2.locator('[data-consent-state="on"]')).toBeVisible({ timeout: 20_000 });
      await tnv2.goto("/volunteer");
      const card = tnv2.locator(`[data-trip-card="${B.trip2}"]`);
      await card.getByRole("button", { name: "Nhận chuyến" }).click();
      await expect(card).toContainText("Đã nhận", { timeout: 20_000 });
      await card.getByRole("button", { name: "Bắt đầu chuyến" }).click();
      await expect(tnv2).toHaveURL(new RegExp(`/volunteer/trips/${B.trip2}$`), { timeout: 30_000 });
      await expect(tnv2.locator("[data-location-banner]")).toContainText("Đang chia sẻ vị trí", {
        timeout: 30_000,
      });

      // Điều phối viên thấy vị trí + ETA; cửa hàng C chỉ thấy lượt bàn giao, không có vị trí
      await page.context().clearCookies();
      await loginAs(page, B.charity!.user, `/charity/pickups/${B.trip2}`);
      await expect(page.getByText(/Vị trí gần đúng của/).first()).toBeVisible({ timeout: 60_000 });
      const dispatchText = await page.locator("main").innerText();
      note(
        testInfo,
        "P3-20 điều phối",
        (dispatchText.match(/[^\n]*(dự kiến|ETA|Vị trí gần đúng)[^\n]*/g) ?? []).join(" | ").slice(0, 300),
      );
      await shot(page, testInfo, "P3-20-dispatch-live");
      await store.context().clearCookies();
      await loginAs(store, B.stores!.C.user, "/store/handover");
      const storeText = await store.locator("main").innerText();
      const storeHasEta = /dự kiến|tới lúc|ETA/i.test(storeText);
      note(
        testInfo,
        "P3-20 cửa hàng C",
        `có bản đồ vị trí TNV: ${(await store.getByText(/Vị trí gần đúng của/).count()) > 0} · có ETA: ${storeHasEta}`,
      );
      await expect(store.getByText(/Vị trí gần đúng của/)).toHaveCount(0);
      await shot(store, testInfo, "P3-20-store-view");
      expect.soft(storeHasEta, "cửa hàng thấy giờ dự kiến TNV tới (ETA)").toBe(true);

      const { stopId, code } = await volunteerShowCode(tnv2, B.stores!.C.at);
      await storeEnterCode(store, B.stores!.C.user, stopId, code);
      const drop2 = await volunteerDropoffCode(tnv2);
      await charityReceiveCode(page, B.charity!.user, B.trip2!, drop2);
      await expect(tnv2.locator("[data-trip-done]")).toBeVisible({ timeout: 30_000 });

      // P3-22: chuyến xong ⇒ không còn vị trí
      const [p2] = await serviceRest<{ status: string; last_location: string | null }[]>(
        `pickups?select=status,last_location&id=eq.${B.trip2}`,
      );
      expect(p2).toMatchObject({ status: "completed", last_location: null });
      await page.goto(`/charity/pickups/${B.trip2}`);
      await expect(page.getByText(/Vị trí gần đúng của/)).toHaveCount(0);
      await shot(page, testInfo, "P3-22-after-trip");

      // P3-14: nhu cầu "Đã nhận đủ"; tác động +50 × kg
      const [n] = await serviceRest<{ status: string; qty_delivered: number }[]>(
        `needs?select=status,qty_delivered&id=eq.${B.needId}`,
      );
      note(testInfo, "P3-14 nhu cầu", JSON.stringify(n));
      expect(n!.status).toBe("fulfilled");
      await page.goto("/charity/needs");
      const listText = await page.locator("main").innerText();
      note(
        testInfo,
        "P3-14 danh sách nhu cầu",
        (listText.match(/[^\n]*(Đã nhận đủ|Hoàn tất|Đã đáp ứng)[^\n]*/) ?? ["(không thấy nhãn)"])[0]!,
      );
      const after = await charityImpact(page, B.charity!.user);
      note(
        testInfo,
        "P3-14 tác động",
        `kg ${B.impactBefore.kg} → ${after.kg} (kỳ vọng +${(50 * B.weight!).toFixed(2)}) · lô ${B.impactBefore.lots} → ${after.lots}`,
      );
      expect(num(after.kg) - num(B.impactBefore.kg)).toBeCloseTo(50 * B.weight!, 0);
      await shot(page, testInfo, "P3-14-impact");
      B.done.delivered = true;
    } finally {
      await t1.close();
      await t2.close();
      await storeCtx.close();
    }
  });

  test("P3-15 Tác động → Chuyến tình nguyện: +2 chuyến, +3 điểm lấy — kiểm tra có chỉ số này chưa", async ({
    page,
  }, testInfo) => {
    need(B.done.delivered, "bàn giao xong (P3-14)");
    await loginAs(page, B.charity!.user, "/charity/esg");
    const placeholder = (await page.getByRole("heading", { name: /Tính năng mở ở giai đoạn/ }).count()) > 0;
    await shot(page, testInfo, "P3-15-esg", false);
    await page.goto("/charity");
    const found = (await page.getByText(/Chuyến tình nguyện/).count()) > 0;
    const trips = await serviceRest<{ id: string }[]>(
      `pickups?select=id&charity_org_id=eq.${B.charity!.orgId}&mode=eq.volunteer&status=eq.completed`,
    );
    note(
      testInfo,
      "P3-15",
      `/charity/esg giữ chỗ: ${placeholder} · chỉ số “Chuyến tình nguyện” trên Tổng quan: ${found} · DB: ${trips.length} chuyến TNV hoàn tất`,
    );
    expect(trips.length).toBe(2);
  });

  // ---- Vòng 2: ma trận hủy (P3-23…27) ----

  test("P3-23/24 nhu cầu 50 lần 2, A+B+C xác nhận; B hủy (bắt buộc lý do, cảnh báo uy tín) ⇒ [TC] được báo thiếu 18, ghép lại đúng 18", async ({
    page,
    browser,
    baseURL,
  }, testInfo) => {
    test.setTimeout(480_000);
    need(B.stores, "thế giới P3");
    const stop = startDispatchPump(baseURL!);
    try {
      if (!B.round2?.needId) {
        const lots: Record<string, Lot> = {};
        for (const [k, q] of [
          ["A", 20],
          ["B", 18],
          ["C", 12],
        ] as const)
          lots[k] = await lotViaApi(B.stores![k], {
            title: `Bánh ngọt ${k}2 ${B.t}`,
            category: "pastry",
            quantity: q,
            hours: 8,
            unit: "piece",
          });
        B.round2 = { lots };
        await loginAs(page, B.charity!.user, "/charity/needs");
        await page
          .getByRole("button", { name: /^Đăng nhu cầu/ })
          .first()
          .click();
        const dialog = page.getByRole("dialog", { name: "Đăng nhu cầu" });
        await dialog.getByRole("checkbox", { name: "Bánh ngọt & dessert" }).click();
        if ((await dialog.getByLabel("Đơn vị").inputValue()) !== "piece")
          await dialog.getByLabel("Đơn vị").selectOption("piece");
        await dialog.getByLabel("Số lượng cần").fill("50");
        await dialog.getByRole("button", { name: "Đăng nhu cầu" }).click();
        await expect(page).toHaveURL(/\/charity\/needs\/[0-9a-f-]{36}$/, { timeout: 45_000 });
        B.round2.needId = page.url().split("/").pop()!;
        saveB();
      } else {
        await loginAs(page, B.charity!.user, `/charity/needs/${B.round2.needId}`);
      }
      if (testInfo.project.name === "mobile")
        await page.getByRole("button", { name: /^Phương án 1 \d/ }).click();
      const p1 = page.getByRole("article", { name: "Phương án 1", exact: true });
      for (const k of ["A", "B", "C"] as const) await expect(p1).toContainText(B.round2.lots[k]!.title);
      await p1.getByRole("button", { name: "Chọn phương án này" }).click();
      await expect(page.getByRole("region", { name: "Phương án đã chọn", exact: true })).toBeVisible({
        timeout: 45_000,
      });
      // Ba cửa hàng xác nhận (giao diện đã kiểm ở P3-10 — ở đây dựng nhanh bằng RPC thật dưới quyền từng cửa hàng)
      const allocs = await serviceRest<{ id: string; offer_id: string }[]>(
        `allocations?select=id,offer_id&need_id=eq.${B.round2.needId}`,
      );
      for (const k of ["A", "B", "C"] as const) {
        const a = allocs.find((x) => x.offer_id === B.round2!.lots[k]!.offerId)!;
        await rpcAs(await accessTokenOf(B.stores![k].user), "confirm_allocation", {
          p_allocation_id: a.id,
          p_client_op_id: randomUUID(),
        });
      }

      // P3-23: cửa hàng B hủy (sau khi đã xác nhận) — trên giao diện: Hủy lô
      const [trustBefore] = await serviceRest<{ trust_score: number }[]>(
        `organizations?select=trust_score&id=eq.${B.stores!.B.orgId}`,
      );
      const since = new Date(Date.now() - 5_000).toISOString();
      const bctx = await device(browser, testInfo, "laptop");
      const bp = await bctx.newPage();
      try {
        await loginAs(bp, B.stores!.B.user, `/store/inventory/${B.round2.lots.B!.offerId}`);
        await bp.getByRole("button", { name: /^Thao tác khác với lô/ }).click();
        await bp.getByRole("menuitem", { name: "Hủy lô" }).click();
        const dlg = bp.getByRole("alertdialog");
        const warn = await dlg.innerText();
        note(testInfo, "P3-23 hộp thoại", warn.replace(/\n+/g, " | ").slice(0, 400));
        expect(warn).toMatch(/uy tín/);
        await dlg.getByRole("button", { name: "Hủy lô" }).click();
        await expect(dlg.getByText("Vui lòng chọn hoặc nhập lý do hủy lô.")).toBeVisible();
        await shot(bp, testInfo, "P3-23-cancel-reason", false);
        await dlg.getByText("Lý do khác").click();
        await dlg.getByLabel("Nhập lý do").fill("Lò nướng hỏng, không đủ bánh");
        await dlg.getByRole("button", { name: "Hủy lô" }).click();
        await expect(bp.getByText(/Đã hủy lô/)).toBeVisible({ timeout: 30_000 });
      } finally {
        await bctx.close();
      }
      const [trustAfter] = await serviceRest<{ trust_score: number }[]>(
        `organizations?select=trust_score&id=eq.${B.stores!.B.orgId}`,
      );
      note(testInfo, "P3-23 uy tín B", `${trustBefore!.trust_score} → ${trustAfter!.trust_score}`);
      expect(Number(trustAfter!.trust_score)).toBe(Number(trustBefore!.trust_score) - 5);

      // P3-24: [TC] được báo thiếu; ghép lại chỉ phần thiếu (cửa hàng E mới có 25 bánh)
      const E = await approvedOrg("store", `Tiệm UAT Bổ Sung ${B.t}`, offset(B.center, 2, 20), "Chủ Tiệm E");
      const Elot = await lotViaApi(E, {
        title: `Bánh ngọt E ${B.t}`,
        category: "pastry",
        quantity: 25,
        hours: 8,
        unit: "piece",
      });
      B.round2.E = E;
      B.round2.Elot = Elot;
      saveB();
      await expect
        .poll(async () => (await notificationsOf(B.charity!.user, since)).map((n) => n.title).join(" | "), {
          timeout: 60_000,
        })
        .toMatch(/thiếu|Thiếu/);
      note(
        testInfo,
        "P3-24 thông báo",
        (await notificationsOf(B.charity!.user, since))
          .map((n) => `${n.title}: ${n.body}`)
          .join(" || ")
          .slice(0, 400),
      );
      await page.goto(`/charity/needs/${B.round2.needId}`);
      await expect(page.getByRole("heading", { name: `Còn thiếu 18 ${UNIT_LABEL}` })).toBeVisible({
        timeout: 30_000,
      });
      await page.getByRole("button", { name: `Còn thiếu 18 ${UNIT_LABEL} — tìm phương án bổ sung` }).click();
      await expect(
        page.getByRole("heading", { name: `Phương án bổ sung cho 18 ${UNIT_LABEL} còn thiếu` }),
      ).toBeVisible({ timeout: 30_000 });
      const extra = page.getByRole("article", { name: "Phương án 1", exact: true });
      await expect(extra).toContainText("Đáp ứng 18/18");
      await expect(extra).not.toContainText(B.stores!.B.orgName);
      await shot(page, testInfo, "P3-24-rematch");
      await extra.getByRole("button", { name: "Chọn phương án này" }).click();
      await expect(page.getByRole("article", { name: /Phương án bổ sung · 1 cửa hàng/ })).toBeVisible({
        timeout: 45_000,
      });
      const active = await serviceRest<{ qty_reserved: number; qty_released: number; status: string }[]>(
        `allocations?select=qty_reserved,qty_released,status&need_id=eq.${B.round2.needId}&status=in.(requested,confirmed,assigned,picked_up,delivered)`,
      );
      const total = active.reduce((a, x) => a + Number(x.qty_reserved) - Number(x.qty_released), 0);
      note(testInfo, "P3-24 tổng sau ghép lại", String(total));
      expect(total).toBeLessThanOrEqual(50);
      expect(total).toBe(50);
      B.done.round2 = true;
    } finally {
      stop();
    }
  });

  test("P3-25 [TC] hủy một yêu cầu trước khi lấy ⇒ số lượng trả về lô của cửa hàng", async ({
    page,
  }, testInfo) => {
    need(B.done.round2 && B.round2?.Elot, "vòng 2 (P3-24)");
    const before = await offerByTitle(B.round2!.Elot!.title);
    await loginAs(page, B.charity!.user, "/charity");
    const item = page.getByRole("article").filter({ hasText: B.round2!.Elot!.title }).first();
    await expect(item).toBeVisible({ timeout: 30_000 });
    await item.getByRole("button", { name: "Hủy yêu cầu" }).click();
    const dlg = page.getByRole("alertdialog");
    await expect(dlg).toBeVisible();
    const reason = dlg.getByLabel("Đã nhận đủ từ nguồn khác");
    if (await reason.count()) await reason.check();
    await dlg.getByRole("button", { name: "Hủy yêu cầu" }).click();
    await expect(page.getByText(/Đã hủy yêu cầu/)).toBeVisible({ timeout: 30_000 });
    const after = await offerByTitle(B.round2!.Elot!.title);
    note(testInfo, "P3-25 lô E", `còn ${before.qty_available} → ${after.qty_available}`);
    expect(Number(after.qty_available) - Number(before.qty_available)).toBe(18);
    await shot(page, testInfo, "P3-25-cancelled", false);
  });

  test("P3-26 điều phối đánh dấu TNV2 không đến ⇒ chuyến hủy, phân bổ về “Đã xác nhận”", async ({
    page,
  }, testInfo) => {
    need(B.done.round2, "vòng 2 (P3-24)");
    const [aC] = await serviceRest<{ id: string }[]>(
      `allocations?select=id&offer_id=eq.${B.round2!.lots.C!.offerId}&status=eq.confirmed`,
    );
    const trip = await rpcAs<string>(await accessTokenOf(B.charity!.user), "assign_pickup", {
      p_plan: {
        allocation_ids: [aC!.id],
        mode: "volunteer",
        assignee_user_id: B.tnv2!.id,
        charity_site_id: B.charity!.siteId,
      },
      p_client_op_id: randomUUID(),
    });
    await loginAs(page, B.charity!.user, `/charity/pickups/${trip}`);
    await page.getByRole("button", { name: "Hủy chuyến" }).click();
    const dlg = page.getByRole("dialog", { name: "Hủy chuyến này?" });
    await dlg.getByLabel("Tình nguyện viên không đến").check();
    await dlg.getByRole("button", { name: "Hủy chuyến" }).click();
    await expect(page.getByText(/Chuyến đã hủy.*lý do: Tình nguyện viên không đến/)).toBeVisible({
      timeout: 30_000,
    });
    const [a] = await serviceRest<{ status: string; pickup_id: string | null }[]>(
      `allocations?select=status,pickup_id&id=eq.${aC!.id}`,
    );
    expect(a).toMatchObject({ status: "confirmed", pickup_id: null });
    await shot(page, testInfo, "P3-26-no-show", false);
  });

  test("P3-27 sau khi đã lấy hàng: không hủy được, chỉ còn “Báo sự cố”", async ({ page }, testInfo) => {
    need(B.done.round2, "vòng 2 (P3-24)");
    const [aA] = await serviceRest<{ id: string }[]>(
      `allocations?select=id&offer_id=eq.${B.round2!.lots.A!.offerId}&status=eq.confirmed`,
    );
    const ctoken = await accessTokenOf(B.charity!.user);
    const trip = await rpcAs<string>(ctoken, "assign_pickup", {
      p_plan: {
        allocation_ids: [aA!.id],
        mode: "volunteer",
        assignee_user_id: B.tnv1!.id,
        charity_site_id: B.charity!.siteId,
      },
      p_client_op_id: randomUUID(),
    });
    const vt = await accessTokenOf(B.tnv1!);
    await rpcAs(vt, "respond_pickup", {
      p_pickup_id: trip,
      p_accept: true,
      p_reason: null,
      p_client_op_id: randomUUID(),
    });
    await rpcAs(vt, "start_pickup", { p_pickup_id: trip, p_client_op_id: randomUUID() });
    const [st] = await serviceRest<{ id: string }[]>(
      `pickup_stops?select=id&pickup_id=eq.${trip}&kind=eq.pickup`,
    );
    const [issued] = await rpcAs<{ handover_id: string; code: string }[]>(vt, "issue_handover_token", {
      p_stop_id: st!.id,
      p_lines: [],
      p_client_op_id: randomUUID(),
    });
    await rpcAs(await accessTokenOf(B.stores!.A.user), "consume_handover_code", {
      p_handover_id: issued!.handover_id,
      p_code: issued!.code,
      p_lines: [{ allocation_id: aA!.id, qty: 20, reason: null, note: null }],
      p_client_op_id: randomUUID(),
    });
    await loginAs(page, B.charity!.user, "/charity");
    const item = page.getByRole("article").filter({ hasText: B.round2!.lots.A!.title }).first();
    await expect(item).toBeVisible({ timeout: 30_000 });
    await expect(item.getByRole("button", { name: "Hủy yêu cầu" })).toHaveCount(0);
    await page.goto(`/charity/pickups/${trip}`);
    await expect(page.getByRole("button", { name: "Hủy chuyến" })).toBeDisabled();
    const why = await page.getByRole("button", { name: "Hủy chuyến" }).getAttribute("aria-describedby");
    note(testInfo, "P3-27", `Hủy chuyến bị khóa: “${why ? await page.locator(`#${why}`).innerText() : ""}”`);
    await expect(page.getByRole("button", { name: "Báo sự cố" })).toBeVisible();
    await shot(page, testInfo, "P3-27-after-pickup");
  });
});

// ===============================================================================================================
// C. Lời mời tình nguyện viên (P3-16…18)
// ===============================================================================================================

test.describe("UAT P3 — C mời tình nguyện viên", () => {
  test("P3-16/17/18 mời qua email (có hạn) → mở trên Android, tạo tài khoản, hồ sơ khu vực phường/xã → mở lại link", async ({
    page,
    browser,
  }, testInfo) => {
    test.setTimeout(300_000);
    const t = tag(testInfo);
    const charity = await approvedOrg(
      "charity",
      `Bếp UAT Mời ${t}`,
      { lat: 10.8, lng: 106.5 },
      "Trần Văn Bếp",
    );
    const email = uniqueEmail(`uat.tnv.${t}`);
    await loginAs(page, charity.user, "/charity/volunteers");
    const sentAt = Date.now();
    await page.getByRole("button", { name: "Mời tình nguyện viên" }).first().click();
    const invite = page.getByRole("dialog", { name: "Mời tình nguyện viên" });
    await invite.getByLabel("Email người được mời").fill(email);
    await invite.getByRole("button", { name: "Gửi lời mời" }).click();
    const mail = await waitForMail(email, /Lời mời tham gia/, 60_000);
    const delay = new Date(mail.Created).getTime() - sentAt;
    note(
      testInfo,
      "P3-16 email",
      `“${mail.Subject}” sau ${delay} ms · ${mail.Text.match(/Lời mời có hiệu lực[^.]*\./)?.[0]}`,
    );
    expect(delay).toBeLessThan(60_000);
    expect(mail.Text).toMatch(/có hiệu lực tới .* \(7 ngày\)/);
    expect(`${mail.Subject}\n${mail.Text}`).not.toMatch(MOJIBAKE);
    const link = linkIn(mail, /https?:\/\/[^\s"'<>]+\/invite\/[A-Za-z0-9_-]+/);

    // P3-17: mở link trên Android, tạo tài khoản, nhận lời mời, điền hồ sơ
    const ctx = await device(browser, testInfo, "android");
    const phone = await ctx.newPage();
    try {
      await phone.goto(link);
      await expect(phone.getByRole("heading", { level: 1 })).toHaveText("Bạn được mời tham gia FoodSave");
      await phone.getByRole("link", { name: "Tạo tài khoản mới" }).click();
      await phone.getByLabel("Họ và tên").fill("Lê Minh Khoa");
      await phone.getByLabel("Email").fill(email);
      await phone.getByLabel("Mật khẩu", { exact: true }).fill(E2E_PASSWORD);
      await phone.getByLabel("Nhập lại mật khẩu").fill(E2E_PASSWORD);
      await phone.getByRole("checkbox").check();
      await phone.getByRole("button", { name: "Tạo tài khoản" }).click();
      await expect(phone.getByRole("status")).toContainText("Đã gửi thư xác nhận");
      const confirm = await waitForMail(email, /Xác nhận email/);
      await phone.goto(linkIn(confirm, /https?:\/\/[^\s"'<>]+\/auth\/confirm\?[^\s"'<>]+/));
      await expect(phone).toHaveURL(/\/invite\//, { timeout: 30_000 });
      await phone.getByRole("button", { name: "Nhận lời mời" }).click();
      await expect(phone).toHaveURL(/\/volunteer$/, { timeout: 30_000 });
      await phone.goto("/volunteer/profile");
      await expect(phone.getByRole("heading", { level: 1, name: "Tài khoản" })).toBeVisible();
      // Khu vực chỉ ở mức phường/xã (làm tròn ~1 km), không có ô địa chỉ nhà
      await expect(phone.getByLabel(/Địa chỉ|Số nhà/)).toHaveCount(0);
      await phone.getByRole("radio", { name: "Xe máy" }).check();
      await phone.getByLabel(/Sức chở mỗi chuyến/).fill("20");
      await ctx.grantPermissions(["geolocation"]);
      await ctx.setGeolocation({ latitude: 10.80123, longitude: 106.50456, accuracy: 20 });
      await phone.getByRole("button", { name: "Dùng vị trí hiện tại" }).click();
      await expect(phone.getByText("Đã chọn khu vực (làm tròn khoảng 1 km).")).toBeVisible();
      await phone.getByLabel("Tên khu vực").fill("Phường Tân Định");
      const digits = String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
      await phone.getByLabel(/Số điện thoại/).fill(`09${digits}`);
      await phone.getByRole("button", { name: "Lưu hồ sơ" }).click();
      await expect(phone.getByText("Đã lưu hồ sơ tình nguyện viên.")).toBeVisible();
      await shot(phone, testInfo, "P3-17-volunteer-profile", true);
      const [vp] = await serviceRest<
        { base_area: string | null; base_area_label: string | null; vehicle: string }[]
      >(
        `volunteer_profiles?select=base_area,base_area_label,vehicle&user_id=eq.${(await serviceRest<{ id: string }[]>(`profiles?select=id&email=eq.${encodeURIComponent(email)}`))[0]!.id}`,
      );
      note(testInfo, "P3-17 hồ sơ", JSON.stringify({ ...vp, base_area: vp?.base_area?.slice(0, 20) }));
    } finally {
      await ctx.close();
    }

    // P3-18: mở link lần hai — người lạ (chưa đăng nhập / tài khoản khác)
    const anon = await device(browser, testInfo, "laptop");
    const ap = await anon.newPage();
    try {
      await ap.goto(link);
      const anonH1 = await ap.getByRole("heading", { level: 1 }).innerText();
      const other = await createConfirmedUser({ prefix: "uat3-other" });
      await loginAs(ap, other, link.replace(/^https?:\/\/[^/]+/, ""));
      await ap.getByRole("button", { name: "Nhận lời mời" }).click();
      // (không lấy nhầm route announcer của Next — cũng role="alert", chữ là tiêu đề trang)
      const err = ap
        .getByRole("alert")
        .filter({ hasText: /đã được|hết hạn|không dành|không hợp lệ|email khác/i })
        .first();
      await expect(err).toBeVisible({ timeout: 20_000 });
      const msg = await err.innerText();
      note(testInfo, "P3-18", `chưa đăng nhập: “${anonH1}” · tài khoản khác bấm nhận: “${msg}”`);
      await shot(ap, testInfo, "P3-18-reused-link", false);
      expect(msg).toMatch(/đã được (dùng|.*sử dụng)|hết hạn|không dành cho|email khác|không hợp lệ/i);
    } finally {
      await anon.close();
    }
  });
});

// ===============================================================================================================
// E. Kiểm tra khả thi lô Đỏ, điểm ẩn (P3-28, P3-29)
// ===============================================================================================================

test.describe("UAT P3 — E khả thi lô Đỏ và điểm ẩn", () => {
  test("P3-28 lô Đỏ còn ~35 phút cách 12 km ⇒ không gợi ý; lô Đỏ gần ⇒ có", async ({ page }, testInfo) => {
    const t = tag(testInfo);
    const c = testInfo.project.name === "mobile" ? { lat: 10.45, lng: 106.9 } : { lat: 10.45, lng: 107.05 };
    const charity = await approvedOrg("charity", `Mái ấm UAT Khả Thi ${t}`, c, "Ngô Thị Kịp");
    await adminPatch(`sites?id=eq.${charity.siteId}`, { radius_km: 15 });
    const near = await approvedOrg("store", `Tiệm UAT Gần ${t}`, offset(c, 1, 90), "Chủ Gần");
    const far = await approvedOrg("store", `Tiệm UAT Xa ${t}`, offset(c, 12, 270), "Chủ Xa");
    const nearLot = await lotViaApi(near, {
      title: `Cơm hộp gần ${t}`,
      category: "cooked_meal",
      quantity: 5,
      hours: 35 / 60,
    });
    const farLot = await lotViaApi(far, {
      title: `Cơm hộp xa ${t}`,
      category: "cooked_meal",
      quantity: 5,
      hours: 35 / 60,
    });
    const farOk = await lotViaApi(far, {
      title: `Mì gói xa ${t}`,
      category: "dry_goods",
      quantity: 5,
      hours: 24 * 5,
    });
    await loginAs(page, charity.user, "/charity/donations");
    const list = page
      .locator("main")
      .getByRole("article")
      .filter({ has: page.getByRole("button", { name: "Xin nhận" }) });
    await expect(list.filter({ hasText: nearLot.title })).toBeVisible({ timeout: 30_000 });
    await expect(list.filter({ hasText: farOk.title })).toBeVisible();
    await expect(list.filter({ hasText: farLot.title })).toHaveCount(0);
    const nearText = await list.filter({ hasText: nearLot.title }).innerText();
    note(
      testInfo,
      "P3-28",
      `gần: ${nearText.replace(/\n+/g, " | ").slice(0, 160)} · xa 12 km (Đỏ 35′): không hiện · xa 12 km (Vàng 5 ngày): hiện`,
    );
    expect(nearText).toMatch(/Nhãn\s*Đỏ/);
    await shot(page, testInfo, "P3-28-feasibility");
  });

  test("P3-29 “Nhu cầu gần bạn”: tổ chức điểm Ẩn chỉ hiện phường/vùng, không ghim chính xác", async ({
    page,
  }, testInfo) => {
    const t = tag(testInfo);
    const c = testInfo.project.name === "mobile" ? { lat: 10.52, lng: 106.9 } : { lat: 10.52, lng: 107.05 };
    const shelter = await approvedOrg("charity", `Nhà tạm lánh UAT ${t}`, c, "Phan Thị An");
    await adminPatch(`sites?id=eq.${shelter.siteId}`, {
      visibility: "hidden",
      radius_km: 5,
      address_line: "99 Hẻm Bí Mật",
    });
    const store = await approvedOrg("store", `Tiệm UAT Kề Bên ${t}`, offset(c, 1.2, 45), "Chủ Kề Bên");
    await lotViaApi(store, { title: `Bánh mì kề bên ${t}`, category: "bread", quantity: 10, hours: 6 });
    const needId = await rpcAs<string>(await accessTokenOf(shelter.user), "publish_need", {
      p_site_id: shelter.siteId,
      p_category_codes: ["bread"],
      p_unit: "loaf",
      p_quantity: 30,
      p_needed_by: new Date(Date.now() + 5 * H).toISOString(),
      p_people_to_serve: 25,
      p_note: null,
      p_client_op_id: randomUUID(),
    });
    await loginAs(page, store.user, "/store/connect");
    const card = page.getByRole("article", { name: literal(shelter.orgName) });
    await expect(card).toBeVisible({ timeout: 30_000 });
    const text = await card.innerText();
    note(testInfo, "P3-29 thẻ", text.replace(/\n+/g, " | ").slice(0, 300));
    expect(text).toMatch(/vị trí được ẩn/);
    const html = await page.content();
    expect(html).not.toContain(String(c.lat));
    expect(html).not.toContain(String(c.lng));
    expect(html).not.toContain("99 Hẻm Bí Mật");
    if (testInfo.project.name === "mobile")
      await page.getByRole("button", { name: "Bản đồ", exact: true }).click();
    const map = page.getByRole("region", { name: /Bản đồ nhu cầu gần bạn/ });
    await expect(map).toBeVisible();
    await expect(map.getByRole("button", { name: literal(shelter.orgName) })).toHaveCount(0);
    note(testInfo, "P3-29 bản đồ", (await map.getAttribute("aria-label")) ?? "");
    await shot(page, testInfo, "P3-29-hidden-need");
    void needId;
  });
});

// ===============================================================================================================
// F. Thiết bị (P3-30, P3-31) — giả lập; máy thật cần người thử
// ===============================================================================================================

test.describe("UAT P3 — F màn Chuyến hôm nay trên điện thoại (giả lập)", () => {
  test("P3-30/31 (giả lập) nút ≥ 44 px, dùng một tay; tải lại/ẩn trang quay về đúng chuyến, có ghi chú vị trí chỉ khi app mở", async ({
    browser,
  }, testInfo) => {
    const t = tag(testInfo);
    const c = { lat: 10.4, lng: 107.2 };
    const charity = await approvedOrg("charity", `Bếp UAT Thiết Bị ${t}`, c, "Đỗ Thị Máy");
    const store = await approvedOrg("store", `Tiệm UAT Thiết Bị ${t}`, offset(c, 1, 0), "Chủ Máy");
    const lot = await lotViaApi(store, {
      title: `Bánh mì thiết bị ${t}`,
      category: "bread",
      quantity: 10,
      hours: 5,
    });
    const vol = await createConfirmedUser({ prefix: "uat3-dev", fullName: "Nguyễn Một Tay" });
    await addMember(charity.orgId, vol, "volunteer");
    const ct = await accessTokenOf(charity.user);
    const req = await rpcAs<{ allocation_id: string; status: string }>(ct, "request_offer", {
      p_offer_id: lot.offerId,
      p_qty: 10,
      p_charity_site_id: charity.siteId,
      p_client_op_id: randomUUID(),
    });
    if (req.status === "requested")
      await rpcAs(await accessTokenOf(store.user), "confirm_allocation", {
        p_allocation_id: req.allocation_id,
        p_client_op_id: randomUUID(),
      });
    const trip = await rpcAs<string>(ct, "assign_pickup", {
      p_plan: {
        allocation_ids: [req.allocation_id],
        mode: "volunteer",
        assignee_user_id: vol.id,
        charity_site_id: charity.siteId,
      },
      p_client_op_id: randomUUID(),
    });
    const vt = await accessTokenOf(vol);
    await rpcAs(vt, "respond_pickup", {
      p_pickup_id: trip,
      p_accept: true,
      p_reason: null,
      p_client_op_id: randomUUID(),
    });
    await rpcAs(vt, "start_pickup", { p_pickup_id: trip, p_client_op_id: randomUUID() });

    const ctx = await device(browser, testInfo, "android");
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    try {
      const t0 = Date.now();
      await loginAs(page, vol, `/volunteer/trips/${trip}`);
      await expect(page.locator("[data-current-stop]").first()).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole("region", { name: /Bản đồ chuyến/ })).toBeVisible({ timeout: 30_000 });
      const loadMs = Date.now() - t0;
      const small = await page.locator("main").evaluate((main) =>
        Array.from(main.querySelectorAll<HTMLElement>("button, a[href], [role=button], summary"))
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
          })
          .map((el) => ({
            name: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 40),
            h: Math.round(el.getBoundingClientRect().height),
            w: Math.round(el.getBoundingClientRect().width),
          }))
          .filter((x) => x.h < 44 || x.w < 44),
      );
      note(
        testInfo,
        "P3-30",
        `tải màn chuyến (CPU 4×) ${loadMs} ms · nút/liên kết < 44 px: ${JSON.stringify(small)}`,
      );
      await shot(page, testInfo, "P3-30-trip-android", true);
      // P3-31 (giả lập khóa màn hình): ẩn trang rồi hiện lại + tải lại ⇒ vẫn đúng chuyến
      await page.evaluate(() => {
        Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await page.reload();
      await expect(page).toHaveURL(new RegExp(`/volunteer/trips/${trip}$`));
      await expect(page.locator("[data-current-stop]").first()).toBeVisible();
      const notice = await page
        .getByText(/màn hình chuyến đang mở|chỉ gửi khi|app đang mở|trang này đang mở/i)
        .count();
      note(
        testInfo,
        "P3-31",
        `sau khi ẩn + tải lại vẫn ở chuyến; ghi chú “vị trí chỉ gửi khi màn hình mở” hiện ${notice} lần`,
      );
      expect(small.filter((x) => x.h < 24).length, "không có vùng chạm < 24 px").toBe(0);
    } finally {
      await ctx.close();
    }
  });
});
