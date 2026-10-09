/* eslint-disable no-console -- script CLI: in tiến độ và kết quả cho người chạy */
// Seed dữ liệu demo theo thời gian tương đối (ROADMAP P2-16/P2-17, DATA-MODEL §17, skill seed-demo).
// Idempotent: chạy lại không nhân đôi — tài khoản/tổ chức được tìm lại, lô và các luồng chỉ được bổ sung
// khi không còn bản "sống", lịch sử chỉ sinh cho ngày còn trống.
// Đường đi thật: Auth Admin API (email_confirm) → RPC dưới JWT người dùng (create_organization,
// upsert_site, set_site_hours, grant_consent, submit_organization, invite_member/accept_invite,
// create_offer/publish_offer, request_offer, confirm_allocation, assign_pickup, issue_handover_token,
// consume_handover_token). Chỉ 3 bước dùng helper service-role của migration demo_ops: duyệt hồ sơ
// (thay review_organization cần admin aal2), lịch sử lùi ngày và reset.
import { randomBytes, randomUUID } from "node:crypto";

import { fail, section, stopwatch } from "./cli.mjs";
import { demoPdf, generatePassword, must, opId, pool, rpc, sha256Hex, userSession } from "./client.mjs";
import {
  ACCOUNTS,
  AUTO_ACCEPTED,
  CONFIRMED_FOR_JUDGE,
  DEFAULT_EMAIL_DOMAIN,
  DEMO_NEED,
  HANDOVER_OFFERS,
  OFFERS,
  ORGS,
  PENDING_REQUESTS,
  REVIEWER,
  VOLUNTEER_PROFILES,
  VOLUNTEER_TRIP,
  VOLUNTEERS,
} from "./dataset.mjs";
import { buildHistoryItems, missingHistoryDays } from "./history.mjs";
import {
  HOUR,
  MINUTE,
  freshnessLabel,
  pickupAnchor,
  vnDate,
  vnInstant,
  vnMidnight,
  vnParts,
} from "./hours.mjs";

const LABEL_VI = { green: "Xanh", yellow: "Vàng", red: "Đỏ", expired: "Hết hạn" };

export function accountList(ctx) {
  const domain = ctx.emailDomain ?? DEFAULT_EMAIL_DOMAIN;
  return ACCOUNTS.map((a) => ({ ...a, email: `${a.local}@${domain}` }));
}

/** Đếm nhanh cho phần "kế hoạch" (chỉ đọc). */
export async function inspectTarget(svc, ctx) {
  const accounts = accountList(ctx);
  const profiles = await must(
    svc
      .from("profiles")
      .select("id, email")
      .in(
        "email",
        accounts.map((a) => a.email),
      ),
    "profiles",
  );
  const head = { count: "exact", head: true };
  const [demoOrgs, realApproved, realAll] = await Promise.all([
    svc.from("organizations").select("id", head).eq("is_demo", true),
    svc.from("organizations").select("id", head).eq("is_demo", false).eq("status", "approved"),
    svc.from("organizations").select("id", head).eq("is_demo", false),
  ]);
  for (const r of [demoOrgs, realApproved, realAll])
    if (r.error) fail(`Không đọc được organizations: ${r.error.message}`);
  return {
    accountsExisting: profiles.length,
    accountsTotal: accounts.length,
    demoOrgs: demoOrgs.count ?? 0,
    realApprovedOrgs: realApproved.count ?? 0,
    realOrgs: realAll.count ?? 0,
  };
}

export function printSeedPlan(ctx, info) {
  console.log(
    `Tài khoản demo : ${info.accountsTotal} (đã có ${info.accountsExisting}, tạo mới ${info.accountsTotal - info.accountsExisting})`,
  );
  console.log(
    `   giám khảo   : giamkhao.cuahang / giamkhao.tochuc / giamkhao.tnv @${ctx.emailDomain ?? DEFAULT_EMAIL_DOMAIN} (không có admin)`,
  );
  console.log(
    `Tổ chức demo   : ${ORGS.length} (8 cửa hàng + 4 tổ chức) — hiện có ${info.demoOrgs} tổ chức is_demo`,
  );
  console.log(`Tổ chức thật   : ${info.realOrgs} (đã duyệt ${info.realApprovedOrgs}) — KHÔNG bị đụng tới`);
  console.log(`Lô hôm nay     : bổ sung tới ${OFFERS.length} lô theo now() + khoảng (đủ Xanh/Vàng/Đỏ)`);
  console.log(
    "Luồng          : 3 yêu cầu chờ duyệt, 1 phân bổ đã xác nhận (tự lấy), 1 chuyến TNV, 3 bàn giao hôm nay",
  );
  console.log(
    `Lịch sử        : ${ctx.historyDays ? `${ctx.historyDays} ngày (chỉ ngày còn trống)` : "không sinh"}`,
  );
}

/** Chạy toàn bộ seed. Trả về tóm tắt (để demo-reset in và kiểm). */
export async function runSeed(ctx, svc) {
  const elapsed = stopwatch();
  const notes = [];
  const warn = (msg) => {
    notes.push(msg);
    console.log(`  ! ${msg}`);
  };

  // ---- tham chiếu ----
  const categories = Object.fromEntries(
    (
      await must(svc.from("food_categories").select("code, perishability, default_unit"), "food_categories")
    ).map((c) => [c.code, c]),
  );
  const policy = await must(
    svc.from("app_settings").select("value").eq("key", "terms_policy_version").maybeSingle(),
    "app_settings",
  );
  const policyVersion = typeof policy?.value === "string" ? policy.value : "2026-10-v1";

  // ---- 1. tài khoản ----
  section("Tài khoản (Auth Admin API, email_confirm)");
  const users = await ensureAccounts(ctx, svc);
  const sessions = new Map();
  const session = (key) => {
    if (!sessions.has(key)) sessions.set(key, userSession(ctx, svc, users[key]));
    return sessions.get(key);
  };

  // ---- 2. tổ chức ----
  section("Tổ chức (create → hồ sơ → điểm → giờ → giấy tờ → cam kết → gửi duyệt → duyệt demo)");
  const orgs = {};
  const byOwner = new Map();
  ORGS.forEach((def, i) => {
    const list = byOwner.get(def.owner) ?? [];
    list.push({ def, index: i });
    byOwner.set(def.owner, list);
  });
  await Promise.all(
    [...byOwner.values()].map(async (list) => {
      for (const { def, index } of list) {
        const org = await ensureOrg({ ctx, svc, def, index, users, session, policyVersion });
        if (org) orgs[def.key] = org;
      }
    }),
  );
  for (const def of ORGS) {
    const o = orgs[def.key];
    console.log(`  ${o ? (o.created ? "+" : "=") : "!"} ${def.name}${o ? "" : " — bỏ qua"}`);
  }
  if (Object.keys(orgs).length < ORGS.length) warn("Một số tổ chức chưa sẵn sàng (xem cảnh báo ở trên).");

  // ---- 3. thành viên TNV ----
  section("Tình nguyện viên (invite_member → accept_invite)");
  for (const v of VOLUNTEERS) {
    const org = orgs[v.org];
    if (!org) continue;
    const vol = users[v.account];
    const existing = await must(
      svc.from("org_members").select("status").eq("org_id", org.id).eq("user_id", vol.id).maybeSingle(),
      "org_members",
    );
    if (existing?.status === "active") {
      console.log(`  = ${vol.email} → ${org.name}`);
      continue;
    }
    const token = randomBytes(32).toString("base64url");
    await rpc(await session(org.owner), "invite_member", {
      p_org_id: org.id,
      p_email: vol.email,
      p_role: "volunteer",
      p_site_ids: null,
      p_token_hash: `\\x${sha256Hex(token)}`,
    });
    await rpc(await session(v.account), "accept_invite", { p_token: token });
    console.log(`  + ${vol.email} → ${org.name}`);
  }

  // ---- 4. lô hôm nay ----
  section("Lô hôm nay (create_offer → publish_offer, thời gian tương đối)");
  const offers = {};
  const byStore = new Map();
  for (const tpl of OFFERS) {
    const list = byStore.get(tpl.store) ?? [];
    list.push(tpl);
    byStore.set(tpl.store, list);
  }
  let createdOffers = 0;
  await pool([...byStore.entries()], 4, async ([storeKey, list]) => {
    const store = orgs[storeKey];
    if (!store) return;
    for (const tpl of list) {
      const live = await findLiveOffer(svc, store.id, tpl.title);
      if (live) {
        offers[tpl.key] = live;
        continue;
      }
      const made = await createOffer({
        svc,
        store,
        tpl,
        categories,
        client: await session(store.owner),
        warn,
      });
      if (made) {
        offers[tpl.key] = made;
        createdOffers++;
      }
    }
  });
  console.log(
    `  ${createdOffers} lô mới, ${Object.keys(offers).length - createdOffers} lô còn sống được giữ lại`,
  );

  // ---- 5. luồng ----
  section("Luồng (request_offer, confirm_allocation, assign_pickup, bàn giao QR)");
  const judgeStore = orgs.judge_store;
  const flowCtx = { svc, orgs, users, offers, session, warn };
  // Ba nhánh độc lập (lô khác nhau) chạy song song: mỗi lời gọi tới DB cloud tốn một vòng mạng
  await Promise.all([
    Promise.all(PENDING_REQUESTS.map((pr) => ensurePending(flowCtx, pr))),
    (async () => {
      if (!judgeStore) return;
      await ensureConfirmedForJudge(flowCtx);
      await ensureVolunteerTrip(flowCtx);
      await ensureAutoAccepted(flowCtx);
    })(),
    Promise.all(HANDOVER_OFFERS.map((h) => ensureHandoverToday({ ...flowCtx, categories, h }))),
  ]);

  // ---- 5b. P3: nhu cầu đang mở + hồ sơ tình nguyện viên ----
  section("Nhu cầu & tình nguyện viên (publish_need, upsert_volunteer_profile)");
  await ensureDemoNeed(flowCtx);
  await ensureVolunteerProfiles(flowCtx);

  // ---- 6. lịch sử ----
  let history = { delivered: 0, expired: 0, kg: 0 };
  if (ctx.historyDays > 0) {
    section(`Lịch sử ${ctx.historyDays} ngày (demo_seed_history, ledger qua credit_impact)`);
    history = await ensureHistory({ ctx, svc, orgs, users });
  }

  // ---- 7. tóm tắt ----
  const summary = await summarize(svc, orgs, categories);
  section(`Tóm tắt (seed ${elapsed()})`);
  printSummary(summary, history);
  printAccounts(ctx, users, orgs);
  return { summary, history, notes, users };
}

// ===========================================================================
// Tài khoản
// ===========================================================================

async function ensureAccounts(ctx, svc) {
  const accounts = accountList(ctx);
  const profiles = await must(
    svc
      .from("profiles")
      .select("id, email, is_demo, platform_role")
      .in(
        "email",
        accounts.map((a) => a.email),
      ),
    "profiles",
  );
  const byEmail = new Map(profiles.map((p) => [p.email, p]));
  const users = {};

  // Một mật khẩu chung cho mỗi nhóm đăng nhập (giám khảo / nhóm). Không truyền mà nhóm có tài khoản mới ⇒
  // sinh một mật khẩu và đặt cho CẢ nhóm (in một lần); không có tài khoản mới ⇒ giữ nguyên mật khẩu cũ.
  const groupPassword = {};
  for (const group of ["judge", "team"]) {
    const provided = group === "judge" ? ctx.judgePassword : ctx.teamPassword;
    const anyNew = accounts.some((a) => a.group === group && !byEmail.has(a.email));
    groupPassword[group] = provided ?? (anyNew ? generatePassword() : undefined);
  }
  const generated = {
    judge: !ctx.judgePassword && groupPassword.judge ? groupPassword.judge : undefined,
    team: !ctx.teamPassword && groupPassword.team ? groupPassword.team : undefined,
  };

  await pool(accounts, 4, async (acct) => {
    const provided = groupPassword[acct.group];
    const existing = byEmail.get(acct.email);
    if (existing) {
      if (existing.platform_role !== "user")
        fail(`${acct.email} là admin — không bao giờ dùng làm tài khoản demo.`);
      if (!existing.is_demo) {
        const { count, error } = await svc
          .from("org_members")
          .select("org_id, organizations!inner(is_demo)", { count: "exact", head: true })
          .eq("user_id", existing.id)
          .eq("organizations.is_demo", false);
        if (error) fail(`Không kiểm được ${acct.email}: ${error.message}`);
        if (count)
          fail(`${acct.email} đã là thành viên tổ chức thật — dừng để không biến tài khoản thật thành demo.`);
      }
      if (provided) {
        await must(
          svc.auth.admin.updateUserById(existing.id, { password: provided }),
          `cập nhật mật khẩu ${acct.email}`,
        );
      }
      users[acct.key] = { ...acct, id: existing.id, password: provided, created: false };
      return;
    }
    const password = provided ?? generatePassword();
    const created = await must(
      svc.auth.admin.createUser({
        email: acct.email,
        password,
        email_confirm: true,
        user_metadata: { full_name: acct.fullName },
      }),
      `tạo ${acct.email}`,
    );
    users[acct.key] = { ...acct, id: created.user.id, password, created: true };
  });

  const ids = Object.values(users).map((u) => u.id);
  await must(
    svc.from("profiles").update({ is_demo: true }).in("id", ids).eq("is_demo", false),
    "profiles.is_demo",
  );
  for (const acct of accounts) console.log(`  ${users[acct.key].created ? "+" : "="} ${acct.email}`);
  // thứ tự cố định (ACCOUNTS) cho phần in; mật khẩu sinh mới (nếu có) đi kèm để in một lần
  return Object.assign(Object.fromEntries(accounts.map((a) => [a.key, users[a.key]])), {
    [GENERATED]: generated,
  });
}

const GENERATED = Symbol("generatedPasswords");

// ===========================================================================
// Tổ chức
// ===========================================================================

function consentText(policyVersion) {
  return (
    "Tài khoản demo hư cấu do script seed FoodSave tạo (dữ liệu trình diễn). " +
    `Đồng ý Điều khoản sử dụng và Chính sách bảo mật phiên bản ${policyVersion} thay cho người dùng hư cấu; ` +
    "không có người thật nào ký cam kết này."
  );
}

async function ensureOrg({ svc, def, index, users, session, policyVersion }) {
  const owner = users[def.owner];
  const rows = await must(
    svc
      .from("organizations")
      .select("id, status, is_demo")
      .eq("created_by", owner.id)
      .eq("name", def.name)
      .order("created_at", { ascending: false }),
    "organizations",
  );
  let org = rows.find((r) => !["rejected", "closed"].includes(r.status));
  let created = false;
  if (!org) {
    const id = await rpc(await session(def.owner), "create_organization", {
      p_kind: def.kind,
      p_name: def.name,
      p_subtype: def.subtype,
      p_client_op_id: opId(),
    });
    org = { id, status: "draft", is_demo: false };
    created = true;
  }
  if (!org.is_demo) {
    // "is_demo: chỉ seed/service role đặt" (DATA-MODEL §2.1) — ngay sau khi tạo, trước mọi bước khác
    await must(svc.from("organizations").update({ is_demo: true }).eq("id", org.id), "organizations.is_demo");
  }

  if (org.status === "draft" || org.status === "needs_changes") {
    const client = await session(def.owner);
    await must(
      client
        .from("organizations")
        .update({
          description: def.description,
          ...(def.kind === "charity"
            ? { declared_beneficiaries: def.beneficiaries, founded_on: def.foundedOn }
            : {}),
        })
        .eq("id", org.id),
      "hồ sơ tổ chức",
    );
    await must(
      client
        .from("org_sensitive")
        .update({
          legal_name: def.legalName,
          tax_code: `000000${String(index + 1).padStart(4, "0")}`,
          registration_no: `DEMO-${String(index + 1).padStart(4, "0")}`,
          representative_name: owner.fullName,
          representative_title: def.representativeTitle,
          contact_email: owner.email,
        })
        .eq("org_id", org.id),
      "thông tin pháp lý (hư cấu)",
    );

    let siteId = await primarySiteId(svc, org.id);
    if (!siteId) {
      siteId = await rpc(client, "upsert_site", {
        p_org_id: org.id,
        p_site: { ...def.site, location_source: "pin" },
        p_client_op_id: opId(),
      });
    }
    await rpc(client, "set_site_hours", { p_site_id: siteId, p_hours: def.hours });

    const docs = await must(
      svc.from("org_documents").select("id").eq("org_id", org.id).is("change_request_id", null),
      "org_documents",
    );
    if (docs.length === 0) {
      const docType = def.kind === "store" ? "business_license" : "operating_license";
      const path = `${org.id}/${docType}/${randomUUID()}.pdf`;
      const bytes = demoPdf(def.name);
      await must(
        client.storage.from("kyc").upload(path, bytes, { contentType: "application/pdf", upsert: false }),
        "tải giấy tờ demo",
      );
      await must(
        client.from("org_documents").insert({
          org_id: org.id,
          doc_type: docType,
          storage_path: path,
          mime_type: "application/pdf",
          size_bytes: bytes.length,
          sha256: sha256Hex(bytes),
        }),
        "org_documents",
      );
    }

    await rpc(client, "grant_consent", {
      p_purpose: "terms",
      p_policy_version: policyVersion,
      p_text_hash: sha256Hex(consentText(policyVersion)),
      p_source: "web",
    });
    await rpc(client, "submit_organization", { p_org_id: org.id, p_client_op_id: opId() });
    org.status = "submitted";
  }

  if (org.status === "submitted") {
    await rpc(svc, "demo_approve_organization", { p_org_id: org.id, p_reviewer_id: users[REVIEWER].id });
    org.status = "approved";
  }
  if (org.status !== "approved") {
    console.log(`  ! ${def.name}: trạng thái ${org.status} — bỏ qua (cần demo:reset)`);
    return null;
  }
  const siteId = await primarySiteId(svc, org.id);
  if (!siteId) return null;
  return {
    key: def.key,
    kind: def.kind,
    name: def.name,
    owner: def.owner,
    hours: def.hours,
    id: org.id,
    siteId,
    created,
  };
}

async function primarySiteId(svc, orgId) {
  const rows = await must(
    svc.from("sites").select("id").eq("org_id", orgId).eq("is_primary", true).eq("is_active", true),
    "sites",
  );
  return rows[0]?.id ?? null;
}

// ===========================================================================
// Lô
// ===========================================================================

async function findLiveOffer(svc, storeOrgId, title, minAvailable = 0) {
  const rows = await must(
    svc
      .from("offers")
      .select("id, qty_available, effective_deadline, category_code")
      .eq("org_id", storeOrgId)
      .eq("title", title)
      .in("status", ["open", "fully_allocated"])
      .gt("effective_deadline", new Date(Date.now() + 20 * MINUTE).toISOString())
      .order("created_at", { ascending: false }),
    "offers",
  );
  const hit = rows.find((r) => Number(r.qty_available) >= minAvailable);
  return hit
    ? { id: hit.id, deadline: hit.effective_deadline, category: hit.category_code, created: false }
    : null;
}

/** Tạo + đăng một lô theo mẫu, khung lấy tính theo giờ mở cửa của điểm (giờ VN). */
async function createOffer({ store, tpl, client, warn }) {
  const now = new Date();
  const anchor = pickupAnchor(store.hours, now);
  if (!anchor) {
    warn(`${store.name}: không có giờ mở cửa trong tuần — bỏ lô "${tpl.title}"`);
    return null;
  }
  const openNow = anchor.start.getTime() === now.getTime();
  const begin = openNow ? now : anchor.start;
  // khung lấy bắt đầu từ phút hiện tại (lùi 1 phút) hoặc từ giờ mở cửa kế tiếp
  const windowStart = openNow ? new Date(Math.floor(now.getTime() / MINUTE) * MINUTE - MINUTE) : anchor.start;

  let expiry;
  let expiresAt;
  if (tpl.expiry === "end_of_day") {
    let p = vnParts(begin);
    expiresAt = vnInstant(p.year, p.month, p.day, 23 * 60 + 59);
    if (expiresAt.getTime() - begin.getTime() < 90 * MINUTE) {
      p = vnParts(new Date(begin.getTime() + 24 * HOUR));
      expiresAt = vnInstant(p.year, p.month, p.day, 23 * 60 + 59);
    }
    expiry = { date: vnDate(expiresAt) };
  } else {
    expiresAt = new Date(Math.floor((begin.getTime() + tpl.expiresH * HOUR) / MINUTE) * MINUTE);
    expiry = { datetime: expiresAt.toISOString() };
  }
  let windowEnd = expiresAt;
  if (anchor.close && anchor.close < windowEnd) windowEnd = anchor.close;
  if (windowEnd.getTime() - begin.getTime() < 45 * MINUTE) {
    warn(`${store.name}: còn quá ít thời gian mở cửa — bỏ lô "${tpl.title}"`);
    return null;
  }

  const payload = {
    site_id: store.siteId,
    category_code: tpl.category,
    title: tpl.title,
    description: `${tpl.description} (Dữ liệu demo)`,
    quantity: tpl.quantity,
    expiry,
    pickup_start: windowStart.toISOString(),
    pickup_end: windowEnd.toISOString(),
    ...(tpl.unit ? { unit: tpl.unit } : {}),
    ...(tpl.unitWeightKg ? { unit_weight_kg: tpl.unitWeightKg } : {}),
  };
  const id = await rpc(client, "create_offer", { p_payload: payload, p_client_op_id: opId() });
  const res = await rpc(client, "publish_offer", {
    p_offer_id: id,
    p_safety_attested: true,
    p_client_op_id: opId(),
  });
  return { id, deadline: res.effective_deadline, label: res.label, category: tpl.category, created: true };
}

// ===========================================================================
// Luồng
// ===========================================================================

/** request_offer dưới danh tính chủ tổ chức; trả { allocation_id, status } hoặc null (kèm cảnh báo). */
async function request(flow, charityKey, offer, qty) {
  const charity = flow.orgs[charityKey];
  if (!charity?.siteId) return null;
  try {
    return await rpc(await flow.session(charity.owner), "request_offer", {
      p_offer_id: offer.id,
      p_qty: qty,
      p_charity_site_id: charity.siteId,
      p_client_op_id: opId(),
    });
  } catch (err) {
    flow.warn(`${charity.name} không gửi được yêu cầu: ${err.message}`);
    return null;
  }
}

async function ensurePending(flow, pr) {
  const offer = flow.offers[pr.offer];
  if (!offer) return;
  const live = await must(
    flow.svc
      .from("allocations")
      .select("id")
      .eq("offer_id", offer.id)
      .eq("status", "requested")
      .gt("reserved_until", new Date(Date.now() + 10 * MINUTE).toISOString()),
    "allocations",
  );
  if (live.length) {
    console.log(`  = yêu cầu chờ duyệt: ${pr.offer}`);
    return;
  }
  for (const charityKey of [pr.charity, pr.fallbackCharity].filter(Boolean)) {
    const res = await request(flow, charityKey, offer, pr.quantity);
    if (res) {
      console.log(
        `  + yêu cầu ${res.status === "requested" ? "chờ duyệt" : res.status}: ${flow.orgs[charityKey].name} → ${pr.offer}`,
      );
      return;
    }
  }
}

/** Phân bổ "sống" của tổ chức với lô có tiêu đề cho trước. */
async function liveAllocations(svc, { charityOrgId, storeOrgId, title, statuses, unassignedOnly = false }) {
  let q = svc
    .from("allocations")
    .select("id, status, pickup_id, offers!inner(title, effective_deadline)")
    .eq("charity_org_id", charityOrgId)
    .eq("store_org_id", storeOrgId)
    .in("status", statuses)
    .eq("offers.title", title)
    .gt("offers.effective_deadline", new Date(Date.now() + 30 * MINUTE).toISOString());
  if (unassignedOnly) q = q.is("pickup_id", null);
  return must(q, "allocations");
}

/** request + (nếu cần) confirm_allocation bởi chủ cửa hàng. Trả allocation id hoặc null. */
async function requestAndConfirm(flow, charityKey, offer, qty, storeKey) {
  const res = await request(flow, charityKey, offer, qty);
  if (!res) return null;
  if (res.status === "requested") {
    await rpc(await flow.session(flow.orgs[storeKey].owner), "confirm_allocation", {
      p_allocation_id: res.allocation_id,
      p_client_op_id: opId(),
    });
  }
  return res.allocation_id;
}

async function ensureConfirmedForJudge(flow) {
  const c = CONFIRMED_FOR_JUDGE;
  const offer = flow.offers[c.offer];
  const charity = flow.orgs[c.charity];
  if (!offer || !charity) return;
  const tpl = OFFERS.find((o) => o.key === c.offer);
  const existing = await liveAllocations(flow.svc, {
    charityOrgId: charity.id,
    storeOrgId: flow.orgs.judge_store.id,
    title: tpl.title,
    statuses: ["confirmed"],
    unassignedOnly: true,
  });
  if (existing.length) {
    console.log(`  = phân bổ đã xác nhận (tự lấy) cho ${charity.name}`);
    return;
  }
  const id = await requestAndConfirm(flow, c.charity, offer, c.quantity, "judge_store");
  if (id) console.log(`  + phân bổ đã xác nhận, sẵn sàng tự đến lấy: ${tpl.title} → ${charity.name}`);
}

async function ensureVolunteerTrip(flow) {
  const t = VOLUNTEER_TRIP;
  const offer = flow.offers[t.offer];
  const charity = flow.orgs[t.charity];
  const volunteer = flow.users[t.volunteer];
  if (!offer || !charity) return;
  const trips = await must(
    flow.svc
      .from("pickups")
      .select("id")
      .eq("assignee_user_id", volunteer.id)
      .in("status", ["planned", "assigned", "in_progress"]),
    "pickups",
  );
  if (trips.length) {
    console.log(`  = chuyến đang chờ của ${volunteer.email}`);
    return;
  }
  const allocationId = await requestAndConfirm(flow, t.charity, offer, t.quantity, "judge_store");
  if (!allocationId) return;
  await rpc(await flow.session(charity.owner), "assign_pickup", {
    p_plan: {
      allocation_ids: [allocationId],
      mode: "volunteer",
      assignee_user_id: volunteer.id,
      charity_site_id: charity.siteId,
    },
    p_client_op_id: opId(),
  });
  console.log(`  + chuyến giao cho ${volunteer.email} (${charity.name})`);
}

async function ensureAutoAccepted(flow) {
  const a = AUTO_ACCEPTED;
  const offer = flow.offers[a.offer];
  const charity = flow.orgs[a.charity];
  const tpl = OFFERS.find((o) => o.key === a.offer);
  if (!offer || !charity || !flow.orgs[tpl.store]) return;
  const existing = await liveAllocations(flow.svc, {
    charityOrgId: charity.id,
    storeOrgId: flow.orgs[tpl.store].id,
    title: tpl.title,
    statuses: ["requested", "confirmed", "assigned"],
  });
  if (existing.length) {
    console.log(`  = yêu cầu tự chấp nhận: ${tpl.title} → ${charity.name}`);
    return;
  }
  const res = await request(flow, a.charity, offer, a.quantity);
  if (res)
    console.log(
      `  + ${flow.orgs[tpl.store].name} tự chấp nhận (${res.status}): ${tpl.title} → ${charity.name}`,
    );
}

/** Nhu cầu bánh mì đang mở của tổ chức giám khảo (bỏ qua nếu đã có nhu cầu còn ≥ 90 phút). */
async function ensureDemoNeed(flow) {
  const n = DEMO_NEED;
  const charity = flow.orgs[n.charity];
  if (!charity?.siteId) return;
  const live = await must(
    flow.svc
      .from("needs")
      .select("id")
      .eq("org_id", charity.id)
      .in("status", ["open", "partially_matched", "matched"])
      .gt("needed_by", new Date(Date.now() + 90 * MINUTE).toISOString()),
    "needs",
  );
  if (live.length) {
    console.log(`  = nhu cầu đang mở: ${charity.name}`);
    return;
  }
  try {
    await rpc(await flow.session(charity.owner), "publish_need", {
      p_site_id: charity.siteId,
      p_category_codes: n.categories,
      p_unit: n.unit,
      p_quantity: n.quantity,
      p_needed_by: new Date(Date.now() + n.hoursAhead * HOUR).toISOString(),
      p_people_to_serve: n.people,
      p_note: n.note,
      p_client_op_id: randomUUID(),
    });
    console.log(`  + nhu cầu ${n.quantity} ổ bánh mì: ${charity.name} (mở trang Nhu cầu để xem 3 phương án)`);
  } catch (err) {
    flow.warn(`${charity.name} không đăng được nhu cầu demo: ${err.message}`);
  }
}

/** Hồ sơ phương tiện / sức chở / khu vực của tình nguyện viên demo (idempotent: upsert). */
async function ensureVolunteerProfiles(flow) {
  await Promise.all(
    VOLUNTEER_PROFILES.map(async (v) => {
      if (!flow.users[v.account]) return;
      try {
        await rpc(await flow.session(v.account), "upsert_volunteer_profile", {
          p_payload: {
            vehicle: v.vehicle,
            capacity_kg: v.capacity_kg,
            lat: v.lat,
            lng: v.lng,
            base_area_label: v.label,
          },
        });
        console.log(`  = hồ sơ TNV: ${flow.users[v.account].email} (${v.vehicle}, ${v.capacity_kg} kg)`);
      } catch (err) {
        flow.warn(`Không cập nhật được hồ sơ TNV ${v.account}: ${err.message}`);
      }
    }),
  );
}

/** Bàn giao hoàn tất hôm nay: lô riêng → request → confirm → assign_pickup (tự lấy) → QR → dropoff tự động. */
async function ensureHandoverToday(flow) {
  const { h, svc, orgs } = flow;
  const store = orgs[h.store];
  const charity = orgs[h.charity];
  if (!store || !charity) return;
  const done = await must(
    svc
      .from("allocations")
      .select("id, offers!inner(title)")
      .eq("store_org_id", store.id)
      .eq("charity_org_id", charity.id)
      .eq("status", "delivered")
      .gte("delivered_at", vnMidnight(new Date()).toISOString())
      .eq("offers.title", h.title),
    "allocations",
  );
  if (done.length) {
    console.log(`  = bàn giao hôm nay: ${h.title} (${store.name} → ${charity.name})`);
    return;
  }
  const anchor = pickupAnchor(store.hours, new Date());
  if (!anchor || anchor.start.getTime() > Date.now()) {
    flow.warn(`${store.name} đang đóng cửa — bỏ qua bàn giao "${h.title}" hôm nay`);
    return;
  }
  const storeClient = await flow.session(store.owner);
  const charityClient = await flow.session(charity.owner);
  const offer = await createOffer({ store, tpl: h, client: storeClient, warn: flow.warn });
  if (!offer) return;
  const allocationId = await requestAndConfirm(flow, h.charity, offer, h.quantity, h.store);
  if (!allocationId) return;
  const pickupId = await rpc(charityClient, "assign_pickup", {
    p_plan: { allocation_ids: [allocationId], mode: "self", charity_site_id: charity.siteId },
    p_client_op_id: opId(),
  });
  const stop = await must(
    svc.from("pickup_stops").select("id").eq("pickup_id", pickupId).eq("kind", "pickup").single(),
    "pickup_stops",
  );
  const issued = await rpc(charityClient, "issue_handover_token", {
    p_stop_id: stop.id,
    p_lines: [],
    p_client_op_id: opId(),
  });
  const token = (Array.isArray(issued) ? issued[0] : issued)?.token;
  if (!token) fail("issue_handover_token không trả token.");
  const res = await rpc(storeClient, "consume_handover_token", {
    p_token: token,
    p_lines: [{ allocation_id: allocationId, qty: h.quantity }],
    p_client_op_id: opId(),
  });
  const kg = res?.dropoff?.kg;
  console.log(
    `  + bàn giao QR hoàn tất: ${h.title} (${store.name} → ${charity.name})${kg ? `, ${kg} kg vào sổ tác động` : ""}`,
  );
}

// ===========================================================================
// Lịch sử
// ===========================================================================

async function ensureHistory({ ctx, svc, orgs, users }) {
  const now = new Date();
  const from = vnDate(vnMidnight(now, -ctx.historyDays));
  const covered = await must(
    svc.from("impact_public_daily").select("day").eq("is_demo", true).gte("day", from),
    "impact_public_daily",
  );
  const missing = missingHistoryDays(
    now,
    ctx.historyDays,
    covered.map((r) => r.day),
  );
  const items = buildHistoryItems({ orgs, users, missingDays: missing, now });
  if (!items.length) {
    console.log(`  = đủ ${ctx.historyDays} ngày, không cần bổ sung`);
    return { delivered: 0, expired: 0, kg: 0 };
  }
  const total = { delivered: 0, expired: 0, kg: 0 };
  for (let i = 0; i < items.length; i += 400) {
    const res = await rpc(svc, "demo_seed_history", { p_items: items.slice(i, i + 400) });
    total.delivered += res.delivered;
    total.expired += res.expired;
    total.kg += Number(res.kg);
  }
  console.log(
    `  + ${missing.length} ngày: ${total.delivered} lần bàn giao, ${total.expired} lô hết hạn chưa nhận, ${total.kg.toFixed(1)} kg`,
  );
  return total;
}

// ===========================================================================
// Tóm tắt
// ===========================================================================

async function summarize(svc, orgs, categories) {
  const storeIds = Object.values(orgs)
    .filter((o) => o.kind === "store")
    .map((o) => o.id);
  const now = new Date();
  const open = storeIds.length
    ? await must(
        svc
          .from("offers")
          .select("effective_deadline, category_code")
          .in("org_id", storeIds)
          .in("status", ["open", "fully_allocated"]),
        "offers",
      )
    : [];
  const labels = { green: 0, yellow: 0, red: 0, expired: 0 };
  for (const o of open) {
    labels[freshnessLabel(new Date(o.effective_deadline), categories[o.category_code].perishability, now)]++;
  }
  const allocs = storeIds.length
    ? await must(svc.from("allocations").select("status").in("store_org_id", storeIds), "allocations")
    : [];
  const byStatus = {};
  for (const a of allocs) byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
  const ledger = await must(
    svc.from("impact_ledger").select("kg, occurred_at").eq("is_demo", true),
    "impact_ledger",
  );
  const today = vnMidnight(now).getTime();
  return {
    orgs: Object.keys(orgs).length,
    openOffers: open.length,
    labels,
    allocations: byStatus,
    ledgerRows: ledger.length,
    ledgerKg: ledger.reduce((s, r) => s + Number(r.kg), 0),
    ledgerToday: ledger.filter((r) => new Date(r.occurred_at).getTime() >= today).length,
  };
}

function printSummary(s, history) {
  console.log(`Tổ chức demo đã duyệt : ${s.orgs}`);
  console.log(
    `Lô đang mở            : ${s.openOffers} — ${["green", "yellow", "red"].map((l) => `${LABEL_VI[l]} ${s.labels[l]}`).join(", ")}`,
  );
  console.log(
    `Phân bổ (cửa hàng demo): ${
      Object.entries(s.allocations)
        .map(([k, v]) => `${k} ${v}`)
        .join(", ") || "0"
    }`,
  );
  console.log(
    `Sổ tác động (demo)    : ${s.ledgerRows} dòng credit, ${s.ledgerKg.toFixed(1)} kg (hôm nay ${s.ledgerToday}; lịch sử mới ${history.delivered})`,
  );
  if (!s.labels.green || !s.labels.yellow || !s.labels.red)
    console.log("  ! Chưa đủ cả 3 nhãn — kiểm tra giờ mở cửa / chạy lại seed.");
}

function printAccounts(ctx, users, orgs) {
  section("Tài khoản đăng nhập (mật khẩu chỉ in khi vừa được tạo ngẫu nhiên)");
  const roleOf = {
    judge_store: `chủ "${orgs.judge_store?.name ?? "cửa hàng"}"`,
    judge_charity: `chủ "${orgs.judge_charity?.name ?? "tổ chức"}"`,
    judge_volunteer: `TNV của "${orgs.judge_charity?.name ?? "tổ chức"}"`,
    team_store: `chủ "${orgs.may?.name ?? "Tiệm bánh Mây"}"`,
    team_charity: `chủ "${orgs.anh_duong?.name ?? "Mái ấm Ánh Dương"}"`,
    team_charity2: `chủ "${orgs.binh_minh?.name ?? "Mái ấm Bình Minh"}"`,
    team_volunteer: `TNV của "${orgs.anh_duong?.name ?? "Mái ấm Ánh Dương"}"`,
    team_volunteer2: `TNV của "${orgs.anh_duong?.name ?? "Mái ấm Ánh Dương"}"`,
  };
  for (const u of Object.values(users)) {
    if (u.group === "internal") continue;
    console.log(
      `  ${u.group === "judge" ? "[giám khảo]" : "[nhóm]     "} ${u.email.padEnd(36)} ${roleOf[u.key] ?? ""}`,
    );
  }
  const generated = users[GENERATED];
  const describe = (group, envName, provided) =>
    generated[group]
      ? `MỚI SINH (chỉ hiện một lần): ${generated[group]}`
      : provided
        ? `đã đặt theo ${envName}`
        : `không đổi (không truyền ${envName})`;
  console.log(
    `\n  Mật khẩu chung giám khảo : ${describe("judge", "DEMO_JUDGE_PASSWORD", ctx.judgePassword)}`,
  );
  console.log(`  Mật khẩu chung nhóm      : ${describe("team", "DEMO_TEAM_PASSWORD", ctx.teamPassword)}`);
  if (generated.judge || generated.team) {
    console.log(
      "  → Lưu vào trình quản lý mật khẩu, gửi giám khảo qua kênh riêng (không ghi vào repo/tài liệu).",
    );
  }
}
