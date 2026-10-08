"use client";

import { Camera, ImagePlus, Loader2, Sparkles, Trash2 } from "lucide-react";
import { useId, useRef } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { FieldErrorText } from "@/features/onboarding/components/fields";
import { cn } from "@/lib/utils";

import { OFFER_PHOTO_ACCEPT } from "../upload";

/**
 * Ảnh lô + nút "Chụp ảnh để điền nhanh" (P2-05). Nút AI chỉ hiện khi server bật AI (US-STO-08 AC4).
 * Chưa có ảnh ⇒ nút AI mở bộ chọn ảnh rồi nhận diện ngay; đã có ảnh ⇒ nhận diện ảnh đang chọn.
 */
export function PhotoField({
  previewUrl,
  preparing,
  error,
  aiAvailable,
  aiRunning,
  onPick,
  onRemove,
  onAi,
}: {
  previewUrl: string | null;
  preparing: boolean;
  error: string | null;
  aiAvailable: boolean;
  aiRunning: boolean;
  onPick: (file: File, opts: { runAi: boolean }) => void;
  onRemove: () => void;
  onAi: () => void;
}) {
  const id = useId();
  const inputId = `${id}-photo`;
  const inputRef = useRef<HTMLInputElement>(null);
  const runAiAfterPick = useRef(false);
  const busy = preparing || aiRunning;

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <div className="relative grid aspect-[4/3] w-full shrink-0 place-items-center overflow-hidden rounded-xl border bg-bg-sunken sm:w-56">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- ảnh xem trước là blob: URL cục bộ
          <img src={previewUrl} alt="Ảnh lô đã chọn" className="size-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-2 px-4 text-center text-ink-subtle">
            <ImagePlus aria-hidden className="size-8" strokeWidth={1.75} />
            <span className="text-sm">Chưa có ảnh</span>
          </div>
        )}
        {busy ? (
          <div className="absolute inset-0 grid place-items-center bg-surface/70">
            <Loader2 aria-hidden className="size-6 animate-spin text-ink-muted" />
          </div>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={OFFER_PHOTO_ACCEPT}
          className="peer sr-only"
          disabled={busy}
          aria-describedby={error ? `${inputId}-error` : `${inputId}-hint`}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            const runAi = runAiAfterPick.current;
            runAiAfterPick.current = false;
            if (file) onPick(file, { runAi });
          }}
        />
        <div className="flex flex-wrap gap-2">
          {aiAvailable ? (
            <Button
              type="button"
              size="lg"
              variant="outline"
              disabled={busy}
              aria-busy={aiRunning || undefined}
              className="border-info/40 text-info hover:bg-info-soft hover:text-info"
              onClick={() => {
                if (previewUrl) onAi();
                else {
                  runAiAfterPick.current = true;
                  inputRef.current?.click();
                }
              }}
            >
              {aiRunning ? <Loader2 aria-hidden className="animate-spin" /> : <Sparkles aria-hidden />}
              {aiRunning ? "Đang nhận diện…" : "Chụp ảnh để điền nhanh"}
            </Button>
          ) : null}
          <label
            htmlFor={inputId}
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              "cursor-pointer peer-focus-visible:border-ring peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 peer-disabled:cursor-not-allowed peer-disabled:opacity-60",
            )}
          >
            <Camera aria-hidden />
            {previewUrl ? "Đổi ảnh" : "Chọn hoặc chụp ảnh"}
          </label>
          {previewUrl ? (
            <Button type="button" variant="ghost" size="lg" onClick={onRemove} disabled={busy}>
              <Trash2 aria-hidden />
              Gỡ ảnh
            </Button>
          ) : null}
        </div>
        {aiRunning ? (
          <p role="status" className="text-sm text-info">
            AI đang đọc ảnh, thường mất vài giây. Bạn vẫn có thể nhập tay trong lúc chờ.
          </p>
        ) : (
          <p id={`${inputId}-hint`} className="text-sm text-ink-subtle">
            Không bắt buộc. Ảnh được xóa thông tin vị trí (EXIF/GPS) ngay trên máy trước khi tải lên.
            {aiAvailable ? " AI chỉ gợi ý — bạn kiểm tra lại trước khi đăng." : null}
          </p>
        )}
        {error ? <FieldErrorText id={inputId}>{error}</FieldErrorText> : null}
      </div>
    </div>
  );
}
