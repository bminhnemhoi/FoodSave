import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import type { Page, TestInfo } from "@playwright/test";

import {
  confirmViaApi,
  requestViaApi,
  setupCharity,
  setupStoreOffer,
  type CharitySetup,
  type StoreOffer,
} from "../charity/helpers";
import { accessTokenOf, addMember, rpcAs } from "../fixtures/orgs";
import { createConfirmedUser, serviceKey, SUPABASE_URL, type TestUser } from "../fixtures/users";

/**
 * Dựng dữ liệu cho E2E điều phối tình nguyện viên (Supabase LOCAL). Tổ chức/điểm/thành viên dựng bằng service
 * role như các fixture khác; mọi chuyển trạng thái (xin nhận, xác nhận, giao chuyến, check-in, bàn giao) đi qua
 * RPC thật dưới JWT của đúng người.
 */

export type Volunteer = { user: TestUser; token: () => Promise<string> };

export async function serviceGet<T>(path: string): Promise<T> {
  const key = serviceKey();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

/** Thành viên `volunteer` + hồ sơ (phương tiện, sức chở, khu vực gần đúng) qua RPC của chính TNV. */
export async function addVolunteer(
  charity: CharitySetup,
  opts: { name: string; base?: { lat: number; lng: number }; capacityKg?: number; area?: string },
): Promise<Volunteer> {
  const user = await createConfirmedUser({ prefix: "vol", fullName: opts.name });
  await addMember(charity.org.id, user, "volunteer");
  const token = await accessTokenOf(user);
  await rpcAs(token, "upsert_volunteer_profile", {
    p_payload: {
      vehicle: "motorbike",
      capacity_kg: opts.capacityKg ?? 25,
      ...(opts.base ? { lat: opts.base.lat, lng: opts.base.lng } : {}),
      ...(opts.area ? { base_area_label: opts.area } : {}),
    },
  });
  return { user, token: () => accessTokenOf(user) };
}

/** Lô đã được cửa hàng xác nhận cho tổ chức (qty mặc định 10). */
export async function confirmedLot(
  charity: CharitySetup,
  opts: { at: { lat: number; lng: number }; title?: string; qty?: number },
): Promise<{ store: StoreOffer; allocationId: string }> {
  const store = await setupStoreOffer({ at: opts.at, quantity: 30, title: opts.title, hoursLeft: 5 });
  const allocationId = await requestViaApi(charity, store.offerId, opts.qty ?? 10);
  await confirmViaApi(store, allocationId);
  return { store, allocationId };
}

/** Giao chuyến TNV qua RPC (dựng trạng thái — luồng giao bằng giao diện được test riêng). */
export async function assignViaApi(
  charity: CharitySetup,
  allocationIds: string[],
  volunteer: Volunteer,
): Promise<string> {
  return rpcAs<string>(await charity.token(), "assign_pickup", {
    p_plan: {
      allocation_ids: allocationIds,
      mode: "volunteer",
      assignee_user_id: volunteer.user.id,
      charity_site_id: charity.site.id,
    },
    p_client_op_id: randomUUID(),
  });
}

export type StopRow = {
  id: string;
  kind: "pickup" | "dropoff";
  seq: number;
  site_id: string;
  status: string;
};

export async function stopsOf(pickupId: string): Promise<StopRow[]> {
  return serviceGet<StopRow[]>(
    `pickup_stops?pickup_id=eq.${pickupId}&select=id,kind,seq,site_id,status&order=seq.asc`,
  );
}

/** TNV bắt đầu chuyến, hiện mã ở điểm lấy; cửa hàng nhập mã 6 số với đủ số lượng ⇒ hàng đã lấy. */
export async function pickUpAll(
  pickupId: string,
  volunteer: Volunteer,
  lots: { store: StoreOffer; allocationId: string; qty: number }[],
): Promise<void> {
  const vToken = await volunteer.token();
  await rpcAs(vToken, "start_pickup", { p_pickup_id: pickupId, p_client_op_id: randomUUID() });
  const stops = await stopsOf(pickupId);
  for (const lot of lots) {
    const stop = stops.find((s) => s.kind === "pickup" && s.site_id === lot.store.site.id)!;
    const [issued] = await rpcAs<{ handover_id: string; code: string }[]>(vToken, "issue_handover_token", {
      p_stop_id: stop.id,
      p_lines: [],
      p_client_op_id: randomUUID(),
    });
    await rpcAs(lot.store.token, "consume_handover_code", {
      p_handover_id: issued!.handover_id,
      p_code: issued!.code,
      p_lines: [{ allocation_id: lot.allocationId, qty: lot.qty, reason: null, note: null }],
      p_client_op_id: randomUUID(),
    });
  }
}

/** TNV mở mã giao về (mọi điểm lấy đã xong) ⇒ mã 6 số. */
export async function issueDropoffCode(pickupId: string, volunteer: Volunteer): Promise<string> {
  const stops = await stopsOf(pickupId);
  const dropoff = stops.find((s) => s.kind === "dropoff")!;
  const [issued] = await rpcAs<{ code: string }[]>(await volunteer.token(), "issue_handover_token", {
    p_stop_id: dropoff.id,
    p_lines: [],
    p_client_op_id: randomUUID(),
  });
  return issued!.code;
}

/**
 * Ảnh chụp màn hình cho báo cáo (chỉ khi đặt COORD_SHOTS_DIR): `<dir>/coordinator-<name>-<project>.png`.
 */
export async function shot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const dir = process.env.COORD_SHOTS_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({
    path: join(dir, `coordinator-${name}-${testInfo.project.name}.png`),
    fullPage: true,
  });
}

export { setupCharity, type CharitySetup, type StoreOffer };
