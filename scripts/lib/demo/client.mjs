// Truy cập Supabase cho script demo: client service role + phiên của từng người dùng demo.
// Mọi thao tác nghiệp vụ chạy DƯỚI DANH TÍNH NGƯỜI DÙNG (JWT aal1) qua RPC thật; service role chỉ dùng
// để tạo tài khoản (Auth Admin API), gắn cờ is_demo, đọc trạng thái và gọi 3 helper demo (service-role
// only) của migration demo_ops.
import { createHash, randomBytes, randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import { fail } from "./cli.mjs";

const AUTH = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };

export function serviceClient(ctx) {
  return createClient(ctx.url, ctx.serviceKey, { auth: AUTH });
}

/** Lỗi PostgREST/Auth → thông điệp gọn (mã + message + detail), không in token. */
export function describeError(error) {
  if (!error) return "";
  const parts = [error.code, error.message, error.details, error.hint].filter(Boolean);
  return parts.join(" · ");
}

/** Chờ kết quả `{ data, error }` của supabase-js, ném lỗi có nhãn nếu thất bại. */
export async function must(promise, label) {
  const { data, error } = await promise;
  if (error) {
    const e = new Error(`${label}: ${describeError(error)}`);
    e.code = error.code;
    e.details = error.details;
    throw e;
  }
  return data;
}

export const opId = () => randomUUID();

/** Mật khẩu ngẫu nhiên dễ đọc: Demo-xxxx-xxxx-xxxx (có chữ và số, không ký tự dễ nhầm). */
export function generatePassword() {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  for (;;) {
    const bytes = randomBytes(12);
    const chars = [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
    const pw = `Demo-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
    if (/\d/.test(pw.slice(5)) && /[a-z]/i.test(pw.slice(5))) return pw;
  }
}

export const sha256Hex = (data) => createHash("sha256").update(data).digest("hex");

/**
 * Phiên của một người dùng demo: đăng nhập bằng mật khẩu nếu biết, nếu không thì magic link sinh bằng
 * Admin API (`generateLink`, KHÔNG gửi email) rồi `verifyOtp` — script không cần biết mật khẩu giám khảo.
 * Trả về client supabase-js mang JWT của người đó.
 */
export async function userSession(ctx, svc, account) {
  const client = createClient(ctx.url, ctx.anonKey, { auth: AUTH });
  if (account.password) {
    const { data, error } = await client.auth.signInWithPassword({
      email: account.email,
      password: account.password,
    });
    if (!error && data.session) return client;
  }
  const link = await must(
    svc.auth.admin.generateLink({ type: "magiclink", email: account.email }),
    `generateLink ${account.email}`,
  );
  const tokenHash = link?.properties?.hashed_token;
  if (!tokenHash) fail(`Không tạo được phiên cho ${account.email}.`);
  const { data, error } = await client.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
  if (error || !data.session) fail(`Không tạo được phiên cho ${account.email}: ${describeError(error)}`);
  return client;
}

/** Gọi RPC dưới danh tính `client`; ném lỗi có tên RPC (RPC chưa có trên project ⇒ gợi ý áp migration). */
export async function rpc(client, fn, args) {
  try {
    return await must(client.rpc(fn, args), fn);
  } catch (err) {
    if (err.code === "PGRST202") {
      fail(
        `RPC ${fn} chưa có trên project này — áp đủ migration P2 và demo_ops (supabase/migrations) trước.`,
      );
    }
    throw err;
  }
}

/** Chạy `worker` cho từng phần tử với tối đa `limit` việc song song. */
export async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function lane() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return results;
}

/** PDF tối thiểu (giấy tờ giả, ghi rõ "TAI LIEU DEMO") cho bước nộp hồ sơ. */
export function demoPdf(orgName) {
  const ascii = orgName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
  const text = `FoodSave - TAI LIEU DEMO (hu cau), khong phai giay to that: ${ascii.replace(/[()\\]/g, "")}`;
  const stream = `BT /F1 10 Tf 24 60 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 140] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((obj, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) body += `${String(off).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

/** Liệt kê đệ quy mọi object dưới `prefix` của một bucket (service role). */
export async function listObjects(svc, bucket, prefix) {
  const out = [];
  const stack = [prefix.replace(/\/$/, "")];
  while (stack.length) {
    const dir = stack.pop();
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await svc.storage.from(bucket).list(dir, { limit: 1000, offset });
      if (error) throw new Error(`storage list ${bucket}/${dir}: ${error.message}`);
      for (const entry of data ?? []) {
        const path = `${dir}/${entry.name}`;
        if (entry.id === null) stack.push(path);
        else out.push(path);
      }
      if (!data || data.length < 1000) break;
    }
  }
  return out;
}

/** Xóa object theo lô 100 (Storage API — SQL không xóa được storage.objects). */
export async function removeObjects(svc, bucket, paths) {
  let removed = 0;
  for (let i = 0; i < paths.length; i += 100) {
    const batch = paths.slice(i, i + 100);
    const { data, error } = await svc.storage.from(bucket).remove(batch);
    if (error) throw new Error(`storage remove ${bucket}: ${error.message}`);
    removed += data?.length ?? 0;
  }
  return removed;
}
