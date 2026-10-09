import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import type { Page, TestInfo } from "@playwright/test";

import type { StoreOffer } from "../charity/helpers";
import { rpcAs } from "../fixtures/orgs";

/** Tiện ích cho E2E bảng điều khiển Admin (console-*.spec.ts). Chỉ chạy với Supabase LOCAL. */

/** Bảng (≥ 1024 px) hay thẻ (mobile) — cùng dữ liệu, khác bố cục. */
export const isWide = (page: Page) => (page.viewportSize()?.width ?? 1440) >= 1024;

/** Ảnh cho báo cáo (chỉ khi đặt ADMIN_SHOTS_DIR): `<dir>/<name>-<project>.png`, toàn trang. */
export async function shot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const dir = process.env.ADMIN_SHOTS_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `${name}-${testInfo.project.name}.png`), fullPage: true });
}

/** Thêm một lô cho cửa hàng có sẵn qua RPC thật (`create_offer` → `publish_offer`). */
export async function publishOffer(
  store: StoreOffer,
  opts: { title: string; hoursLeft: number; expiryHours?: number; category?: string; quantity?: number },
): Promise<string> {
  const now = Date.now();
  const offerId = await rpcAs<string>(store.token, "create_offer", {
    p_payload: {
      site_id: store.site.id,
      category_code: opts.category ?? "bread",
      title: opts.title,
      quantity: opts.quantity ?? 20,
      expiry: {
        datetime: new Date(now + (opts.expiryHours ?? opts.hoursLeft + 2) * 3_600_000).toISOString(),
      },
      pickup_start: new Date(now - 10 * 60_000).toISOString(),
      pickup_end: new Date(now + opts.hoursLeft * 3_600_000).toISOString(),
    },
    p_client_op_id: randomUUID(),
  });
  await rpcAs(store.token, "publish_offer", {
    p_offer_id: offerId,
    p_safety_attested: true,
    p_client_op_id: randomUUID(),
  });
  return offerId;
}
