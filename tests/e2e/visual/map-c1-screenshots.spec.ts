import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { createSubmittedOrg, loginAdminWithMfa, revokeAdmin } from "../fixtures/admin";
import { accessTokenOf, addMember, adminPatch, createSite, rpcAs, seedSensitive } from "../fixtures/orgs";
import { createConfirmedUser, createOrgFor, loginAs, type TestUser } from "../fixtures/users";

/**
 * Ảnh chụp "trước/sau" cho cổng C1 bản đồ (docs/uat/C1-map-comprehension.md): mỗi màn có bản đồ, desktop
 * 1440 × 900 và điện thoại 390 × 844. Chỉ chạy khi đặt MAP_C1_SHOTS=before|after (project desktop):
 *
 *   MAP_C1_SHOTS=after node scripts/with-test-lock.mjs pnpm test:e2e tests/e2e/visual/map-c1-screenshots.spec.ts --project=desktop
 *
 * Mỗi kịch bản dựng dữ liệu riêng ở một khu vực riêng (bán kính nhỏ) để bản đồ không lẫn dữ liệu của bài test
 * khác; tên cửa hàng/tổ chức là tên hư cấu, không hậu tố, để ảnh dễ đọc. Cuối kịch bản các tổ chức được tạm
 * ngưng (không còn là ứng viên của lần chạy sau).
 */
const PHASE = process.env.MAP_C1_SHOTS;
// MAP_C1_DIR: chụp vào thư mục khác (thử nhanh trên `next dev` bằng E2E_BASE_URL), không ghi đè ảnh trong docs/
const DIR =
  process.env.MAP_C1_DIR ?? (PHASE ? path.join("docs", "uat", "screenshots", "map-c1", PHASE) : null);

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

type Lot = { title: string; category: string; quantity: number; hoursLeft: number; unit?: string };
type Org = {
  user: TestUser;
  org: { id: string; name: string };
  site: { id: string; name: string };
  token: () => Promise<string>;
};
type StoreLot = Org & { offerId: string; title: string };

/** Điểm cách `c` một quãng `km` theo hướng `bearing` độ (xấp xỉ phẳng — đủ cho vài km). */
function offset(c: { lat: number; lng: number }, km: number, bearing: number) {
  const rad = (bearing * Math.PI) / 180;
  const round = (x: number) => Math.round(x * 1e6) / 1e6;
  return {
    lat: round(c.lat + (km * Math.cos(rad)) / 111.32),
    lng: round(c.lng + (km * Math.sin(rad)) / (111.32 * Math.cos((c.lat * Math.PI) / 180))),
  };
}

async function makeCharity(
  name: string,
  siteName: string,
  at: { lat: number; lng: number },
  opts: { radiusKm?: number; visibility?: "public" | "approximate"; fullName?: string } = {},
): Promise<Org> {
  const user = await createConfirmedUser({ prefix: "c1-charity", fullName: opts.fullName ?? "Võ Thị Hạnh" });
  const org = await createOrgFor(user, { kind: "charity", status: "approved", name });
  const site = await createSite(org.id, { name: siteName, ...at, address: "8 Võ Văn Ngân" });
  await adminPatch(`sites?id=eq.${site.id}`, {
    radius_km: opts.radiusKm ?? 3,
    ...(opts.visibility ? { visibility: opts.visibility } : {}),
  });
  return { user, org, site, token: () => accessTokenOf(user) };
}

async function makeStore(
  name: string,
  at: { lat: number; lng: number },
  lot: Lot,
  visibility: "public" | "approximate" = "public",
): Promise<StoreLot> {
  const user = await createConfirmedUser({ prefix: "c1-store", fullName: "Chị Thu Lan" });
  const org = await createOrgFor(user, { kind: "store", status: "approved", name });
  const site = await createSite(org.id, { name: "Chi nhánh chính", ...at, address: "45 Pasteur" });
  if (visibility !== "public") await adminPatch(`sites?id=eq.${site.id}`, { visibility });
  const token = await accessTokenOf(user);
  const now = Date.now();
  const offerId = await rpcAs<string>(token, "create_offer", {
    p_payload: {
      site_id: site.id,
      category_code: lot.category,
      title: lot.title,
      quantity: lot.quantity,
      ...(lot.unit ? { unit: lot.unit } : {}),
      expiry: { datetime: new Date(now + (lot.hoursLeft + 2) * 3_600_000).toISOString() },
      pickup_start: new Date(now - 10 * 60_000).toISOString(),
      pickup_end: new Date(now + lot.hoursLeft * 3_600_000).toISOString(),
    },
    p_client_op_id: randomUUID(),
  });
  await rpcAs(token, "publish_offer", {
    p_offer_id: offerId,
    p_safety_attested: true,
    p_client_op_id: randomUUID(),
  });
  return { user, org, site, token: () => Promise.resolve(token), offerId, title: lot.title };
}

/** Tổ chức xin nhận toàn bộ lô + cửa hàng xác nhận ⇒ phân bổ `confirmed` (lô biến khỏi kho tặng). */
async function confirmAll(charity: Org, store: StoreLot, qty: number): Promise<string> {
  const req = await rpcAs<{ allocation_id: string; status: string }>(await charity.token(), "request_offer", {
    p_offer_id: store.offerId,
    p_qty: qty,
    p_charity_site_id: charity.site.id,
    p_client_op_id: randomUUID(),
  });
  if (req.status === "requested")
    await rpcAs(await store.token(), "confirm_allocation", {
      p_allocation_id: req.allocation_id,
      p_client_op_id: randomUUID(),
    });
  return req.allocation_id;
}

async function addVolunteer(charity: Org, fullName: string, base: { lat: number; lng: number }) {
  const user = await createConfirmedUser({ prefix: "c1-vol", fullName });
  await addMember(charity.org.id, user, "volunteer");
  await rpcAs(await accessTokenOf(user), "upsert_volunteer_profile", {
    p_payload: { vehicle: "motorbike", capacity_kg: 30, lat: base.lat, lng: base.lng },
  });
  return user;
}

/** Tạm ngưng: lô/nhu cầu của các tổ chức này không còn hiện ở lần chạy sau. */
async function retire(orgs: { org: { id: string } }[]) {
  if (orgs.length === 0) return;
  await adminPatch(`organizations?id=in.(${orgs.map((o) => o.org.id).join(",")})`, {
    is_paused: true,
    paused_reason: "E2E: dọn dữ liệu ảnh chụp bản đồ C1",
  }).catch(() => undefined);
}

/** Lần chạy trước bị dừng giữa chừng: tạm ngưng cửa hàng cùng tên còn lô quanh điểm nhận mới. */
async function retireLeftovers(charity: Org, names: string[]) {
  const lots = await rpcAs<{ store_org_id: string; store_name: string }[]>(
    await charity.token(),
    "marketplace_offers",
    { p_charity_site_id: charity.site.id },
  ).catch(() => []);
  const ids = [...new Set(lots.filter((l) => names.includes(l.store_name)).map((l) => l.store_org_id))];
  if (ids.length > 0) await retire(ids.map((id) => ({ org: { id } })));
}

/** Chờ canvas + ít nhất một marker (nút) trong vùng bản đồ, rồi chờ tile vẽ xong. */
async function settle(page: Page, region: Locator) {
  await expect(region).toBeVisible({ timeout: 30_000 });
  await expect(region.locator("canvas.maplibregl-canvas")).toBeVisible({ timeout: 30_000 });
  await expect(region.locator(".maplibregl-marker").first()).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(2_500);
}

/** Ảnh khung nhìn; `scroll` ⇒ đưa đầu vùng bản đồ xuống dưới thanh đầu trang (~88 px). */
async function snap(page: Page, region: Locator, file: string, scroll = true) {
  if (scroll)
    await region.evaluate((el) => {
      const top = el.getBoundingClientRect().top + window.scrollY - 88;
      window.scrollTo(0, Math.max(0, top));
    });
  else await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(800);
  mkdirSync(DIR!, { recursive: true });
  await page.screenshot({ path: path.join(DIR!, file) });
}

/** Desktop rồi điện thoại (tải lại ở cỡ điện thoại để bản đồ vừa khung đúng cỡ). */
async function both(
  page: Page,
  name: string,
  region: () => Locator,
  opts: { mobileSetup?: () => Promise<void>; scrollDesktop?: boolean; scrollMobile?: boolean } = {},
) {
  await page.setViewportSize(DESKTOP);
  await settle(page, region());
  await snap(page, region(), `${name}-desktop.png`, opts.scrollDesktop ?? true);
  // Bản đồ nằm dưới nửa màn hình đầu ⇒ thêm một ảnh cuộn tới bản đồ (cùng cách chụp với ảnh "trước" ở trên)
  if (opts.scrollDesktop === false) await snap(page, region(), `${name}-ban-do-desktop.png`, true);
  await page.setViewportSize(MOBILE);
  await page.reload();
  await opts.mobileSetup?.();
  await settle(page, region());
  await snap(page, region(), `${name}-mobile.png`, opts.scrollMobile ?? true);
  await page.setViewportSize(DESKTOP);
}

const THU_DUC = { lat: 10.8496, lng: 106.7717 };
const GO_VAP = { lat: 10.838, lng: 106.665 };
const THAO_DIEN = { lat: 10.804, lng: 106.737 };
const QUAN_7 = { lat: 10.7295, lng: 106.721 };

test.describe("Ảnh chụp bản đồ C1 (trước/sau)", () => {
  test.skip(!DIR, "Đặt MAP_C1_SHOTS=before|after (hoặc MAP_C1_DIR) để chụp ảnh");
  test.setTimeout(420_000);
  test.beforeEach(async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "Chỉ chạy một lần (project desktop)");
    // Ảnh ổn định: không chụp giữa animation (vòng tỏa lô Đỏ, flyTo)
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("kho tặng: cửa hàng theo nhãn, cụm, vị trí gần đúng", async ({ page }) => {
    const charity = await makeCharity("Bếp ăn Hy Vọng", "Bếp chính Thủ Đức", THU_DUC);
    const names = [
      "Tiệm bánh Hạt Lúa",
      "Bếp cơm Nhà Mơ",
      "Sữa Đồng Xanh",
      "Bánh mì Phố Mới",
      "Bánh ngọt Mây Hồng",
      "Cơm tấm Cô Ba",
    ];
    await retireLeftovers(charity, names);
    const stores = await Promise.all([
      makeStore(names[0]!, offset(THU_DUC, 0.8, 10), {
        title: "Bánh mì ổ nướng trong ngày",
        category: "bread",
        quantity: 30,
        hoursLeft: 2,
      }),
      makeStore(names[1]!, offset(THU_DUC, 1.4, 265), {
        title: "Cơm hộp gà xối mỡ",
        category: "cooked_meal",
        quantity: 24,
        hoursLeft: 8,
      }),
      makeStore(names[2]!, offset(THU_DUC, 1.1, 140), {
        title: "Sữa tươi tiệt trùng 180 ml",
        category: "dairy",
        quantity: 48,
        hoursLeft: 100,
      }),
      makeStore(
        names[3]!,
        offset(THU_DUC, 1.6, 55),
        { title: "Bánh mì que", category: "bread", quantity: 40, hoursLeft: 3 },
        "approximate",
      ),
      // Hai cửa hàng sát nhau ⇒ thành cụm ở mức thu phóng ban đầu
      makeStore(names[4]!, offset(THU_DUC, 2.1, 320), {
        title: "Bánh bông lan",
        category: "pastry",
        quantity: 16,
        hoursLeft: 9,
      }),
      makeStore(names[5]!, offset(THU_DUC, 2.2, 323), {
        title: "Cơm tấm sườn",
        category: "cooked_meal",
        quantity: 12,
        hoursLeft: 3,
      }),
    ]);
    try {
      await loginAs(page, charity.user, "/charity/donations");
      await page.goto("/charity/donations");
      const region = () => page.getByRole("region", { name: /Bản đồ kho tặng/ });
      await both(page, "kho-tang", region, {
        scrollDesktop: false,
        mobileSetup: () => page.getByRole("button", { name: "Bản đồ", exact: true }).click(),
      });
      // Điện thoại: "Xem trên bản đồ" ở thẻ lô ⇒ bản đồ bay tới cửa hàng, thẻ lô nổi trong khung bản đồ
      await page.setViewportSize(MOBILE);
      await page.reload();
      // Lần trước đã chuyển sang "Bản đồ" (giữ trong URL) ⇒ về "Danh sách" để bấm "Xem trên bản đồ" ở thẻ lô
      await page.getByRole("button", { name: /^Danh sách/ }).click();
      await page
        .getByRole("article", { name: /Bánh mì ổ nướng trong ngày/ })
        .getByRole("button", { name: "Xem trên bản đồ" })
        .click();
      await expect(page.getByRole("region", { name: `Lô của ${names[0]}` })).toBeVisible();
      await settle(page, region());
      await snap(page, region(), "kho-tang-chon-mobile.png");
      await page.setViewportSize(DESKTOP);
    } finally {
      await retire([charity, ...stores]);
    }
  });

  test("phương án ghép 50 ổ = 20 + 18 + 12, nhu cầu gần bạn, phương án đã chọn", async ({ page }) => {
    const charity = await makeCharity("Mái ấm Nắng Mai", "Bếp Nắng Mai", GO_VAP, {
      radiusKm: 2,
      visibility: "approximate",
    });
    const names = ["Tiệm bánh Hoa Sữa", "Lò bánh Mặt Trời", "Bánh mì Phố Xanh", "Bánh mì Bình Minh"];
    await retireLeftovers(charity, names);
    const [a, b, c, d] = await Promise.all([
      makeStore(names[0]!, offset(GO_VAP, 0.5, 40), {
        title: "Bánh mì ổ Hoa Sữa",
        category: "bread",
        quantity: 20,
        hoursLeft: 3,
      }),
      makeStore(names[1]!, offset(GO_VAP, 0.7, 95), {
        title: "Bánh mì ổ Mặt Trời",
        category: "bread",
        quantity: 18,
        hoursLeft: 6,
      }),
      makeStore(
        names[2]!,
        offset(GO_VAP, 0.9, 140),
        { title: "Bánh mì ổ Phố Xanh", category: "bread", quantity: 12, hoursLeft: 7 },
        "approximate",
      ),
      makeStore(names[3]!, offset(GO_VAP, 1.6, 270), {
        title: "Bánh mì ổ Bình Minh",
        category: "bread",
        quantity: 25,
        hoursLeft: 7,
      }),
    ]);
    try {
      const needId = await rpcAs<string>(await charity.token(), "publish_need", {
        p_site_id: charity.site.id,
        p_category_codes: ["bread"],
        p_unit: "loaf",
        p_quantity: 50,
        p_needed_by: new Date(Date.now() + 5 * 3_600_000).toISOString(),
        p_people_to_serve: 45,
        p_note: null,
        p_client_op_id: randomUUID(),
      });

      // Cửa hàng A: "Nhu cầu gần bạn"
      await loginAs(page, a!.user, "/store/connect");
      await page.goto("/store/connect");
      await both(
        page,
        "nhu-cau-gan-ban",
        () => page.getByRole("region", { name: /Bản đồ nhu cầu gần bạn/ }),
        {
          scrollDesktop: false,
          mobileSetup: () => page.getByRole("button", { name: "Bản đồ", exact: true }).click(),
        },
      );
      await page.context().clearCookies();

      // Tổ chức: so sánh phương án
      await loginAs(page, charity.user, `/charity/needs/${needId}`);
      await page.goto(`/charity/needs/${needId}`);
      const plan1 = page.getByRole("article", { name: "Phương án 1", exact: true });
      await expect(plan1).toContainText("Đáp ứng 50/50", { timeout: 45_000 });
      await both(page, "phuong-an-ghep", () => page.getByRole("region", { name: /Bản đồ phương án 1/ }));

      // Chọn phương án 1 ⇒ "Phương án đã chọn" (bản đồ tuyến)
      await plan1.getByRole("button", { name: "Chọn phương án này" }).click();
      await expect(page.getByRole("region", { name: "Phương án đã chọn", exact: true })).toBeVisible({
        timeout: 45_000,
      });
      await both(page, "phuong-an-da-chon", () =>
        page.getByRole("region", { name: /Bản đồ phương án đã chọn/ }),
      );
    } finally {
      await retire([charity, a!, b!, c!, d!]);
    }
  });

  test("điều phối chuyến (vị trí TNV) và màn chuyến của TNV", async ({ page }) => {
    const charity = await makeCharity("Bếp ăn Tình Thương", "Bếp Thảo Điền", THAO_DIEN);
    const stores = await Promise.all([
      makeStore("Tiệm bánh Lúa Mới", offset(THAO_DIEN, 1.0, 20), {
        title: "Bánh mì sandwich",
        category: "bread",
        quantity: 20,
        hoursLeft: 3,
        unit: "loaf",
      }),
      makeStore("Bếp cơm Chị Hai", offset(THAO_DIEN, 1.5, 75), {
        title: "Cơm hộp chay",
        category: "cooked_meal",
        quantity: 15,
        hoursLeft: 6,
      }),
      makeStore("Bánh bao Phúc Ký", offset(THAO_DIEN, 1.2, 130), {
        title: "Bánh bao nhân thịt",
        category: "bread",
        quantity: 25,
        hoursLeft: 5,
      }),
    ]);
    const volunteer = await addVolunteer(charity, "Nguyễn Minh An", offset(THAO_DIEN, 0.5, 300));
    try {
      const allocs = await Promise.all([
        confirmAll(charity, stores[0]!, 20),
        confirmAll(charity, stores[1]!, 15),
        confirmAll(charity, stores[2]!, 25),
      ]);
      const pickupId = await rpcAs<string>(await charity.token(), "assign_pickup", {
        p_plan: {
          allocation_ids: allocs,
          mode: "volunteer",
          assignee_user_id: volunteer.id,
          charity_site_id: charity.site.id,
        },
        p_client_op_id: randomUUID(),
      });
      const vToken = await accessTokenOf(volunteer);
      await rpcAs(vToken, "respond_pickup", {
        p_pickup_id: pickupId,
        p_accept: true,
        p_reason: null,
        p_client_op_id: randomUUID(),
      });
      await rpcAs(vToken, "start_pickup", { p_pickup_id: pickupId, p_client_op_id: randomUUID() });
      // Vị trí mới nhất của TNV (dựng trực tiếp bằng service role — luồng đồng ý + gửi vị trí có E2E riêng)
      const first = offset(THAO_DIEN, 0.6, 30);
      await adminPatch(`pickups?id=eq.${pickupId}`, {
        last_location: `SRID=4326;POINT(${first.lng} ${first.lat})`,
        last_location_at: new Date(Date.now() - 3 * 60_000).toISOString(),
        last_location_accuracy_m: 20,
      });

      await loginAs(page, charity.user, `/charity/pickups/${pickupId}`);
      await page.goto(`/charity/pickups/${pickupId}`);
      await expect(page.getByText(/Vị trí gần đúng của/).first()).toBeVisible({ timeout: 40_000 });
      await both(page, "dieu-phoi-chuyen", () => page.getByRole("region", { name: /Bản đồ điều phối/ }), {
        scrollDesktop: false,
        scrollMobile: true,
      });
      await page.context().clearCookies();

      await loginAs(page, volunteer, `/volunteer/trips/${pickupId}`);
      await page.goto(`/volunteer/trips/${pickupId}`);
      await both(page, "chuyen-tnv", () => page.getByRole("region", { name: /Bản đồ chuyến/ }));
    } finally {
      await retire([charity, ...stores]);
    }
  });

  test("lập chuyến chia 2 tuyến và chuyến tự đến lấy", async ({ page }) => {
    const charity = await makeCharity("Nhà mở Ánh Dương", "Điểm nhận Phú Mỹ", QUAN_7);
    const stores = await Promise.all([
      makeStore("Tiệm bánh Sao Mai", offset(QUAN_7, 1.0, 10), {
        title: "Bánh mì hoa cúc",
        category: "bread",
        quantity: 20,
        hoursLeft: 5,
      }),
      makeStore("Lò bánh Gạo Thơm", offset(QUAN_7, 1.3, 40), {
        title: "Bánh mì gối",
        category: "bread",
        quantity: 18,
        hoursLeft: 6,
      }),
      makeStore("Bánh ngọt Hạnh Nhân", offset(QUAN_7, 1.2, 220), {
        title: "Bánh su kem",
        category: "pastry",
        quantity: 12,
        hoursLeft: 6,
      }),
    ]);
    await addVolunteer(charity, "Lê Minh Khoa", offset(QUAN_7, 1.5, 20));
    await addVolunteer(charity, "Trần Thảo Vy", offset(QUAN_7, 1.5, 220));
    try {
      await Promise.all([
        confirmAll(charity, stores[0]!, 20),
        confirmAll(charity, stores[1]!, 18),
        confirmAll(charity, stores[2]!, 12),
      ]);
      await loginAs(page, charity.user, "/charity/pickups");
      await page.goto("/charity/pickups");
      const planner = page.getByRole("region", { name: `Giao về ${charity.site.name}` });
      await planner.getByRole("radio", { name: "Tình nguyện viên" }).click();
      await planner.getByRole("checkbox", { name: /Lê Minh Khoa/ }).check();
      await planner.getByRole("checkbox", { name: /Trần Thảo Vy/ }).check();
      const region = () => page.getByRole("region", { name: /Bản đồ phương án: 2 tuyến/ });
      await page.setViewportSize(DESKTOP);
      await settle(page, region());
      await snap(page, region(), "chia-tuyen-desktop.png");
      await page.setViewportSize(MOBILE);
      await page.waitForTimeout(1_500);
      await snap(page, region(), "chia-tuyen-mobile.png");
      await page.setViewportSize(DESKTOP);

      // Chuyến tự đến lấy (TripView)
      await planner.getByRole("radio", { name: /Tự đến lấy/ }).click();
      await page.getByRole("button", { name: "Tạo chuyến tự đến lấy" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Chuyến tự đến lấy" })).toBeVisible({
        timeout: 30_000,
      });
      await both(page, "chuyen-tu-lay", () => page.getByRole("region", { name: /Bản đồ chuyến/ }), {
        scrollDesktop: false,
      });
    } finally {
      await retire([charity, ...stores]);
    }
  });

  test("bộ chọn vị trí (sửa điểm nhận) và bản đồ vị trí ở trang duyệt hồ sơ", async ({ page }) => {
    const owner = await createConfirmedUser({ prefix: "c1-loc", fullName: "Võ Thị Hạnh" });
    const org = await createOrgFor(owner, { kind: "charity", status: "approved", name: "Bếp ăn Nắng Mai" });
    await seedSensitive(org.id, { legal_name: "Bếp ăn Nắng Mai", registration_no: "QĐ 12/2019" });
    await createSite(org.id, { name: "Bếp chính" });
    await loginAs(page, owner, "/charity/settings?tab=sites");
    await page.goto("/charity/settings?tab=sites");
    await page.getByRole("button", { name: /Sửa thông tin điểm/ }).click();
    const picker = () => page.getByRole("region", { name: /Bản đồ chọn vị trí/ });
    await page.setViewportSize(DESKTOP);
    await settle(page, picker());
    await snap(page, picker(), "chon-vi-tri-desktop.png");
    await page.setViewportSize(MOBILE);
    await page.waitForTimeout(1_500);
    await snap(page, picker(), "chon-vi-tri-mobile.png");
    await page.setViewportSize(DESKTOP);
    await page.context().clearCookies();

    const submitter = await createConfirmedUser({ prefix: "c1-sub", fullName: "Nguyễn Thị Thu Lan" });
    const submitted = await createSubmittedOrg(submitter, { kind: "store", name: "Tiệm bánh Hạt Dẻ" });
    const { admin } = await loginAdminWithMfa(page);
    try {
      await page.goto(`/admin/reviews/${submitted.id}`);
      await both(page, "admin-vi-tri-diem", () => page.getByRole("region", { name: /Bản đồ vị trí/ }));
    } finally {
      await revokeAdmin(admin);
    }
  });
});
