"use client";

import {
  Bike,
  CircleCheckBig,
  Clock3,
  Hourglass,
  Keyboard,
  Loader2,
  Lock,
  PackageCheck,
  QrCode,
  RefreshCw,
  RotateCcw,
  Route,
  ScanLine,
  ShieldAlert,
  Store,
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
import { CallVolunteerButton } from "@/features/contacts/components/call-volunteer-button";
import { cn } from "@/lib/utils";

import { formatClock } from "../format";
import { totalKg } from "../lines";
import { parseScannedPayload } from "../payload";
import type { HandoverPreview } from "../queries";
import { peekDropoff } from "../receive-actions";
import { RECEIVE_MESSAGES } from "../receive-errors";
import type { PendingDropoff, RecentDropoff } from "../receive-queries";

import { ReceiveReview, type ReceiveMode } from "./receive-review";

const REFRESH_MS = 15_000;

type Review = {
  preview: HandoverPreview;
  mode: ReceiveMode;
  pickupId: string;
  openedAtMs: number;
  key: number;
};
type CodeState = "none" | "active" | "expired" | "locked";

function codeState(p: PendingDropoff): CodeState {
  if (!p.handover) return "none";
  if (p.handover.locked) return "locked";
  if (p.handover.expired) return "expired";
  return "active";
}

/**
 * Nhận hàng tại tổ chức (PRD US-CHA-21; mirror màn bàn giao của cửa hàng — DESIGN-SYSTEM §17):
 * - "Quét mã QR" ⇒ camera (ZXing tải động) ⇒ `peek_handover_token` (mã giao về) ⇒ đối soát ⇒ `record_dropoff`;
 * - "Nhập mã 6 số" trên một lượt đang chờ (cần id lượt giao về) ⇒ `record_dropoff` với mã.
 * Token quét được chỉ nằm trong state. Danh sách tự làm mới mỗi 15 giây khi không có lớp phủ nào mở.
 */
export function ReceiveDropoff({
  pending,
  recent,
  serverNow,
  focusTripId,
}: {
  pending: PendingDropoff[];
  recent: RecentDropoff[];
  serverNow: number;
  /** Mở từ trang chuyến (?trip=…): đưa lượt đó lên đầu và nhấn mạnh. */
  focusTripId: string | null;
}) {
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

  const ordered = [...pending].sort((a, b) => {
    const fa = a.pickupId === focusTripId ? 0 : 1;
    const fb = b.pickupId === focusTripId ? 0 : 1;
    if (fa !== fb) return fa - fb;
    return Number(b.ready) - Number(a.ready);
  });
  const ready = ordered.filter((p) => p.ready);
  const onTheWay = ordered.filter((p) => !p.ready);

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
      const res = await peekDropoff({ token });
      if (!res.ok) {
        setScanError(res.error.message);
        return;
      }
      setScannerOpen(false);
      const { pickupId, ...preview } = res.data;
      setReview({ preview, mode: { kind: "qr", token }, pickupId, openedAtMs: Date.now(), key: Date.now() });
    });
  }, []);

  const openCode = useCallback((p: PendingDropoff) => {
    if (!p.handover) return;
    const at = Date.now();
    setHint(null);
    setReview({ preview: p.handover, mode: { kind: "code" }, pickupId: p.pickupId, openedAtMs: at, key: at });
  }, []);

  const useCodeInstead = () => {
    setScannerOpen(false);
    const active = ready.filter((p) => codeState(p) === "active");
    if (active.length === 1) {
      openCode(active[0]!);
      return;
    }
    setHint(
      active.length === 0
        ? "Chưa có lượt nào đang mở mã giao về. Nhờ tình nguyện viên bấm “Hiện mã giao về” trên điện thoại, rồi bấm “Làm mới”."
        : "Chọn đúng lượt giao về (theo tên tình nguyện viên) rồi bấm “Nhập mã 6 số”.",
    );
    requestAnimationFrame(() => listHeadingRef.current?.focus());
  };

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4 rounded-xl border bg-surface p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-start gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-role-accent-soft text-role-accent">
            <ScanLine aria-hidden className="size-7" />
          </span>
          <div>
            <h2 className="text-lg font-semibold">Tình nguyện viên đã về tới?</h2>
            <p className="text-sm text-ink-muted">
              Quét QR “Giao về tổ chức” trên điện thoại của họ. Không quét được thì nhập mã 6 số.
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

      <section aria-labelledby="ready-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2
            id="ready-heading"
            ref={listHeadingRef}
            tabIndex={-1}
            className="text-lg font-semibold outline-none"
          >
            Chờ nhận hàng{ready.length ? ` (${ready.length})` : ""}
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
        {ready.length === 0 ? (
          <EmptyState
            variant="section"
            icon={PackageCheck}
            title="Chưa có chuyến nào đang chờ nhận"
            description="Khi tình nguyện viên lấy xong hàng ở mọi cửa hàng, lượt giao về hiện ở đây. Họ tới nơi thì bạn quét QR trên điện thoại của họ."
            action={
              <Button asChild variant="outline">
                <Link href="/charity/pickups">
                  <Route aria-hidden />
                  Xem chuyến lấy hàng
                </Link>
              </Button>
            }
          />
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {ready.map((p) => (
              <DropoffCard
                key={p.pickupId}
                p={p}
                serverNow={serverNow}
                focused={p.pickupId === focusTripId}
                onEnterCode={() => openCode(p)}
              />
            ))}
          </ul>
        )}
      </section>

      {onTheWay.length > 0 ? (
        <section aria-labelledby="ontheway-heading" className="flex flex-col gap-3">
          <h2 id="ontheway-heading" className="text-lg font-semibold">
            Đang lấy hàng ({onTheWay.length})
          </h2>
          <ul className="flex flex-col divide-y rounded-lg border bg-surface">
            {onTheWay.map((p) => (
              <li key={p.pickupId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex items-center gap-1.5 font-medium text-ink">
                    <Bike aria-hidden className="size-4 text-ink-muted" />
                    {p.volunteerName ?? "Tình nguyện viên"}
                  </span>
                  <span className="text-sm text-ink-muted tabular-nums">
                    Đã lấy {p.pickupsDone}/{p.pickupsTotal} điểm · {p.storeNames.join(", ") || "—"}
                  </span>
                </span>
                <Button asChild variant="outline" size="sm" className="min-h-11">
                  <Link href={`/charity/pickups/${p.pickupId}`}>Theo dõi chuyến</Link>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="recent-heading" className="flex flex-col gap-3">
        <h2 id="recent-heading" className="text-lg font-semibold">
          Đã nhận trong 24 giờ qua
        </h2>
        {recent.length === 0 ? (
          <p className="text-sm text-ink-muted">Chưa nhận chuyến nào trong 24 giờ qua.</p>
        ) : (
          <ul className="divide-y rounded-lg border bg-surface">
            {recent.map((r) => (
              <li key={r.pickupId} className="flex flex-col gap-1 px-4 py-3">
                <p className="flex flex-wrap items-center gap-x-2 font-medium text-ink">
                  <CircleCheckBig aria-hidden className="size-4 text-success" />
                  {r.completedAt ? formatClock(r.completedAt) : "—"} · {r.volunteerName ?? "Tình nguyện viên"}
                  <span className="text-sm font-normal text-ink-muted tabular-nums">
                    · ≈ {displayKg(r.kg).text}
                  </span>
                </p>
                <p className="text-sm text-ink-muted">
                  {r.lines.map((l) => `${formatQty(l.qty, l.unit)} ${l.title}`).join(" · ") || "—"}
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
        title="Quét mã giao về"
        description="Hướng camera vào mã QR trên điện thoại tình nguyện viên."
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
            rejectMessage={RECEIVE_MESSAGES.scanNotHandover}
          />
        ) : null}
      </FullscreenDialog>

      {review ? (
        <ReceiveReview
          key={review.key}
          open
          onOpenChange={(o) => {
            if (!o) setReview(null);
          }}
          preview={review.preview}
          mode={review.mode}
          pickupId={review.pickupId}
          openedAtMs={review.openedAtMs}
          onScanNext={() => {
            setReview(null);
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
  none: "Tình nguyện viên chưa bấm “Hiện mã giao về”.",
  active: "",
  expired: "Nhờ tình nguyện viên bấm “Tạo mã mới”, rồi bấm “Làm mới”.",
  locked: "Nhập sai 5 lần. Nhờ tình nguyện viên bấm “Tạo mã mới”, rồi bấm “Làm mới”.",
};

function DropoffCard({
  p,
  serverNow,
  focused,
  onEnterCode,
}: {
  p: PendingDropoff;
  serverNow: number;
  focused: boolean;
  onEnterCode: () => void;
}) {
  const state = codeState(p);
  const badge = STATE_BADGE[state];
  const BadgeIcon = badge.icon;
  const kg = totalKg(
    p.lines,
    p.lines.map((l) => ({ allocationId: l.allocationId, qty: l.expectedQty })),
  );
  const headingId = `dropoff-${p.pickupId}`;
  return (
    <li
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-surface p-4",
        focused && "border-info ring-1 ring-info",
      )}
      aria-labelledby={headingId}
      data-pending-dropoff={p.pickupId}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id={headingId} className="flex items-center gap-2 font-semibold text-ink">
            <Bike aria-hidden className="size-4 shrink-0 text-ink-muted" />
            {p.volunteerName ?? "Tình nguyện viên"}
          </h3>
          <p className="flex items-center gap-1 text-sm text-ink-muted">
            <Store aria-hidden className="size-3.5 shrink-0" />
            Từ {p.storeNames.join(", ") || "—"} · về {p.siteName}
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
          {state === "active" && p.handover?.expiresAt ? (
            <>
              {" · "}
              <Countdown deadline={p.handover.expiresAt} serverNow={serverNow} />
            </>
          ) : null}
        </span>
      </div>
      <ul className="flex flex-col gap-1 text-sm">
        {p.lines.map((l) => (
          <li key={l.allocationId} className="flex justify-between gap-3">
            <span className="text-ink">{l.title}</span>
            <span className="font-semibold text-ink tabular-nums">
              Đã lấy {formatQty(l.expectedQty, l.unit)}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-sm text-ink-muted tabular-nums">Tổng ≈ {displayKg(kg).text}</p>
      {STATE_HELP[state] ? <p className="text-sm text-ink-muted">{STATE_HELP[state]}</p> : null}
      <div className="flex flex-wrap gap-2">
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
        <Button asChild variant="ghost" className="h-11">
          <Link href={`/charity/pickups/${p.pickupId}`} aria-describedby={headingId}>
            <Route aria-hidden />
            Xem chuyến
          </Link>
        </Button>
        {p.volunteerName ? <CallVolunteerButton pickupId={p.pickupId} /> : null}
      </div>
    </li>
  );
}
