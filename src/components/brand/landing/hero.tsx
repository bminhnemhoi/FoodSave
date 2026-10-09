import {
  Apple,
  Beef,
  CakeSlice,
  Carrot,
  Check,
  CircleCheck,
  Croissant,
  CupSoda,
  HandHeart,
  type LucideIcon,
  Milk,
  QrCode,
  Soup,
  Sprout,
  Store,
  Timer,
  Wheat,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Enter, FloatingCard, IllustrativeTag } from "@/components/brand/marketing";
import { photo } from "@/components/brand/photos";
import { FreshnessBadge } from "@/components/labels/freshness-badge";
import { buttonVariants } from "@/components/ui/button";
import { HeroImpactCard } from "@/features/impact/components/hero-impact-card";
import { cn } from "@/lib/utils";

import { REGISTER_CHARITY, REGISTER_STORE } from "./shared";

type CssVars = React.CSSProperties & Record<`--${string}`, string>;

/** 9 nhóm thực phẩm thật của FoodSave (`food_categories`, seed 00_reference.sql) — tên rút gọn, cùng icon. */
const CATEGORIES: { name: string; icon: LucideIcon }[] = [
  { name: "Bánh mì", icon: Croissant },
  { name: "Cơm hộp", icon: Soup },
  { name: "Bánh ngọt", icon: CakeSlice },
  { name: "Rau củ", icon: Carrot },
  { name: "Trái cây", icon: Apple },
  { name: "Sữa", icon: Milk },
  { name: "Thịt & hải sản", icon: Beef },
  { name: "Đồ uống", icon: CupSoda },
  { name: "Đồ khô", icon: Wheat },
];

/**
 * Hero (DESIGN-SYSTEM §2.5, §10.4): ảnh là LỚP NỀN tràn viền (L2, trôi chậm theo cuộn), phủ lớp màu thương
 * hiệu để chữ đạt ≥ 4,5:1 (đo trong tests/e2e/public/home.spec.ts), thẻ nổi ở lớp trước (L3), dải 9 nhóm thực
 * phẩm thật ở đáy. Ảnh nền là ảnh LCP duy nhất có `preload`; tiêu đề không có hiệu ứng vào để hiện ngay.
 */
export function Hero() {
  const bg = photo("trao-hop-thuc-pham");
  return (
    <section
      aria-labelledby="hero-heading"
      className="fs-grain relative isolate flex min-h-[max(100svh,46rem)] flex-col overflow-hidden bg-brand-deep text-on-deep lg:min-h-[max(100svh,50rem)]"
    >
      {/* L1–L3: ảnh nền, lớp phủ, lưới, thẻ nổi — sau chữ trong thứ tự đọc, dưới chữ trong thứ tự vẽ */}
      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 items-end px-4 pt-[19.75rem] pb-10 sm:px-8 sm:pt-[23rem] lg:items-center lg:pt-28 lg:pb-14">
        <div className="flex max-w-[36rem] flex-col gap-6 lg:max-w-[30rem] xl:max-w-[32rem]">
          <Enter
            as="p"
            delay={0}
            className="flex w-fit items-center gap-2 rounded-full border border-on-deep/20 bg-brand-deep/60 px-3 py-1 text-sm font-medium text-brand-mint"
          >
            <Sprout aria-hidden className="size-4" />
            Nền tảng phi lợi nhuận · Không thu phí
          </Enter>
          <h1
            id="hero-heading"
            className="font-display text-[clamp(2.5rem,5.4vw,4.25rem)] leading-[1.05] font-extrabold text-balance text-on-deep"
          >
            Cứu thực phẩm, <span className="text-brand-yellow">minh bạch</span> đến từng suất ăn.
          </h1>
          <p className="max-w-[32rem] text-lg leading-relaxed text-on-deep-muted">
            FoodSave kết nối thực phẩm còn dùng tốt từ cửa hàng tới mái ấm, bếp ăn từ thiện và viện dưỡng lão
            — nhanh, đúng người, và có bằng chứng cho từng lô.
          </p>
          <Enter delay={120} className="flex flex-wrap gap-3">
            {/* Link mang kiểu nút (buttonVariants) thay cho <Button asChild>: không kéo Radix Slot xuống trình duyệt */}
            <Link
              prefetch={false}
              href={REGISTER_STORE}
              className={cn(
                buttonVariants({ size: "lg" }),
                "min-h-12 w-full bg-brand-yellow px-6 text-ink hover:bg-brand-yellow-soft focus-visible:outline-on-deep sm:w-auto",
              )}
            >
              <Store aria-hidden />
              Đăng ký cửa hàng
            </Link>
            <Link
              prefetch={false}
              href={REGISTER_CHARITY}
              className={cn(
                buttonVariants({ size: "lg", variant: "outline" }),
                "min-h-12 w-full border-on-deep/40 bg-brand-deep/40 px-6 text-on-deep hover:bg-on-deep/10 hover:text-on-deep focus-visible:outline-on-deep sm:w-auto",
              )}
            >
              <HandHeart aria-hidden />
              Đăng ký tổ chức
            </Link>
          </Enter>
          <Enter as="ul" delay={200} className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-on-deep-muted">
            {["Duyệt hồ sơ trước khi mở cổng", "Bàn giao bằng QR", "Số liệu có nguồn"].map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <Check aria-hidden className="size-4 text-brand-mint" />
                {t}
              </li>
            ))}
          </Enter>
        </div>
      </div>

      <div
        role="group"
        aria-label="Ảnh và giao diện minh họa"
        className="pointer-events-none absolute inset-0 -z-10"
      >
        {/* L2 — ảnh nền: mobile ở nửa trên, desktop chiếm 70% bên phải; trôi xuống chậm khi cuộn */}
        <div
          className="fs-drift absolute inset-x-0 -top-16 h-[29rem] sm:h-[33rem] lg:inset-y-0 lg:-top-16 lg:left-[30%] lg:h-auto"
          style={{ "--fs-drift": "4rem" } as CssVars}
        >
          <Image
            src={bg.src}
            alt={bg.alt}
            fill
            preload
            fetchPriority="high"
            placeholder="blur"
            sizes="(min-width: 1024px) 70vw, 100vw"
            className="object-cover object-[4%_50%] sm:object-[30%_50%] lg:object-[42%_55%]"
          />
          <div aria-hidden className="fs-hero-scrim-m absolute inset-0 lg:hidden" />
        </div>
        <div aria-hidden className="fs-hero-scrim absolute inset-0 hidden lg:block" />
        <div aria-hidden className="fs-hero-grid absolute inset-0 hidden lg:block" />

        {/* L3 — thẻ nổi quanh hộp thực phẩm; trôi ngược chiều ảnh (chiều sâu) */}
        <div
          className="fs-drift absolute inset-x-0 top-0 h-[24rem] sm:h-[28rem] lg:inset-y-0 lg:h-auto"
          style={{ "--fs-drift": "-1.5rem" } as CssVars}
        >
          <div className="relative mx-auto h-full w-full max-w-6xl">
            <FloatingCard
              className="top-[5.5rem] right-8 hidden sm:block lg:top-[21%] lg:right-[4%]"
              delay={260}
              illustrative
            >
              <div className="flex items-center gap-2.5">
                <span className="grid size-9 place-items-center rounded-lg bg-primary-soft text-primary-active">
                  <QrCode aria-hidden className="size-5" />
                </span>
                <div>
                  <p className="text-xs leading-4 text-ink-muted">Mã bàn giao</p>
                  <p className="font-display text-lg leading-6 font-extrabold tracking-[0.08em] tabular-nums">
                    482 913
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1 text-xs leading-4 text-success">
                  <CircleCheck aria-hidden className="size-3.5" />
                  Đã đối soát 3/3 dòng
                </span>
                <IllustrativeTag />
              </div>
            </FloatingCard>

            <FloatingCard
              className="top-[5.25rem] left-4 max-sm:w-[12.75rem] sm:top-[15rem] sm:left-8 lg:top-auto lg:bottom-[13%] lg:left-[47%]"
              delay={380}
              illustrative
            >
              <div className="flex items-center justify-between gap-3">
                <FreshnessBadge label="red" size="sm" />
                <IllustrativeTag />
              </div>
              <p className="font-semibold">Cơm phần rau củ · 7 suất</p>
              <p className="flex items-center gap-1 text-ink-muted tabular-nums">
                <Timer aria-hidden className="size-4" />
                Còn 1 giờ 58 phút
              </p>
            </FloatingCard>

            <FloatingCard
              className="top-[12.25rem] left-4 max-sm:w-[12.75rem] sm:top-[19rem] sm:right-8 sm:left-auto sm:min-w-48 lg:top-auto lg:right-0 lg:bottom-[20%]"
              delay={500}
            >
              <HeroImpactCard />
            </FloatingCard>
          </div>
        </div>
      </div>

      {/* Dải đáy: 9 nhóm thực phẩm thật — lấp khoảng trống bằng thông tin, không phải số tự đặt */}
      <div className="relative z-10 border-t border-on-deep/10 bg-brand-deep/85">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-4 sm:px-8 lg:flex-row lg:items-center lg:gap-6 lg:py-3.5">
          <p
            id="hero-categories"
            className="shrink-0 text-sm leading-5 font-semibold text-brand-mint lg:max-w-24"
          >
            Nhận 9 nhóm thực phẩm
          </p>
          <ul
            aria-labelledby="hero-categories"
            className="flex flex-wrap gap-2 lg:flex-1 lg:flex-nowrap lg:justify-between lg:gap-1.5"
          >
            {CATEGORIES.map(({ name, icon: Icon }) => (
              <li
                key={name}
                className="inline-flex items-center gap-1.5 rounded-full border border-on-deep/15 bg-on-deep/5 px-2.5 py-1 text-[0.8125rem] leading-5 whitespace-nowrap text-on-deep lg:text-sm"
              >
                <Icon aria-hidden className="size-4 shrink-0 text-brand-mint" />
                {name}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
