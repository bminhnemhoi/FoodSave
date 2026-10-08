import { cn } from "@/lib/utils";

import {
  HORIZONTAL_VIEWBOX,
  HORIZONTAL_WORD,
  MARK,
  MARK_SMALL,
  MARK_VIEWBOX,
  STACKED_VIEWBOX,
  STACKED_WORD,
} from "./logo-paths";

export type LogoVariant = "mark" | "horizontal" | "stacked";
/** `color` cho nền sáng, `white` cho nền tối/ảnh, `mono` một màu theo `currentColor` (in, khắc, fax…). */
export type LogoTone = "color" | "white" | "mono";

type LogoProps = {
  variant?: LogoVariant;
  tone?: LogoTone;
  /** Biến thể rút gọn (lá đầy hơn, bỏ gân) cho ký hiệu ≤ 32 px. Chỉ áp dụng với `variant="mark"`. */
  simplified?: boolean;
  /** Tên cho trình đọc màn hình. Mặc định "FoodSave". */
  title?: string;
  /** Bỏ khỏi cây truy cập khi đã có chữ/nhãn tương đương bên cạnh (ví dụ link có aria-label). */
  decorative?: boolean;
  className?: string;
};

/**
 * Bảng màu cố định của logo (DESIGN-SYSTEM §2.2) — dùng giá trị token thương hiệu, không theo chế độ tối,
 * để logo luôn giống nhau ở mọi nơi. `mono` lấy `currentColor`.
 */
const PALETTE: Record<
  LogoTone,
  { sun: string; small: string; big: string; vein?: string; bowl: string; food: string; save: string }
> = {
  color: {
    sun: "var(--brand-yellow)",
    small: "var(--brand-mint)",
    big: "var(--brand-leaf)",
    vein: "var(--surface)",
    bowl: "var(--primary)",
    food: "var(--ink)",
    save: "var(--primary)",
  },
  white: {
    sun: "var(--brand-yellow)",
    small: "var(--primary-soft)",
    big: "var(--brand-mint)",
    vein: "var(--primary)",
    bowl: "var(--surface)",
    food: "var(--bg)",
    save: "var(--brand-mint)",
  },
  mono: {
    sun: "currentColor",
    small: "currentColor",
    big: "currentColor",
    bowl: "currentColor",
    food: "currentColor",
    save: "currentColor",
  },
};

const VIEWBOX: Record<LogoVariant, string> = {
  mark: MARK_VIEWBOX,
  horizontal: HORIZONTAL_VIEWBOX,
  stacked: STACKED_VIEWBOX,
};

/** Kích thước mặc định theo cỡ chữ của phần tử cha (`text-xl` ⇒ logo ngang cao 32 px). */
const SIZE: Record<LogoVariant, string> = {
  mark: "size-[1.6em]",
  horizontal: "h-[1.6em] w-auto",
  stacked: "h-[3.2em] w-auto",
};

/**
 * Logo FoodSave "Bát lá" (DESIGN-SYSTEM §2): chiếc bát là bữa ăn được trao, hai chiếc lá là thực phẩm
 * được cứu, chấm vàng là nắng (kế thừa chấm vàng của wordmark cũ). SVG nội tuyến, không phụ thuộc font
 * lúc chạy — chữ "FoodSave" đã được chuyển thành đường viền.
 */
export function Logo({
  variant = "horizontal",
  tone = "color",
  simplified = false,
  title = "FoodSave",
  decorative = false,
  className,
}: LogoProps) {
  const c = PALETTE[tone];
  const m = variant === "mark" && simplified ? MARK_SMALL : MARK;
  const word = variant === "horizontal" ? HORIZONTAL_WORD : variant === "stacked" ? STACKED_WORD : null;
  const a11y = decorative
    ? ({ "aria-hidden": true, focusable: "false" } as const)
    : ({ role: "img", "aria-label": title } as const);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={VIEWBOX[variant]}
      className={cn("inline-block shrink-0 select-none", SIZE[variant], className)}
      data-logo={variant}
      {...a11y}
    >
      <circle cx={m.sun.cx} cy={m.sun.cy} r={m.sun.r} style={{ fill: c.sun }} />
      <path d={m.small} style={{ fill: c.small }} />
      <path d={m.big} style={{ fill: c.big }} />
      {"vein" in m && c.vein ? (
        <path
          d={m.vein}
          fill="none"
          style={{ stroke: c.vein }}
          strokeWidth={1.8}
          strokeLinecap="round"
          opacity={tone === "color" ? 0.7 : 0.45}
        />
      ) : null}
      <path d={m.bowl} style={{ fill: c.bowl }} />
      {word ? (
        <>
          <path d={word.food} style={{ fill: c.food }} />
          <path d={word.save} style={{ fill: c.save }} />
        </>
      ) : null}
    </svg>
  );
}
