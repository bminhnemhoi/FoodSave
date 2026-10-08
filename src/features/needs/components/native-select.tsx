import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/** `<select>` gốc theo token (bàn phím, trình đọc màn hình, bàn chọn của điện thoại hoạt động sẵn). */
export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        {...props}
        className={cn(
          "h-11 w-full appearance-none rounded-lg border border-input bg-surface pr-9 pl-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:h-10 md:text-sm",
          className,
        )}
      />
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-muted"
      />
    </div>
  );
}
