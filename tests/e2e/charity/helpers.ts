import { randomUUID } from "node:crypto";

import { accessTokenOf, createSite, rpcAs } from "../fixtures/orgs";
import { createConfirmedUser, createOrgFor, uniqueSuffix, type TestUser } from "../fixtures/users";

/**
 * Dựng dữ liệu cho E2E cổng Tổ chức (Supabase LOCAL): tổ chức + cửa hàng đã duyệt dựng bằng service role,
 * lô tặng tạo và đăng qua RPC thật dưới JWT của chủ cửa hàng (`create_offer` → `publish_offer`).
 * Mọi tên đều có hậu tố riêng vì nhiều bài test chạy song song trên cùng khu vực bản đồ.
 */

/** Chợ Bến Thành — điểm nhận của tổ chức thử. */
export const CHARITY_AT = { lat: 10.7725, lng: 106.698 };
/** ~850 m về phía bắc — trong bán kính mặc định 5 km, xe máy ~14 phút. */
export const STORE_AT = { lat: 10.7801, lng: 106.6992 };

export type CharitySetup = {
  user: TestUser;
  org: { id: string; name: string };
  site: { id: string; name: string };
  token: () => Promise<string>;
};

export async function setupCharity(role: "owner" | "manager" | "staff" = "owner"): Promise<CharitySetup> {
  const suffix = uniqueSuffix();
  const user = await createConfirmedUser({ prefix: "charity", fullName: "Điều Phối Viên Thử" });
  const org = await createOrgFor(user, {
    kind: "charity",
    status: "approved",
    role,
    name: `Bếp ăn Hy Vọng ${suffix}`,
  });
  const site = await createSite(org.id, { name: `Bếp chính ${suffix}`, ...CHARITY_AT, address: "1 Lê Lợi" });
  return { user, org, site, token: () => accessTokenOf(user) };
}

export type StoreOffer = {
  owner: TestUser;
  org: { id: string; name: string };
  site: { id: string; name: string };
  offerId: string;
  title: string;
  token: string;
};

export async function setupStoreOffer(
  opts: {
    title?: string;
    quantity?: number;
    category?: string;
    /** Giờ còn tới hết khung lấy (bánh mì: < 4 giờ ⇒ nhãn Đỏ). */
    hoursLeft?: number;
    at?: { lat: number; lng: number };
  } = {},
): Promise<StoreOffer> {
  const suffix = uniqueSuffix();
  const owner = await createConfirmedUser({ prefix: "store", fullName: "Chủ Tiệm Thử" });
  const org = await createOrgFor(owner, {
    kind: "store",
    status: "approved",
    name: `Tiệm bánh Hạt Lúa ${suffix}`,
  });
  const site = await createSite(org.id, {
    name: `Chi nhánh ${suffix}`,
    ...(opts.at ?? STORE_AT),
    address: "45 Pasteur",
  });
  const token = await accessTokenOf(owner);
  const now = Date.now();
  const hours = opts.hoursLeft ?? 3;
  const title = opts.title ?? `Bánh mì ổ thử ${suffix}`;
  const offerId = await rpcAs<string>(token, "create_offer", {
    p_payload: {
      site_id: site.id,
      category_code: opts.category ?? "bread",
      title,
      quantity: opts.quantity ?? 30,
      expiry: { datetime: new Date(now + (hours + 2) * 3_600_000).toISOString() },
      pickup_start: new Date(now - 10 * 60_000).toISOString(),
      pickup_end: new Date(now + hours * 3_600_000).toISOString(),
    },
    p_client_op_id: randomUUID(),
  });
  await rpcAs(token, "publish_offer", {
    p_offer_id: offerId,
    p_safety_attested: true,
    p_client_op_id: randomUUID(),
  });
  return { owner, org, site, offerId, title, token };
}

/** Tổ chức xin nhận qua RPC thật (dựng trạng thái cho bài test chuyến/hủy). */
export async function requestViaApi(charity: CharitySetup, offerId: string, qty: number): Promise<string> {
  const res = await rpcAs<{ allocation_id: string }>(await charity.token(), "request_offer", {
    p_offer_id: offerId,
    p_qty: qty,
    p_charity_site_id: charity.site.id,
    p_client_op_id: randomUUID(),
  });
  return res.allocation_id;
}

/** Cửa hàng xác nhận qua RPC thật. */
export async function confirmViaApi(store: StoreOffer, allocationId: string): Promise<void> {
  await rpcAs(store.token, "confirm_allocation", {
    p_allocation_id: allocationId,
    p_client_op_id: randomUUID(),
  });
}

/** Chuỗi → RegExp khớp nguyên văn (tên có dấu, khoảng trắng). */
export function literal(text: string): RegExp {
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
}
