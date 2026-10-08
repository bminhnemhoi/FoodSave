import Image from "next/image";

import { cn } from "@/lib/utils";

import type { BrandPhoto } from "./photos";

/**
 * Khối dựng trang công khai theo 4 lớp (DESIGN-SYSTEM §2.5): L1 nền `.fs-stage`/`.fs-grain` (globals.css),
 * L2 ảnh xếp lớp `CollagePhoto`, L3 thẻ nổi `FloatingCard`, L4 chuyển động `.fs-enter`/`.fs-pop`/`.fs-parallax`
 * — chỉ transform/opacity, chạy một lần, tắt khi "giảm chuyển động", nội dung luôn hiện khi không có JS.
 */

type CssVars = React.CSSProperties & Record<`--${string}`, string>;

/** Nhãn bắt buộc trên mọi giao diện minh họa (không phải dữ liệu thật). */
export function IllustrativeTag({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center rounded-full border border-dashed border-border-strong px-2 py-0.5 text-xs leading-4 font-medium whitespace-nowrap text-ink-muted",
        className,
      )}
    >
      Minh họa
    </span>
  );
}

type CollagePhotoProps = {
  photo: BrandPhoto;
  /** Vị trí + kích thước (absolute) trong khung collage. */
  className?: string;
  /** Thuộc tính `sizes` của next/image theo bố cục thật. */
  sizes: string;
  /** Độ nghiêng (deg) — cùng hướng bóng đổ cho mọi ảnh. */
  tilt?: number;
  /** Biên độ parallax (px) khi cuộn; âm = trôi ngược chiều. */
  parallax?: number;
  /** Trễ màn mở đầu (ms). */
  delay?: number;
  /** Chỉ ảnh LCP. */
  preload?: boolean;
  /** Ảnh trang trí (đã có chữ tương đương) ⇒ alt rỗng. */
  decorative?: boolean;
};

/** L2 — một ảnh trong collage: lớp ngoài trôi theo cuộn, lớp giữa mở đầu, lớp trong nghiêng + bo + bóng. */
export function CollagePhoto({
  photo,
  className,
  sizes,
  tilt = 0,
  parallax = 0,
  delay = 0,
  preload = false,
  decorative = false,
}: CollagePhotoProps) {
  return (
    <div
      className={cn("absolute", parallax ? "fs-parallax" : undefined, className)}
      style={{ "--fs-parallax": `${parallax}px` } as CssVars}
    >
      <div className="fs-pop size-full" style={{ "--fs-delay": `${delay}ms` } as CssVars}>
        <div
          className="relative size-full overflow-hidden rounded-[1.375rem] bg-brand-deep shadow-photo"
          style={{ rotate: `${tilt}deg` }}
        >
          <Image
            src={photo.src}
            alt={decorative ? "" : photo.alt}
            fill
            sizes={sizes}
            placeholder="blur"
            preload={preload}
            className="object-cover"
          />
        </div>
      </div>
    </div>
  );
}

type FloatingCardProps = {
  className?: string;
  children: React.ReactNode;
  delay?: number;
  parallax?: number;
};

/** L3 — thẻ nổi trên ảnh: nền giấy, bóng một hướng, xuất hiện sau ảnh trong màn mở đầu. */
export function FloatingCard({ className, children, delay = 0, parallax = 0 }: FloatingCardProps) {
  return (
    <div
      className={cn("absolute z-10", parallax ? "fs-parallax" : undefined, className)}
      style={{ "--fs-parallax": `${parallax}px` } as CssVars}
    >
      <div
        className="fs-pop flex flex-col gap-1.5 rounded-2xl bg-surface p-3 text-sm leading-5 text-ink shadow-float ring-1 ring-ink/5"
        style={{ "--fs-delay": `${delay}ms` } as CssVars}
      >
        {children}
      </div>
    </div>
  );
}

/** Thứ tự xuất hiện của màn mở đầu (L4). */
export function Enter({
  as: Tag = "div",
  delay = 0,
  rise = false,
  className,
  children,
  ...rest
}: {
  as?: "div" | "p" | "h1" | "h2" | "span" | "ul";
  delay?: number;
  /** Chỉ trượt, không mờ (dùng cho tiêu đề LCP). */
  rise?: boolean;
  className?: string;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag
      className={cn(rise ? "fs-rise" : "fs-enter", className)}
      style={{ "--fs-delay": `${delay}ms` } as CssVars}
      {...rest}
    >
      {children}
    </Tag>
  );
}
