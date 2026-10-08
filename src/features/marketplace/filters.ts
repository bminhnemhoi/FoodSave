/**
 * Bộ lọc Kho tặng đồng bộ với URL (DESIGN-SYSTEM §12.3, US-CHA-06 AC2): chia sẻ được, giữ khi quay lại.
 * Thuần, không IO — dùng chung cho Server Component (đọc `searchParams`) và client (ghi URL).
 *
 * Tham số: `site` (điểm nhận) · `labels=red,yellow` · `maxKm=3` · `maxMin=30` · `cats=bread,dairy` · `view=map`.
 * Giá trị không hợp lệ bị bỏ qua (không báo lỗi) để link cũ/sửa tay vẫn mở được trang.
 */

export type LabelFilter = "red" | "yellow" | "green";
export type MarketplaceView = "list" | "map";

/** Thứ tự hiển thị chip: Đỏ → Vàng → Xanh (DESIGN-SYSTEM §3.6). */
export const LABEL_FILTERS: readonly LabelFilter[] = ["red", "yellow", "green"];

/** Mốc "Tới trong ≤ x phút" (đã gồm 10 phút đệm của ước tính xe máy — DATA-MODEL §4.7). */
export const TRAVEL_MIN_OPTIONS: readonly number[] = [20, 30, 45, 60, 90];

export const MIN_KM = 0.5;
export const MAX_KM = 30;
export const KM_STEP = 0.5;

export type MarketplaceFilters = {
  siteId: string | null;
  /** Rỗng = mọi nhãn. */
  labels: LabelFilter[];
  /** null = theo bán kính phục vụ của điểm nhận. */
  maxKm: number | null;
  /** null = không giới hạn thời gian tới. */
  maxMin: number | null;
  /** Rỗng = mọi danh mục điểm nhận chấp nhận. */
  categories: string[];
};

export const EMPTY_FILTERS: MarketplaceFilters = {
  siteId: null,
  labels: [],
  maxKm: null,
  maxMin: null,
  categories: [],
};

type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CATEGORY_RE = /^[a-z][a-z0-9_]{1,39}$/;

function read(params: ParamSource, key: string): string | null {
  if (params instanceof URLSearchParams) return params.get(key);
  const v = params[key];
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function list(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Làm tròn về bước 0,5 km trong khoảng 0,5–30. */
export function normalizeKm(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  const stepped = Math.round(value / KM_STEP) * KM_STEP;
  if (stepped < MIN_KM || stepped > MAX_KM) return null;
  return stepped;
}

export function parseFilters(params: ParamSource): MarketplaceFilters {
  const site = read(params, "site");
  const labels = LABEL_FILTERS.filter((l) => list(read(params, "labels")).includes(l));

  const kmRaw = read(params, "maxKm");
  const maxKm = kmRaw === null || kmRaw === "" ? null : normalizeKm(Number(kmRaw.replace(",", ".")));

  const minRaw = read(params, "maxMin");
  const minNum = minRaw === null || minRaw === "" ? Number.NaN : Number(minRaw);
  const maxMin = Number.isInteger(minNum) && minNum >= 5 && minNum <= 240 ? minNum : null;

  const categories = [...new Set(list(read(params, "cats")).filter((c) => CATEGORY_RE.test(c)))]
    .sort()
    .slice(0, 20);

  return {
    siteId: site && UUID_RE.test(site) ? site.toLowerCase() : null,
    labels,
    maxKm,
    maxMin,
    categories,
  };
}

export function parseView(params: ParamSource): MarketplaceView {
  return read(params, "view") === "map" ? "map" : "list";
}

/**
 * Khoảng cách tối đa thật sự áp dụng: không vượt bán kính phục vụ; bằng (hoặc lớn hơn) bán kính ⇒ null
 * (không lọc thêm, RPC đã giới hạn theo bán kính).
 */
export function effectiveMaxKm(maxKm: number | null, radiusKm: number): number | null {
  if (maxKm === null || maxKm >= radiusKm) return null;
  return maxKm;
}

/** URL gọn: bỏ giá trị mặc định, thứ tự khóa cố định (dễ so sánh, chia sẻ). */
export function serializeFilters(
  f: MarketplaceFilters,
  opts: { radiusKm?: number; view?: MarketplaceView } = {},
): URLSearchParams {
  const out = new URLSearchParams();
  if (f.siteId) out.set("site", f.siteId);
  const labels = LABEL_FILTERS.filter((l) => f.labels.includes(l));
  if (labels.length > 0 && labels.length < LABEL_FILTERS.length) out.set("labels", labels.join(","));
  const km = opts.radiusKm === undefined ? f.maxKm : effectiveMaxKm(f.maxKm, opts.radiusKm);
  if (km !== null) out.set("maxKm", String(km));
  if (f.maxMin !== null) out.set("maxMin", String(f.maxMin));
  if (f.categories.length > 0) out.set("cats", [...new Set(f.categories)].sort().join(","));
  if (opts.view === "map") out.set("view", "map");
  return out;
}

export function filtersHref(
  pathname: string,
  f: MarketplaceFilters,
  opts: { radiusKm?: number; view?: MarketplaceView } = {},
): string {
  const qs = serializeFilters(f, opts).toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/** Số bộ lọc đang áp (không tính điểm nhận) — hiện trên nút "Bộ lọc (n)". */
export function countActiveFilters(f: MarketplaceFilters, radiusKm: number): number {
  let n = 0;
  if (f.labels.length > 0 && f.labels.length < LABEL_FILTERS.length) n++;
  if (effectiveMaxKm(f.maxKm, radiusKm) !== null) n++;
  if (f.maxMin !== null) n++;
  if (f.categories.length > 0) n++;
  return n;
}

/** Bỏ mọi bộ lọc, giữ điểm nhận. */
export function clearFilters(f: MarketplaceFilters): MarketplaceFilters {
  return { ...EMPTY_FILTERS, siteId: f.siteId };
}

/** Tham số RPC `marketplace_offers` (DATA-MODEL §8.3). */
export function toRpcArgs(f: MarketplaceFilters, siteId: string, radiusKm: number) {
  const labels = LABEL_FILTERS.filter((l) => f.labels.includes(l));
  const km = effectiveMaxKm(f.maxKm, radiusKm);
  return {
    p_charity_site_id: siteId,
    ...(labels.length > 0 && labels.length < LABEL_FILTERS.length ? { p_labels: labels } : {}),
    ...(km !== null ? { p_max_km: km } : {}),
    ...(f.maxMin !== null ? { p_max_travel_min: f.maxMin } : {}),
    ...(f.categories.length > 0 ? { p_category_codes: f.categories } : {}),
  };
}

/** Bật/tắt một phần tử trong danh sách (chip). */
export function toggle<T>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}
