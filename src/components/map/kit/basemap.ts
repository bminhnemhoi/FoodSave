import type {
  ExpressionSpecification,
  FilterSpecification,
  LayerSpecification,
  StyleSpecification,
} from "maplibre-gl";

/**
 * Nền bản đồ "thân thiện" (DESIGN-SYSTEM §13.1): tải style JSON một lần (cache theo URL trong module), phối lại
 * màu theo token thương hiệu (đất giấy ấm, nước xanh nhạt, công viên xanh lá nhạt, đường trắng viền ấm), giảm
 * POI (chỉ hiện khi phóng sát ≥ 16, mờ đi) và ẩn biển số quốc lộ xanh lá (dễ lẫn nhãn Xanh). Thuần — không
 * đọc DOM; màu truyền vào qua `BasemapPalette`.
 *
 * BẮT BUỘC: nhãn chủ quyền "Quần đảo Hoàng Sa", "Quần đảo Trường Sa" luôn hiển thị.
 * - Goong: lớp `place-archipelago` / `place-island` (nguồn `base`, source-layer `island`) — không bao giờ ẩn,
 *   không đổi minzoom/filter; chỉ chỉnh màu chữ.
 * - Dự phòng OpenFreeMap: dữ liệu OSM có thể ghi tên khác ⇒ ẩn nhãn đảo/biển của style trong hai vùng quần đảo
 *   và Biển Đông, rồi vẽ nhãn tiếng Việt của FoodSave (`fs-sovereignty-labels`).
 * Kiểm bằng E2E `tests/e2e/map/sovereignty.spec.ts` (queryRenderedFeatures + ảnh chụp).
 */

export type BasemapFlavor = "goong" | "fallback";

export type BasemapPalette = {
  land: string;
  landAlt: string;
  park: string;
  water: string;
  road: string;
  roadCase: string;
  roadMajor: string;
  roadMajorCase: string;
  building: string;
  label: string;
  labelMuted: string;
  labelHalo: string;
  boundary: string;
};

/** Lớp nhãn chủ quyền của style Goong (giữ nguyên hiển thị). */
export const GOONG_SOVEREIGNTY_LAYERS = ["place-archipelago", "place-island"] as const;
/** Lớp nhãn chủ quyền FoodSave thêm vào style dự phòng. */
export const FALLBACK_SOVEREIGNTY_LAYER = "fs-sovereignty-labels";

const HOANG_SA = "Quần đảo Hoàng Sa (Việt Nam)";
const TRUONG_SA = "Quần đảo Trường Sa (Việt Nam)";

/** Vùng hai quần đảo (đủ rộng để bao các đảo, không chạm đất liền). */
const ARCHIPELAGO_AREAS: GeoJSON.MultiPolygon = {
  type: "MultiPolygon",
  coordinates: [
    [
      [
        [110.8, 15.3],
        [113.4, 15.3],
        [113.4, 17.4],
        [110.8, 17.4],
        [110.8, 15.3],
      ],
    ],
    [
      [
        [111.2, 6.0],
        [117.8, 6.0],
        [117.8, 12.2],
        [111.2, 12.2],
        [111.2, 6.0],
      ],
    ],
  ],
};

/** Biển Đông (để thay tên biển của style dự phòng bằng "Biển Đông"). */
const EAST_SEA_AREA: GeoJSON.Polygon = {
  type: "Polygon",
  coordinates: [
    [
      [109.6, 4.5],
      [119.0, 4.5],
      [119.5, 21.0],
      [111.0, 21.0],
      [109.6, 12.0],
      [109.6, 4.5],
    ],
  ],
};

const SOVEREIGNTY_POINTS: GeoJSON.FeatureCollection<GeoJSON.Point, { name: string; kind: string }> = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { name: HOANG_SA, kind: "archipelago" },
      geometry: { type: "Point", coordinates: [112.0, 16.45] },
    },
    {
      type: "Feature",
      properties: { name: TRUONG_SA, kind: "archipelago" },
      geometry: { type: "Point", coordinates: [114.3, 9.9] },
    },
    {
      type: "Feature",
      properties: { name: "Biển Đông", kind: "sea" },
      geometry: { type: "Point", coordinates: [113.2, 13.6] },
    },
  ],
};

// ---------------------------------------------------------------------------
// Màu
// ---------------------------------------------------------------------------

/** Trộn hai màu hex `#rrggbb`: t = 0 ⇒ a, t = 1 ⇒ b. Giá trị không phải hex ⇒ trả `a`. */
export function mixHex(a: string, b: string, t: number): string {
  const pa = parseHex(a);
  const pb = parseHex(b);
  if (!pa || !pb) return a;
  const c = pa.map((v, i) => Math.round(v + (pb[i]! - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Bảng màu nền từ token (đọc qua `read(name, fallback)`; fallback = giá trị trong DESIGN-SYSTEM §3). */
export function basemapPalette(read: (name: `--${string}`, fallback: string) => string): BasemapPalette {
  const hex = (name: `--${string}`, fallback: string) => {
    const v = read(name, fallback);
    return parseHex(v) ? v : fallback;
  };
  const bg = hex("--bg", "#faf7f0");
  const sunken = hex("--bg-sunken", "#f3eee3");
  const surface = hex("--surface", "#fffdf8");
  const border = hex("--border", "#e6dfd0");
  const borderStrong = hex("--border-strong", "#8e8676");
  const mint = hex("--brand-mint", "#8cc9a0");
  const info = hex("--info", "#1f5fbf");
  const chartE = hex("--chart-e", "#0f766e");
  const inkMuted = hex("--ink-muted", "#4a5b53");
  const inkSubtle = hex("--ink-subtle", "#5f7068");
  return {
    land: mixHex(bg, sunken, 0.55),
    landAlt: mixHex(sunken, border, 0.35),
    park: mixHex(sunken, mint, 0.42),
    // Xanh nước nhạt, ngả teal của thương hiệu — khác hẳn màu tuyến (--map-route) đậm
    water: mixHex(mixHex(surface, info, 0.2), chartE, 0.08),
    road: surface,
    roadCase: border,
    roadMajor: surface,
    roadMajorCase: mixHex(border, borderStrong, 0.35),
    building: mixHex(sunken, border, 0.75),
    label: inkMuted,
    labelMuted: inkSubtle,
    labelHalo: surface,
    boundary: mixHex(border, borderStrong, 0.55),
  };
}

// ---------------------------------------------------------------------------
// Phân loại lớp
// ---------------------------------------------------------------------------

type Kind =
  | "sovereignty"
  | "background"
  | "land"
  | "water"
  | "water-shadow"
  | "waterway"
  | "park"
  | "landuse"
  | "building"
  | "building-3d"
  | "road"
  | "road-case"
  | "road-major"
  | "road-major-case"
  | "boundary"
  | "poi"
  | "shield"
  | "label"
  | "other";

const MAJOR = /motorway|trunk|primary/;

export function classifyLayer(layer: LayerSpecification, flavor: BasemapFlavor): Kind {
  const id = layer.id.toLowerCase();
  const sourceLayer = ("source-layer" in layer ? (layer["source-layer"] ?? "") : "").toLowerCase();
  if (flavor === "goong" && (GOONG_SOVEREIGNTY_LAYERS as readonly string[]).includes(layer.id))
    return "sovereignty";
  if (layer.type === "background") return "background";
  if (layer.type === "fill") {
    if (id === "water-shadow") return "water-shadow";
    if (/water|ocean|riversandlakes|sea\b/.test(id) || /water|ocean|riversandlakes/.test(sourceLayer))
      return "water";
    if (/park|forest|grass|wood|wetland|natural/.test(id)) return "park";
    if (/human-made|human_made/.test(id)) return "land";
    if (/building/.test(id) || /building/.test(sourceLayer)) return "building";
    if (/landuse|landcover|landuser|aeroway/.test(id)) return "landuse";
    return "other";
  }
  if (layer.type === "fill-extrusion") return "building-3d";
  if (layer.type === "line") {
    if (/waterway/.test(id) || /waterway/.test(sourceLayer)) return "waterway";
    if (/boundary/.test(id)) return "boundary";
    // Đường sắt (Goong: class "major", "-tracks"), lối đi bộ, sân bay, phà: giữ nguyên
    if (/rail|path|pedestrian|aeroway|ferry|runway|taxiway|track|hatching|park|-major$|major-tracks/.test(id))
      return "other";
    if (/road|bridge|tunnel|street|highway/.test(id) || /streets|transportation/.test(sourceLayer)) {
      const isCase = /case|casing/.test(id);
      if (MAJOR.test(id)) return isCase ? "road-major-case" : "road-major";
      return isCase ? "road-case" : "road";
    }
    return "other";
  }
  if (layer.type === "symbol") {
    if (/shield/.test(id)) return "shield";
    if (/^poi[-_]/.test(id) || id === "airport") return "poi";
    return "label";
  }
  return "other";
}

// ---------------------------------------------------------------------------
// Phối lại style
// ---------------------------------------------------------------------------

/** Mức phóng tối thiểu để hiện POI (mức xem chuyến/kho tặng 12–15 sẽ không còn biểu tượng cửa hàng lạ). */
export const POI_MIN_ZOOM = 16;

type AnyLayer = LayerSpecification & {
  paint?: Record<string, unknown>;
  layout?: Record<string, unknown>;
  minzoom?: number;
  filter?: FilterSpecification;
};

/**
 * Trả về bản sao đã phối màu của `style` (không sửa đối tượng gốc — style gốc được cache dùng chung).
 * `fontStack` của lớp nhãn chủ quyền dự phòng lấy từ một lớp nhãn có sẵn trong style.
 */
export function patchStyle(
  style: StyleSpecification,
  palette: BasemapPalette,
  flavor: BasemapFlavor,
): StyleSpecification {
  const next = structuredClone(style) as StyleSpecification & { layers: AnyLayer[] };
  for (const layer of next.layers) patchLayer(layer, palette, flavor);
  if (flavor === "fallback") addFallbackSovereignty(next, palette);
  return next;
}

function setPaint(layer: AnyLayer, key: string, value: unknown) {
  layer.paint = { ...(layer.paint ?? {}), [key]: value };
}

function setLayout(layer: AnyLayer, key: string, value: unknown) {
  layer.layout = { ...(layer.layout ?? {}), [key]: value };
}

function patchLayer(layer: AnyLayer, p: BasemapPalette, flavor: BasemapFlavor) {
  switch (classifyLayer(layer, flavor)) {
    case "sovereignty":
      // Chỉ đổi màu chữ cho đọc rõ; luôn hiển thị, không đụng minzoom/filter
      setLayout(layer, "visibility", "visible");
      setPaint(layer, "text-color", p.label);
      setPaint(layer, "text-halo-color", p.labelHalo);
      setPaint(layer, "text-halo-width", 1.5);
      return;
    case "background":
      setPaint(layer, "background-color", p.land);
      return;
    case "land":
      setPaint(layer, "fill-color", p.land);
      return;
    case "water":
      setPaint(layer, "fill-color", p.water);
      return;
    case "water-shadow":
      setLayout(layer, "visibility", "none");
      return;
    case "waterway":
      setPaint(layer, "line-color", p.water);
      return;
    case "park":
      setPaint(layer, "fill-color", p.park);
      return;
    case "landuse":
      setPaint(layer, "fill-color", p.landAlt);
      return;
    case "building":
      setPaint(layer, "fill-color", p.building);
      return;
    case "building-3d":
      setPaint(layer, "fill-extrusion-color", p.building);
      setPaint(layer, "fill-extrusion-opacity", 0.55);
      return;
    case "road":
      setPaint(layer, "line-color", p.road);
      return;
    case "road-case":
      setPaint(layer, "line-color", p.roadCase);
      return;
    case "road-major":
      setPaint(layer, "line-color", p.roadMajor);
      return;
    case "road-major-case":
      setPaint(layer, "line-color", p.roadMajorCase);
      return;
    case "boundary":
      setPaint(layer, "line-color", p.boundary);
      return;
    case "shield":
      // Biển số quốc lộ nền xanh lá dễ lẫn với nhãn Xanh ⇒ ẩn (tên đường vẫn còn)
      setLayout(layer, "visibility", "none");
      return;
    case "poi":
      if (layer.id === "poi-tree") {
        setLayout(layer, "visibility", "none");
        return;
      }
      layer.minzoom = Math.max(layer.minzoom ?? 0, POI_MIN_ZOOM);
      setPaint(layer, "text-color", p.labelMuted);
      setPaint(layer, "text-halo-color", p.labelHalo);
      setPaint(layer, "icon-opacity", 0.55);
      return;
    case "label":
      if (!layer.layout || !("text-field" in layer.layout)) return;
      setPaint(layer, "text-color", p.label);
      setPaint(layer, "text-halo-color", p.labelHalo);
      return;
    default:
      return;
  }
}

/** Dự phòng: ẩn nhãn đảo/biển của style trong vùng quần đảo + Biển Đông, rồi vẽ nhãn tiếng Việt của FoodSave. */
function addFallbackSovereignty(style: StyleSpecification & { layers: AnyLayer[] }, p: BasemapPalette) {
  let font: unknown = ["Noto Sans Regular"];
  for (const layer of style.layers) {
    if (layer.type !== "symbol") continue;
    const id = layer.id.toLowerCase();
    if (/water_name|waterway_line_label/.test(id)) {
      layer.filter = excludeWithin(layer.filter, EAST_SEA_AREA);
    } else if (
      /label_other|island|archipelago|place/.test(id) &&
      !/country|state|city|town|village/.test(id)
    ) {
      layer.filter = excludeWithin(layer.filter, ARCHIPELAGO_AREAS);
    }
    if (/label_city|label_town|place/.test(id) && layer.layout?.["text-font"])
      font = layer.layout["text-font"];
  }
  style.sources = {
    ...style.sources,
    "fs-sovereignty": { type: "geojson", data: SOVEREIGNTY_POINTS },
  };
  style.layers.push({
    id: FALLBACK_SOVEREIGNTY_LAYER,
    type: "symbol",
    source: "fs-sovereignty",
    minzoom: 3,
    layout: {
      "text-field": ["get", "name"],
      "text-font": font as string[],
      "text-size": ["interpolate", ["linear"], ["zoom"], 3, 11, 8, 15],
      "text-max-width": 9,
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      "text-color": p.label,
      "text-halo-color": p.labelHalo,
      "text-halo-width": 1.5,
    },
  } as AnyLayer);
}

function excludeWithin(
  filter: FilterSpecification | undefined,
  area: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): FilterSpecification {
  const outside = ["!", ["within", area]] as unknown as ExpressionSpecification;
  if (!filter) return outside as FilterSpecification;
  return ["all", filter as ExpressionSpecification, outside] as FilterSpecification;
}

// ---------------------------------------------------------------------------
// Tải style (cache theo URL)
// ---------------------------------------------------------------------------

const rawCache = new Map<string, Promise<StyleSpecification>>();

/** Tải style JSON một lần cho mỗi URL; lỗi ⇒ xóa khỏi cache để lần sau thử lại. */
export function loadStyleJson(url: string, fetcher: typeof fetch = fetch): Promise<StyleSpecification> {
  const hit = rawCache.get(url);
  if (hit) return hit;
  const pending = fetcher(url)
    .then(async (res) => {
      if (!res.ok) throw new Error(`basemap_style_${res.status}`);
      const json = (await res.json()) as StyleSpecification;
      if (!json || json.version !== 8 || !Array.isArray(json.layers))
        throw new Error("basemap_style_invalid");
      return json;
    })
    .catch((err: unknown) => {
      rawCache.delete(url);
      throw err;
    });
  rawCache.set(url, pending);
  return pending;
}

/** Chỉ cho test: xóa cache. */
export function clearStyleCache() {
  rawCache.clear();
}
