import { ArrowRight, HandHeart, LogIn, type LucideIcon, Store } from "lucide-react";
import Link from "next/link";

import { CollagePhoto, PhoneFrame } from "@/components/brand/marketing";
import { photo } from "@/components/brand/photos";
import { SHOTS } from "@/components/brand/product-shots";
import { cn } from "@/lib/utils";

import { REGISTER_CHARITY, REGISTER_STORE } from "./shared";

type CssVars = React.CSSProperties & Record<`--${string}`, string>;

const DOORS: { href: string; icon: LucideIcon; title: string; body: string; primary?: boolean }[] = [
  {
    href: REGISTER_STORE,
    icon: Store,
    title: "Tôi là cửa hàng",
    body: "Đăng lô còn dùng tốt, tổ chức gần bạn tới nhận",
    primary: true,
  },
  {
    href: REGISTER_CHARITY,
    icon: HandHeart,
    title: "Tôi là tổ chức từ thiện",
    body: "Xin nhận lô, ghép nhu cầu từ nhiều cửa hàng",
  },
];

/**
 * CTA cuối (DESIGN-SYSTEM §10.4): mảng tối tràn viền nối thẳng vào chân trang — tiêu đề lớn, hai "cửa" theo
 * vai trò + lối vào cho người đã có tài khoản; bên phải xếp lớp ảnh món ăn + điện thoại chụp màn hình thật.
 * Tên link khác hẳn CTA hero ("Đăng ký cửa hàng", "Đăng nhập") để mỗi tên là duy nhất trên trang.
 */
export function ClosingCta() {
  const bread = photo("banh-mi");
  return (
    <section aria-labelledby="cta-heading" className="fs-stage fs-grain relative overflow-hidden">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 pt-20 pb-16 sm:px-8 lg:grid-cols-[minmax(0,1fr)_26rem] lg:gap-8 lg:py-24">
        <div className="flex flex-col gap-7">
          <h2
            id="cta-heading"
            className="font-display text-[clamp(2.25rem,3.3vw,2.875rem)] leading-[1.08] font-extrabold text-balance text-on-deep"
          >
            <span className="lg:block">Còn thực phẩm tốt cuối ngày?</span>{" "}
            <span className="text-brand-yellow lg:block">Đừng để nó thành rác.</span>
          </h2>
          <p className="max-w-xl text-lg text-on-deep-muted">
            Đăng ký miễn phí. Sau khi FoodSave duyệt hồ sơ, cửa hàng và tổ chức dùng được ngay mọi tính năng.
          </p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {DOORS.map(({ href, icon: Icon, title, body, primary }) => (
              <li key={href}>
                <Link
                  prefetch={false}
                  href={href}
                  className={cn(
                    "group flex h-full min-h-11 items-start gap-3 rounded-2xl p-4 transition-colors focus-visible:outline-on-deep sm:p-5",
                    primary
                      ? "bg-brand-yellow text-ink hover:bg-brand-yellow-soft"
                      : "border border-on-deep/30 bg-on-deep/5 text-on-deep hover:bg-on-deep/10",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-10 shrink-0 place-items-center rounded-xl",
                      primary ? "bg-ink/10" : "bg-on-deep/10 text-brand-mint",
                    )}
                  >
                    <Icon aria-hidden className="size-5" />
                  </span>
                  <span className="flex flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-1.5 text-lg leading-6 font-semibold">
                      {title}
                      <ArrowRight
                        aria-hidden
                        className="size-4 transition-transform group-hover:translate-x-0.5"
                      />
                    </span>
                    <span className={cn("text-sm leading-5", primary ? "text-ink/80" : "text-on-deep-muted")}>
                      {body}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="flex flex-wrap items-center gap-x-2 text-on-deep-muted">
            Đã có tài khoản?
            <Link
              prefetch={false}
              href="/login"
              className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-on-deep underline-offset-4 hover:underline focus-visible:outline-on-deep"
            >
              <LogIn aria-hidden className="size-4" />
              Vào tài khoản của bạn
            </Link>
          </p>
        </div>

        {/* Lớp ảnh: món ăn nghiêng phía sau, điện thoại phía trước tràn qua mép dưới (nối thẳng chân trang) */}
        <div className="relative mx-auto -mb-16 h-[23rem] w-full max-w-[26rem] sm:h-[26rem] lg:-mb-24 lg:h-full lg:min-h-[28rem] lg:max-w-none lg:self-stretch">
          <CollagePhoto
            photo={bread}
            decorative
            className="top-[8%] left-0 aspect-[4/3] w-[64%]"
            sizes="(min-width: 1024px) 270px, 60vw"
            tilt={-4}
            parallax={18}
          />
          <div
            className="fs-parallax absolute top-[14%] right-0 w-[52%] max-w-[15.5rem]"
            style={{ "--fs-parallax": "-22px" } as CssVars}
          >
            <PhoneFrame
              shot={SHOTS.storeLots}
              sizes="(min-width: 1024px) 240px, 40vw"
              className="rotate-[3deg]"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
