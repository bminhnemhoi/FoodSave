import { Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Đánh dấu trường do AI điền (DESIGN-SYSTEM §11.2 `AiSuggestionField`): viền trái `--info`, icon Sparkles +
 * "AI gợi ý — kiểm tra lại". Biến mất khi người dùng sửa trường đó.
 */
export function AiFieldFrame({
  active,
  children,
  className,
}: {
  active: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", active && "border-l-2 border-info pl-3", className)}>
      {children}
      {active ? (
        <p className="flex items-center gap-1 text-xs font-medium text-info">
          <Sparkles aria-hidden className="size-3.5" />
          AI gợi ý — kiểm tra lại
        </p>
      ) : null}
    </div>
  );
}
