"use client";

import {
  CircleCheckBig,
  Clock3,
  Home,
  Hourglass,
  Keyboard,
  Loader2,
  Lock,
  Package,
  QrCode,
  RefreshCw,
  RotateCcw,
  ScanLine,
  ShieldAlert,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { EmptyState } from "@/components/layout/empty-state";
import { Countdown } from "@/components/labels/live-freshness";
import { FullscreenDialog } from "@/components/qr/fullscreen-dialog";
import { QrScannerLazy } from "@/components/qr/qr-scanner-lazy";
import { Button } from "@/components/ui/button";
import { displayKg } from "@/core/impact";
import { formatQty } from "@/features/catalog/labels";
import { cn } from "@/lib/utils";

import { peekHandover } from "../actions";
import { HANDOVER_MESSAGES } from "../errors";
import { formatClock } from "../format";
import { HANDOVER_METHOD_PHRASE, SHORTFALL_REASON_LABEL } from "../labels";
import { totalKg } from "../lines";
import { parseScannedPayload } from "../payload";
import type { HandoverPreview, PendingStop, RecentHandover } from "../queries";

import { HandoverReview, type ReviewMode } from "./handover-review";

const REFRESH_MS = 15_000;

type StoreHandoverProps = {
  pending: PendingStop[];
  recent: RecentHandover[];
  siteCount: number;
  serverNow: number;
};

type Review = { preview: HandoverPreview; mode: ReviewMode; openedAtMs: number; key: number };

type CodeState = "none" | "active" | "expired" | "locked";

function codeState(p: PendingStop): CodeState {
  if (!p.handover) return "none";
  if (p.handover.locked) return "locked";
  if (p.handover.expired) return "expired";
  return "active";
}

/**
 * Bàn giao tại cửa hàng (P2-12; PRD US-STO-17/18; DESIGN-SYSTEM §17 màn quét toàn màn hình):
 * - "Quét mã QR" ⇒ camera (ZXing tải động) ⇒ `peek_handover_token` ⇒ đối soát ⇒ `consume_handover_token`;
 * - "Nhập mã 6 số" trên một lượt đang chờ (RPC mã 6 số cần id lượt bàn giao) ⇒ `consume_handover_code`.
 * Token quét được chỉ nằm trong state (không URL/storage/log). Danh sách tự làm mới mỗi 15 giây.
 */
export function StoreHandover({ pending, recent, siteCount, serverNow }: StoreHandoverProps) {
  const router = useRouter();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanKey, setScanKey] = useState(0);
  const [scanError, setScanError] = useState<string | null>(null);
  const [peeking, startPeek] = useTransition();
  const [review, setReview] = useState<Review | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const listHeadingRef = useRef<HTMLHeadingElement>(null);
  const busy = scannerOpen || review !== null;

  // Tự làm mới danh sách (người nhận vừa mở mã) khi không có màn quét/đối soát đang mở
  useEffect(() => {
    if (busy) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [busy, router]);

  const openScanner = () => {
    setScanError(null);
    setHint(null);
    setScanKey((k) => k + 1);
    setScannerOpen(true);
  };

  const onScanned = useCallback((token: string) => {
    setScanError(null);
    startPeek(async () => {
      const res = await peekHandover({ token });
      if (!res.ok) {
        setScanError(res.error.message);
        return;
      }
      setScannerOpen(false);
      setReview({ preview: res.data, mode: { kind: "qr", token }, openedAtMs: Date.now(), key: Date.now() });
    });
  }, []);

  const openCode = (p: PendingStop) => {
    if (!p.handover) return;
    setHint(null);
    setReview({ preview: p.handover, mode: { kind: "code" }, openedAtMs: Date.now(), key: Date.now() });
  };

  const useCodeInstead = () => {
    setScannerOpen(false);
    const active = pending.filter((p) => codeState(p) === "active");
    if (active.length === 1) {
      openCode(active[0]!);
      return;
    }
    setHint(
      active.length === 0
        ? "Chưa có lượt nào đang mở mã. Nhờ người nhận bấm “Hiện mã bàn giao” trên điện thoại, rồi bấm “Làm mới”."
        : "Chọn đúng lượt bàn giao (theo tên tổ chức) rồi bấm “Nhập mã 6 số”.",
    );
    requestAnimationFrame(() => listHeadingRef.current?.focus());
  };

  if (siteCount === 0) {
    return (
      <EmptyState
        icon={Package}
        title="Cửa hàng chưa có chi nhánh"
        description="Thêm chi nhánh (điểm lấy hàng) trong Cài đặt để bắt đầu nhận và bàn giao lô tặng."
        action={
          <Button asChild>
            <Link href="/store/settings">Mở Cài đặt</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4 rounded-xl border bg-surface p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-start gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-role-accent-soft text-role-accent">
            <ScanLine aria-hidden className="size-7" />
          </span>
          <div>
            <h2 className="text-lg font-semibold">Người nhận đã tới?</h2>
            <p className="text-sm text-ink-muted">
              Quét QR trên điện thoại của họ bằng camera máy này. Không quét được thì nhập mã 6 số.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" size="lg" className="h-14 text-lg sm:px-8" onClick={openScanner}>
            <QrCode aria-hidden className="size-5" />
            Quét mã QR
          </Button>
          <Button
            type="button"
            size="lg"
            variant="outline"
            className="h-14 text-base"
            onClick={useCodeInstead}
          >
            <Keyboard aria-hidden />
            Nhập mã 6 số
          </Button>
        </div>
      </section>

      <section aria-labelledby="pending-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2
            id="pending-heading"
            ref={listHeadingRef}
            tabIndex={-1}
            className="text-lg font-semibold outline-none"
          >
            Đang chờ bàn giao{pending.length ? ` (${pending.length})` : ""}
          </h2>
          <Button
            type="button"
            variant="ghost"
            className="h-11"
            onClick={() => startRefresh(() => router.refresh())}
            disabled={refreshing}
            aria-busy={refreshing}
          >
            <RefreshCw aria-hidden className={cn(refreshing && "animate-spin")} />
            Làm mới
          </Button>
        </div>
        {hint ? (
          <p
            role="status"
            className="rounded-md border border-info/30 bg-info-soft px-3 py-2 text-sm text-info"
          >
            {hint}
          </p>
        ) : null}
        {pending.length === 0 ? (
          <EmptyState
            variant="section"
            icon={QrCode}
            title="Chưa có lượt lấy hàng nào đang chờ"
            description="Khi tổ chức nhận lô và lên chuyến, lượt bàn giao hiện ở đây. Người nhận đến nơi thì bạn quét QR trên điện thoại của họ."
            action={
              <Button asChild variant="outline">
                <Link href="/store/inventory">Xem lô tặng</Link>
              </Button>
            }
          />
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {pending.map((p) => (
              <PendingCard key={p.stopId} stop={p} serverNow={serverNow} onEnterCode={() => openCode(p)} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="recent-heading" className="flex flex-col gap-3">
        <h2 id="recent-heading" className="text-lg font-semibold">
          Đã bàn giao trong 24 giờ qua
        </h2>
        {recent.length === 0 ? (
          <p className="text-sm text-ink-muted">Chưa có lượt nào trong 24 giờ qua.</p>
        ) : (
          <ul className="divide-y rounded-lg border bg-surface">
            {recent.map((r) => (
              <li key={r.handoverId} className="flex flex-col gap-1 px-4 py-3" data-recent={r.handoverId}>
                <p className="flex flex-wrap items-center gap-x-2 font-medium text-ink">
                  <CircleCheckBig aria-hidden className="size-4 text-success" />
                  {formatClock(r.consumedAt)} · {r.charityName}
                  <span className="text-sm font-normal text-ink-muted">
                    {r.siteName ? `· ${r.siteName} ` : ""}
                    {r.method ? `· ${HANDOVER_METHOD_PHRASE[r.method]}` : ""}
                  </span>
                </p>
                <p className="text-sm text-ink-muted">
                  {r.lines
                    .map(
                      (l) =>
                        `${formatQty(l.qty, l.unit)} ${l.title}${l.reason ? ` (thiếu ${formatQty(l.expectedQty - l.qty, l.unit)} — ${SHORTFALL_REASON_LABEL[l.reason].toLowerCase()})` : ""}`,
                    )
                    .join(" · ")}{" "}
                  · ≈{" "}
                  {
                    displayKg(
                      r.lines.reduce((s, l) => s + Math.round(l.qty * l.unitWeightKg * 1000) / 1000, 0),
                    ).text
                  }
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <FullscreenDialog
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        tone="dark"
        title="Quét mã bàn giao"
        description="Hướng camera vào mã QR trên điện thoại người nhận."
        closeLabel="Đóng máy quét"
      >
        {scanError ? (
          <div
            role="alert"
            className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-10 text-center"
          >
            <ShieldAlert aria-hidden className="size-10 text-primary-foreground" />
            <p className="text-lg font-semibold text-primary-foreground">{scanError}</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" size="lg" variant="secondary" className="h-12" onClick={openScanner}>
                <RotateCcw aria-hidden />
                Quét lại
              </Button>
              <Button type="button" size="lg" variant="secondary" className="h-12" onClick={useCodeInstead}>
                <Keyboard aria-hidden />
                Nhập mã 6 số
              </Button>
            </div>
          </div>
        ) : peeking ? (
          <p
            role="status"
            className="flex items-center justify-center gap-2 px-4 py-16 text-primary-foreground"
          >
            <Loader2 aria-hidden className="size-6 animate-spin" />
            Đang kiểm tra mã…
          </p>
        ) : scannerOpen ? (
          <QrScannerLazy
            key={scanKey}
            accept={parseScannedPayload}
            onResult={onScanned}
            onUseCode={useCodeInstead}
            rejectMessage={HANDOVER_MESSAGES.scanNotHandover}
          />
        ) : null}
      </FullscreenDialog>

      {review ? (
        <HandoverReview
          key={review.key}
          open
          onOpenChange={(o) => {
            if (!o) setReview(null);
          }}
          preview={review.preview}
          mode={review.mode}
          openedAtMs={review.openedAtMs}
          onScanNext={() => {
            setReview(null);
            // Mở máy quét sau khi lớp đối soát đã gỡ hẳn (focus trả về trang trước, không tranh với lớp mới)
            requestAnimationFrame(() => openScanner());
          }}
        />
      ) : null}
    </div>
  );
}

const STATE_BADGE: Record<CodeState, { text: string; className: string; icon: typeof Lock }> = {
  none: {
    text: "Chưa mở mã",
    className: "border-border-strong/40 bg-bg-sunken text-ink-muted",
    icon: Clock3,
  },
  active: { text: "Mã đang mở", className: "border-info/30 bg-info-soft text-info", icon: QrCode },
  expired: {
    text: "Mã đã hết hạn",
    className: "border-warning/30 bg-warning-soft text-warning",
    icon: Hourglass,
  },
  locked: { text: "Đã khóa", className: "border-danger/30 bg-danger-soft text-danger", icon: Lock },
};

const STATE_HELP: Record<CodeState, string> = {
  none: "Người nhận chưa bấm “Hiện mã bàn giao”.",
  active: "",
  expired: "Nhờ người nhận bấm “Tạo mã mới”, rồi bấm “Làm mới”.",
  locked: "Nhập sai 5 lần. Nhờ người nhận bấm “Tạo mã mới”, rồi bấm “Làm mới”.",
};

function PendingCard({
  stop,
  serverNow,
  onEnterCode,
}: {
  stop: PendingStop;
  serverNow: number;
  onEnterCode: () => void;
}) {
  const state = codeState(stop);
  const badge = STATE_BADGE[state];
  const BadgeIcon = badge.icon;
  const kg = totalKg(
    stop.lines,
    stop.lines.map((l) => ({ allocationId: l.allocationId, qty: l.expectedQty })),
  );
  const headingId = `pending-${stop.stopId}`;
  return (
    <li
      className="flex flex-col gap-3 rounded-lg border bg-surface p-4"
      aria-labelledby={headingId}
      data-pending-stop={stop.stopId}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id={headingId} className="flex items-center gap-2 font-semibold text-ink">
            <Home aria-hidden className="size-4 shrink-0 text-ink-muted" />
            {stop.charityName}
          </h3>
          {stop.siteName ? <p className="text-sm text-ink-muted">Điểm lấy: {stop.siteName}</p> : null}
          {/* Chỉ giờ dự kiến tới, không bao giờ vị trí người mang hàng (US-STO-15 AC2) */}
          <p className="flex items-center gap-1.5 text-sm text-ink-muted" data-eta>
            <Clock3 aria-hidden className="size-4 shrink-0" />
            {stop.eta ? (
              <span>
                Dự kiến tới{" "}
                <time dateTime={stop.eta} className="font-medium text-ink tabular-nums">
                  {formatClock(stop.eta)}
                </time>
              </span>
            ) : (
              "Chưa có giờ dự kiến"
            )}
          </p>
        </div>
        <span
          className={cn(
            "inline-flex w-fit items-center gap-1 rounded-full border px-2.5 py-1 text-sm font-medium whitespace-nowrap",
            badge.className,
          )}
        >
          <BadgeIcon aria-hidden className="size-4" />
          {badge.text}
          {state === "active" && stop.handover?.expiresAt ? (
            <>
              {" · "}
              <Countdown deadline={stop.handover.expiresAt} serverNow={serverNow} />
            </>
          ) : null}
        </span>
      </div>
      <ul className="flex flex-col gap-1 text-sm">
        {stop.lines.map((l) => (
          <li key={l.allocationId} className="flex justify-between gap-3">
            <span className="text-ink">{l.title}</span>
            <span className="font-semibold text-ink tabular-nums">{formatQty(l.expectedQty, l.unit)}</span>
          </li>
        ))}
      </ul>
      <p className="text-sm text-ink-muted tabular-nums">Tổng ≈ {displayKg(kg).text}</p>
      {STATE_HELP[state] ? <p className="text-sm text-ink-muted">{STATE_HELP[state]}</p> : null}
      <Button
        type="button"
        variant={state === "active" ? "default" : "outline"}
        className="h-11 w-full sm:w-fit"
        onClick={onEnterCode}
        disabled={state !== "active"}
        aria-describedby={headingId}
      >
        <Keyboard aria-hidden />
        Nhập mã 6 số
      </Button>
    </li>
  );
}
