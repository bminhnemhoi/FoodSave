import { Bike, Combine, type LucideIcon, Route } from "lucide-react";

import { LaptopFrame, PhoneFrame, ScreenshotTag } from "@/components/brand/marketing";
import { SHOTS } from "@/components/brand/product-shots";

import { SectionHead } from "./shared";

type CssVars = React.CSSProperties & Record<`--${string}`, string>;

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Combine,
    title: "Ghép từ nhiều cửa hàng",
    body: "Một nhu cầu được ghép từ nhiều lô còn đến kịp; tối đa 3 phương án, xếp theo đáp ứng đủ → ít điểm dừng → tuyến ngắn.",
  },
  {
    icon: Route,
    title: "Tuyến và giờ ước tính",
    body: "Mỗi phương án có quãng đường, thời gian xe máy và giờ dự kiến về tới điểm nhận, kiểm theo hạn dùng của từng lô.",
  },
  {
    icon: Bike,
    title: "Tình nguyện viên nhận chuyến",
    body: "Chuyến hiện trên điện thoại tình nguyện viên: điểm kế tiếp, hàng cần lấy, mã bàn giao khi tới nơi.",
  },
];

/**
 * "Xem sản phẩm" (DESIGN-SYSTEM §10.4): ảnh chụp màn hình THẬT (dữ liệu demo) trong khung laptop + điện
 * thoại xếp lớp — màn "Phương án ghép" (tổ chức) và "Điểm kế tiếp" (tình nguyện viên). Mảng mực đậm để
 * khác mảng xanh của hero/tác động.
 */
export function ProductShowcase() {
  return (
    <section
      id="san-pham"
      aria-labelledby="product-heading"
      className="fs-grain relative isolate scroll-mt-4 overflow-hidden bg-ink text-on-deep"
    >
      <div
        aria-hidden
        className="absolute inset-x-0 top-[30%] -z-10 mx-auto h-[44rem] max-w-6xl bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--brand-leaf)_34%,transparent),transparent)]"
      />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 py-20 sm:px-8 lg:gap-14 lg:py-24">
        <SectionHead
          id="product-heading"
          tone="dark"
          eyebrow="Xem sản phẩm"
          title={
            <>
              Một nhu cầu, ba phương án ghép — <span className="text-brand-yellow">vẽ sẵn trên bản đồ</span>
            </>
          }
          lead="Mái ấm đăng “cần 36 ổ bánh mì trước trưa”. FoodSave tìm lô còn đến kịp quanh điểm nhận, đề xuất phương án ghép và tuyến lấy hàng; tình nguyện viên nhận chuyến ngay trên điện thoại."
          className="mx-auto items-center text-center"
        />

        <figure className="mx-auto flex w-full max-w-5xl flex-col items-center gap-6">
          <div className="relative w-full pb-8 sm:pb-12">
            <LaptopFrame
              shot={SHOTS.plans}
              sizes="(min-width: 1152px) 840px, (min-width: 640px) 78vw, 88vw"
              className="fs-parallax mr-auto w-[86%] sm:w-[84%]"
            />
            <div
              className="fs-parallax absolute right-0 bottom-0 w-[36%] max-w-[17rem] sm:w-[25%]"
              style={{ "--fs-parallax": "-28px" } as CssVars}
            >
              <PhoneFrame shot={SHOTS.volunteer} sizes="(min-width: 1024px) 272px, 34vw" />
            </div>
          </div>
          <figcaption>
            <ScreenshotTag tone="dark" />
          </figcaption>
        </figure>

        <ul className="grid gap-6 sm:grid-cols-3 lg:gap-10">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex flex-col gap-2 border-t border-on-deep/15 pt-5">
              <Icon aria-hidden className="size-6 text-brand-mint" />
              <h3 className="text-lg font-semibold text-on-deep">{title}</h3>
              <p className="text-sm leading-6 text-on-deep-muted">{body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
