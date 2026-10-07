import { execSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";

import { expect, type Page } from "@playwright/test";
import { Secret, TOTP } from "otpauth";

import { createConfirmedUser, loginAs, serviceKey, SUPABASE_URL, type TestUser } from "./users";

/**
 * Fixture cho E2E khu vực Admin (P1-09, P1-10) — chỉ chạy với Supabase LOCAL (users.ts kiểm URL).
 * - Cấp/thu hồi admin bằng RPC `grant_platform_admin` / `revoke_platform_admin` gọi bằng service role
 *   (đúng đường bootstrap thật — không UPDATE profiles bằng tay).
 * - Hồ sơ "đã gửi duyệt" được dựng bằng RPC THẬT dưới phiên của chủ hồ sơ (create → site → giấy tờ →
 *   đồng ý → submit), nên lịch sử audit và giấy tờ trong bucket `kyc` giống luồng người dùng.
 */

let cachedAnon: string | undefined;

export function anonKey(): string {
  if (process.env.E2E_SUPABASE_ANON_KEY) return process.env.E2E_SUPABASE_ANON_KEY;
  if (cachedAnon) return cachedAnon;
  const out = execSync("pnpm exec supabase status -o env", {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 90_000,
  });
  const match = out.match(/^ANON_KEY="?([^"\r\n]+)"?\s*$/m);
  if (!match)
    throw new Error("Không đọc được ANON_KEY từ `supabase status`. Đặt biến E2E_SUPABASE_ANON_KEY.");
  cachedAnon = match[1]!;
  return cachedAnon;
}

async function req<T>(path: string, init: RequestInit & { token?: string; service?: boolean }): Promise<T> {
  const key = init.service ? serviceKey() : anonKey();
  const headers = new Headers(init.headers);
  headers.set("apikey", key);
  headers.set("Authorization", `Bearer ${init.service ? key : (init.token ?? key)}`);
  if (!headers.has("Content-Type") && typeof init.body === "string")
    headers.set("Content-Type", "application/json");
  const res = await fetch(`${SUPABASE_URL}${path}`, { ...init, headers });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : null) as T;
}

const rpc = <T>(fn: string, args: Record<string, unknown>, auth: { token?: string; service?: boolean }) =>
  req<T>(`/rest/v1/rpc/${fn}`, { method: "POST", body: JSON.stringify(args), ...auth });

/** Phiên REST (aal1) của người dùng bằng mật khẩu — dùng để gọi RPC như chính họ. */
export async function passwordToken(user: TestUser): Promise<string> {
  const data = await req<{ access_token: string }>("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email: user.email, password: user.password }),
  });
  return data.access_token;
}

export async function grantAdmin(user: TestUser, reason = "E2E: cấp quyền admin để kiểm thử") {
  await rpc("grant_platform_admin", { p_user_id: user.id, p_reason: reason }, { service: true });
}

/** Thu hồi (bỏ qua lỗi "admin cuối cùng" khi chạy song song). */
export async function revokeAdmin(user: TestUser) {
  await rpc(
    "revoke_platform_admin",
    { p_user_id: user.id, p_reason: "E2E: dọn dẹp" },
    { service: true },
  ).catch(() => undefined);
}

export async function createAdminUser(fullName = "Ngô Thanh Tâm"): Promise<TestUser> {
  const user = await createConfirmedUser({ prefix: "admin", fullName });
  await grantAdmin(user);
  return user;
}

// ---------------------------------------------------------------------------
// TOTP
// ---------------------------------------------------------------------------

export function totpFor(secret: string) {
  return new TOTP({ secret: Secret.fromBase32(secret), digits: 6, period: 30, algorithm: "SHA1" });
}

const periodOf = (ms: number) => Math.floor(ms / 30_000);

/**
 * Mã TOTP mới: nếu vẫn còn trong cùng chu kỳ 30 s với lần dùng trước thì chờ sang chu kỳ sau
 * (tránh trường hợp máy chủ từ chối dùng lại mã).
 */
export async function freshCode(secret: string, lastUsedAt?: number): Promise<{ code: string; at: number }> {
  if (lastUsedAt !== undefined && periodOf(Date.now()) === periodOf(lastUsedAt)) {
    const wait = 30_000 - (Date.now() % 30_000) + 500;
    await new Promise((r) => setTimeout(r, wait));
  }
  const at = Date.now();
  return { code: totpFor(secret).generate({ timestamp: at }), at };
}

/** Đi qua màn đăng ký TOTP (đang ở /admin/mfa) và trả khóa bí mật + thời điểm dùng mã. */
export async function enrollTotpViaUi(page: Page): Promise<{ secret: string; usedAt: number }> {
  await expect(page).toHaveURL(/\/admin\/mfa/);
  await page.getByRole("button", { name: "Tạo mã QR" }).click();
  const secretBox = page.getByTestId("mfa-secret");
  await expect(secretBox).toBeVisible({ timeout: 20_000 });
  const secret = ((await secretBox.textContent()) ?? "").replace(/\s+/g, "");
  expect(secret).toMatch(/^[A-Z2-7]{16,}$/);
  const { code, at } = await freshCode(secret);
  await page.getByLabel("Mã xác thực 6 số").fill(code);
  await page.getByRole("button", { name: "Xác nhận và vào khu vực quản trị" }).click();
  return { secret, usedAt: at };
}

/** Admin mới + đăng nhập + đăng ký TOTP ⇒ trang đang ở phiên aal2. */
export async function loginAdminWithMfa(page: Page, next = "/admin/reviews") {
  const admin = await createAdminUser();
  await loginAs(page, admin, next);
  const mfa = await enrollTotpViaUi(page);
  await expect(page).toHaveURL((u) => `${u.pathname}${u.search}` === next, { timeout: 20_000 });
  return { admin, ...mfa };
}

// ---------------------------------------------------------------------------
// Tệp giấy tờ mẫu
// ---------------------------------------------------------------------------

/** PDF tối thiểu hợp lệ (một trang trống) để kiểm tra mở tab mới. */
export function samplePdf(): Buffer {
  const body =
    "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n";
  return Buffer.from(body, "latin1");
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** Ảnh PNG 480×320 giống một tờ giấy phép (nền kem, dòng chữ giả màu xám) — không chứa dữ liệu thật. */
export function sampleDocumentPng(width = 480, height = 320): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const border = x < 8 || x >= width - 8 || y < 8 || y >= height - 8;
      const title = y >= 40 && y < 56 && x >= 120 && x < 360;
      const line = (y - 90) % 28 < 6 && y >= 90 && y < 280 && x >= 40 && x < width - 40 - ((y * 7) % 90);
      const [r, g, b] = border
        ? [27, 107, 71]
        : title
          ? [60, 60, 60]
          : line
            ? [170, 170, 165]
            : [250, 247, 240];
      raw[row + 1 + x * 3] = r;
      raw[row + 2 + x * 3] = g;
      raw[row + 3 + x * 3] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Hồ sơ đã gửi duyệt (qua RPC thật dưới phiên chủ hồ sơ)
// ---------------------------------------------------------------------------

export type SubmittedOrg = {
  id: string;
  name: string;
  documents: { id: string; path: string; mime: string }[];
};

async function uploadDoc(
  token: string,
  orgId: string,
  docType: "business_license" | "food_safety_cert" | "establishment_decision",
  file: Buffer,
  mime: "application/pdf" | "image/png",
) {
  const ext = mime === "application/pdf" ? "pdf" : "png";
  const path = `${orgId}/${docType}/${randomUUID()}.${ext}`;
  await req(`/storage/v1/object/kyc/${path}`, {
    method: "POST",
    token,
    headers: { "Content-Type": mime, "x-upsert": "false" },
    body: new Uint8Array(file),
  });
  const [doc] = await req<{ id: string }[]>("/rest/v1/org_documents", {
    method: "POST",
    token,
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      org_id: orgId,
      doc_type: docType,
      storage_path: path,
      mime_type: mime,
      size_bytes: file.length,
      sha256: createHash("sha256").update(file).digest("hex"),
    }),
  });
  return { id: doc!.id, path, mime };
}

export async function createSubmittedOrg(
  owner: TestUser,
  opts: { kind?: "store" | "charity"; name?: string } = {},
): Promise<SubmittedOrg> {
  const kind = opts.kind ?? "store";
  const suffix = randomUUID().slice(0, 6);
  const name = opts.name ?? (kind === "store" ? `Tiệm bánh Hạt Lúa ${suffix}` : `Bếp ăn Nắng Mai ${suffix}`);
  const token = await passwordToken(owner);

  const orgId = await rpc<string>(
    "create_organization",
    {
      p_kind: kind,
      p_name: name,
      p_subtype: kind === "store" ? "bakery" : "soup_kitchen",
      p_client_op_id: randomUUID(),
    },
    { token },
  );

  await req(`/rest/v1/org_sensitive?org_id=eq.${orgId}`, {
    method: "PATCH",
    token,
    body: JSON.stringify({
      legal_name: kind === "store" ? `Hộ kinh doanh ${name}` : `Nhóm thiện nguyện ${name}`,
      tax_code: "0312345678",
      registration_no: "41O8-012345",
      representative_name: owner.fullName,
      representative_title: "Chủ hộ kinh doanh",
      contact_phone: "0901234567",
    }),
  });
  // 4 số cuối CCCD chỉ ghi được bằng RPC admin / service role (B6) — fixture đặt trực tiếp để có dữ liệu hiển thị
  await req(`/rest/v1/org_sensitive?org_id=eq.${orgId}`, {
    method: "PATCH",
    service: true,
    body: JSON.stringify({ representative_id_last4: "4821" }),
  });

  await rpc(
    "upsert_site",
    {
      p_org_id: orgId,
      p_site: {
        name: kind === "store" ? "Chi nhánh Bến Thành" : "Điểm nhận Bàn Cờ",
        address_line: "45 Lê Thánh Tôn",
        ward: "Phường Sài Gòn",
        city: "Thành phố Hồ Chí Minh",
        lat: 10.776889,
        lng: 106.700806,
        location_source: "pin",
      },
      p_client_op_id: randomUUID(),
    },
    { token },
  );

  const documents = [
    await uploadDoc(
      token,
      orgId,
      kind === "store" ? "business_license" : "establishment_decision",
      samplePdf(),
      "application/pdf",
    ),
    await uploadDoc(token, orgId, "food_safety_cert", sampleDocumentPng(), "image/png"),
  ];

  await rpc(
    "grant_consent",
    {
      p_purpose: "terms",
      p_policy_version: "2026-10-v1",
      p_text_hash: createHash("sha256").update("terms-2026-10-v1").digest("hex"),
      p_source: "web",
    },
    { token },
  );
  await rpc("submit_organization", { p_org_id: orgId, p_client_op_id: randomUUID() }, { token });

  return { id: orgId, name, documents };
}

/** Gọi RPC duyệt trực tiếp bằng phiên REST aal1 (bỏ qua UI) — để kiểm DB chặn admin chưa MFA. */
export async function reviewViaRest(token: string, orgId: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/review_organization`, {
    method: "POST",
    headers: { apikey: anonKey(), Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      p_org_id: orgId,
      p_decision: "approve",
      p_reason: null,
      p_client_op_id: randomUUID(),
    }),
  });
  return { status: res.status, body: (await res.json()) as { code?: string; message?: string } };
}

// ---------------------------------------------------------------------------
// Mailpit
// ---------------------------------------------------------------------------

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

export async function waitForEmailSubject(to: string, subject: RegExp, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    if (res.ok) {
      const data = (await res.json()) as { messages?: { ID: string; Subject: string }[] };
      const hit = data.messages?.find((m) => subject.test(m.Subject));
      if (hit) {
        const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${hit.ID}`)).json()) as {
          Subject: string;
          Text: string;
          HTML: string;
        };
        return msg;
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Không thấy email "${subject}" gửi tới ${to} trong ${timeoutMs} ms`);
}

/** Đọc payload JWT (không kiểm chữ ký — chỉ để kiểm TTL của signed URL). */
export function jwtPayload(token: string): { exp?: number; iat?: number; url?: string } {
  const part = token.split(".")[1] ?? "";
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as { exp?: number; iat?: number };
}
