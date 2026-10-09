import { MonitorSmartphone } from "lucide-react";
import Image from "next/image";

import { cn } from "@/lib/utils";

import type { BrandPhoto } from "./photos";
import type { ProductShot } from "./product-shots";

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
            placeholder={preload ? "blur" : "empty"}
            preload={preload}
            fetchPriority={preload ? "high" : undefined}
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
  /** Thẻ giao diện minh họa (không phải dữ liệu thật) ⇒ bắt buộc chứa `IllustrativeTag` (test kiểm). */
  illustrative?: boolean;
};

/** L3 — thẻ nổi trên ảnh: nền giấy, bóng một hướng, xuất hiện sau ảnh trong màn mở đầu. */
export function FloatingCard({
  className,
  children,
  delay = 0,
  parallax = 0,
  illustrative = false,
}: FloatingCardProps) {
  return (
    <div
      className={cn("absolute z-10", parallax ? "fs-parallax" : undefined, className)}
      style={{ "--fs-parallax": `${parallax}px` } as CssVars}
    >
      <div
        className="fs-pop flex flex-col gap-1.5 rounded-2xl bg-surface p-3 text-sm leading-5 text-ink shadow-float ring-1 ring-ink/5"
        style={{ "--fs-delay": `${delay}ms` } as CssVars}
        data-illustrative={illustrative || undefined}
      >
        {children}
      </div>
    </div>
  );
}

/** Nhãn cho ảnh chụp màn hình thật dùng tài khoản demo (khác "Minh họa": đây là giao diện thật). */
export function ScreenshotTag({
  tone = "light",
  className,
}: {
  tone?: "light" | "dark";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs leading-4 font-medium whitespace-nowrap",
        tone === "dark"
          ? "border border-on-deep/25 bg-brand-deep/80 text-on-deep"
          : "border border-border-strong/40 bg-surface/90 text-ink-muted",
        className,
      )}
    >
      <MonitorSmartphone aria-hidden className="size-3.5" />
      Ảnh chụp màn hình · dữ liệu demo
    </span>
  );
}

type DeviceProps = {
  shot: ProductShot;
  sizes: string;
  className?: string;
  /** Ảnh mang nội dung (mặc định) hay đã có chữ tương đương bên cạnh. */
  decorative?: boolean;
};

/**
 * Khung điện thoại (CSS thuần) chứa ảnh chụp màn hình 390 × 844. Có thanh trạng thái riêng phía trên ảnh
 * (cùng màu dòng đầu của ảnh: dải "dữ liệu demo" hoặc nền hộp thoại) để "đảo" camera không che chữ.
 */
export function PhoneFrame({
  shot,
  sizes,
  className,
  decorative = false,
  statusBar = "demo",
}: DeviceProps & { statusBar?: "demo" | "surface" }) {
  return (
    <div
      className={cn(
        "relative rounded-[2.4rem] bg-ink p-[3.2%] shadow-device ring-1 ring-on-deep/15",
        className,
      )}
    >
      <div
        className={cn(
          "relative overflow-hidden rounded-[1.9rem] pt-[11%]",
          statusBar === "demo" ? "bg-brand-yellow-soft" : "bg-surface",
        )}
      >
        <span
          aria-hidden
          className="absolute top-[1.3%] left-1/2 h-[2%] w-[30%] -translate-x-1/2 rounded-full bg-ink"
        />
        <div className="relative aspect-[390/844]">
          <Image
            src={shot.src}
            alt={decorative ? "" : shot.alt}
            fill
            sizes={sizes}
            className="object-cover object-top"
          />
        </div>
      </div>
    </div>
  );
}

/** Khung laptop (CSS thuần) chứa ảnh chụp màn hình 1440 × 900. */
export function LaptopFrame({ shot, sizes, className, decorative = false }: DeviceProps) {
  return (
    <div className={cn("relative", className)}>
      <div className="relative rounded-t-[1.1rem] rounded-b-md bg-ink p-[1.6%] pb-[2.4%] shadow-device ring-1 ring-on-deep/15">
        <div className="relative aspect-[16/10] overflow-hidden rounded-[0.4rem] bg-bg">
          <Image
            src={shot.src}
            alt={decorative ? "" : shot.alt}
            fill
            sizes={sizes}
            className="object-cover object-top"
          />
        </div>
      </div>
      <div
        aria-hidden
        className="relative -mx-[6%] h-[0.85rem] rounded-b-[1.1rem] bg-gradient-to-b from-bg-sunken to-border-strong shadow-float"
      >
        <span className="absolute top-0 left-1/2 h-1.5 w-[16%] -translate-x-1/2 rounded-b-lg bg-border-strong/70" />
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
