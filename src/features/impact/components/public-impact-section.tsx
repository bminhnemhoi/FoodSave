import { Sprout } from "lucide-react";

import { ImpactBoard } from "./impact-board";

/**
 * Khối "Tác động đã ghi nhận" trên landing — mảng tối, số lớn (PRD US-PUB-02, F-76; DESIGN-SYSTEM §2.5, §10.4).
 * Phần chữ là HTML tĩnh (landing prerender, phục vụ từ CDN); số liệu do `ImpactBoard` lấy phía trình duyệt từ
 * `/api/public-impact` (Data Cache thẻ `public-impact`, hủy ngay bằng `updateTag` sau mỗi bàn giao ghi sổ).
 */
export function PublicImpactSection() {
  return (
    <section
      id="tac-dong"
      aria-labelledby="impact-heading"
      className="fs-stage fs-grain scroll-mt-4 overflow-hidden"
    >
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 sm:px-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center lg:gap-16 lg:py-24">
        <div className="flex max-w-prose flex-col gap-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-brand-mint">
            <Sprout aria-hidden className="size-4" />
            Sổ tác động
          </p>
          <h2
            id="impact-heading"
            className="font-display text-[clamp(2rem,4.5vw,3rem)] leading-[1.1] font-extrabold text-balance text-on-deep"
          >
            Tác động đã ghi nhận
          </h2>
          <p className="text-lg text-on-deep-muted">
            Mỗi con số đến từ một lần bàn giao thật đã được cửa hàng và tổ chức đối soát từng dòng — không có
            số ước đoán hay số mẫu.
          </p>
        </div>
        <ImpactBoard />
      </div>
    </section>
  );
}
