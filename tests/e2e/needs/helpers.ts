import { randomUUID } from "node:crypto";

import type { TestInfo } from "@playwright/test";

import { accessTokenOf, adminPatch, createSite, rpcAs } from "../fixtures/orgs";
import {
  createConfirmedUser,
  createOrgFor,
  serviceKey,
  SUPABASE_URL,
  uniqueSuffix,
  type TestUser,
} from "../fixtures/users";

/**
 * Dựng "thế giới 50 bánh" cho E2E nhu cầu (Supabase LOCAL): tổ chức + điểm nhận (gần đúng, bán kính 2 km) và
 * 4 cửa hàng có lô bánh mì đăng qua RPC thật (`create_offer` → `publish_offer`).
 *
 * Cô lập: mỗi (project, bài test) một ô cố định cách nhau ~5,5 km, ở Thủ Dầu Một/Thuận An — xa khu Bến Thành
 * mà các bài E2E khác dùng (> 15 km, ngoài mọi bán kính 5 km của họ), nên lô của bài này không lọt vào ghép
 * đơn của bài khác và ngược lại. Cuối bài, mọi cửa hàng của thế giới được tạm ngưng (không còn là ứng viên).
 */

export const PREFIX = "E2E Nhu cầu";

const BASE = { lat: 10.93, lng: 106.64 };
const SLOT_STEP = 0.05; // ~5,5 km

/** Ô của (project, bài test): desktop 0–3, mobile 4–7. Lệch nhỏ ngẫu nhiên để toạ độ không nằm trên lưới 0,005°. */
export function worldCenter(info: TestInfo, testIndex: number): { lat: number; lng: number } {
  const slot = (info.project.name === "mobile" ? 4 : 0) + testIndex;
  const jitter = () => 0.0011 + Math.random() * 0.0017;
  return {
    lat: round6(BASE.lat + SLOT_STEP * (slot % 4) + jitter()),
    lng: round6(BASE.lng + SLOT_STEP * Math.floor(slot / 4) + jitter()),
  };
}

function round6(x: number): number {
  return Math.round(x * 1e6) / 1e6;
}

/** Điểm cách `c` một quãng `km` theo hướng `bearing` độ (xấp xỉ phẳng — đủ cho vài km). */
export function offset(c: { lat: number; lng: number }, km: number, bearing: number) {
  const rad = (bearing * Math.PI) / 180;
  const dLat = (km * Math.cos(rad)) / 111.32;
  const dLng = (km * Math.sin(rad)) / (111.32 * Math.cos((c.lat * Math.PI) / 180));
  return { lat: round6(c.lat + dLat), lng: round6(c.lng + dLng) };
}

export type Store = {
  key: string;
  owner: TestUser;
  org: { id: string; name: string };
  site: { id: string; name: string };
  offerId: string;
  title: string;
  token: string;
};

export type Charity = {
  user: TestUser;
  org: { id: string; name: string };
  site: { id: string; name: string };
  at: { lat: number; lng: number };
  token: () => Promise<string>;
};

export async function setupCharityAt(at: { lat: number; lng: number }): Promise<Charity> {
  const suffix = uniqueSuffix();
  const user = await createConfirmedUser({ prefix: "needs", fullName: "Điều Phối Viên Nhu Cầu" });
  const org = await createOrgFor(user, {
    kind: "charity",
    status: "approved",
    name: `Mái ấm Nắng Mai ${suffix}`,
  });
  const site = await createSite(org.id, { name: `Bếp Nắng Mai ${suffix}`, ...at, address: "8 Đường Số 1" });
  // Điểm nhận gần đúng (mặc định của tổ chức) + bán kính 2 km: cô lập thế giới của bài test
  await adminPatch(`sites?id=eq.${site.id}`, { visibility: "approximate", radius_km: 2 });
  return { user, org, site, at, token: () => accessTokenOf(user) };
}

export async function setupStoreAt(
  key: string,
  at: { lat: number; lng: number },
  opts: {
    quantity: number;
    hoursLeft: number;
    visibility?: "public" | "approximate" | "hidden";
    name: string;
  },
): Promise<Store> {
  const suffix = uniqueSuffix();
  const owner = await createConfirmedUser({ prefix: `store${key}`, fullName: `Chủ Tiệm ${key}` });
  const org = await createOrgFor(owner, {
    kind: "store",
    status: "approved",
    name: `${PREFIX} ${opts.name} ${suffix}`,
  });
  const site = await createSite(org.id, {
    name: `Chi nhánh ${key}`,
    ...at,
    address: `${key} Đại lộ Bình Dương`,
  });
  if (opts.visibility && opts.visibility !== "public")
    await adminPatch(`sites?id=eq.${site.id}`, { visibility: opts.visibility });
  const token = await accessTokenOf(owner);
  const now = Date.now();
  const title = `Bánh mì ổ ${opts.name}`;
  const offerId = await rpcAs<string>(token, "create_offer", {
    p_payload: {
      site_id: site.id,
      category_code: "bread",
      title,
      quantity: opts.quantity,
      expiry: { datetime: new Date(now + (opts.hoursLeft + 2) * 3_600_000).toISOString() },
      pickup_start: new Date(now - 10 * 60_000).toISOString(),
      pickup_end: new Date(now + opts.hoursLeft * 3_600_000).toISOString(),
    },
    p_client_op_id: randomUUID(),
  });
  await rpcAs(token, "publish_offer", {
    p_offer_id: offerId,
    p_safety_attested: true,
    p_client_op_id: randomUUID(),
  });
  return { key, owner, org, site, offerId, title, token };
}

export type World = { charity: Charity; stores: Record<"A" | "B" | "C" | "D", Store> };

/**
 * Kịch bản PRD US-CHA-10 AC1: A 20 · B 18 · C 12 cụm phía đông (≤ 0,9 km), D 25 phía tây xa hơn (1,6 km).
 * C ở vị trí gần đúng (vẽ vùng mờ). A gấp nhất (bánh mì còn 3 giờ ⇒ Đỏ).
 */
export async function setupWorld(info: TestInfo, testIndex: number): Promise<World> {
  const at = worldCenter(info, testIndex);
  const charity = await setupCharityAt(at);
  await retireLeftovers(charity);
  const [A, B, C, D] = await Promise.all([
    setupStoreAt("A", offset(at, 0.5, 40), { quantity: 20, hoursLeft: 3, name: "Hoa Sữa" }),
    setupStoreAt("B", offset(at, 0.7, 95), { quantity: 18, hoursLeft: 6, name: "Mặt Trời" }),
    setupStoreAt("C", offset(at, 0.9, 140), {
      quantity: 12,
      hoursLeft: 7,
      name: "Phố Xanh",
      visibility: "approximate",
    }),
    setupStoreAt("D", offset(at, 1.6, 270), { quantity: 25, hoursLeft: 7, name: "Bình Minh" }),
  ]);
  return { charity, stores: { A: A!, B: B!, C: C!, D: D! } };
}

/**
 * Lần chạy trước bị dừng giữa chừng (không kịp afterEach) có thể để lại lô trong ô này: tạm ngưng các cửa hàng
 * E2E của bài này còn lô quanh điểm nhận mới (chỉ cửa hàng có tiền tố của bài — không đụng dữ liệu bài khác).
 */
async function retireLeftovers(charity: Charity): Promise<void> {
  const lots = await rpcAs<{ store_org_id: string; store_name: string }[]>(
    await charity.token(),
    "marketplace_offers",
    { p_charity_site_id: charity.site.id },
  ).catch(() => []);
  const ids = [...new Set(lots.filter((l) => l.store_name.startsWith(PREFIX)).map((l) => l.store_org_id))];
  if (ids.length === 0) return;
  await adminPatch(`organizations?id=in.(${ids.join(",")})`, {
    is_paused: true,
    paused_reason: "E2E: dọn dữ liệu sót của bài test nhu cầu",
  }).catch(() => undefined);
}

/** Tạm ngưng mọi cửa hàng của thế giới (cuối bài): lô của họ không còn là ứng viên của bài chạy sau. */
export async function retireWorld(world: World | null): Promise<void> {
  if (!world) return;
  // Cửa hàng (không còn là ứng viên) + tổ chức (nhu cầu không còn hiện ở "Nhu cầu gần bạn" của bài sau)
  const ids = [...Object.values(world.stores).map((s) => s.org.id), world.charity.org.id];
  await adminPatch(`organizations?id=in.(${ids.join(",")})`, {
    is_paused: true,
    paused_reason: "E2E: dọn dữ liệu sau bài test nhu cầu",
  }).catch(() => undefined);
}

/** Đọc bằng service role (chỉ để kiểm kết quả trong DB). */
export async function serviceGet<T>(path: string): Promise<T> {
  const key = serviceKey();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

export async function allocationsOf(needId: string) {
  return serviceGet<{ offer_id: string; status: string; qty_reserved: number; bundle_id: string | null }[]>(
    `allocations?select=offer_id,status,qty_reserved,bundle_id&need_id=eq.${needId}&order=requested_at`,
  );
}

/** Đăng nhu cầu qua RPC thật (bài test phía cửa hàng). */
export async function publishNeedViaApi(
  charity: Charity,
  opts: { quantity: number; hours: number; people?: number },
): Promise<string> {
  return rpcAs<string>(await charity.token(), "publish_need", {
    p_site_id: charity.site.id,
    p_category_codes: ["bread"],
    p_unit: "loaf",
    p_quantity: opts.quantity,
    p_needed_by: new Date(Date.now() + opts.hours * 3_600_000).toISOString(),
    p_people_to_serve: opts.people ?? null,
    p_note: null,
    p_client_op_id: randomUUID(),
  });
}

/** Chuỗi → RegExp khớp nguyên văn. */
export function literal(text: string): RegExp {
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
}
