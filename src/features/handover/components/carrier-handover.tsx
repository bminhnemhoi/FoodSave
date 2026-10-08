"use client";

import { ChevronDown, Info, Loader2, QrCode, Scale } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { QrHandover } from "@/components/qr/qr-handover";
import { Button } from "@/components/ui/button";
import { displayKg } from "@/core/impact";
import { formatQty } from "@/features/catalog/labels";
import { newUuid } from "@/lib/hash";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

import { issueHandoverToken, type IssuedToken } from "../actions";
import { formatClock } from "../format";
import { CARRIER_SHORTFALL_REASONS } from "../labels";
import {
  draftFromSpec,
  isAdjusted,
  totalKg,
  validateLines,
  type LineDraft,
  type LineError,
  type LineInput,
  type LineSpec,
} from "../lines";
import { qrPayloadForToken } from "../payload";

import { LineEditor } from "./line-editor";

const POLL_MS = 3000;

type CarrierKind = "pickup" | "dropoff";

type CarrierHandoverProps = {
  pickupId: string;
  stopId: string;
  /** Nơi đưa mã: cửa hàng (bước lấy hàng) hoặc tổ chức nhận (bước giao về). */
  storeName: string;
  siteName: string;
  lines: LineSpec[];
  /** Mã đã được mở trước đó (chưa dùng) — bí mật không còn trong bộ nhớ, chỉ biết id + hạn. */
  existing: { id: string; expiresAt: string | null } | null;
  /** `pickup` (mặc định): đưa cửa hàng quét. `dropoff`: tình nguyện viên đưa điều phối viên tổ chức quét. */
  kind?: CarrierKind;
  /**
   * `page` (mặc định): màn riêng có danh sách hàng. `embedded`: chỉ khối hiện mã (+ đề xuất mang ít hơn), nhúng
   * trong thẻ điểm dừng của màn khác (PWA tình nguyện viên).
   */
  variant?: "page" | "embedded";
  /** Chữ trên nút chính (mặc định theo `kind`). */
  triggerLabel?: string;
  /** Bên kia đã quét/nhập mã. Mặc định: làm mới trang (server render lại kết quả). */
  onConsumed?: () => void;
};

const COPY: Record<
  CarrierKind,
  {
    trigger: string;
    title: string;
    audience: "store" | "charity";
    handTo: string;
    consumed: string;
    help: (place: string) => string;
  }
> = {
  pickup: {
    trigger: "Hiện mã bàn giao",
    title: "Mã bàn giao",
    audience: "store",
    handTo: "đưa màn hình này cho nhân viên cửa hàng",
    consumed: "Cửa hàng đã xác nhận bàn giao — đang tải kết quả…",
    help: (place) =>
      `Mở mã khi đã tới ${place}. Mã gồm QR và 6 số, dùng một lần, hiệu lực 15 phút. Nhân viên cửa hàng quét (hoặc nhập mã) rồi đối soát từng dòng.`,
  },
  dropoff: {
    trigger: "Hiện mã giao hàng",
    title: "Mã giao hàng",
    audience: "charity",
    handTo: "đưa màn hình này cho điều phối viên tổ chức",
    consumed: "Tổ chức đã xác nhận nhận hàng — đang tải kết quả…",
    help: (place) =>
      `Mở mã khi đã về tới ${place}. Mã gồm QR và 6 số, dùng một lần, hiệu lực 15 phút. Điều phối viên quét (hoặc nhập mã) để ghi nhận đã nhận hàng.`,
  },
};

/**
 * Khối người mang hàng (PRD US-CHA-20, US-VOL-07, US-VOL-09; F-39): xem hàng cần nhận, (tùy chọn, chỉ bước lấy
 * hàng) đề xuất mang ít hơn, "Hiện mã" ⇒ QR + mã 6 số toàn màn hình. Không gắn với route nào: dùng cho tổ chức
 * tự đến lấy (`/charity/pickups/…/handover`) và cho PWA tình nguyện viên (điểm lấy + điểm giao về).
 *
 * Token/mã CHỈ nằm trong state của component này (không URL, không localStorage, không log). Phát hiện bên kia
 * đã quét bằng cách hỏi trạng thái mỗi 3 giây khi tab đang hiện (RLS cho phép người mang hàng đọc
 * `handovers.consumed_at`); xong ⇒ `onConsumed` (mặc định làm mới trang).
 */
export function CarrierHandover({
  pickupId,
  stopId,
  storeName,
  siteName,
  lines,
  existing,
  kind = "pickup",
  variant = "page",
  triggerLabel,
  onConsumed,
}: CarrierHandoverProps) {
  const router = useRouter();
  const copy = COPY[kind];
  const canAdjust = kind === "pickup";
  const embedded = variant === "embedded";
  const [drafts, setDrafts] = useState<LineDraft[]>(() => lines.map((l) => draftFromSpec(l)));
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [lineErrors, setLineErrors] = useState<Record<string, LineError>>({});
  const [serverLineErrors, setServerLineErrors] = useState<Record<string, string>>({});
  const [issued, setIssued] = useState<(IssuedToken & { issuedAtMs: number }) | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consumed, setConsumed] = useState(false);
  const [pending, startTransition] = useTransition();

  const handoverId = issued?.handoverId ?? existing?.id ?? null;

  // Bên kia đã quét/nhập mã? Hỏi nhẹ mỗi 3 giây khi tab đang hiển thị.
  useEffect(() => {
    if (!handoverId || consumed) return;
    const supabase = createClient();
    let stopped = false;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      const { data } = await supabase
        .from("handovers")
        .select("consumed_at")
        .eq("id", handoverId)
        .maybeSingle();
      if (!stopped && data?.consumed_at) {
        stopped = true;
        setConsumed(true);
        setQrOpen(false);
        setIssued(null); // bỏ token khỏi bộ nhớ ngay khi đã dùng
        if (onConsumed) onConsumed();
        else router.refresh();
      }
    };
    const timer = setInterval(() => void tick(), POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [handoverId, consumed, router, onConsumed]);

  const onDraftsChange = (next: LineDraft[]) => {
    setDrafts(next);
    setServerLineErrors({});
    if (Object.keys(lineErrors).length > 0) {
      const r = validateLines(lines, next, CARRIER_SHORTFALL_REASONS);
      setLineErrors(r.ok ? {} : r.errors);
      if (r.ok) setError(null);
    }
  };

  const issue = () => {
    setError(null);
    setServerLineErrors({});
    let proposal: LineInput[] = [];
    if (canAdjust && adjustOpen && isAdjusted(lines, drafts)) {
      const r = validateLines(lines, drafts, CARRIER_SHORTFALL_REASONS);
      if (!r.ok) {
        setLineErrors(r.errors);
        setError("Vui lòng kiểm tra các dòng được đánh dấu trước khi hiện mã.");
        return;
      }
      proposal = r.lines;
    }
    setLineErrors({});
    const clientOpId = newUuid(); // mỗi lần bấm = một ý định (mã mới)
    startTransition(async () => {
      try {
        const res = await issueHandoverToken({ pickupId, stopId, lines: proposal, clientOpId });
        if (!res.ok) {
          if (res.error.fieldErrors && canAdjust) {
            setServerLineErrors(res.error.fieldErrors);
            setAdjustOpen(true);
          }
          setError(res.error.message);
          return;
        }
        setIssued({ ...res.data, issuedAtMs: Date.now() });
        setQrOpen(true);
      } catch {
        setError(
          "Không có kết nối mạng nên chưa tạo được mã. Mã bàn giao cần mạng — hãy thử lại khi có sóng.",
        );
      }
    });
  };

  const showCode = () => {
    if (issued && new Date(issued.expiresAt).getTime() > Date.now()) {
      setQrOpen(true);
      return;
    }
    issue();
  };

  if (consumed) {
    return (
      <p
        role="status"
        className="flex items-center gap-2 rounded-lg border bg-success-soft p-4 font-medium text-success"
      >
        <Loader2 aria-hidden className="size-5 animate-spin" />
        {copy.consumed}
      </p>
    );
  }

  const fullKg = totalKg(
    lines,
    lines.map((l) => ({ allocationId: l.allocationId, qty: l.expectedQty })),
  );

  return (
    <div className={cn("flex flex-col", embedded ? "gap-3" : "gap-6")}>
      {embedded ? null : (
        <section aria-labelledby="carrier-lines-heading" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="carrier-lines-heading" className="text-lg font-semibold">
              Hàng cần nhận ({lines.length} dòng)
            </h2>
            <p className="flex items-center gap-1.5 text-sm text-ink-muted tabular-nums">
              <Scale aria-hidden className="size-4" />≈ {displayKg(fullKg).text}
            </p>
          </div>
          <ul className="divide-y rounded-lg border bg-surface">
            {lines.map((l) => (
              <li
                key={l.allocationId}
                className="flex flex-wrap items-baseline justify-between gap-x-3 px-4 py-3"
              >
                <span className="font-medium text-ink">{l.title}</span>
                <span className="font-semibold text-ink tabular-nums">
                  {formatQty(l.expectedQty, l.unit)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section
        className={cn("flex flex-col gap-3", embedded ? null : "rounded-xl border bg-surface p-4 sm:p-5")}
      >
        {existing && !issued ? (
          <p className="flex items-start gap-2 text-sm text-ink-muted">
            <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-info" />
            <span>
              Bạn đã mở mã cho điểm này
              {existing.expiresAt ? ` (hiệu lực đến ${formatClock(existing.expiresAt)})` : ""}. Vì bảo mật, mã
              chỉ hiển thị một lần — bấm nút dưới để tạo mã mới, mã cũ sẽ mất hiệu lực.
            </span>
          </p>
        ) : null}
        <Button
          type="button"
          size="lg"
          className={cn("w-full text-lg", embedded ? "h-[3.25rem]" : "h-14 sm:w-auto sm:self-start sm:px-8")}
          onClick={showCode}
          disabled={pending}
          aria-busy={pending}
        >
          {pending ? (
            <Loader2 aria-hidden className="size-5 animate-spin" />
          ) : (
            <QrCode aria-hidden className="size-5" />
          )}
          {triggerLabel ?? copy.trigger}
        </Button>
        <p className="text-sm text-ink-muted">{copy.help(storeName)}</p>
        {error ? (
          <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
      </section>

      {canAdjust ? (
        <section className="flex flex-col gap-3">
          <Button
            type="button"
            variant="ghost"
            className="h-11 w-fit px-2 text-ink"
            aria-expanded={adjustOpen}
            aria-controls={`carrier-adjust-${stopId}`}
            onClick={() => setAdjustOpen((v) => !v)}
          >
            <ChevronDown aria-hidden className={adjustOpen ? "rotate-180" : undefined} />
            Mang ít hơn số đã đặt?
          </Button>
          {adjustOpen ? (
            <div id={`carrier-adjust-${stopId}`} className="flex flex-col gap-3">
              <p className="text-sm text-ink-muted">
                Ghi số bạn sẽ mang đi và lý do (ví dụ không đủ sức chở). Cửa hàng thấy đề xuất này khi quét mã
                và xác nhận số cuối cùng. Phần không lấy vì thiếu sức chở được trả về lô nếu còn hạn.
              </p>
              <LineEditor
                idPrefix={`carrier-${stopId}`}
                specs={lines}
                drafts={drafts}
                onChange={onDraftsChange}
                errors={lineErrors}
                serverErrors={serverLineErrors}
                allowedReasons={CARRIER_SHORTFALL_REASONS}
                qtyLabel="Số mang đi"
                disabled={pending}
              />
            </div>
          ) : null}
        </section>
      ) : null}

      {issued ? (
        <QrHandover
          open={qrOpen}
          onOpenChange={setQrOpen}
          payload={qrPayloadForToken(issued.token)}
          code={issued.code}
          expiresAt={issued.expiresAt}
          issuedAtMs={issued.issuedAtMs}
          title={copy.title}
          subtitle={`${storeName}${siteName ? ` · ${siteName}` : ""} — ${copy.handTo}`}
          audience={copy.audience}
          onReissue={issue}
          reissuing={pending}
          error={qrOpen ? error : null}
        />
      ) : null}
    </div>
  );
}
