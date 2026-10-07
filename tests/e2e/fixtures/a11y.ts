import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/** axe WCAG 2.2 AA: không được có vi phạm serious/critical (TESTING.md §6.1). */
export async function expectNoA11yViolations(page: Page, label = page.url()) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    // Canvas MapLibre là nội dung trực quan; thông tin tương đương nằm trong danh sách/ô địa chỉ bên cạnh.
    .exclude(".maplibregl-canvas")
    .analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(
    serious,
    `${label}: ${JSON.stringify(serious.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })))}`,
  ).toEqual([]);
}
