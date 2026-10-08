import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import type { Page, TestInfo } from "@playwright/test";

import { parseEwkbPoint } from "../../../src/features/pickups/geo";
import { accessTokenOf, addMember, createSite, rpcAs, seedSensitive } from "../fixtures/orgs";
import {
  createConfirmedUser,
  createOrgFor,
  serviceKey,
  SUPABASE_URL,
  type TestUser,
} from "../fixtures/users";

/**
 * Chuyến TÌNH NGUYỆN VIÊN thật bằng RPC (Supabase LOCAL): cửa hàng đăng + công bố lô, tổ chức xin nhận, cửa hàng
 * xác nhận, điều phối viên tạo chuyến `volunteer` giao cho một TNV đã là thành viên ⇒ chuyến `assigned` với một điểm
 * lấy và một điểm giao về. Chỉ tổ chức/điểm/thành viên dựng bằng service role; mọi chuyển trạng thái qua RPC của
 * đúng người dùng (DATA-MODEL §6.5).
 */

export const STORE_POS = { lat: 10.7725, lng: 106.698 };
export const CHARITY_POS = { lat: 10.7801, lng: 106.6992 };

export type VolunteerScenario = {
  store: TestUser;
  charity: TestUser;
  volunteer: TestUser;
  storeName: string;
  charityName: string;
  offerTitle: string;
  qty: number;
  allocationId: string;
  pickupId: string;
  pickupStopId: string;
  dropoffStopId: string;
};

const minutes = (n: number) => new Date(Date.now() + n * 60_000).toISOString();

export async function serviceGet<T>(path: string): Promise<T> {
  const key = serviceKey();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

export async function createVolunteerTripScenario(
  opts: { tag?: string; qty?: number; volunteer?: TestUser } = {},
): Promise<VolunteerScenario> {
  const qty = opts.qty ?? 20;
  const tag = opts.tag ?? "vol";

  const store = await createConfirmedUser({ prefix: `vol-store-${tag}`, fullName: "Chị Thu Lan" });
  const charity = await createConfirmedUser({ prefix: `vol-charity-${tag}`, fullName: "Cô Võ Thị Hạnh" });
  const volunteer =
    opts.volunteer ?? (await createConfirmedUser({ prefix: `vol-tnv-${tag}`, fullName: "Nguyễn Minh An" }));
  const storeOrg = await createOrgFor(store, { kind: "store", status: "approved" });
  const charityOrg = await createOrgFor(charity, { kind: "charity", status: "approved" });
  await seedSensitive(storeOrg.id, { contact_phone: "0901234567" });
  await seedSensitive(charityOrg.id, { contact_phone: "0912345678" });
  if (!opts.volunteer) await addMember(charityOrg.id, volunteer, "volunteer");
  const storeSite = await createSite(storeOrg.id, { name: "Chi nhánh Bến Thành", ...STORE_POS });
  const charitySite = await createSite(charityOrg.id, {
    name: "Bếp chính",
    ...CHARITY_POS,
    address: "45 Nguyễn Huệ",
  });

  const storeToken = await accessTokenOf(store);
  const charityToken = await accessTokenOf(charity);
  const offerTitle = `Bánh mì sandwich ${tag}`;

  const offerId = await rpcAs<string>(storeToken, "create_offer", {
    p_payload: {
      site_id: storeSite.id,
      category_code: "bread",
      title: offerTitle,
      quantity: qty,
      unit: "loaf",
      unit_weight_kg: 0.12,
      expiry: { datetime: minutes(24 * 60) },
      pickup_start: minutes(-5),
      pickup_end: minutes(180),
    },
    p_client_op_id: randomUUID(),
  });
  await rpcAs(storeToken, "publish_offer", {
    p_offer_id: offerId,
    p_safety_attested: true,
    p_client_op_id: randomUUID(),
  });
  const req = await rpcAs<{ allocation_id: string; status: string }>(charityToken, "request_offer", {
    p_offer_id: offerId,
    p_qty: qty,
    p_charity_site_id: charitySite.id,
    p_client_op_id: randomUUID(),
  });
  if (req.status === "requested") {
    await rpcAs(storeToken, "confirm_allocation", {
      p_allocation_id: req.allocation_id,
      p_client_op_id: randomUUID(),
    });
  }

  // Điều phối viên giao chuyến cho TNV (US-CHA-16 — assign_pickup mode volunteer)
  const pickupId = await rpcAs<string>(charityToken, "assign_pickup", {
    p_plan: {
      allocation_ids: [req.allocation_id],
      mode: "volunteer",
      assignee_user_id: volunteer.id,
      charity_site_id: charitySite.id,
      planned_start_at: minutes(10),
    },
    p_client_op_id: randomUUID(),
  });
  const stops = await serviceGet<{ id: string; kind: string }[]>(
    `pickup_stops?select=id,kind&pickup_id=eq.${pickupId}`,
  );

  return {
    store,
    charity,
    volunteer,
    storeName: storeOrg.name,
    charityName: charityOrg.name,
    offerTitle,
    qty,
    allocationId: req.allocation_id,
    pickupId,
    pickupStopId: stops.find((s) => s.kind === "pickup")!.id,
    dropoffStopId: stops.find((s) => s.kind === "dropoff")!.id,
  };
}

/** TNV nhận + bắt đầu chuyến qua RPC (dựng nhanh trạng thái `in_progress` cho các ca không thử luồng này). */
export async function acceptAndStart(s: VolunteerScenario) {
  const token = await accessTokenOf(s.volunteer);
  await rpcAs(token, "respond_pickup", {
    p_pickup_id: s.pickupId,
    p_accept: true,
    p_reason: "",
    p_client_op_id: randomUUID(),
  });
  await rpcAs(token, "start_pickup", { p_pickup_id: s.pickupId, p_client_op_id: randomUUID() });
}

export async function pickupOf(pickupId: string) {
  const [row] = await serviceGet<
    {
      status: string;
      assignee_user_id: string | null;
      last_location: string | null;
      accepted_at: string | null;
    }[]
  >(`pickups?select=status,assignee_user_id,last_location,accepted_at&id=eq.${pickupId}`);
  return { ...row!, lastLocation: parseEwkbPoint(row!.last_location) };
}

export async function stopOf(stopId: string) {
  const [row] = await serviceGet<
    { status: string; arrival_check: string | null; arrival_note: string | null }[]
  >(`pickup_stops?select=status,arrival_check,arrival_note&id=eq.${stopId}`);
  return row!;
}

export async function handoverIdOf(stopId: string): Promise<string> {
  const [row] = await serviceGet<{ id: string }[]>(`handovers?select=id&stop_id=eq.${stopId}`);
  if (!row) throw new Error(`Chưa có handover cho điểm ${stopId}`);
  return row.id;
}

export async function consentsOf(userId: string) {
  return serviceGet<
    { purpose: string; withdrawn_at: string | null; policy_version: string; source: string }[]
  >(
    `consents?select=purpose,withdrawn_at,policy_version,source&user_id=eq.${userId}&purpose=eq.location_trip`,
  );
}

export async function volunteerProfileOf(userId: string) {
  const [row] = await serviceGet<
    {
      vehicle: string;
      capacity_kg: number;
      base_area: string | null;
      base_area_label: string | null;
      availability_note: string | null;
    }[]
  >(
    `volunteer_profiles?select=vehicle,capacity_kg,base_area,base_area_label,availability_note&user_id=eq.${userId}`,
  );
  return row ? { ...row, area: parseEwkbPoint(row.base_area) } : null;
}

/** Cho phép vị trí + đặt toạ độ giả cho trang (Chromium). */
export async function setPhonePosition(page: Page, pos: { lat: number; lng: number }, accuracy = 8) {
  await page.context().grantPermissions(["geolocation"]);
  await page.context().setGeolocation({ latitude: pos.lat, longitude: pos.lng, accuracy });
}

/**
 * Ảnh chụp màn hình để duyệt giao diện: `VOL_SHOTS_DIR` (thư mục scratchpad của phiên) nếu có, ngược lại vào thư
 * mục kết quả của test. Ảnh mobile tên `volunteer-<tên>.png`, desktop thêm hậu tố `-desktop`.
 */
export async function shot(page: Page, testInfo: TestInfo, name: string, fullPage = true) {
  const dir = process.env.VOL_SHOTS_DIR;
  const file = `volunteer-${name}${testInfo.project.name === "mobile" ? "" : `-${testInfo.project.name}`}.png`;
  if (dir) mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: dir ? join(dir, file) : testInfo.outputPath(file), fullPage });
}
