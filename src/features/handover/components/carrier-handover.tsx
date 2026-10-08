"use client";

import { ChevronDown, Info, Loader2, QrCode, Scale } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { QrHandover } from "@/components/qr/qr-handover";
import { Button } from "@/components/ui/button";
import { displayKg } from "@/core/impact";
import { formatQty } from "@/features/catalog/labels";
import { createClient } from "@/lib/supabase/client";

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
  type LineSpec,
} from "../lines";
import { qrPayloadForToken } from "../payload";

import { LineEditor } from "./line-editor";

const POLL_MS = 3000;

type CarrierHandoverProps = {
  pickupId: string;
  stopId: string;
  storeName: string;
  siteName: string;
  lines: LineSpec[];
  /** Mã đã được mở trước đó (chưa dùng) — bí mật không còn trong bộ nhớ, chỉ biết id + hạn. */
  existing: { id: string; expiresAt: string | null } | null;
};

/**
 * Màn người mang hàng (tổ chức tự đến lấy — PRD US-CHA-20, F-39): xem hàng cần nhận, (tùy chọn) đề xuất mang
 * ít hơn, "Hiện mã bàn giao" ⇒ QR + mã 6 số toàn màn hình. Token/mã CHỈ nằm trong state của component này
 * (không URL, không localStorage, không log). Phát hiện cửa hàng đã quét bằng cách hỏi trạng thái mỗi 3 giây
 * (RLS cho phép người mang hàng đọc `handovers.consumed_at`); xong ⇒ làm mới trang để hiện kết quả.
 */
export function CarrierHandover({
  pickupId,
  stopId,
  storeName,
  siteName,
  lines,
  existing,
}: CarrierHandoverProps) {
  const router = useRouter();
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

  // Cửa hàng đã quét/nhập mã? Hỏi nhẹ mỗi 3 giây khi tab đang hiển thị.
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
        router.refresh();
      }
    };
    const timer = setInterval(() => void tick(), POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [handoverId, consumed, router]);

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
    let proposal: ReturnType<typeof validateLines> | null = null;
    if (adjustOpen && isAdjusted(lines, drafts)) {
      proposal = validateLines(lines, drafts, CARRIER_SHORTFALL_REASONS);
      if (!proposal.ok) {
        setLineErrors(proposal.errors);
        setError("Vui lòng kiểm tra các dòng được đánh dấu trước khi hiện mã.");
        return;
      }
    }
    setLineErrors({});
    const clientOpId = crypto.randomUUID(); // mỗi lần bấm = một ý định (mã mới)
    startTransition(async () => {
      const res = await issueHandoverToken({
        pickupId,
        stopId,
        lines: proposal?.ok ? proposal.lines : [],
        clientOpId,
      });
      if (!res.ok) {
        if (res.error.fieldErrors) {
          setServerLineErrors(res.error.fieldErrors);
          setAdjustOpen(true);
        }
        setError(res.error.message);
        return;
      }
      setIssued({ ...res.data, issuedAtMs: Date.now() });
      setQrOpen(true);
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
        Cửa hàng đã xác nhận bàn giao — đang tải kết quả…
      </p>
    );
  }

  const fullKg = totalKg(
    lines,
    lines.map((l) => ({ allocationId: l.allocationId, qty: l.expectedQty })),
  );

  return (
    <div className="flex flex-col gap-6">
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
              <span className="font-semibold text-ink tabular-nums">{formatQty(l.expectedQty, l.unit)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border bg-surface p-4 sm:p-5">
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
          className="h-14 w-full text-lg sm:w-auto sm:self-start sm:px-8"
          onClick={showCode}
          disabled={pending}
          aria-busy={pending}
        >
          {pending ? (
            <Loader2 aria-hidden className="size-5 animate-spin" />
          ) : (
            <QrCode aria-hidden className="size-5" />
          )}
          Hiện mã bàn giao
        </Button>
        <p className="text-sm text-ink-muted">
          Mở mã khi đã tới {storeName}. Mã gồm QR và 6 số, dùng một lần, hiệu lực 15 phút. Nhân viên cửa hàng
          quét (hoặc nhập mã) rồi đối soát từng dòng.
        </p>
        {error ? (
          <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <Button
          type="button"
          variant="ghost"
          className="h-11 w-fit px-2 text-ink"
          aria-expanded={adjustOpen}
          aria-controls="carrier-adjust"
          onClick={() => setAdjustOpen((v) => !v)}
        >
          <ChevronDown aria-hidden className={adjustOpen ? "rotate-180" : undefined} />
          Mang ít hơn số đã đặt?
        </Button>
        {adjustOpen ? (
          <div id="carrier-adjust" className="flex flex-col gap-3">
            <p className="text-sm text-ink-muted">
              Ghi số bạn sẽ mang đi và lý do (ví dụ không đủ sức chở). Cửa hàng thấy đề xuất này khi quét mã
              và xác nhận số cuối cùng. Phần không lấy vì thiếu sức chở được trả về lô nếu còn hạn.
            </p>
            <LineEditor
              idPrefix="carrier"
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

      {issued ? (
        <QrHandover
          open={qrOpen}
          onOpenChange={setQrOpen}
          payload={qrPayloadForToken(issued.token)}
          code={issued.code}
          expiresAt={issued.expiresAt}
          issuedAtMs={issued.issuedAtMs}
          title="Mã bàn giao"
          subtitle={`${storeName}${siteName ? ` · ${siteName}` : ""} — đưa màn hình này cho nhân viên cửa hàng`}
          onReissue={issue}
          reissuing={pending}
          error={qrOpen ? error : null}
        />
      ) : null}
    </div>
  );
}
