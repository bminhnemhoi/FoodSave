import type { LayerSpecification, StyleSpecification } from "maplibre-gl";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  basemapPalette,
  classifyLayer,
  clearStyleCache,
  FALLBACK_SOVEREIGNTY_LAYER,
  GOONG_SOVEREIGNTY_LAYERS,
  loadStyleJson,
  mixHex,
  patchStyle,
  POI_MIN_ZOOM,
} from "./basemap";

const palette = basemapPalette((_name, fallback) => fallback);

/** Rút gọn từ style `goong_map_web` thật (cùng id/type/source-layer/filter của các lớp liên quan). */
function goongLike(): StyleSpecification {
  return {
    version: 8,
    sources: { base: { type: "vector", url: "https://example.test/base.json" } },
    layers: [
      { id: "background", type: "background", paint: { "background-color": "#EBF0F0" } },
      { id: "landcover-human-made", type: "fill", source: "base", "source-layer": "landcover_human_made" },
      { id: "landuser-park", type: "fill", source: "base", "source-layer": "landuser" },
      { id: "ocean", type: "fill", source: "base", "source-layer": "ocean" },
      { id: "water-shadow", type: "fill", source: "base", "source-layer": "riversandlakes" },
      { id: "water", type: "fill", source: "base", "source-layer": "riversandlakes" },
      { id: "road-major", type: "line", source: "base", "source-layer": "streets" },
      { id: "road-street-case", type: "line", source: "base", "source-layer": "streets" },
      { id: "road-street", type: "line", source: "base", "source-layer": "streets" },
      { id: "road-motorway", type: "line", source: "base", "source-layer": "streets" },
      { id: "road-trunk-case", type: "line", source: "base", "source-layer": "streets" },
      { id: "building_flat", type: "fill", source: "base", "source-layer": "VN_Building" },
      {
        id: "poi-scalerank-3",
        type: "symbol",
        source: "base",
        "source-layer": "point_map",
        minzoom: 12,
        layout: { "text-field": "{name}" },
      },
      { id: "poi-tree", type: "symbol", source: "base", "source-layer": "trees", minzoom: 15 },
      {
        id: "highway-shield-1",
        type: "symbol",
        source: "base",
        "source-layer": "roadshields",
        layout: { "text-field": "{ref}" },
      },
      {
        id: "place-archipelago",
        type: "symbol",
        source: "base",
        "source-layer": "island",
        minzoom: 4,
        maxzoom: 22,
        filter: ["all", ["==", "code", 3]],
        layout: { "text-field": "{name}", visibility: "visible" },
      },
      {
        id: "place-island",
        type: "symbol",
        source: "base",
        "source-layer": "island",
        minzoom: 6,
        filter: ["all", ["==", "code", 4]],
        layout: { "text-field": "{name}", visibility: "visible" },
      },
      {
        id: "place-suburb3",
        type: "symbol",
        source: "base",
        "source-layer": "vietnam_administrator",
        layout: { "text-field": "P.{name_vn}" },
      },
    ] as LayerSpecification[],
  };
}

/** Rút gọn từ style "liberty" của OpenFreeMap (dự phòng). */
function libertyLike(): StyleSpecification {
  return {
    version: 8,
    sources: { openmaptiles: { type: "vector", url: "https://example.test/planet" } },
    layers: [
      { id: "background", type: "background" },
      { id: "water", type: "fill", source: "openmaptiles", "source-layer": "water" },
      {
        id: "water_name_point_label",
        type: "symbol",
        source: "openmaptiles",
        "source-layer": "water_name",
        layout: { "text-field": ["get", "name"] },
      },
      {
        id: "label_other",
        type: "symbol",
        source: "openmaptiles",
        "source-layer": "place",
        filter: ["match", ["get", "class"], ["city", "country"], false, true],
        layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Italic"] },
      },
      {
        id: "label_city",
        type: "symbol",
        source: "openmaptiles",
        "source-layer": "place",
        layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Regular"] },
      },
    ] as LayerSpecification[],
  };
}

// Truy cập lỏng các thuộc tính paint/layout/filter của lớp trong kiểm thử
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseLayer = Record<string, any>;
const byId = (s: StyleSpecification, id: string) => s.layers.find((l) => l.id === id) as LooseLayer;

describe("mixHex", () => {
  it("trộn tuyến tính hai màu hex", () => {
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mixHex("#faf7f0", "#faf7f0", 0.3)).toBe("#faf7f0");
  });
  it("giá trị không phải hex ⇒ giữ màu đầu", () => {
    expect(mixHex("oklch(50% 0.1 100)", "#ffffff", 0.5)).toBe("oklch(50% 0.1 100)");
  });
});

describe("basemapPalette", () => {
  it("token không đọc được (oklch, rỗng) ⇒ dùng giá trị DESIGN-SYSTEM", () => {
    const p = basemapPalette(() => "oklch(50% 0 0)");
    expect(p.road).toBe("#fffdf8");
    expect(p.label).toBe("#4a5b53");
  });
});

describe("patchStyle — Goong", () => {
  it("giữ nguyên nhãn Hoàng Sa/Trường Sa: luôn hiển thị, không đổi minzoom/filter", () => {
    const before = goongLike();
    const after = patchStyle(before, palette, "goong");
    for (const id of GOONG_SOVEREIGNTY_LAYERS) {
      const a = byId(after, id);
      const b = byId(before, id);
      expect(a.layout.visibility).toBe("visible");
      expect(a.minzoom).toBe(b.minzoom);
      expect(a.filter).toEqual(b.filter);
      expect(a.layout["text-field"]).toBe(b.layout["text-field"]);
    }
  });

  it("phối màu nền, nước, công viên, đường; không sửa style gốc (cache dùng chung)", () => {
    const before = goongLike();
    const snapshot = JSON.stringify(before);
    const after = patchStyle(before, palette, "goong");
    expect(JSON.stringify(before)).toBe(snapshot);
    expect(byId(after, "background").paint["background-color"]).toBe(palette.land);
    expect(byId(after, "landcover-human-made").paint["fill-color"]).toBe(palette.land);
    expect(byId(after, "water").paint["fill-color"]).toBe(palette.water);
    expect(byId(after, "ocean").paint["fill-color"]).toBe(palette.water);
    expect(byId(after, "landuser-park").paint["fill-color"]).toBe(palette.park);
    expect(byId(after, "road-street").paint["line-color"]).toBe(palette.road);
    expect(byId(after, "road-street-case").paint["line-color"]).toBe(palette.roadCase);
    expect(byId(after, "road-trunk-case").paint["line-color"]).toBe(palette.roadMajorCase);
    expect(byId(after, "water-shadow").layout.visibility).toBe("none");
    // "road-major" của Goong là đường sắt ⇒ giữ nguyên
    expect(byId(after, "road-major").paint).toBeUndefined();
  });

  it("giảm POI: chỉ hiện từ zoom 16; ẩn cây và biển số quốc lộ xanh lá (dễ lẫn nhãn Xanh)", () => {
    const after = patchStyle(goongLike(), palette, "goong");
    expect(byId(after, "poi-scalerank-3").minzoom).toBe(POI_MIN_ZOOM);
    expect(byId(after, "poi-tree").layout.visibility).toBe("none");
    expect(byId(after, "highway-shield-1").layout.visibility).toBe("none");
    expect(byId(after, "place-suburb3").paint["text-color"]).toBe(palette.label);
  });

  it("phân loại lớp", () => {
    const l = (id: string, type: string, sourceLayer = "streets") =>
      ({ id, type, source: "s", "source-layer": sourceLayer }) as LayerSpecification;
    expect(classifyLayer(l("place-archipelago", "symbol", "island"), "goong")).toBe("sovereignty");
    expect(classifyLayer(l("place-archipelago", "symbol", "island"), "fallback")).toBe("label");
    expect(classifyLayer(l("road-major-tracks", "line"), "goong")).toBe("other");
    expect(classifyLayer(l("bridge-primary-case", "line"), "goong")).toBe("road-major-case");
    expect(classifyLayer(l("road_minor_casing", "line", "transportation"), "fallback")).toBe("road-case");
    expect(classifyLayer(l("poi_r20", "symbol", "poi"), "fallback")).toBe("poi");
  });
});

describe("patchStyle — dự phòng OpenFreeMap", () => {
  it("thêm nhãn tiếng Việt của FoodSave cho Hoàng Sa, Trường Sa, Biển Đông", () => {
    const after = patchStyle(libertyLike(), palette, "fallback");
    const layer = byId(after, FALLBACK_SOVEREIGNTY_LAYER);
    expect(layer.type).toBe("symbol");
    expect(layer.layout["text-font"]).toEqual(["Noto Sans Regular"]);
    expect(after.layers.at(-1)!.id).toBe(FALLBACK_SOVEREIGNTY_LAYER);
    const source = after.sources["fs-sovereignty"] as { data: GeoJSON.FeatureCollection };
    const names = source.data.features.map((f) => f.properties!.name);
    expect(names).toEqual(["Quần đảo Hoàng Sa (Việt Nam)", "Quần đảo Trường Sa (Việt Nam)", "Biển Đông"]);
  });

  it("ẩn nhãn đảo/biển của style trong vùng quần đảo và Biển Đông (tránh tên khác), giữ điều kiện cũ", () => {
    const before = libertyLike();
    const after = patchStyle(before, palette, "fallback");
    const other = byId(after, "label_other").filter;
    expect(other[0]).toBe("all");
    expect(other[1]).toEqual(byId(before, "label_other").filter);
    expect(other[2][0]).toBe("!");
    expect(other[2][1][0]).toBe("within");
    expect(byId(after, "water_name_point_label").filter[1][0]).toBe("within");
    // Nhãn thành phố không bị đụng tới
    expect(byId(after, "label_city").filter).toBeUndefined();
  });
});

describe("loadStyleJson", () => {
  afterEach(() => clearStyleCache());

  it("tải một lần cho mỗi URL (cache trong module)", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(goongLike())));
    const [a, b] = await Promise.all([
      loadStyleJson("https://x.test/a.json", fetcher),
      loadStyleJson("https://x.test/a.json", fetcher),
    ]);
    expect(a).toBe(b);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("lỗi HTTP hoặc JSON không phải style ⇒ từ chối và cho thử lại lần sau", async () => {
    const bad = vi.fn(async () => new Response("{}", { status: 200 }));
    await expect(loadStyleJson("https://x.test/b.json", bad)).rejects.toThrow("basemap_style_invalid");
    const down = vi.fn(async () => new Response("", { status: 503 }));
    await expect(loadStyleJson("https://x.test/b.json", down)).rejects.toThrow("basemap_style_503");
    expect(bad).toHaveBeenCalledTimes(1);
    expect(down).toHaveBeenCalledTimes(1);
  });
});
