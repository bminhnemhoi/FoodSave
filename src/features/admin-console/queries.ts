import "server-only";

import type { FreshnessLabel, Perishability } from "@/core/labels";
import type { AllocationStatus, OfferStatus, PickupStatus, UnitCode } from "@/features/catalog/labels";
import type { ShortfallReason } from "@/features/handover/labels";
import { vnDateKey, VN_OFFSET } from "@/features/offers/datetime";
import { escapeLike } from "@/features/org-reviews/schemas";
import { createClient } from "@/server/db/supabase";
import type { Database, Json } from "@/types/database.types";

import {
  ADMIN_PAGE_SIZE,
  LABEL_ORDER,
  offerSortOf,
  offerStatusesOf,
  staleBefore,
  TURNING_RED_HOURS,
  vnDayRange,
  type AllocationFilters,
  type AuditFilters,
  type OfferFilters,
} from "./filters";

/**
 * Đọc dữ liệu bảng điều khiển Admin (US-ADM-05, US-ADM-07, US-ADM-11) bằng client của NGƯỜI DÙNG: RLS
 * `private.is_admin()` (aal2) mở mọi dòng của offers / allocations / pickups / audit_logs cho Admin. Không
 * dùng service role — phiên rớt về aal1 thì truy vấn trả rỗng thay vì lộ dữ liệu.
 * Nhãn tươi tính lúc đọc bằng computed field `offer_label` / `offer_label_rank` / `offer_red_at`
 * (migration 20261009100000_admin_console, security invoker).
 */

type PickupMode = Database["public"]["Enums"]["pickup_mode"];

export type ListResult<T> = { rows: T[]; total: number; outOfRange: boolean };

function fail(what: string, code: string | undefined): never {
  throw new Error(`Không tải được ${what} (${code ?? "unknown"})`);
}

const num = (v: number | string | null | undefined) => (v === null || v === undefined ? 0 : Number(v));

// ---------------------------------------------------------------------------
// Danh mục (bộ lọc)
// ---------------------------------------------------------------------------

export type CategoryOption = { code: string; nameVi: string };

export async function listCategoryOptions(): Promise<CategoryOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("food_categories").select("code, name_vi").order("sort_order");
  if (error) fail("danh mục thực phẩm", error.code);
  return (data ?? []).map((c) => ({ code: c.code, nameVi: c.name_vi }));
}

// ---------------------------------------------------------------------------
// Lô hàng
// ---------------------------------------------------------------------------

export type AdminOfferRow = {
  id: string;
  title: string;
  status: OfferStatus;
  categoryName: string;
  perishability: Perishability;
  unit: UnitCode;
  quantity: number;
  qtyAvailable: number;
  qtyCommitted: number;
  effectiveDeadline: string | null;
  createdAt: string;
  closedAt: string | null;
  label: FreshnessLabel | null;
  store: { id: string; name: string; isDemo: boolean };
  site: { name: string; ward: string | null } | null;
  /** Yêu cầu đang chờ cửa hàng xác nhận (`requested`). */
  pendingRequests: number;
};

/** Mốc "chuyển Đỏ trong 3 giờ tới" (ô chỉ số + bộ lọc `soon`). */
function turningRedBy(now: Date): string {
  return new Date(now.getTime() + TURNING_RED_HOURS * 3_600_000).toISOString();
}

export async function listAdminOffers(
  f: OfferFilters,
  now: Date = new Date(),
): Promise<ListResult<AdminOfferRow>> {
  const supabase = await createClient();
  let query = supabase
    .from("offers")
    .select(
      "id, title, status, unit, quantity, qty_available, qty_committed, effective_deadline, created_at, closed_at, offer_label, food_categories(name_vi, perishability), sites(name, ward), organizations!inner(id, name, is_demo), allocations(count)",
      { count: "exact" },
    )
    .eq("allocations.status", "requested");

  const statuses = offerStatusesOf(f.view);
  if (statuses) query = query.in("status", statuses);
  if (f.labels.length > 0) query = query.in("offer_label", f.labels);
  if (f.cat) query = query.eq("category_code", f.cat);
  if (f.q) query = query.ilike("organizations.name", `%${escapeLike(f.q)}%`);
  if (!f.demo) query = query.eq("organizations.is_demo", false);
  if (f.unclaimed) query = query.eq("qty_committed", 0);
  if (f.soon) {
    query = query
      .eq("status", "open")
      .in("offer_label", ["green", "yellow"])
      .lte("offer_red_at", turningRedBy(now));
  }

  switch (offerSortOf(f.view)) {
    case "urgency":
      query = query
        .order("offer_label_rank", { ascending: true })
        .order("effective_deadline", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });
      break;
    case "closed":
      query = query.order("closed_at", { ascending: false, nullsFirst: false });
      break;
    case "created":
      query = query.order("created_at", { ascending: false });
      break;
  }

  const from = (f.page - 1) * ADMIN_PAGE_SIZE;
  const { data, count, error } = await query.order("id").range(from, from + ADMIN_PAGE_SIZE - 1);
  if (error?.code === "PGRST103") return { rows: [], total: count ?? 0, outOfRange: true };
  if (error) fail("danh sách lô", error.code);

  const rows = (data ?? []).map((o): AdminOfferRow => ({
    id: o.id,
    title: o.title,
    status: o.status,
    categoryName: o.food_categories?.name_vi ?? "—",
    perishability: o.food_categories?.perishability ?? "packaged",
    unit: o.unit,
    quantity: num(o.quantity),
    qtyAvailable: num(o.qty_available),
    qtyCommitted: num(o.qty_committed),
    effectiveDeadline: o.effective_deadline,
    createdAt: o.created_at,
    closedAt: o.closed_at,
    label: o.offer_label,
    store: { id: o.organizations.id, name: o.organizations.name, isDemo: o.organizations.is_demo },
    site: o.sites ? { name: o.sites.name, ward: o.sites.ward } : null,
    pendingRequests: o.allocations[0]?.count ?? 0,
  }));
  return { rows, total: count ?? rows.length, outOfRange: false };
}

export type OfferKpis = {
  /** Lô `open` theo nhãn tính lúc đọc ("Hết hạn" = đã quá hạn nhưng tác vụ đóng lô chưa chạy). */
  openByLabel: Record<FreshnessLabel, number>;
  /** Lô `open` đang Xanh/Vàng sẽ chuyển Đỏ trong 3 giờ tới. */
  turningRedSoon: number;
  /** Lô đóng với trạng thái `expired` (không ai lấy được gì) từ 00:00 hôm nay, giờ Việt Nam. */
  expiredToday: number;
  at: string;
};

export async function getOfferKpis(includeDemo: boolean, now: Date = new Date()): Promise<OfferKpis> {
  const supabase = await createClient();
  const base = () => {
    const q = supabase
      .from("offers")
      .select("id, organizations!inner(is_demo)", { count: "exact", head: true });
    return includeDemo ? q : q.eq("organizations.is_demo", false);
  };
  const todayStart = `${vnDateKey(now)}T00:00:00${VN_OFFSET}`;

  const results = await Promise.all([
    ...LABEL_ORDER.map((label) => base().eq("status", "open").eq("offer_label", label)),
    base().eq("status", "open").in("offer_label", ["green", "yellow"]).lte("offer_red_at", turningRedBy(now)),
    base().eq("status", "expired").gte("closed_at", todayStart),
  ]);
  for (const r of results) if (r.error) fail("chỉ số lô", r.error.code);
  const counts = results.map((r) => r.count ?? 0);

  return {
    openByLabel: Object.fromEntries(LABEL_ORDER.map((l, i) => [l, counts[i]!])) as Record<
      FreshnessLabel,
      number
    >,
    turningRedSoon: counts[LABEL_ORDER.length]!,
    expiredToday: counts[LABEL_ORDER.length + 1]!,
    at: now.toISOString(),
  };
}

export type AdminAllocationItem = {
  id: string;
  status: AllocationStatus;
  unit: UnitCode;
  qtyReserved: number;
  qtyPicked: number;
  qtyDelivered: number;
  qtyReleased: number;
  requestedAt: string;
  confirmedAt: string | null;
  updatedAt: string;
  autoConfirmed: boolean;
  shortfallReason: ShortfallReason | null;
  cancelActor: string | null;
  cancelReason: string | null;
  charity: { id: string; name: string; isDemo: boolean };
  charitySite: { name: string; ward: string | null } | null;
  pickup: { status: PickupStatus; mode: PickupMode } | null;
};

export type AdminOfferDetail = {
  id: string;
  title: string;
  description: string | null;
  status: OfferStatus;
  label: FreshnessLabel | null;
  categoryName: string;
  perishability: Perishability;
  unit: UnitCode;
  unitWeightKg: number;
  quantity: number;
  qtyAvailable: number;
  qtyCommitted: number;
  qtyUnclaimed: number | null;
  expiresAt: string;
  expiryIsDateOnly: boolean;
  pickupWindow: string | null;
  effectiveDeadline: string | null;
  publishedAt: string | null;
  closedAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  aiAssisted: boolean;
  store: { id: string; name: string; isDemo: boolean };
  site: { name: string; ward: string | null; city: string } | null;
  allocations: AdminAllocationItem[];
};

/** Một lô + mọi phân bổ của lô (mới nhất trước); `null` khi không có (hoặc RLS chặn). */
export async function getAdminOfferDetail(offerId: string): Promise<AdminOfferDetail | null> {
  const supabase = await createClient();
  const [offerRes, allocRes] = await Promise.all([
    supabase
      .from("offers")
      .select(
        "id, title, description, status, unit, unit_weight_kg, quantity, qty_available, qty_committed, qty_unclaimed, expires_at, expiry_is_date_only, pickup_window, effective_deadline, published_at, closed_at, cancel_reason, created_at, ai_assisted, offer_label, food_categories(name_vi, perishability), sites(name, ward, city), organizations(id, name, is_demo)",
      )
      .eq("id", offerId)
      .maybeSingle(),
    supabase
      .from("allocations")
      .select(
        "id, status, unit, qty_reserved, qty_picked, qty_delivered, qty_released, requested_at, confirmed_at, updated_at, auto_confirmed, shortfall_reason, cancel_actor, cancel_reason, charity:organizations!allocations_charity_org_id_fkey(id, name, is_demo), charity_site:sites!allocations_charity_site_id_fkey(name, ward), pickups!allocations_pickup_id_fkey(status, mode)",
      )
      .eq("offer_id", offerId)
      .order("requested_at", { ascending: false })
      .limit(200),
  ]);
  if (offerRes.error) fail("lô", offerRes.error.code);
  if (allocRes.error) fail("phân bổ của lô", allocRes.error.code);
  const o = offerRes.data;
  if (!o || !o.organizations) return null;

  return {
    id: o.id,
    title: o.title,
    description: o.description,
    status: o.status,
    label: o.offer_label,
    categoryName: o.food_categories?.name_vi ?? "—",
    perishability: o.food_categories?.perishability ?? "packaged",
    unit: o.unit,
    unitWeightKg: num(o.unit_weight_kg),
    quantity: num(o.quantity),
    qtyAvailable: num(o.qty_available),
    qtyCommitted: num(o.qty_committed),
    qtyUnclaimed: o.qty_unclaimed === null ? null : num(o.qty_unclaimed),
    expiresAt: o.expires_at,
    expiryIsDateOnly: o.expiry_is_date_only,
    pickupWindow: typeof o.pickup_window === "string" ? o.pickup_window : null,
    effectiveDeadline: o.effective_deadline,
    publishedAt: o.published_at,
    closedAt: o.closed_at,
    cancelReason: o.cancel_reason,
    createdAt: o.created_at,
    aiAssisted: o.ai_assisted,
    store: { id: o.organizations.id, name: o.organizations.name, isDemo: o.organizations.is_demo },
    site: o.sites ? { name: o.sites.name, ward: o.sites.ward, city: o.sites.city } : null,
    allocations: (allocRes.data ?? []).map((a): AdminAllocationItem => ({
      id: a.id,
      status: a.status,
      unit: a.unit,
      qtyReserved: num(a.qty_reserved),
      qtyPicked: num(a.qty_picked),
      qtyDelivered: num(a.qty_delivered),
      qtyReleased: num(a.qty_released),
      requestedAt: a.requested_at,
      confirmedAt: a.confirmed_at,
      updatedAt: a.updated_at,
      autoConfirmed: a.auto_confirmed,
      shortfallReason: a.shortfall_reason,
      cancelActor: a.cancel_actor,
      cancelReason: a.cancel_reason,
      charity: { id: a.charity.id, name: a.charity.name, isDemo: a.charity.is_demo },
      charitySite: a.charity_site ? { name: a.charity_site.name, ward: a.charity_site.ward } : null,
      pickup: a.pickups ? { status: a.pickups.status, mode: a.pickups.mode } : null,
    })),
  };
}

// ---------------------------------------------------------------------------
// Phân bổ & chuyến
// ---------------------------------------------------------------------------

export type AdminAllocationRow = AdminAllocationItem & {
  offerId: string;
  offerTitle: string;
  store: { id: string; name: string; isDemo: boolean };
  storeSite: { name: string; ward: string | null } | null;
};

const ALLOCATION_COLUMNS =
  "id, offer_id, status, unit, qty_reserved, qty_picked, qty_delivered, qty_released, requested_at, confirmed_at, updated_at, auto_confirmed, shortfall_reason, cancel_actor, cancel_reason, offers(title), store:organizations!allocations_store_org_id_fkey!inner(id, name, is_demo), store_site:sites!allocations_store_site_id_fkey(name, ward), charity:organizations!allocations_charity_org_id_fkey!inner(id, name, is_demo), charity_site:sites!allocations_charity_site_id_fkey(name, ward), pickups!allocations_pickup_id_fkey(status, mode)";

/** Chuyến đang chạy (`in_progress`) — tập nhỏ; dùng để lọc "chuyến đang chạy". */
async function runningPickupIds(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("pickups").select("id").eq("status", "in_progress").limit(500);
  if (error) fail("chuyến đang chạy", error.code);
  return (data ?? []).map((p) => p.id);
}

export async function listAdminAllocations(
  f: AllocationFilters,
  now: Date = new Date(),
): Promise<ListResult<AdminAllocationRow>> {
  const supabase = await createClient();
  let query = supabase.from("allocations").select(ALLOCATION_COLUMNS, { count: "exact" });

  if (f.view !== "all") query = query.eq("status", f.view);
  if (f.quick === "stale") query = query.eq("status", "requested").lt("requested_at", staleBefore(now));
  if (f.quick === "running") {
    const ids = await runningPickupIds();
    if (ids.length === 0) return { rows: [], total: 0, outOfRange: false };
    query = query.in("pickup_id", ids);
  }
  if (f.id) query = query.eq("id", f.id);
  if (!f.demo) query = query.eq("store.is_demo", false).eq("charity.is_demo", false);

  const from = (f.page - 1) * ADMIN_PAGE_SIZE;
  const { data, count, error } = await query
    .order("requested_at", { ascending: f.quick === "stale" })
    .order("id")
    .range(from, from + ADMIN_PAGE_SIZE - 1);
  if (error?.code === "PGRST103") return { rows: [], total: count ?? 0, outOfRange: true };
  if (error) fail("danh sách phân bổ", error.code);

  const rows = (data ?? []).map((a): AdminAllocationRow => ({
    id: a.id,
    offerId: a.offer_id,
    offerTitle: a.offers?.title ?? "—",
    status: a.status,
    unit: a.unit,
    qtyReserved: num(a.qty_reserved),
    qtyPicked: num(a.qty_picked),
    qtyDelivered: num(a.qty_delivered),
    qtyReleased: num(a.qty_released),
    requestedAt: a.requested_at,
    confirmedAt: a.confirmed_at,
    updatedAt: a.updated_at,
    autoConfirmed: a.auto_confirmed,
    shortfallReason: a.shortfall_reason,
    cancelActor: a.cancel_actor,
    cancelReason: a.cancel_reason,
    store: { id: a.store.id, name: a.store.name, isDemo: a.store.is_demo },
    storeSite: a.store_site ? { name: a.store_site.name, ward: a.store_site.ward } : null,
    charity: { id: a.charity.id, name: a.charity.name, isDemo: a.charity.is_demo },
    charitySite: a.charity_site ? { name: a.charity_site.name, ward: a.charity_site.ward } : null,
    pickup: a.pickups ? { status: a.pickups.status, mode: a.pickups.mode } : null,
  }));
  return { rows, total: count ?? rows.length, outOfRange: false };
}

/** Số phân bổ chờ quá 1 giờ và thuộc chuyến đang chạy (hiện trên nút lọc nhanh). */
export async function countAllocationQuick(
  includeDemo: boolean,
  now: Date = new Date(),
): Promise<{ stale: number; running: number }> {
  const supabase = await createClient();
  const base = () => {
    const q = supabase
      .from("allocations")
      .select(
        "id, store:organizations!allocations_store_org_id_fkey!inner(is_demo), charity:organizations!allocations_charity_org_id_fkey!inner(is_demo)",
        { count: "exact", head: true },
      );
    return includeDemo ? q : q.eq("store.is_demo", false).eq("charity.is_demo", false);
  };
  const ids = await runningPickupIds();
  const [stale, running] = await Promise.all([
    base().eq("status", "requested").lt("requested_at", staleBefore(now)),
    ids.length > 0 ? base().in("pickup_id", ids) : Promise.resolve({ count: 0, error: null }),
  ]);
  if (stale.error) fail("phân bổ chờ lâu", stale.error.code);
  if (running.error) fail("phân bổ đang chạy", running.error.code);
  return { stale: stale.count ?? 0, running: running.count ?? 0 };
}

// ---------------------------------------------------------------------------
// Nhật ký kiểm toán
// ---------------------------------------------------------------------------

export type AuditRow = {
  id: number;
  at: string;
  actorId: string | null;
  actorKind: string;
  actorOrgRole: Database["public"]["Enums"]["org_role"] | null;
  actor: { fullName: string | null; email: string | null } | null;
  action: string;
  entityType: string;
  entityId: string | null;
  org: { id: string; name: string } | null;
  orgId: string | null;
  before: Json | null;
  after: Json | null;
  reason: string | null;
};

const ACTOR_MATCH_LIMIT = 100;

/** Người thực hiện khớp tên HOẶC email (hai truy vấn ilike riêng — không ghép chuỗi `.or()`, hồi quy B7). */
async function matchActorIds(term: string): Promise<string[]> {
  const supabase = await createClient();
  const pattern = `%${escapeLike(term)}%`;
  const [byName, byEmail] = await Promise.all([
    supabase.from("profiles").select("id").ilike("full_name", pattern).limit(ACTOR_MATCH_LIMIT),
    supabase.from("profiles").select("id").ilike("email", pattern).limit(ACTOR_MATCH_LIMIT),
  ]);
  if (byName.error) fail("người thực hiện", byName.error.code);
  if (byEmail.error) fail("người thực hiện", byEmail.error.code);
  return [...new Set([...(byName.data ?? []), ...(byEmail.data ?? [])].map((p) => p.id))];
}

export async function listAuditLogs(f: AuditFilters): Promise<ListResult<AuditRow>> {
  const supabase = await createClient();
  let actorIds: string[] | null = null;
  if (f.actor) {
    actorIds = await matchActorIds(f.actor);
    if (actorIds.length === 0) return { rows: [], total: 0, outOfRange: false };
  }

  let query = supabase
    .from("audit_logs")
    .select(
      "id, at, actor_id, actor_kind, actor_org_role, org_id, action, entity_type, entity_id, before, after, reason, actor:profiles!audit_logs_actor_id_fkey(full_name, email)",
      { count: "exact" },
    );
  // Nhóm hành động lấy từ danh sách đóng; vẫn thoát `_` (vd. volunteer_profile) để LIKE khớp nguyên văn.
  if (f.act) query = query.like("action", `${escapeLike(f.act)}.%`);
  if (f.type) query = query.eq("entity_type", f.type);
  if (f.id) query = query.eq("entity_id", f.id);
  if (actorIds) query = query.in("actor_id", actorIds);
  const range = vnDayRange(f.from, f.to);
  if (range.gte) query = query.gte("at", range.gte);
  if (range.lt) query = query.lt("at", range.lt);

  const from = (f.page - 1) * ADMIN_PAGE_SIZE;
  const { data, count, error } = await query
    .order("at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + ADMIN_PAGE_SIZE - 1);
  if (error?.code === "PGRST103") return { rows: [], total: count ?? 0, outOfRange: true };
  if (error) fail("nhật ký kiểm toán", error.code);

  const logs = data ?? [];
  const orgIds = [...new Set(logs.map((l) => l.org_id).filter((id): id is string => id !== null))];
  // audit_logs.org_id cố ý không có FK (dòng audit sống lâu hơn đối tượng) ⇒ tra tên riêng
  const orgNames = new Map<string, string>();
  if (orgIds.length > 0) {
    const { data: orgs, error: orgError } = await supabase
      .from("organizations")
      .select("id, name")
      .in("id", orgIds);
    if (orgError) fail("tên tổ chức", orgError.code);
    for (const o of orgs ?? []) orgNames.set(o.id, o.name);
  }

  const rows = logs.map((l): AuditRow => ({
    id: l.id,
    at: l.at,
    actorId: l.actor_id,
    actorKind: l.actor_kind,
    actorOrgRole: l.actor_org_role,
    actor: l.actor ? { fullName: l.actor.full_name, email: l.actor.email } : null,
    action: l.action,
    entityType: l.entity_type,
    entityId: l.entity_id,
    orgId: l.org_id,
    org: l.org_id && orgNames.has(l.org_id) ? { id: l.org_id, name: orgNames.get(l.org_id)! } : null,
    before: l.before,
    after: l.after,
    reason: l.reason,
  }));
  return { rows, total: count ?? rows.length, outOfRange: false };
}
