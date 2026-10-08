import { readFileSync } from "node:fs";
import path from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EmptyInventoryIllustration, SuccessIllustration } from "@/components/illustrations";

import { Logo } from "./logo";
import { HORIZONTAL_VIEWBOX, HORIZONTAL_WORD, MARK, STACKED_VIEWBOX } from "./logo-paths";
import { PHOTO_CREDITS, photo, type PhotoId } from "./photos";

const BRAND = path.join(process.cwd(), "public", "brand");

describe("Logo Bát lá", () => {
  it("có tên truy cập FoodSave; bản trang trí thì ẩn khỏi cây truy cập", () => {
    const html = renderToStaticMarkup(<Logo />);
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="FoodSave"');
    const deco = renderToStaticMarkup(<Logo variant="mark" decorative />);
    expect(deco).toContain('aria-hidden="true"');
    expect(deco).not.toContain("role=");
  });

  it("đủ biến thể: ngang/đứng có chữ, ký hiệu không có chữ; mono theo currentColor", () => {
    expect(renderToStaticMarkup(<Logo variant="horizontal" />)).toContain(HORIZONTAL_VIEWBOX);
    expect(renderToStaticMarkup(<Logo variant="stacked" />)).toContain(STACKED_VIEWBOX);
    const mark = renderToStaticMarkup(<Logo variant="mark" />);
    expect(mark).not.toContain(HORIZONTAL_WORD.food);
    expect(renderToStaticMarkup(<Logo tone="mono" />)).not.toContain("var(--");
  });

  it("đường viền trong component trùng với tệp SVG gốc ở public/brand (sinh cùng một lần)", () => {
    const horizontal = readFileSync(path.join(BRAND, "foodsave-logo-horizontal.svg"), "utf8");
    expect(horizontal).toContain(`viewBox="${HORIZONTAL_VIEWBOX}"`);
    expect(horizontal).toContain(HORIZONTAL_WORD.food);
    expect(horizontal).toContain(HORIZONTAL_WORD.save);
    const mark = readFileSync(path.join(BRAND, "foodsave-mark.svg"), "utf8");
    for (const d of [MARK.small, MARK.big, MARK.bowl]) expect(mark).toContain(d);
  });
});

describe("Ảnh có giấy phép", () => {
  it("mỗi ảnh trong credits.json có tác giả, nguồn Pexels/Unsplash, giấy phép, alt tiếng Việt và tệp tồn tại", () => {
    expect(PHOTO_CREDITS.photos.length).toBeGreaterThanOrEqual(8);
    for (const c of PHOTO_CREDITS.photos) {
      expect(c.photographer.length).toBeGreaterThan(0);
      expect(c.sourceUrl).toMatch(/^https:\/\/(www\.pexels\.com|unsplash\.com)\//);
      expect(c.license).toMatch(/Giấy phép (Pexels|Unsplash)/);
      expect(c.alt.length).toBeGreaterThan(10);
      expect(photo(c.id as PhotoId).src).toBeTruthy();
      const bytes = readFileSync(path.join(process.cwd(), "public", c.file)).length;
      expect(bytes, c.file).toBeLessThanOrEqual(250 * 1024);
    }
  });
});

describe("Minh họa nét", () => {
  it("luôn là trang trí (aria-hidden) và theo màu accent vai trò", () => {
    for (const C of [EmptyInventoryIllustration, SuccessIllustration]) {
      const html = renderToStaticMarkup(<C />);
      expect(html).toContain('aria-hidden="true"');
      expect(html).toContain("text-role-accent");
    }
  });
});
