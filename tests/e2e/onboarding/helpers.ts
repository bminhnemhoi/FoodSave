import { deflateSync } from "node:zlib";

import { expect, type Page } from "@playwright/test";

import {
  createConfirmedUser,
  createOrgFor,
  loginAs,
  serviceKey,
  SUPABASE_URL,
  type TestUser,
} from "../fixtures/users";

/** Tiện ích chung cho E2E wizard onboarding (P1-02…P1-07). */

export const EXIF_MARKER = "FOODSAVE-GPS-10.7769-106.7009";

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/**
 * PNG nhỏ (màu đặc) có chunk `eXIf` chứa chuỗi đánh dấu — dùng để kiểm ảnh tải lên đã được mã hóa lại
 * và không còn metadata (SECURITY-PRIVACY C13).
 */
export function makePng(width = 48, height = 32): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0)]);
  for (let x = 0; x < width; x++) {
    row[1 + x * 3] = 27;
    row[2 + x * 3] = 107;
    row[3 + x * 3] = 71;
  }
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("eXIf", Buffer.concat([Buffer.from("MM\0*", "binary"), Buffer.from(EXIF_MARKER)])),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export function makePdf(): Buffer {
  return Buffer.from(
    "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
  );
}

function headers(extra: Record<string, string> = {}) {
  const key = serviceKey();
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

/** Đọc bảng bằng service role (chỉ để kiểm kết quả trong E2E). */
export async function adminSelect<T>(path: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: headers() });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

export async function downloadKyc(path: string): Promise<Buffer> {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/kyc/${path}`, { headers: headers() });
  if (!res.ok) throw new Error(`kyc ${path} → ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Cửa hàng đã duyệt có một điểm tại toạ độ cho trước (để `count_stores_within` đếm được). */
export async function createApprovedStoreAt(lat: number, lng: number): Promise<void> {
  const owner = await createConfirmedUser({ prefix: "nearstore" });
  const org = await createOrgFor(owner, { kind: "store", status: "approved" });
  const res = await fetch(`${SUPABASE_URL}/rest/v1/sites`, {
    method: "POST",
    headers: headers({ Prefer: "return=minimal" }),
    body: JSON.stringify({
      org_id: org.id,
      name: "Điểm thử",
      is_primary: true,
      address_line: "1 Đường Thử",
      location: `SRID=4326;POINT(${lng} ${lat})`,
    }),
  });
  if (!res.ok) throw new Error(`POST sites → ${res.status}: ${await res.text()}`);
}

export const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1440) < 1024;

/** Chỉ báo tự lưu đang hiển thị (header trên desktop, dưới tiêu đề trên mobile). */
export function autosaveStatus(page: Page) {
  return page.getByTestId("autosave-status").filter({ visible: true });
}

export async function expectSaved(page: Page) {
  await expect(autosaveStatus(page)).toContainText(/Đã lưu nháp lúc \d{2}:\d{2}/, { timeout: 20_000 });
}

export async function startWizard(page: Page, kind: "store" | "charity", user?: TestUser): Promise<TestUser> {
  const u = user ?? (await createConfirmedUser({ prefix: `onb-${kind}`, fullName: "Phạm Thu Hà" }));
  await loginAs(page, u, "/onboarding");
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByRole("link", { name: kind === "store" ? "Đăng ký cửa hàng" : "Đăng ký tổ chức" }).click();
  await expect(page).toHaveURL(new RegExp(`/onboarding/${kind}/basics$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Thông tin cơ bản");
  return u;
}

export async function clickNext(page: Page) {
  await page.getByRole("button", { name: "Tiếp tục" }).click();
}

/** Đặt ghim: thử gợi ý địa chỉ; dịch vụ lỗi thì bấm lên bản đồ (giống location-picker.spec). */
export async function pickLocationBySearch(page: Page, query: string) {
  const box = page.getByRole("combobox", { name: /Tìm địa chỉ/ });
  await box.fill(query);
  const options = page.getByRole("listbox", { name: "Gợi ý địa chỉ" }).getByRole("option");
  // Chỉ lỗi của bộ chọn vị trí (không lấy nhầm route announcer của Next — cũng có role="alert")
  const failure = page.locator("#site-location [role=alert]");
  await expect(options.first().or(failure.first())).toBeVisible({ timeout: 20_000 });
  if (await options.first().isVisible()) {
    await options.first().click();
  } else {
    await page
      .getByRole("region", { name: /Bản đồ chọn vị trí/ })
      .locator("canvas")
      .click({ position: { x: 140, y: 120 } });
  }
  await expect(page.getByTestId("location-coords")).toBeVisible({ timeout: 20_000 });
  await ensureAddress(page);
}

/** Reverse geocode lỗi ⇒ địa chỉ trống: nhập tay để giá trị hợp lệ. */
export async function ensureAddress(page: Page) {
  await expect(page.getByText("Đang xác định địa chỉ…")).toHaveCount(0, { timeout: 20_000 });
  const address = page.getByLabel("Số nhà, tên đường");
  if ((await address.inputValue()).trim().length < 3) await address.fill("12 Đường Thử Nghiệm");
}
