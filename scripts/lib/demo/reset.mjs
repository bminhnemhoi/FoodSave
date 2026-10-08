/* eslint-disable no-console -- script CLI: in kế hoạch và kết quả cho người chạy */
// demo:reset — xóa MỌI dữ liệu của tổ chức is_demo bằng public.demo_reset() (service role, một giao dịch,
// kiểm chéo demo/thật, ghi audit), rồi xóa file của chúng qua Storage API (SQL không xóa được
// storage.objects). Dữ liệu thật được đếm trước/sau để chứng minh không đổi.
import { fail, section } from "./cli.mjs";
import { listObjects, must, pool, removeObjects, rpc } from "./client.mjs";

const HEAD = { count: "exact", head: true };

async function count(query, label) {
  const { count: n, error } = await query;
  if (error) fail(`Không đếm được ${label}: ${error.message}`);
  return n ?? 0;
}

/** Số liệu thật (không demo) và demo — so sánh trước/sau reset. */
export async function snapshot(svc) {
  const [realOrgs, realApproved, demoOrgs, realLedger, demoLedger, realDaily, offers, allocations, pickups] =
    await Promise.all([
      count(svc.from("organizations").select("id", HEAD).eq("is_demo", false), "organizations"),
      count(
        svc.from("organizations").select("id", HEAD).eq("is_demo", false).eq("status", "approved"),
        "organizations",
      ),
      count(svc.from("organizations").select("id", HEAD).eq("is_demo", true), "organizations"),
      count(svc.from("impact_ledger").select("id", HEAD).eq("is_demo", false), "impact_ledger"),
      count(svc.from("impact_ledger").select("id", HEAD).eq("is_demo", true), "impact_ledger"),
      count(svc.from("impact_public_daily").select("day", HEAD).eq("is_demo", false), "impact_public_daily"),
      count(svc.from("offers").select("id", HEAD), "offers"),
      count(svc.from("allocations").select("id", HEAD), "allocations"),
      count(svc.from("pickups").select("id", HEAD), "pickups"),
    ]);
  return {
    realOrgs,
    realApproved,
    demoOrgs,
    realLedger,
    demoLedger,
    realDaily,
    offers,
    allocations,
    pickups,
  };
}

export async function demoResetEnabled(svc) {
  const row = await must(
    svc.from("app_settings").select("value").eq("key", "demo_reset_enabled").maybeSingle(),
    "app_settings",
  );
  return row?.value === true;
}

/** Gọi demo_reset() rồi dọn file Storage của các tổ chức vừa xóa. */
export async function purgeDemo(svc) {
  const result = await rpc(svc, "demo_reset", {});
  const orgIds = result.org_ids ?? [];

  // kyc: đường dẫn chính xác từ org_documents + mọi thứ còn lại dưới {org_id}/ (giấy tờ yêu cầu thay đổi…);
  // media: logo/ảnh bìa/ảnh lô dưới org/{org_id}/ (giám khảo có thể đã tải ảnh lên)
  const kyc = new Set(result.kyc_paths ?? []);
  const media = new Set();
  await pool(orgIds, 6, async (orgId) => {
    for (const p of await listObjects(svc, "kyc", orgId)) kyc.add(p);
    for (const p of await listObjects(svc, "media", `org/${orgId}`)) media.add(p);
  });
  let removed = 0;
  let storageError = null;
  try {
    removed += await removeObjects(svc, "kyc", [...kyc]);
    removed += await removeObjects(svc, "media", [...media]);
  } catch (err) {
    storageError = err.message; // DB đã xóa xong; file mồ côi không còn ai trỏ tới — báo để dọn tay
  }
  return { result, removed, storageError };
}

export function printResetPlan(before) {
  console.log(`Tổ chức demo (is_demo) : ${before.demoOrgs} — sẽ bị xóa cùng mọi dữ liệu gắn với chúng`);
  console.log(`Sổ tác động demo       : ${before.demoLedger} dòng — xóa qua ngoại lệ fs.demo_reset (§13)`);
  console.log(`Tổ chức thật           : ${before.realOrgs} (đã duyệt ${before.realApproved}) — giữ nguyên`);
  console.log(`Sổ tác động thật       : ${before.realLedger} dòng — giữ nguyên (append-only)`);
  console.log("Tài khoản demo (Auth)  : giữ nguyên, seed dùng lại");
}

/** So sánh dữ liệu thật trước/sau; trả về danh sách sai lệch (rỗng = an toàn). */
export function checkRealUntouched(before, after, result) {
  const problems = [];
  if (after.realOrgs !== before.realOrgs)
    problems.push(`tổ chức thật ${before.realOrgs} → ${after.realOrgs}`);
  if (after.realLedger !== before.realLedger)
    problems.push(`ledger thật ${before.realLedger} → ${after.realLedger}`);
  if (after.realDaily !== before.realDaily)
    problems.push(`thống kê công khai thật ${before.realDaily} → ${after.realDaily}`);
  if (after.demoOrgs !== 0) problems.push(`còn ${after.demoOrgs} tổ chức demo`);
  for (const t of ["offers", "allocations", "pickups"]) {
    const expected = before[t] - (result[t] ?? 0);
    if (after[t] !== expected) problems.push(`${t}: mong đợi ${expected}, thực tế ${after[t]}`);
  }
  return problems;
}

export function printResetResult(purge) {
  section("Đã xóa (demo_reset)");
  const r = purge.result;
  const keys = [
    "organizations",
    "sites",
    "org_members",
    "offers",
    "allocations",
    "pickups",
    "handovers",
    "handover_lines",
    "impact_ledger",
    "trust_events",
    "org_documents",
    "notification_outbox",
    "notifications",
  ];
  console.log(
    keys
      .filter((k) => r[k] !== undefined)
      .map((k) => `${k} ${r[k]}`)
      .join(" · "),
  );
  console.log(
    `Storage: ${purge.removed} file đã xóa${purge.storageError ? ` — LỖI: ${purge.storageError}` : ""}`,
  );
}
