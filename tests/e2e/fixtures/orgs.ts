import { createHash, randomBytes } from "node:crypto";
import { execSync } from "node:child_process";

import { serviceKey, SUPABASE_URL, type TestUser } from "./users";

/**
 * Dựng dữ liệu tổ chức cho E2E Cài đặt / lời mời (Supabase LOCAL). Ghi bằng service role chỉ để dựng
 * trạng thái; thao tác cần kiểm quyền thật (mời, nhận lời mời) đi qua RPC dưới JWT của người dùng.
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
  if (!match) throw new Error("Không đọc được ANON_KEY từ `supabase status`. Đặt E2E_SUPABASE_ANON_KEY.");
  cachedAnon = match[1]!;
  return cachedAnon;
}

function serviceHeaders(extra: Record<string, string> = {}) {
  const key = serviceKey();
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

async function rest<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, init);
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : null) as T;
}

/** Thêm một thành viên vào tổ chức có sẵn (service role). */
export async function addMember(
  orgId: string,
  user: TestUser,
  role: "owner" | "manager" | "staff" | "volunteer",
  siteIds: string[] | null = null,
): Promise<void> {
  await rest("org_members", {
    method: "POST",
    headers: serviceHeaders({ Prefer: "return=minimal" }),
    body: JSON.stringify({
      org_id: orgId,
      user_id: user.id,
      role,
      site_ids: siteIds,
      status: "active",
      joined_at: new Date().toISOString(),
    }),
  });
}

/** Một điểm của tổ chức tại toạ độ cho trước (mặc định quanh chợ Bến Thành). */
export async function createSite(
  orgId: string,
  opts: { name?: string; lat?: number; lng?: number; primary?: boolean; address?: string } = {},
): Promise<{ id: string; name: string }> {
  const name = opts.name ?? "Chi nhánh Bến Thành";
  const lat = opts.lat ?? 10.7725;
  const lng = opts.lng ?? 106.698;
  const [row] = await rest<{ id: string }[]>("sites", {
    method: "POST",
    headers: serviceHeaders({ Prefer: "return=representation" }),
    body: JSON.stringify({
      org_id: orgId,
      name,
      is_primary: opts.primary ?? true,
      address_line: opts.address ?? "12 Lê Lợi",
      ward: "Phường Bến Thành",
      location: `SRID=4326;POINT(${lng} ${lat})`,
    }),
  });
  return { id: row!.id, name };
}

/** Đăng nhập bằng mật khẩu qua GoTrue ⇒ access token (để gọi RPC dưới quyền người dùng). */
export async function accessTokenOf(user: TestUser): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey(), "Content-Type": "application/json" },
    body: JSON.stringify({ email: user.email, password: user.password }),
  });
  const body = (await res.json()) as { access_token?: string };
  if (!res.ok || !body.access_token)
    throw new Error(`Đăng nhập API thất bại cho ${user.email}: ${res.status}`);
  return body.access_token;
}

export async function rpcAs<T>(token: string, fn: string, args: Record<string, unknown>): Promise<T> {
  return rest<T>(`rpc/${fn}`, {
    method: "POST",
    headers: { apikey: anonKey(), Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
}

/**
 * Chủ tổ chức mời một email qua RPC thật `invite_member` (token sinh trong test, DB lưu sha256) — dùng
 * cho các ca lỗi của trang nhận lời mời mà không cần đọc email.
 */
export async function inviteViaApi(
  owner: TestUser,
  orgId: string,
  email: string,
  role: "manager" | "staff" | "volunteer" = "staff",
): Promise<{ token: string; invitationId: string }> {
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token, "utf8").digest("hex");
  const invitationId = await rpcAs<string>(await accessTokenOf(owner), "invite_member", {
    p_org_id: orgId,
    p_email: email,
    p_role: role,
    p_site_ids: null,
    p_token_hash: `\\x${hash}`,
  });
  return { token, invitationId };
}

/** Cập nhật bằng service role (dựng trạng thái: lời mời hết hạn…). */
export async function adminPatch(path: string, body: Record<string, unknown>): Promise<void> {
  await rest(path, {
    method: "PATCH",
    headers: serviceHeaders({ Prefer: "return=minimal" }),
    body: JSON.stringify(body),
  });
}

/** Dòng `org_sensitive` (ứng dụng thật tạo cùng `create_organization`; fixture REST thì phải tự tạo). */
export async function seedSensitive(
  orgId: string,
  values: Partial<{
    legal_name: string;
    tax_code: string;
    registration_no: string;
    representative_name: string;
    representative_title: string;
    contact_email: string;
    contact_phone: string;
  }> = {},
): Promise<void> {
  await rest("org_sensitive", {
    method: "POST",
    headers: serviceHeaders({ Prefer: "return=minimal,resolution=merge-duplicates" }),
    body: JSON.stringify({ org_id: orgId, ...values }),
  });
}

/** Ngày hôm nay + n ngày theo giờ Việt Nam, dạng YYYY-MM-DD. */
export function vnDatePlus(days: number): string {
  const now = new Date(Date.now() + days * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(now);
}
