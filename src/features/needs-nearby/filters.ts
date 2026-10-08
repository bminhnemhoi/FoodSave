/**
 * Bộ lọc "Nhu cầu gần bạn" đồng bộ URL (DESIGN-SYSTEM §12.3): `?cat=bread,pastry&site=<uuid>&view=map`.
 * Thuần, có unit test. Giá trị lạ bị bỏ qua (không làm vỡ trang).
 */

export type NearbyView = "list" | "map";

export type NearbyFilters = {
  categories: string[];
  siteId: string | null;
};

type Params = Record<string, string | string[] | undefined>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE_RE = /^[a-z][a-z0-9_]{0,39}$/;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function parseNearbyFilters(params: Params, known: readonly string[]): NearbyFilters {
  const raw = first(params.cat) ?? "";
  const categories = [
    ...new Set(
      raw
        .split(",")
        .map((c) => c.trim())
        .filter((c) => CODE_RE.test(c) && known.includes(c)),
    ),
  ];
  const site = first(params.site);
  return { categories, siteId: site && UUID_RE.test(site) ? site.toLowerCase() : null };
}

export function parseNearbyView(params: Params): NearbyView {
  return first(params.view) === "map" ? "map" : "list";
}

export function toggleCategory(filters: NearbyFilters, code: string): NearbyFilters {
  const has = filters.categories.includes(code);
  return {
    ...filters,
    categories: has ? filters.categories.filter((c) => c !== code) : [...filters.categories, code],
  };
}

export function nearbyHref(pathname: string, f: NearbyFilters, view: NearbyView = "list"): string {
  const q = new URLSearchParams();
  if (f.categories.length > 0) q.set("cat", f.categories.join(","));
  if (f.siteId) q.set("site", f.siteId);
  if (view === "map") q.set("view", "map");
  const s = q.toString();
  return s ? `${pathname}?${s}` : pathname;
}
