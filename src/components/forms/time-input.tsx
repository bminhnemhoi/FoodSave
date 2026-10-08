"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { maskTimeTyping, parseTime24, stepTime, TIME_24H_RE } from "@/lib/time";
import { cn } from "@/lib/utils";

type TimeInputProps = Omit<
  React.ComponentProps<"input">,
  "type" | "value" | "defaultValue" | "onChange" | "inputMode" | "step"
> & {
  /** Giá trị "HH:mm" (hoặc chuỗi người dùng gõ dở nếu chưa hợp lệ — để form báo lỗi). */
  value: string;
  onValueChange: (value: string) => void;
  /** Bước của phím ↑/↓ (phút). */
  stepMinutes?: number;
};

/**
 * Ô nhập giờ 24 giờ "HH:mm" cho Việt Nam (DESIGN-SYSTEM §16.4), không phụ thuộc locale hệ điều hành.
 * - Gõ tự do: "730", "7:30", "7h30" ⇒ 07:30 khi rời ô; "1830" tự thành "18:30" ngay khi gõ.
 * - Giá trị chỉ được đẩy lên form khi đã đủ "HH:mm" hợp lệ hoặc khi rời ô (không báo lỗi lúc đang gõ dở).
 * - Phím ↑/↓ tăng/giảm 15 phút. Bàn phím số trên điện thoại (`inputMode="numeric"`).
 * Nhãn do nơi dùng cung cấp (`aria-label`/`<label htmlFor>`), kèm gợi ý định dạng qua `aria-describedby`.
 */
export function TimeInput({
  value,
  onValueChange,
  stepMinutes = 15,
  onBlur,
  onKeyDown,
  className,
  ...props
}: TimeInputProps) {
  const [draft, setDraft] = useState(value);
  const [synced, setSynced] = useState(value);
  // Giá trị từ ngoài đổi (vd. "Dùng giờ ngày đầu cho cả tuần") ⇒ cập nhật ô (mẫu "derived state" của React)
  if (value !== synced) {
    setSynced(value);
    setDraft(value);
  }

  function commit(next: string) {
    setSynced(next);
    if (next !== value) onValueChange(next);
  }

  return (
    <Input
      {...props}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      spellCheck={false}
      placeholder={props.placeholder ?? "HH:mm"}
      maxLength={5}
      value={draft}
      onChange={(e) => {
        const masked = maskTimeTyping(e.target.value);
        setDraft(masked);
        if (TIME_24H_RE.test(masked)) commit(masked);
      }}
      onBlur={(e) => {
        const normalized = parseTime24(draft) ?? draft;
        setDraft(normalized);
        commit(normalized);
        onBlur?.(e);
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          const next = stepTime(draft, e.key === "ArrowUp" ? 1 : -1, stepMinutes);
          setDraft(next);
          commit(next);
        }
        onKeyDown?.(e);
      }}
      className={cn("text-center tabular-nums", className)}
    />
  );
}
