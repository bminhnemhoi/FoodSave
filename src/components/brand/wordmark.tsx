import { cn } from "@/lib/utils";

type WordmarkProps = {
  className?: string;
  /** Nền tối: chữ FOOD đổi sang màu sáng. */
  inverted?: boolean;
};

/** Wordmark FOOD/SAVE với chấm vàng thương hiệu (DESIGN-SYSTEM §2.1). */
export function Wordmark({ className, inverted = false }: WordmarkProps) {
  return (
    <span
      className={cn("inline-flex items-baseline font-bold tracking-tight select-none", className)}
      aria-label="FoodSave"
      role="img"
    >
      <span className={inverted ? "text-surface" : "text-ink"}>FOOD</span>
      <span className="text-primary">SAVE</span>
      <span
        aria-hidden
        className="ml-0.5 inline-block size-[0.32em] -translate-y-[0.9em] rounded-full bg-brand-yellow"
      />
    </span>
  );
}
