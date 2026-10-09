import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PIN_SQUARE } from "./glyphs";
import { LegendStore, MapLegend } from "./legend";
import { ClusterBubble, HomePin, StopPin, StoreMarker, VolunteerMarker } from "./markers";

const noop = () => undefined;
const text = (html: string) => html.replace(/<[^>]+>/g, "");

describe("StoreMarker", () => {
  it("có onClick ⇒ <button> với aria-label; nền = màu nhãn (E2E so màu marker theo nhãn)", () => {
    const html = renderToStaticMarkup(
      <StoreMarker label="red" count={3} ariaLabel="Tiệm A, 3 lô, gấp nhất: Nhãn Đỏ" onClick={noop} />,
    );
    expect(html.startsWith("<button")).toBe(true);
    expect(html).toContain('aria-label="Tiệm A, 3 lô, gấp nhất: Nhãn Đỏ"');
    expect(html).toContain("bg-label-red");
    expect(html).toContain("size-11"); // vùng chạm 44 px
    expect(html).toContain("fs-map-halo"); // lô Đỏ có quầng
    expect(text(html)).toContain("3");
  });

  it("Vàng bắt buộc viền --label-yellow-fg; 1 lô thì không có huy hiệu số", () => {
    const html = renderToStaticMarkup(
      <StoreMarker label="yellow" count={1} ariaLabel="Tiệm B" onClick={noop} />,
    );
    expect(html).toContain("border-label-yellow-fg");
    expect(html).not.toContain("fs-map-halo");
    expect(text(html)).toBe("");
  });

  it("không có onClick ⇒ role=img; có số thứ tự và lượng lấy", () => {
    const html = renderToStaticMarkup(
      <StoreMarker label="green" order={2} tag="18 ổ" ariaLabel="Điểm dừng 2" />,
    );
    expect(html.startsWith('<span role="img"')).toBe(true);
    expect(text(html)).toContain("2");
    expect(text(html)).toContain("18 ổ");
  });

  it("vị trí gần đúng: nền nhạt của nhãn + viền nét đứt (vẫn khác màu giữa các nhãn)", () => {
    const html = renderToStaticMarkup(
      <StoreMarker label="red" approximate ariaLabel="Tiệm C" onClick={noop} />,
    );
    expect(html).toContain("bg-label-red-bg");
    expect(html).toContain("border-dashed");
  });
});

describe("ClusterBubble", () => {
  it("chữ chỉ là con số; màu theo nhãn gấp nhất", () => {
    const html = renderToStaticMarkup(
      <ClusterBubble count={12} tone="yellow" ariaLabel="Cụm 12 cửa hàng" onClick={noop} />,
    );
    expect(text(html)).toBe("12");
    expect(html).toContain("bg-label-yellow");
    expect(html).toContain('aria-label="Cụm 12 cửa hàng"');
  });
});

describe("StopPin", () => {
  it("trạng thái bằng ký hiệu, không chỉ màu: đã lấy ⇒ ✓, trễ ⇒ !, tuyến 2 ⇒ ghim vuông", () => {
    const done = renderToStaticMarkup(<StopPin seq={1} status="done" ariaLabel="Điểm 1" onClick={noop} />);
    expect(done).toContain("lucide-check");
    expect(text(done)).not.toContain("1");
    const late = renderToStaticMarkup(<StopPin seq={2} status="late" ariaLabel="Điểm 2" onClick={noop} />);
    expect(late).toContain("lucide-triangle-alert");
    expect(text(late)).toContain("2");
    const second = renderToStaticMarkup(<StopPin seq={1} status="pending" tone={1} ariaLabel="Tuyến 2" />);
    expect(second).toContain(PIN_SQUARE);
    const current = renderToStaticMarkup(<StopPin seq={3} status="pending" current ariaLabel="Kế tiếp" />);
    expect(text(current)).toContain("Kế tiếp");
  });
});

describe("HomePin, VolunteerMarker", () => {
  it("ghim điểm của tôi có chữ luôn hiện; TNV vị trí cũ có cảnh báo", () => {
    const home = renderToStaticMarkup(
      <HomePin kind="charity" caption="Điểm nhận của bạn" ariaLabel="Điểm nhận của bạn: Bếp" />,
    );
    expect(home).toContain('role="img"');
    expect(text(home)).toContain("Điểm nhận của bạn");
    const fresh = renderToStaticMarkup(<VolunteerMarker ariaLabel="TNV" label="An · 1 phút" />);
    expect(fresh).toContain('data-stale="false"');
    const stale = renderToStaticMarkup(<VolunteerMarker ariaLabel="TNV" label="12 phút trước" stale />);
    expect(stale).toContain('data-stale="true"');
    expect(stale).toContain("lucide-triangle-alert");
  });
});

describe("MapLegend", () => {
  it("mở sẵn: danh sách có tên, ký hiệu + chữ; không có gì thì không vẽ", () => {
    const html = renderToStaticMarkup(
      <MapLegend
        storageKey="test"
        routes={[{ key: "r", label: "Tuyến xe máy", tone: 0, dashed: false }]}
        items={[{ key: "red", symbol: <LegendStore label="red" />, label: "Lô Đỏ" }]}
      />,
    );
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-label="Chú thích tuyến"');
    expect(html).toContain('aria-label="Chú giải bản đồ"');
    expect(text(html)).toContain("Lô Đỏ");
    expect(renderToStaticMarkup(<MapLegend storageKey="test" items={[]} />)).toBe("");
  });
});
