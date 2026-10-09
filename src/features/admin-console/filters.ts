import type { FreshnessLabel } from "@/core/labels";
import type { AllocationStatus, OfferStatus } from "@/features/catalog/labels";
import { addDays, isDateKey, VN_OFFSET } from "@/features/offers/datetime";

/**
 * Bộ lọc của bảng điều khiển Admin (US-ADM-05, US-ADM-07, US-ADM-11) — thuần, có unit test.
 * Mọi bộ lọc nằm trên URL (DESIGN-SYSTEM §12.3) để chia sẻ và giữ khi quay lại. Giá trị lạ ⇒ mặc định
 * (không báo lỗi); chuỗi tìm kiếm chỉ đi vào MỘT bộ lọc ilike có thoát ký tự (hồi quy B7).
 */

type Params = Record<string, string | string[] | undefined>;

export const ADMIN_PAGE_SIZE = 50;
export const SEARCH_MAX = 80;
export const STALE_REQUEST_MINUTES = 60;
export const TURNING_RED_HOURS = 3;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function parsePage(params: Params): number {
  const n = Number.parseInt(first(params.page) ?? "1", 10);
  return Number.isFinite(n) && n >= 1 && n <= 1000 ? n : 1;
}

function parseSearch(v: string | string[] | undefined): string {
  return (first(v) ?? "").trim().slice(0, SEARCH_MAX);
}

function pick<T extends string>(v: string | string[] | undefined, allowed: readonly T[]): T | null {
  const raw = first(v);
  return raw !== undefined && (allowed as readonly string[]).includes(raw) ? (raw as T) : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseUuid(v: string | string[] | undefined): string | null {
  const raw = first(v)?.trim();
  return raw && UUID_RE.test(raw) ? raw.toLowerCase() : null;
}

/** Query string gọn: bỏ giá trị rỗng/mặc định (`null`, `""`, `false`, trang 1). */
export function buildHref(base: string, entries: Record<string, string | number | boolean | null>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(entries)) {
    if (value === null || value === "" || value === false) continue;
    if (key === "page" && value === 1) continue;
    sp.set(key, value === true ? "1" : String(value));
  }
  const qs = sp.toString();
  return qs ? `${base}?${qs}` : base;
}

// ---------------------------------------------------------------------------
// Lô hàng (/admin/offers)
// ---------------------------------------------------------------------------

/** `live` = đang diễn ra (open + fully_allocated) — mặc định khi giám sát. */
export const OFFER_VIEWS = [
  "live",
  "open",
  "fully_allocated",
  "draft",
  "completed",
  "expired",
  "cancelled",
  "all",
] as const;
export type OfferView = (typeof OFFER_VIEWS)[number];

/** Thứ tự hiển thị nhãn: Đỏ → Vàng → Xanh → Hết hạn (DESIGN-SYSTEM §3.6). */
export const LABEL_ORDER: readonly FreshnessLabel[] = ["red", "yellow", "green", "expired"];

const CATEGORY_RE = /^[a-z_]{2,32}$/;

export type OfferFilters = {
  view: OfferView;
  labels: FreshnessLabel[];
  q: string;
  cat: string | null;
  /** Gồm cả tổ chức demo (mặc định chỉ dữ liệu thật). */
  demo: boolean;
  /** Chỉ lô chưa ai giữ (qty_committed = 0) — "Đỏ + chưa có phân bổ" (US-ADM-05 AC3). */
  unclaimed: boolean;
  /** Chỉ lô đang mở sẽ chuyển Đỏ trong 3 giờ tới (ô chỉ số "Sắp chuyển Đỏ"). */
  soon: boolean;
  page: number;
};

export function parseOfferFilters(params: Params): OfferFilters {
  const rawLabels = (first(params.label) ?? "").split(",");
  const labels = LABEL_ORDER.filter((l) => rawLabels.includes(l));
  const cat = first(params.cat);
  return {
    view: pick(params.view, OFFER_VIEWS) ?? "live",
    labels,
    q: parseSearch(params.q),
    cat: cat && CATEGORY_RE.test(cat) ? cat : null,
    demo: first(params.demo) === "1",
    unclaimed: first(params.unclaimed) === "1",
    soon: first(params.soon) === "1",
    page: parsePage(params),
  };
}

export function offersHref(base: string, filters: OfferFilters, patch: Partial<OfferFilters> = {}): string {
  const f = { ...filters, ...patch };
  return buildHref(base, {
    view: f.view === "live" ? null : f.view,
    label: LABEL_ORDER.filter((l) => f.labels.includes(l)).join(","),
    q: f.q,
    cat: f.cat,
    demo: f.demo,
    unclaimed: f.unclaimed,
    soon: f.soon,
    page: f.page,
  });
}

/** Bật/tắt một nhãn trong bộ lọc (giữ thứ tự Đỏ → Vàng → Xanh → Hết hạn), về trang 1. */
export function toggleLabel(filters: OfferFilters, label: FreshnessLabel): Partial<OfferFilters> {
  const has = filters.labels.includes(label);
  const labels = LABEL_ORDER.filter((l) => (l === label ? !has : filters.labels.includes(l)));
  return { labels, page: 1 };
}

/** Trạng thái lô ứng với mỗi chế độ xem; `null` = mọi trạng thái. */
export function offerStatusesOf(view: OfferView): OfferStatus[] | null {
  switch (view) {
    case "live":
      return ["open", "fully_allocated"];
    case "all":
      return null;
    default:
      return [view];
  }
}

/** Lô đã đóng (hoàn tất/hết hạn/hủy) sắp theo thời điểm đóng; còn lại Đỏ trước rồi hạn gần trước. */
export function offerSortOf(view: OfferView): "urgency" | "closed" | "created" {
  if (view === "completed" || view === "expired" || view === "cancelled") return "closed";
  if (view === "draft") return "created";
  return "urgency";
}

export function hasOfferFilter(f: OfferFilters): boolean {
  return f.labels.length > 0 || f.q !== "" || f.cat !== null || f.unclaimed || f.soon;
}

// ---------------------------------------------------------------------------
// Phân bổ (/admin/allocations)
// ---------------------------------------------------------------------------

export const ALLOCATION_VIEWS = [
  "all",
  "requested",
  "confirmed",
  "assigned",
  "picked_up",
  "delivered",
  "cancelled",
  "rejected",
  "expired",
] as const satisfies readonly ("all" | AllocationStatus)[];
export type AllocationView = (typeof ALLOCATION_VIEWS)[number];

/** `stale` = chờ cửa hàng quá 60 phút · `running` = thuộc chuyến đang chạy. */
export const ALLOCATION_QUICK = ["stale", "running"] as const;
export type AllocationQuick = (typeof ALLOCATION_QUICK)[number];

export type AllocationFilters = {
  view: AllocationView;
  quick: AllocationQuick | null;
  demo: boolean;
  /** Mở đúng một phân bổ (liên kết từ nhật ký kiểm toán). */
  id: string | null;
  page: number;
};

export function parseAllocationFilters(params: Params): AllocationFilters {
  const quick = pick(params.quick, ALLOCATION_QUICK);
  return {
    // "đang chờ quá 1 giờ" chỉ có nghĩa với trạng thái requested
    view: quick === "stale" ? "requested" : (pick(params.view, ALLOCATION_VIEWS) ?? "all"),
    quick,
    demo: first(params.demo) === "1",
    id: parseUuid(params.id),
    page: parsePage(params),
  };
}

export function allocationsHref(
  base: string,
  filters: AllocationFilters,
  patch: Partial<AllocationFilters> = {},
): string {
  const f = { ...filters, ...patch };
  return buildHref(base, {
    view: f.view === "all" || f.quick === "stale" ? null : f.view,
    quick: f.quick,
    demo: f.demo,
    id: f.id,
    page: f.page,
  });
}

/** Mốc "yêu cầu trước thời điểm này là đã chờ quá 60 phút". */
export function staleBefore(now: Date): string {
  return new Date(now.getTime() - STALE_REQUEST_MINUTES * 60_000).toISOString();
}

// ---------------------------------------------------------------------------
// Nhật ký kiểm toán (/admin/audit)
// ---------------------------------------------------------------------------

/** Nhóm hành động theo tiền tố `<entity>.` (DATA-MODEL §14) — danh sách đóng, không nhận chuỗi tự do. */
export const AUDIT_ACTION_GROUPS = [
  "org",
  "admin",
  "member",
  "site",
  "document",
  "consent",
  "offer",
  "allocation",
  "need",
  "bundle",
  "pickup",
  "stop",
  "handover",
  "incident",
  "ledger",
  "volunteer_profile",
  "settings",
  "demo",
  "audit",
] as const;
export type AuditActionGroup = (typeof AUDIT_ACTION_GROUPS)[number];

export const AUDIT_ENTITY_TYPES = [
  "organization",
  "org_change_request",
  "org_document",
  "org_member",
  "org_invitation",
  "profile",
  "site",
  "consent",
  "offer",
  "allocation",
  "need",
  "need_bundle",
  "pickup",
  "pickup_stop",
  "handover",
  "incident",
  "impact_ledger",
  "volunteer_profile",
  "app_setting",
  "demo",
  "audit_logs",
] as const;
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

export type AuditFilters = {
  act: AuditActionGroup | null;
  type: AuditEntityType | null;
  /** Tìm người thực hiện theo tên hoặc email. */
  actor: string;
  /** Ngày theo giờ Việt Nam, "YYYY-MM-DD", tính trọn ngày. */
  from: string | null;
  to: string | null;
  /** Đúng một đối tượng (liên kết "Xem nhật ký" từ trang lô). */
  id: string | null;
  page: number;
};

export function parseAuditFilters(params: Params): AuditFilters {
  const date = (v: string | string[] | undefined) => {
    const raw = first(v)?.trim();
    return raw && isDateKey(raw) ? raw : null;
  };
  let from = date(params.from);
  let to = date(params.to);
  if (from && to && from > to) [from, to] = [to, from];
  return {
    act: pick(params.act, AUDIT_ACTION_GROUPS),
    type: pick(params.type, AUDIT_ENTITY_TYPES),
    actor: parseSearch(params.actor),
    from,
    to,
    id: parseUuid(params.id),
    page: parsePage(params),
  };
}

export function auditHref(base: string, filters: AuditFilters, patch: Partial<AuditFilters> = {}): string {
  const f = { ...filters, ...patch };
  return buildHref(base, {
    act: f.act,
    type: f.type,
    actor: f.actor,
    from: f.from,
    to: f.to,
    id: f.id,
    page: f.page,
  });
}

export function hasAuditFilter(f: AuditFilters): boolean {
  return (
    f.act !== null || f.type !== null || f.actor !== "" || f.from !== null || f.to !== null || f.id !== null
  );
}

/** Khoảng thời gian [gte, lt) ISO cho bộ lọc ngày giờ VN (đến hết ngày `to`). */
export function vnDayRange(
  from: string | null,
  to: string | null,
): { gte: string | null; lt: string | null } {
  return {
    gte: from ? `${from}T00:00:00${VN_OFFSET}` : null,
    lt: to ? `${addDays(to, 1)}T00:00:00${VN_OFFSET}` : null,
  };
}
