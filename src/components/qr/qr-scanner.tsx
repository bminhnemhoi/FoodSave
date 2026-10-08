"use client";

import {
  CameraOff,
  Flashlight,
  FlashlightOff,
  Keyboard,
  Loader2,
  Lock,
  RotateCcw,
  ScanLine,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Máy quét QR bằng camera sau (`@zxing/browser`, getUserMedia — DESIGN-SYSTEM §11.2 `QrScanner`, PRD
 * US-STO-17). Bundle ZXing chỉ tải khi mở máy quét (component này được import động).
 *
 * Trạng thái camera rõ ràng: đang mở / đang quét / bị từ chối quyền / không có camera / camera bận /
 * trang không an toàn (http) / trình duyệt không hỗ trợ — trường hợp nào cũng có lối "Nhập mã 6 số".
 * Nội dung giải mã KHÔNG được ghi log; chỉ chuyển cho `accept` để lọc mã của FoodSave.
 */

type ScannerState =
  "starting" | "scanning" | "denied" | "no-camera" | "busy" | "insecure" | "unsupported" | "error";

const STATE_TEXT: Record<Exclude<ScannerState, "starting" | "scanning">, { title: string; body: string }> = {
  denied: {
    title: "Chưa được phép dùng camera",
    body: "Bấm biểu tượng ổ khóa cạnh thanh địa chỉ → Quyền camera → Cho phép, rồi bấm “Thử lại”. Hoặc nhập mã 6 số.",
  },
  "no-camera": {
    title: "Không tìm thấy camera",
    body: "Thiết bị này không có camera hoặc camera đang bị tắt. Hãy nhập mã 6 số trên điện thoại người nhận.",
  },
  busy: {
    title: "Camera đang được ứng dụng khác dùng",
    body: "Đóng ứng dụng gọi video/chụp ảnh đang mở rồi bấm “Thử lại”, hoặc nhập mã 6 số.",
  },
  insecure: {
    title: "Trang cần kết nối an toàn (https) để mở camera",
    body: "Hãy mở FoodSave bằng địa chỉ https. Trong lúc đó, nhập mã 6 số vẫn dùng được.",
  },
  unsupported: {
    title: "Trình duyệt chưa hỗ trợ quét bằng camera",
    body: "Dùng Chrome, Edge hoặc Safari bản mới, hoặc nhập mã 6 số.",
  },
  error: {
    title: "Không mở được camera",
    body: "Đã có lỗi khi mở camera. Bấm “Thử lại”, hoặc nhập mã 6 số.",
  },
};

function classify(err: unknown): ScannerState {
  const name = err instanceof DOMException || err instanceof Error ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError")
    return "denied";
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError")
    return "no-camera";
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") return "busy";
  return "error";
}

type QrScannerProps = {
  /** Lọc nội dung quét: trả giá trị hợp lệ (vd. token) hoặc null nếu không phải mã cần tìm. */
  accept: (text: string) => string | null;
  /** Gọi một lần với giá trị đã lọc; máy quét dừng ngay sau đó. */
  onResult: (value: string) => void;
  /** Chuyển sang nhập mã 6 số. */
  onUseCode: () => void;
  /** Thông báo khi quét trúng QR khác (không phải mã bàn giao). */
  rejectMessage: string;
};

export default function QrScanner({ accept, onResult, onUseCode, rejectMessage }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const lastRejectRef = useRef(0);
  const acceptRef = useRef(accept);
  const onResultRef = useRef(onResult);
  const [state, setState] = useState<ScannerState>("starting");
  const [attempt, setAttempt] = useState(0);
  const [torch, setTorch] = useState<{ available: boolean; on: boolean }>({ available: false, on: false });
  const [rejected, setRejected] = useState(false);

  useEffect(() => {
    acceptRef.current = accept;
    onResultRef.current = onResult;
  }, [accept, onResult]);

  useEffect(() => {
    let cancelled = false;
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stream: MediaStream | null = null;

    const stop = () => {
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
      trackRef.current = null;
    };

    const start = async () => {
      // Đợi một vi-tác vụ để mọi setState nằm ngoài thân effect
      await Promise.resolve();
      if (cancelled) return;
      if (!window.isSecureContext) return setState("insecure");
      if (!navigator.mediaDevices?.getUserMedia) return setState("unsupported");
      setState("starting");
      try {
        const [{ BrowserQRCodeReader }, media] = await Promise.all([
          import("@zxing/browser"),
          navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          }),
        ]);
        stream = media;
        const video = videoRef.current;
        if (cancelled || !video) return stop();
        video.srcObject = media;
        await video.play().catch(() => undefined);
        if (cancelled) return stop();

        const track = media.getVideoTracks()[0] ?? null;
        trackRef.current = track;
        const caps = (track?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
        setTorch({ available: caps.torch === true, on: false });
        setState("scanning");

        // Vòng quét tự viết: mỗi lượt vẽ khung hình hiện tại theo ĐÚNG kích thước video lúc đó (camera có thể
        // đổi độ phân giải sau khi mở) rồi giải mã; mọi lỗi giải mã chỉ là "chưa thấy mã", vòng quét không bao
        // giờ tự dừng âm thầm.
        const reader = new BrowserQRCodeReader();
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        // ZXing đôi khi không định vị được mã ở một độ phân giải nhất định ⇒ xoay vòng 3 tỷ lệ (100%, 50%, 75%),
        // mỗi lượt chỉ giải mã một lần để máy yếu vẫn mượt.
        const SCALES = [1, 0.5, 0.75];
        let round = 0;
        const tick = () => {
          if (cancelled || done) return;
          const w = video.videoWidth;
          const h = video.videoHeight;
          if (ctx && w > 0 && h > 0 && video.readyState >= 2) {
            // Giới hạn cạnh dài 1280 px để giải mã nhanh trên máy yếu
            const scale = Math.min(1, 1280 / Math.max(w, h)) * SCALES[round++ % SCALES.length]!;
            const cw = Math.round(w * scale);
            const ch = Math.round(h * scale);
            if (canvas.width !== cw || canvas.height !== ch) {
              canvas.width = cw;
              canvas.height = ch;
            }
            try {
              ctx.drawImage(video, 0, 0, cw, ch);
              const text = reader.decodeFromCanvas(canvas).getText();
              const value = acceptRef.current(text);
              if (value !== null) {
                done = true;
                stop();
                onResultRef.current(value);
                return;
              }
              const now = Date.now();
              if (now - lastRejectRef.current > 2500) {
                lastRejectRef.current = now;
                setRejected(true);
              }
            } catch {
              // chưa thấy mã trong khung hình này
            }
          }
          timer = setTimeout(tick, 100);
        };
        tick();
      } catch (err) {
        stop();
        if (!cancelled) setState(classify(err));
      }
    };

    void start();
    return () => {
      cancelled = true;
      stop();
    };
  }, [attempt]);

  const toggleTorch = useCallback(async () => {
    const track = trackRef.current;
    if (!track) return;
    const next = !torch.on;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorch({ available: true, on: next });
    } catch {
      setTorch({ available: false, on: false });
    }
  }, [torch.on]);

  const failed = state !== "starting" && state !== "scanning";
  const canRetry = state === "denied" || state === "busy" || state === "error";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-4 sm:py-6">
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-primary-foreground/5 sm:aspect-video">
        <video
          ref={videoRef}
          muted
          playsInline
          aria-hidden
          className={cn("size-full object-cover", failed && "hidden")}
        />
        {/* Khung ngắm */}
        {state === "scanning" ? (
          <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="aspect-square w-[min(70%,18rem)] rounded-2xl border-4 border-primary-foreground/90 shadow-[0_0_0_9999px_color-mix(in_oklab,var(--ink)_45%,transparent)]" />
          </div>
        ) : null}
        {state === "starting" ? (
          <div className="absolute inset-0 grid place-items-center p-6 text-center">
            <p className="flex flex-col items-center gap-3 text-primary-foreground">
              <Loader2 aria-hidden className="size-8 animate-spin" />
              Đang mở camera… Nếu trình duyệt hỏi, hãy bấm “Cho phép”.
            </p>
          </div>
        ) : null}
        {failed ? (
          <div role="alert" className="absolute inset-0 grid place-items-center p-6 text-center">
            <div className="flex max-w-sm flex-col items-center gap-3">
              {state === "insecure" ? (
                <Lock aria-hidden className="size-10 text-primary-foreground" />
              ) : (
                <CameraOff aria-hidden className="size-10 text-primary-foreground" />
              )}
              <p className="text-lg font-semibold text-primary-foreground">
                {STATE_TEXT[state as keyof typeof STATE_TEXT].title}
              </p>
              <p className="text-sm text-primary-foreground/85">
                {STATE_TEXT[state as keyof typeof STATE_TEXT].body}
              </p>
              {canRetry ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="mt-1 h-11"
                  onClick={() => setAttempt((n) => n + 1)}
                >
                  <RotateCcw aria-hidden />
                  Thử lại
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <p role="status" className="min-h-6 text-center text-sm text-primary-foreground/90">
        {state === "scanning"
          ? rejected
            ? rejectMessage
            : "Đưa mã QR trên điện thoại người nhận vào giữa khung. Máy sẽ tự nhận."
          : null}
      </p>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Button
          type="button"
          size="lg"
          variant={failed ? "default" : "secondary"}
          className="h-12 text-base"
          onClick={onUseCode}
        >
          <Keyboard aria-hidden />
          Nhập mã 6 số
        </Button>
        {torch.available ? (
          <Button
            type="button"
            size="lg"
            variant="secondary"
            className="h-12 text-base"
            onClick={toggleTorch}
            aria-pressed={torch.on}
          >
            {torch.on ? <FlashlightOff aria-hidden /> : <Flashlight aria-hidden />}
            {torch.on ? "Tắt đèn" : "Bật đèn"}
          </Button>
        ) : null}
      </div>
      <p className="flex items-center justify-center gap-2 text-xs text-primary-foreground/80">
        <ScanLine aria-hidden className="size-3.5" />
        Camera chỉ dùng để đọc mã, không lưu hình ảnh.
      </p>
    </div>
  );
}
