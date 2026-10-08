import { cn } from "@/lib/utils";

import { Logo } from "./logo";

type WordmarkProps = {
  className?: string;
  /** Nền tối/ảnh: dùng bản trắng của logo. */
  inverted?: boolean;
};

/**
 * Logo ngang "Bát lá" + chữ FoodSave (DESIGN-SYSTEM §2). Giữ tên `Wordmark` để các nơi đang dùng không phải
 * đổi; cỡ theo `font-size` của className (`text-xl` ⇒ cao 32 px). Tên truy cập: "FoodSave".
 */
export function Wordmark({ className, inverted = false }: WordmarkProps) {
  return <Logo variant="horizontal" tone={inverted ? "white" : "color"} className={cn(className)} />;
}
