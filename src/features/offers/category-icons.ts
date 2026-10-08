import {
  Apple,
  type LucideProps,
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

import { createElement } from "react";

import { clientEnv } from "@/lib/env.client";

/**
 * Icon lucide của danh mục (`food_categories.icon`, kebab-case) — bảng tĩnh để không phải nạp cả bộ icon.
 * Icon lạ ⇒ `Package` (lô tặng chung, DESIGN-SYSTEM §9).
 */
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

/** Icon danh mục theo tên (component tĩnh — không tạo component trong lúc render). */
export function CategoryIcon({ iconName, ...props }: LucideProps & { iconName: string | null | undefined }) {
  return createElement(categoryIcon(iconName), { "aria-hidden": true, ...props });
}

/** URL công khai của ảnh lô (bucket `media` public — DATA-MODEL §10). */
export function offerPhotoUrl(path: string): string {
  const base = clientEnv.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
  return `${base}/storage/v1/object/public/media/${path.split("/").map(encodeURIComponent).join("/")}`;
}
