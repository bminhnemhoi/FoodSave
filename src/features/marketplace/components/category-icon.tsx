import {
  Apple,
  Beef,
  CakeSlice,
  Carrot,
  Croissant,
  CupSoda,
  type LucideIcon,
  Milk,
  Package,
  Soup,
  Wheat,
} from "lucide-react";

import { cn } from "@/lib/utils";

/** `food_categories.icon` (tên lucide kebab-case) → component; không rõ ⇒ `Package` (DESIGN-SYSTEM §2.3). */
const ICONS: Record<string, LucideIcon> = {
  croissant: Croissant,
  soup: Soup,
  "cake-slice": CakeSlice,
  carrot: Carrot,
  apple: Apple,
  milk: Milk,
  beef: Beef,
  "cup-soda": CupSoda,
  wheat: Wheat,
};

export function categoryIcon(name: string | null | undefined): LucideIcon {
  return (name && ICONS[name]) || Package;
}

/** Ô ảnh lô: ảnh nếu có, không thì icon danh mục trên nền lõm (aspect-square, bo `--radius-md`). */
export function OfferThumb({
  photoUrl,
  icon,
  title,
  className,
}: {
  photoUrl: string | null;
  icon: string;
  title: string;
  className?: string;
}) {
  const Icon = ICONS[icon] ?? Package;
  return (
    <div
      className={cn(
        "grid size-16 shrink-0 place-items-center overflow-hidden rounded-md border bg-bg-sunken text-ink-subtle sm:size-20",
        className,
      )}
    >
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- ảnh public của bucket `media`, đã mã hóa lại khi tải lên
        <img
          src={photoUrl}
          alt={`Ảnh lô ${title}`}
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
        />
      ) : (
        <Icon aria-hidden className="size-7" strokeWidth={1.75} />
      )}
    </div>
  );
}
