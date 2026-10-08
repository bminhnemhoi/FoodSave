"use client";

import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type BottomSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  /** Nút hành động cố định ở đáy (vùng ngón cái). */
  footer?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
};

/**
 * Bottom sheet cho điện thoại (DESIGN-SYSTEM §17: dialog → bottom sheet trên mobile; §6 bo góc trên 20 px):
 * Radix Dialog ⇒ bẫy focus, Esc để đóng, trả focus về nút đã mở. Nút đóng 44 px. Trên desktop vẫn là sheet
 * đáy nhưng giới hạn chiều rộng để dễ đọc.
 */
export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  footer,
  children,
  className,
}: BottomSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className={cn(
          "mx-auto max-h-[92dvh] w-full max-w-lg gap-0 rounded-t-[1.25rem] border-x bg-surface p-0 text-base text-ink",
          className,
        )}
      >
        <SheetHeader className="flex-row items-start gap-3 border-b px-4 pt-4 pb-3">
          <div className="min-w-0 flex-1">
            <SheetTitle className="text-lg leading-7 font-semibold text-ink">{title}</SheetTitle>
            {description ? (
              <SheetDescription className="text-sm text-ink-muted">{description}</SheetDescription>
            ) : null}
          </div>
          <SheetClose asChild>
            <Button type="button" variant="ghost" size="icon-lg" className="-mt-1 -mr-2 shrink-0">
              <X aria-hidden className="size-5" />
              <span className="sr-only">Đóng</span>
            </Button>
          </SheetClose>
        </SheetHeader>
        {/* tabIndex: vùng cuộn dùng được bằng bàn phím khi nội dung dài (WCAG 2.1.1) */}
        <div
          tabIndex={0}
          className="min-h-0 flex-1 overflow-y-auto px-4 py-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {children}
        </div>
        {footer ? (
          <div className="flex flex-col gap-2 border-t px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
