import { mkdirSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

/**
 * C1 (BẮT BUỘC, checklist G0): nền bản đồ đã phối màu vẫn hiện nhãn chủ quyền "Quần đảo Hoàng Sa", "Quần đảo
 * Trường Sa". Kiểm bằng `queryRenderedFeatures` trên bản đồ thật (trang thử /dev/map-kit đưa bản đồ vào
 * `window.__foodsaveMaps`, không có ở production) + ảnh chụp:
 * - Goong: lớp `place-archipelago` (nguồn `base`, source-layer `island`) — bộ phối màu không được ẩn/đổi zoom.
 * - Dự phòng OpenFreeMap (chặn mọi request tới Goong): lớp `fs-sovereignty-labels` của FoodSave, và không còn
 *   nhãn đảo của style mang tên khác trong vùng hai quần đảo.
 * Ảnh: test-results; thêm vào docs/uat/screenshots/map-c1/after khi đặt MAP_C1_SHOTS=after.
 */

const DOCS_DIR =
  process.env.MAP_C1_SHOTS === "after" ? path.join("docs", "uat", "screenshots", "map-c1", "after") : null;

const VIEWS = [
  { key: "hoang-sa", name: /Quần đảo Hoàng Sa/, center: [112.0, 16.5] as [number, number], zoom: 6 },
  { key: "truong-sa", name: /Quần đảo Trường Sa/, center: [114.2, 10.0] as [number, number], zoom: 5.5 },
];

type TestMap = {
  isStyleLoaded(): boolean;
  getLayer(id: string): unknown;
  getLayoutProperty(id: string, name: string): unknown;
  jumpTo(o: { center: [number, number]; zoom: number }): void;
  once(ev: string, cb: () => void): void;
  queryRenderedFeatures(o: {
    layers: string[];
  }): { layer: { id: string }; properties: Record<string, unknown> }[];
};

async function openMap(page: Page) {
  await page.goto("/dev/map-kit");
  const region = page.getByRole("region", { name: "Bản đồ minh họa bộ marker" });
  await expect(region.locator("canvas.maplibregl-canvas")).toBeVisible({ timeout: 60_000 });
  await page.waitForFunction(
    () => {
      const maps = (window as unknown as { __foodsaveMaps?: TestMap[] }).__foodsaveMaps;
      return !!maps?.[0]?.isStyleLoaded();
    },
    null,
    { timeout: 60_000 },
  );
  return region;
}

/** Bay tới một vùng, chờ tile vẽ xong, trả về tên các nhãn đang hiện trên các lớp `layers`. */
async function labelsAt(page: Page, center: [number, number], zoom: number, layers: string[]) {
  return page.evaluate(
    async ({ center, zoom, layers }) => {
      const map = (window as unknown as { __foodsaveMaps: TestMap[] }).__foodsaveMaps[0]!;
      map.jumpTo({ center, zoom });
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, 15_000);
        map.once("idle", () => {
          clearTimeout(t);
          resolve();
        });
      });
      const present = layers.filter((l) => map.getLayer(l));
      return {
        present,
        visibility: present.map((l) => map.getLayoutProperty(l, "visibility") ?? "visible"),
        names: map
          .queryRenderedFeatures({ layers: present })
          .map((f) => `${f.layer.id}: ${String(f.properties.name ?? "")}`),
      };
    },
    { center, zoom, layers },
  );
}

async function shoot(
  region: ReturnType<Page["getByRole"]>,
  testInfo: import("@playwright/test").TestInfo,
  file: string,
) {
  await region.screenshot({ path: testInfo.outputPath(file) });
  if (DOCS_DIR && testInfo.project.name === "desktop") {
    mkdirSync(DOCS_DIR, { recursive: true });
    await region.screenshot({ path: path.join(DOCS_DIR, file) });
  }
}

test.describe("Nhãn chủ quyền Hoàng Sa, Trường Sa trên nền bản đồ đã phối màu", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("nền Goong: lớp place-archipelago hiện đủ hai quần đảo", async ({ page }, testInfo) => {
    const region = await openMap(page);
    const hasGoong = await page.evaluate(
      () =>
        !!(window as unknown as { __foodsaveMaps: TestMap[] }).__foodsaveMaps[0]!.getLayer(
          "place-archipelago",
        ),
    );
    test.skip(!hasGoong, "Không có key tile Goong (đang dùng nền dự phòng) — xem bài test dự phòng bên dưới");
    for (const v of VIEWS) {
      const r = await labelsAt(page, v.center, v.zoom, ["place-archipelago", "place-island"]);
      testInfo.annotations.push({ type: v.key, description: r.names.join(" | ").slice(0, 400) });
      expect(r.visibility.every((x) => x === "visible")).toBe(true);
      expect(
        r.names.some((n) => n.startsWith("place-archipelago") && v.name.test(n)),
        r.names.join(" | "),
      ).toBe(true);
      await shoot(region, testInfo, `chu-quyen-${v.key}-goong.png`);
    }
  });

  test("nền dự phòng (Goong lỗi): nhãn tiếng Việt của FoodSave, không có tên khác", async ({
    page,
  }, testInfo) => {
    await page.route(/tiles\.goong\.io/, (route) => route.abort());
    const region = await openMap(page);
    await expect(region.getByText("Đang dùng bản đồ dự phòng")).toBeVisible();
    for (const v of VIEWS) {
      const r = await labelsAt(page, v.center, v.zoom, [
        "fs-sovereignty-labels",
        "label_other",
        "water_name_point_label",
      ]);
      testInfo.annotations.push({
        type: `${v.key}-fallback`,
        description: r.names.join(" | ").slice(0, 400),
      });
      expect(
        r.names.some((n) => n.startsWith("fs-sovereignty-labels") && v.name.test(n)),
        r.names.join(" | "),
      ).toBe(true);
      const others = r.names.filter((n) => !n.startsWith("fs-sovereignty-labels"));
      for (const n of others)
        expect(n).not.toMatch(/Paracel|Spratly|西沙|南沙|Xisha|Nansha|South China Sea/i);
      await shoot(region, testInfo, `chu-quyen-${v.key}-du-phong.png`);
    }
  });
});
