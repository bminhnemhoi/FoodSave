"use client";

import { Hourglass, Loader2, RefreshCw, ScanLine, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import { Countdown } from "@/components/labels/live-freshness";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { FullscreenDialog } from "./fullscreen-dialog";
import { QrCode } from "./qr-code";
import { useWakeLock } from "./use-wake-lock";

/** "482913" ⇒ "482 913"; đọc từng chữ số cho trình đọc màn hình. */
function groupCode(code: string) {
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

const clock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Ho_Chi_Minh",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

type QrHandoverProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chuỗi mã hóa vào QR (token thô). Chỉ giữ trong bộ nhớ component cha. */
  payload: string;
  code: string;
  /** ISO thời điểm hết hạn (TTL 15 phút). */
  expiresAt: string;
  /** `Date.now()` lúc nhận mã (ms) — mốc đầu cho đồng hồ đếm ngược. */
  issuedAtMs: number;
  title: string;
  subtitle?: React.ReactNode;
  onReissue: () => void;
  reissuing?: boolean;
  /** Lỗi khi tạo mã mới (đã là câu tiếng Việt). */
  error?: string | null;
};

/**
 * Màn mã bàn giao toàn màn hình (DESIGN-SYSTEM §11.2 `QrHandover`, PRD US-VOL-07, US-CHA-20): nền trắng thuần,
 * QR lớn có vùng yên tĩnh, mã 6 số cỡ lớn nhóm 3-3, đếm ngược tới hạn + giờ hết hạn tĩnh, giữ màn hình sáng
 * (Wake Lock), "Tạo mã mới" (mã cũ mất hiệu lực). Hết hạn ⇒ che QR, nút tạo mã mới thành nút chính.
 */
export function QrHandover({
  open,
  onOpenChange,
  payload,
  code,
  expiresAt,
  issuedAtMs,
  title,
  subtitle,
  onReissue,
  reissuing = false,
  error,
}: QrHandoverProps) {
  const wakeLock = useWakeLock(open);
  const [expiredFor, setExpiredFor] = useState<string | null>(null);
  const expired = expiredFor === expiresAt;

  useEffect(() => {
    const delay = new Date(expiresAt).getTime() - Date.now();
    const t = setTimeout(() => setExpiredFor(expiresAt), Math.max(0, delay));
    return () => clearTimeout(t);
  }, [expiresAt]);

  return (
    <FullscreenDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={subtitle}
      closeLabel="Đóng mã bàn giao"
      footer={
        <div className="mx-auto flex w-full max-w-md flex-col gap-2">
          {error ? (
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </p>
          ) : null}
          <Button
            type="button"
            size="lg"
            variant={expired ? "default" : "outline"}
            className="h-12 w-full text-base"
            onClick={onReissue}
            disabled={reissuing}
            aria-busy={reissuing}
          >
            {reissuing ? <Loader2 aria-hidden className="animate-spin" /> : <RefreshCw aria-hidden />}
            Tạo mã mới
          </Button>
          <p className="text-center text-xs text-ink-subtle">
            Tạo mã mới thì mã đang hiện mất hiệu lực ngay.
          </p>
        </div>
      }
    >
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-5 px-4 py-5 sm:py-8">
        <div className="relative w-full max-w-[min(100%,52dvh,26rem)] rounded-xl border bg-primary-foreground p-2 shadow-2">
          <QrCode
            value={payload}
            label="Mã QR bàn giao — đưa cho nhân viên cửa hàng quét"
            className={cn(expired && "opacity-10")}
          />
          {expired ? (
            <div className="absolute inset-0 grid place-items-center p-6 text-center">
              <p className="flex flex-col items-center gap-2 text-lg font-semibold text-ink">
                <Hourglass aria-hidden className="size-8 text-warning" />
                Mã đã hết hạn
                <span className="text-sm font-normal text-ink-muted">Bấm “Tạo mã mới” để hiện mã khác.</span>
              </p>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col items-center gap-1 text-center">
          <p className="text-sm font-medium text-ink-muted">Hoặc đọc mã 6 số cho nhân viên cửa hàng</p>
          <p
            className={cn(
              "text-[clamp(2.75rem,12vw,3.75rem)] leading-none font-bold tracking-[0.08em] text-ink tabular-nums",
              expired && "text-ink-disabled line-through",
            )}
            aria-label={`Mã 6 số: ${code.split("").join(" ")}`}
            data-handover-code
          >
            {groupCode(code)}
          </p>
        </div>

        <div className="flex flex-col items-center gap-1 text-center" aria-live="off">
          {expired ? (
            <p className="font-medium text-warning">Mã đã hết hạn lúc {clock.format(new Date(expiresAt))}.</p>
          ) : (
            <>
              <p className="flex items-center gap-2 text-base font-semibold text-ink">
                <Hourglass aria-hidden className="size-4 text-ink-muted" />
                <span>
                  Mã dùng một lần,{" "}
                  <Countdown deadline={expiresAt} serverNow={issuedAtMs} className="text-ink" />
                </span>
              </p>
              <p className="text-sm text-ink-muted">Hiệu lực đến {clock.format(new Date(expiresAt))}.</p>
            </>
          )}
        </div>

        {!expired ? (
          <p role="status" className="flex items-center gap-2 text-sm text-ink-muted">
            <ScanLine aria-hidden className="size-4 shrink-0 text-primary" />
            Đang chờ cửa hàng quét mã…
          </p>
        ) : null}

        <p className="flex items-start gap-2 text-xs text-ink-subtle">
          <Sun aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Tăng độ sáng màn hình nếu cửa hàng quét chưa được.
            {wakeLock === "on" ? " Màn hình sẽ luôn sáng khi đang hiện mã." : null}
          </span>
        </p>
      </div>
    </FullscreenDialog>
  );
}
