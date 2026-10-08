import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";

import { BinaryBitmap, HybridBinarizer, QRCodeReader, RGBLuminanceSource } from "@zxing/library";

import { matrixFromSvgPath } from "../../../src/components/qr/qr-matrix";
import { accessTokenOf, createSite, rpcAs } from "../fixtures/orgs";
import {
  createConfirmedUser,
  createOrgFor,
  serviceKey,
  SUPABASE_URL,
  type TestUser,
} from "../fixtures/users";

/**
 * Dựng một chuyến TỰ ĐẾN LẤY thật bằng RPC (Supabase LOCAL): cửa hàng đăng + công bố lô, tổ chức xin nhận,
 * cửa hàng xác nhận, tổ chức tạo chuyến `self` ⇒ một điểm dừng `pickup` đang chờ bàn giao.
 * Chỉ tạo tổ chức/điểm bằng service role (giống fixture Cài đặt); mọi chuyển trạng thái đi qua RPC của người dùng.
 */

export type SelfPickupScenario = {
  store: TestUser;
  charity: TestUser;
  storeName: string;
  charityName: string;
  offerTitle: string;
  qty: number;
  unitWeightKg: number;
  allocationId: string;
  pickupId: string;
  stopId: string;
};

const minutes = (n: number) => new Date(Date.now() + n * 60_000).toISOString();

async function serviceGet<T>(path: string): Promise<T> {
  const key = serviceKey();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

export async function createSelfPickupScenario(
  opts: { qty?: number; unitWeightKg?: number; tag?: string } = {},
): Promise<SelfPickupScenario> {
  const qty = opts.qty ?? 20;
  const unitWeightKg = opts.unitWeightKg ?? 0.12;
  const tag = opts.tag ?? "qr";

  const store = await createConfirmedUser({ prefix: `ho-store-${tag}`, fullName: "Chị Thu Lan" });
  const charity = await createConfirmedUser({ prefix: `ho-charity-${tag}`, fullName: "Cô Võ Thị Hạnh" });
  const storeOrg = await createOrgFor(store, { kind: "store", status: "approved" });
  const charityOrg = await createOrgFor(charity, { kind: "charity", status: "approved" });
  const storeSite = await createSite(storeOrg.id, {
    name: "Chi nhánh Bến Thành",
    lat: 10.7725,
    lng: 106.698,
  });
  const charitySite = await createSite(charityOrg.id, {
    name: "Bếp chính",
    lat: 10.7801,
    lng: 106.6992,
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
      unit_weight_kg: unitWeightKg,
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

  const pickupId = await rpcAs<string>(charityToken, "assign_pickup", {
    p_plan: { allocation_ids: [req.allocation_id], mode: "self", charity_site_id: charitySite.id },
    p_client_op_id: randomUUID(),
  });
  const [stop] = await serviceGet<{ id: string }[]>(
    `pickup_stops?select=id&pickup_id=eq.${pickupId}&kind=eq.pickup`,
  );

  return {
    store,
    charity,
    storeName: storeOrg.name,
    charityName: charityOrg.name,
    offerTitle,
    qty,
    unitWeightKg,
    allocationId: req.allocation_id,
    pickupId,
    stopId: stop!.id,
  };
}

/** Dòng sổ tác động của một phân bổ (service role — kiểm chứng ngoài ứng dụng). */
export async function ledgerOf(allocationId: string) {
  return serviceGet<{ entry_type: string; kg: number; co2e_kg: number; meals: number; is_demo: boolean }[]>(
    `impact_ledger?select=entry_type,kg,co2e_kg,meals,is_demo&allocation_id=eq.${allocationId}`,
  );
}

export async function allocationOf(allocationId: string) {
  const [row] = await serviceGet<
    { status: string; qty_picked: number; qty_delivered: number; shortfall_reason: string | null }[]
  >(`allocations?select=status,qty_picked,qty_delivered,shortfall_reason&id=eq.${allocationId}`);
  return row!;
}

/**
 * Ghi một video Y4M (YUV 4:2:0) chứa đúng ma trận QR đang hiển thị trên điện thoại tổ chức, để Chromium dùng
 * làm camera giả (`--use-file-for-fake-video-capture`). Không có “cửa hậu” nào trong ứng dụng: máy quét thật
 * (ZXing + getUserMedia) đọc mã từ khung hình như với camera laptop.
 *
 * Ảnh tổng hợp sắc nét tuyệt đối (khác camera thật luôn hơi mờ/nhiễu) đôi khi làm bộ định vị của ZXing trượt ở
 * một cỡ module nhất định; mọi khung hình lại giống hệt nhau nên trượt là trượt mãi. Vì vậy chọn cỡ module mà
 * chính ZXing (cùng thư viện với trình duyệt) đọc được trước khi ghi video.
 */
export function writeQrVideo(path: string, svgPath: string, viewBoxSize: number) {
  const modules = matrixFromSvgPath(svgPath, viewBoxSize);
  const W = 640;
  const H = 480;
  const render = (scale: number) => {
    const side = scale * viewBoxSize;
    const ox = Math.floor((W - side) / 2);
    const oy = Math.floor((H - side) / 2);
    const y = Buffer.alloc(W * H, 235);
    for (let py = 0; py < side; py++) {
      for (let px = 0; px < side; px++) {
        if (modules[Math.floor(py / scale) * viewBoxSize + Math.floor(px / scale)]) {
          y[(oy + py) * W + ox + px] = 16;
        }
      }
    }
    return y;
  };
  const decodes = (y: Buffer) => {
    try {
      const source = new RGBLuminanceSource(new Uint8ClampedArray(y), W, H);
      return new QRCodeReader().decode(new BinaryBitmap(new HybridBinarizer(source))).getText().length > 0;
    } catch {
      return false;
    }
  };
  const maxScale = Math.floor((Math.min(W, H) * 0.9) / viewBoxSize);
  const scales = Array.from({ length: maxScale - 3 }, (_, i) => maxScale - i);
  const y = scales.map(render).find(decodes);
  if (!y) throw new Error("Không dựng được khung hình QR đọc được cho camera giả");
  const chroma = Buffer.alloc((W / 2) * (H / 2), 128);
  const frame = Buffer.concat([Buffer.from("FRAME\n"), y, chroma, chroma]);
  const header = Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`);
  writeFileSync(path, Buffer.concat([header, frame, frame, frame, frame]));
}

/** Số kg trên bộ đếm công khai của landing (0 khi sổ trống). */
export function parseVnNumber(text: string): number {
  return Number(text.replace(/\./g, "").replace(",", "."));
}
