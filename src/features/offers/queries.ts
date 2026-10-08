import "server-only";

import { cache } from "react";

import type { OrgRole } from "@/core/access/portal";
import { freshnessLabel, LABEL_PRIORITY, type FreshnessLabel, type Perishability } from "@/core/labels";
import type { OfferStatus, UnitCode } from "@/features/catalog/labels";
import { requirePortal } from "@/server/auth/guards";
import { createClient } from "@/server/db/supabase";

import { parseTstzRange, vnDateKey } from "./datetime";
import type { OfferRecord } from "./mapping";
import type { CategoryOption, SiteOption, WeightSource } from "./schemas";

/**
 * Đọc dữ liệu lô tặng của cổng Cửa hàng (RSC). Luôn dùng client Supabase của NGƯỜI DÙNG: RLS `offers_select`
 * giới hạn theo điểm (`can_access_site` — nhân viên chỉ thấy điểm được giao, US-STO-06), không service role.
 */

export type StoreContext = {
  orgId: string;
  orgName: string;
  userId: string;
  role: OrgRole;
  /** Giới hạn điểm của người xem (`null` = mọi điểm). */
  siteIds: string[] | null;
  /** Điểm đang hoạt động mà người xem được thao tác. */
  sites: SiteOption[];
  /** owner/manager: hủy lô (`cancel_offer`) — nhân viên thì không (DATA-MODEL §6.1). */
  canCancel: boolean;
  isPaused: boolean;
};

function fail(what: string, code: string | undefined): never {
  throw new Error(`Không tải được ${what} (${code ?? "unknown"})`);
}

export const loadStoreContext = cache(async (): Promise<StoreContext> => {
  const { profile, membership } = await requirePortal("store");
  const supabase = await createClient();
  const [meRes, sitesRes, orgRes] = await Promise.all([
    supabase
      .from("org_members")
      .select("site_ids")
      .eq("org_id", membership.orgId)
      .eq("user_id", profile.id)
      .eq("status", "active")
      .maybeSingle(),
    supabase
      .from("sites")
      .select("id, name, ward, is_primary, is_active")
      .eq("org_id", membership.orgId)
      .order("is_primary", { ascending: false })
      .order("name"),
    supabase.from("organizations").select("is_paused").eq("id", membership.orgId).single(),
  ]);
  if (meRes.error) fail("quyền của bạn", meRes.error.code);
  if (sitesRes.error) fail("danh sách điểm", sitesRes.error.code);
  if (orgRes.error) fail("cửa hàng", orgRes.error.code);

  const siteIds = meRes.data?.site_ids ?? null;
  const sites = (sitesRes.data ?? [])
    .filter((s) => s.is_active && (siteIds === null || siteIds.includes(s.id)))
    .map((s) => ({ id: s.id, name: s.name, ward: s.ward }));

  return {
    orgId: membership.orgId,
    orgName: membership.org.name,
    userId: profile.id,
    role: membership.role,
    siteIds,
    sites,
    canCancel: membership.role === "owner" || membership.role === "manager",
    isPaused: orgRes.data.is_paused,
  };
});

/** Danh mục đang dùng (ai cũng đọc được — RLS `food_categories_select`). */
export const loadCategories = cache(async (): Promise<CategoryOption[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("food_categories")
    .select("code, name_vi, perishability, default_unit, default_unit_weight_kg, icon")
    .eq("is_active", true)
    .order("sort_order");
  if (error) fail("danh mục thực phẩm", error.code);
  return (data ?? []).map((c) => ({
    code: c.code,
    nameVi: c.name_vi,
    perishability: c.perishability,
    defaultUnit: c.default_unit,
    defaultUnitWeightKg: Number(c.default_unit_weight_kg),
    icon: c.icon,
  }));
});

// ---------------------------------------------------------------------------
// Lô
// ---------------------------------------------------------------------------

const OFFER_COLUMNS =
  "id, title, description, status, site_id, category_code, quantity, unit, unit_weight_kg, weight_source, " +
  "qty_committed, qty_available, qty_unclaimed, effective_deadline, expires_at, expiry_is_date_only, " +
  "pickup_window, photo_paths, ai_assisted, published_at, safety_attested_at, closed_at, cancel_reason, " +
  "created_at, updated_at, food_categories(name_vi, perishability, icon), sites(name)";

type OfferDbRow = {
  id: string;
  title: string;
  description: string | null;
  status: OfferStatus;
  site_id: string;
  category_code: string;
  quantity: number;
  unit: UnitCode;
  unit_weight_kg: number;
  weight_source: WeightSource;
  qty_committed: number;
  qty_available: number | null;
  qty_unclaimed: number | null;
  effective_deadline: string | null;
  expires_at: string;
  expiry_is_date_only: boolean;
  pickup_window: unknown;
  photo_paths: string[];
  ai_assisted: boolean;
  published_at: string | null;
  safety_attested_at: string | null;
  closed_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
  food_categories: { name_vi: string; perishability: Perishability; icon: string } | null;
  sites: { name: string } | null;
};

export type StoreOffer = {
  id: string;
  title: string;
  description: string | null;
  status: OfferStatus;
  siteId: string;
  siteName: string | null;
  categoryCode: string;
  categoryName: string;
  perishability: Perishability;
  icon: string | null;
  quantity: number;
  unit: UnitCode;
  unitWeightKg: number;
  weightSource: WeightSource;
  committed: number;
  available: number;
  unclaimed: number | null;
  effectiveDeadline: string | null;
  expiresAt: string;
  expiryIsDateOnly: boolean;
  pickupWindowText: string;
  pickupStart: string | null;
  pickupEnd: string | null;
  photoPath: string | null;
  photoPaths: string[];
  aiAssisted: boolean;
  publishedAt: string | null;
  safetyAttestedAt: string | null;
  closedAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
};

function toOffer(r: OfferDbRow): StoreOffer {
  const windowText = typeof r.pickup_window === "string" ? r.pickup_window : "";
  const window = parseTstzRange(windowText);
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    status: r.status,
    siteId: r.site_id,
    siteName: r.sites?.name ?? null,
    categoryCode: r.category_code,
    categoryName: r.food_categories?.name_vi ?? r.category_code,
    perishability: r.food_categories?.perishability ?? "packaged",
    icon: r.food_categories?.icon ?? null,
    quantity: Number(r.quantity),
    unit: r.unit,
    unitWeightKg: Number(r.unit_weight_kg),
    weightSource: r.weight_source,
    committed: Number(r.qty_committed),
    available: Number(r.qty_available ?? Number(r.quantity) - Number(r.qty_committed)),
    unclaimed: r.qty_unclaimed === null ? null : Number(r.qty_unclaimed),
    effectiveDeadline: r.effective_deadline,
    expiresAt: r.expires_at,
    expiryIsDateOnly: r.expiry_is_date_only,
    pickupWindowText: windowText,
    pickupStart: window?.start.toISOString() ?? null,
    pickupEnd: window?.end.toISOString() ?? null,
    photoPath: r.photo_paths?.[0] ?? null,
    photoPaths: r.photo_paths ?? [],
    aiAssisted: r.ai_assisted,
    publishedAt: r.published_at,
    safetyAttestedAt: r.safety_attested_at,
    closedAt: r.closed_at,
    cancelReason: r.cancel_reason,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function offerRecord(o: StoreOffer): OfferRecord {
  return {
    siteId: o.siteId,
    categoryCode: o.categoryCode,
    title: o.title,
    description: o.description,
    quantity: o.quantity,
    unit: o.unit,
    unitWeightKg: o.unitWeightKg,
    weightSource: o.weightSource,
    expiresAt: o.expiresAt,
    expiryIsDateOnly: o.expiryIsDateOnly,
    pickupWindow: o.pickupWindowText,
    photoPaths: o.photoPaths,
    aiAssisted: o.aiAssisted,
  };
}

/** Số liệu phân bổ của một lô (đã lấy, yêu cầu chờ, đang chuẩn bị). */
export type OfferAllocationStats = {
  picked: number;
  /** Yêu cầu `requested` còn trong hạn phản hồi. */
  pending: number;
  /** `confirmed`/`assigned` — sẽ bị hủy (−5 uy tín mỗi phân bổ) nếu cửa hàng hủy lô. */
  confirmed: number;
  /** Có bất kỳ phân bổ nào (mọi trạng thái) ⇒ `update_offer` chỉ cho sửa tên, mô tả, ảnh. */
  total: number;
};

export type InventoryOffer = StoreOffer & { stats: OfferAllocationStats; label: FreshnessLabel | null };

const EMPTY_STATS: OfferAllocationStats = { picked: 0, pending: 0, confirmed: 0, total: 0 };

async function loadStats(offerIds: string[], now: Date): Promise<Map<string, OfferAllocationStats>> {
  const map = new Map<string, OfferAllocationStats>();
  if (offerIds.length === 0) return map;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("allocations")
    .select("offer_id, status, qty_picked, reserved_until")
    .in("offer_id", offerIds);
  if (error) fail("phân bổ của lô", error.code);
  for (const a of data ?? []) {
    const s = { ...(map.get(a.offer_id) ?? EMPTY_STATS) };
    s.total += 1;
    s.picked += Number(a.qty_picked);
    if (a.status === "requested" && a.reserved_until && new Date(a.reserved_until) > now) s.pending += 1;
    if (a.status === "confirmed" || a.status === "assigned") s.confirmed += 1;
    map.set(a.offer_id, s);
  }
  return map;
}

function withStats(
  offers: StoreOffer[],
  stats: Map<string, OfferAllocationStats>,
  now: Date,
): InventoryOffer[] {
  return offers.map((o) => ({
    ...o,
    stats: stats.get(o.id) ?? EMPTY_STATS,
    label:
      o.effectiveDeadline && (o.status === "open" || o.status === "fully_allocated")
        ? freshnessLabel(new Date(o.effectiveDeadline), o.perishability, now)
        : null,
  }));
}

/** Đỏ → Vàng → Xanh → Hết hạn, cùng nhãn thì hạn hiệu lực gần nhất trước (US-STO-10 AC1). */
export function sortByUrgency(a: InventoryOffer, b: InventoryOffer): number {
  const pa = a.label ? LABEL_PRIORITY[a.label] : 9;
  const pb = b.label ? LABEL_PRIORITY[b.label] : 9;
  if (pa !== pb) return pa - pb;
  const da = a.effectiveDeadline ? Date.parse(a.effectiveDeadline) : Infinity;
  const db = b.effectiveDeadline ? Date.parse(b.effectiveDeadline) : Infinity;
  return da - db;
}

export type InventoryTab = "open" | "draft" | "closed";

export const TAB_STATUSES: Record<InventoryTab, OfferStatus[]> = {
  open: ["open", "fully_allocated"],
  draft: ["draft"],
  closed: ["completed", "expired", "cancelled"],
};

/** Lô đã kết thúc hiện tối đa bấy nhiêu lô gần nhất. */
export const CLOSED_LIMIT = 50;

export async function listInventory(opts: {
  orgId: string;
  tab: InventoryTab;
  siteId: string | null;
  now: Date;
}): Promise<{ offers: InventoryOffer[]; counts: Record<InventoryTab, number> }> {
  const supabase = await createClient();

  const countOf = (tab: InventoryTab) => {
    let q = supabase
      .from("offers")
      .select("id", { count: "exact", head: true })
      .eq("org_id", opts.orgId)
      .in("status", TAB_STATUSES[tab]);
    if (opts.siteId) q = q.eq("site_id", opts.siteId);
    return q;
  };

  let list = supabase
    .from("offers")
    .select(OFFER_COLUMNS)
    .eq("org_id", opts.orgId)
    .in("status", TAB_STATUSES[opts.tab]);
  if (opts.siteId) list = list.eq("site_id", opts.siteId);
  list =
    opts.tab === "closed"
      ? list.order("closed_at", { ascending: false, nullsFirst: false }).limit(CLOSED_LIMIT)
      : opts.tab === "draft"
        ? list.order("updated_at", { ascending: false })
        : list.order("effective_deadline", { ascending: true });

  const [listRes, openRes, draftRes, closedRes] = await Promise.all([
    list,
    countOf("open"),
    countOf("draft"),
    countOf("closed"),
  ]);
  if (listRes.error) fail("danh sách lô", listRes.error.code);
  for (const r of [openRes, draftRes, closedRes]) if (r.error) fail("số lượng lô", r.error.code);

  const offers = ((listRes.data ?? []) as unknown as OfferDbRow[]).map(toOffer);
  const stats = await loadStats(
    offers.map((o) => o.id),
    opts.now,
  );
  let rows = withStats(offers, stats, opts.now);
  if (opts.tab === "open") rows = rows.sort(sortByUrgency);

  return {
    offers: rows,
    counts: { open: openRes.count ?? 0, draft: draftRes.count ?? 0, closed: closedRes.count ?? 0 },
  };
}

/** Một lô của cửa hàng (RLS: điểm người xem được thao tác). Không thấy ⇒ null. */
export async function getStoreOffer(offerId: string, now: Date): Promise<InventoryOffer | null> {
  if (!/^[0-9a-f-]{36}$/i.test(offerId)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("offers").select(OFFER_COLUMNS).eq("id", offerId).maybeSingle();
  if (error) fail("lô tặng", error.code);
  if (!data) return null;
  const offer = toOffer(data as unknown as OfferDbRow);
  const stats = await loadStats([offer.id], now);
  return withStats([offer], stats, now)[0]!;
}

// ---------------------------------------------------------------------------
// Tổng quan
// ---------------------------------------------------------------------------

/** Lô đang mở (còn hạn) của cửa hàng, sắp theo độ gấp. */
export async function listLiveOffers(orgId: string, now: Date): Promise<InventoryOffer[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("offers")
    .select(OFFER_COLUMNS)
    .eq("org_id", orgId)
    .in("status", TAB_STATUSES.open)
    .gt("effective_deadline", now.toISOString())
    .order("effective_deadline", { ascending: true })
    .limit(200);
  if (error) fail("lô đang mở", error.code);
  const offers = ((data ?? []) as unknown as OfferDbRow[]).map(toOffer);
  const stats = await loadStats(
    offers.map((o) => o.id),
    now,
  );
  return withStats(offers, stats, now).sort(sortByUrgency);
}

/**
 * Kg đã bàn giao trong tháng (giờ VN) — từ sổ tác động (`impact_ledger`, RLS: dòng `store_org_id` của
 * thành viên cửa hàng; gồm cả dòng đảo ngược âm), không phải số ước tính.
 */
export async function kgHandedOverThisMonth(orgId: string, now: Date): Promise<number> {
  const supabase = await createClient();
  const monthStart = `${vnDateKey(now).slice(0, 7)}-01T00:00:00+07:00`;
  const { data, error } = await supabase
    .from("impact_ledger")
    .select("kg")
    .eq("store_org_id", orgId)
    .gte("occurred_at", monthStart)
    .limit(10_000);
  if (error) fail("sổ tác động", error.code);
  const total = (data ?? []).reduce((sum, r) => sum + Number(r.kg), 0);
  return Math.max(0, Math.round(total * 1000) / 1000);
}

/** Tên lô cho `<title>` của trang chi tiết/sửa (RLS như trên; không thấy ⇒ null). */
export const getOfferTitle = cache(async (offerId: string): Promise<string | null> => {
  if (!/^[0-9a-f-]{36}$/i.test(offerId)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("offers").select("title").eq("id", offerId).maybeSingle();
  return data?.title ?? null;
});
