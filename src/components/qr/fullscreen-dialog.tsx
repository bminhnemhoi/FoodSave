"use client";

import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FullscreenDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Dòng phụ dưới tiêu đề (đồng thời là mô tả của dialog cho trình đọc màn hình). */
  description?: React.ReactNode;
  /** `dark` cho màn quét camera; `light` (mặc định) cho mã QR / đối soát. */
  tone?: "light" | "dark";
  closeLabel?: string;
  /** Vùng nút cố định ở đáy (vùng ngón cái trên điện thoại). */
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

/**
 * Lớp phủ toàn màn hình cho bàn giao (DESIGN-SYSTEM §17: màn QR/quét luôn toàn màn hình). Dựa trên Radix
 * Dialog: bẫy focus, Esc để đóng, trả focus về nút đã mở; tiêu đề luôn hiện (không chỉ cho trình đọc màn hình).
 */
export function FullscreenDialog({
  open,
  onOpenChange,
  title,
  description,
  tone = "light",
  closeLabel = "Đóng",
  footer,
  children,
  className,
}: FullscreenDialogProps) {
  const dark = tone === "dark";
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          // Không có mô tả ⇒ tắt aria-describedby (Radix cảnh báo nếu trỏ tới phần tử không tồn tại)
          {...(description ? {} : { "aria-describedby": undefined })}
          // Toàn màn hình nên không có "bên ngoài" để bấm: chỉ đóng bằng nút Đóng hoặc Esc. Chặn đóng khi focus bị
          // chuyển ra ngoài lúc một lớp phủ khác vừa đóng (chuyển từ đối soát sang máy quét).
          onInteractOutside={(e) => e.preventDefault()}
          className={cn(
            "fixed inset-0 z-50 flex h-dvh w-screen flex-col outline-none",
            dark ? "bg-ink text-primary-foreground" : "bg-bg text-ink",
            className,
          )}
        >
          <header
            className={cn(
              "flex shrink-0 items-start gap-3 border-b px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 sm:px-6",
              dark ? "border-primary-foreground/15" : "border-border bg-surface",
            )}
          >
            <div className="min-w-0 flex-1">
              {/* màu ghi rõ: base style của h2 là text-ink, sẽ chìm trên nền tối của máy quét */}
              <DialogPrimitive.Title
                className={cn(
                  "text-lg leading-7 font-semibold text-balance",
                  dark ? "text-primary-foreground" : "text-ink",
                )}
              >
                {title}
              </DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description
                  className={cn("text-sm", dark ? "text-primary-foreground/85" : "text-ink-muted")}
                >
                  {description}
                </DialogPrimitive.Description>
              ) : null}
            </div>
            <DialogPrimitive.Close asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                className={cn(
                  dark &&
                    "text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground",
                )}
              >
                <X aria-hidden className="size-6" />
                <span className="sr-only">{closeLabel}</span>
              </Button>
            </DialogPrimitive.Close>
          </header>
          {/* tabIndex: vùng cuộn dùng được bằng bàn phím khi nội dung dài hơn màn hình (WCAG 2.1.1) */}
          <div tabIndex={0} className="min-h-0 flex-1 overflow-y-auto">
            {children}
          </div>
          {footer ? (
            <footer
              className={cn(
                "shrink-0 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6",
                dark ? "border-primary-foreground/15" : "border-border bg-surface",
              )}
            >
              {footer}
            </footer>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
