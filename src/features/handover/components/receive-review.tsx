"use client";

import { REGEXP_ONLY_DIGITS } from "input-otp";
import {
  CircleAlert,
  CircleCheckBig,
  Loader2,
  PackageCheck,
  Route,
  ScanLine,
  ShieldAlert,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { Countdown } from "@/components/labels/live-freshness";
import { FullscreenDialog } from "@/components/qr/fullscreen-dialog";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { displayCo2e, displayKg, displayMeals } from "@/core/impact";
import { formatQty } from "@/features/catalog/labels";
import { RPC_MESSAGES } from "@/lib/rpc-errors";

import { HANDOVER_MESSAGES, tokenConsumedMessage } from "../errors";
import { formatClock } from "../format";
import type { ShortfallReason } from "../labels";
import {
  draftFromSpec,
  totalKg,
  validateLines,
  type LineDraft,
  type LineError,
  type LineInput,
} from "../lines";
import { formatHandoverCode } from "../payload";
import type { HandoverPreview } from "../queries";
import { recordDropoff, type DropoffOutcome } from "../receive-actions";

import { HandoverSummaryLines } from "./handover-summary";
import { LineEditor } from "./line-editor";

/** Ở bước giao về chỉ được từ chối vì chất lượng (DATA-MODEL §2.3 handover_lines: dropoff chỉ nhận `quality_reject`). */
const DROPOFF_REASONS: readonly ShortfallReason[] = ["quality_reject"];

export type ReceiveMode = { kind: "qr"; token: string } | { kind: "code" };

function blockedReason(p: HandoverPreview): string | null {
  if (p.consumedAt) return tokenConsumedMessage(p.consumedAt);
  if (p.locked) return HANDOVER_MESSAGES.codeLocked;
  if (p.expired) return RPC_MESSAGES.tokenExpired;
  return null;
}

/**
 * Đối soát và xác nhận nhận hàng tại tổ chức (PRD US-CHA-21 AC1–AC2): người mang hàng, (đường nhập mã) ô 6 số,
 * từng dòng đã lấy với số thực nhận ≤ số đã lấy; thiếu thì chỉ được ghi "Không đạt chất lượng" kèm mô tả.
 * Xong ⇒ kg/suất ăn/CO₂e vừa ghi vào sổ tác động. `client_op_id` giữ nguyên khi gửi lại do mất mạng.
 */
export function ReceiveReview({
  open,
  onOpenChange,
  preview,
  mode,
  pickupId,
  openedAtMs,
  onScanNext,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: HandoverPreview;
  mode: ReceiveMode;
  pickupId: string;
  openedAtMs: number;
  onScanNext: () => void;
}) {
  const router = useRouter();
  const specs = preview.lines;
  const [drafts, setDrafts] = useState<LineDraft[]>(() =>
    specs.map((l) =>
      draftFromSpec(
        l,
        l.proposal
          ? { ...l.proposal, reason: l.proposal.reason === "quality_reject" ? "quality_reject" : null }
          : undefined,
      ),
    ),
  );
  const [errors, setErrors] = useState<Record<string, LineError>>({});
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(() => blockedReason(preview));
  const [outcome, setOutcome] = useState<{
    result: Extract<DropoffOutcome, { status: "done" }>;
    lines: LineInput[];
  } | null>(null);
  const [pending, startTransition] = useTransition();
  const opIdRef = useRef<string | null>(null);

  const onDraftsChange = (next: LineDraft[]) => {
    setDrafts(next);
    setFormError(null);
    setServerErrors({});
    if (Object.keys(errors).length > 0) {
      const r = validateLines(specs, next, DROPOFF_REASONS);
      setErrors(r.ok ? {} : r.errors);
    }
  };

  const submit = () => {
    setFormError(null);
    setServerErrors({});
    const v = validateLines(specs, drafts, DROPOFF_REASONS);
    let codeOk = true;
    if (mode.kind === "code" && !/^\d{6}$/.test(code)) {
      setCodeError("Vui lòng nhập đủ 6 chữ số.");
      codeOk = false;
    }
    if (!v.ok) {
      setErrors(v.errors);
      setFormError("Có dòng chưa hợp lệ. Vui lòng kiểm tra các dòng được đánh dấu.");
      const first = Object.keys(v.errors)[0];
      if (first) document.getElementById(`receive-${first}-qty`)?.focus();
      return;
    }
    setErrors({});
    if (!codeOk) {
      document.getElementById("receive-code")?.focus();
      return;
    }
    setCodeError(null);
    opIdRef.current ??= crypto.randomUUID();
    const clientOpId = opIdRef.current;

    startTransition(async () => {
      let res: Awaited<ReturnType<typeof recordDropoff>>;
      try {
        res =
          mode.kind === "qr"
            ? await recordDropoff({
                method: "qr",
                handoverId: preview.handoverId,
                token: mode.token,
                lines: v.lines,
                clientOpId,
              })
            : await recordDropoff({
                method: "code",
                handoverId: preview.handoverId,
                code,
                lines: v.lines,
                clientOpId,
              });
      } catch {
        setFormError("Không có kết nối mạng. Dữ liệu của bạn vẫn còn — hãy thử lại khi có mạng.");
        return;
      }
      opIdRef.current = null;

      if (!res.ok) {
        const e = res.error;
        if (e.fieldErrors?.code) {
          setCodeError(e.fieldErrors.code);
          return;
        }
        if (e.fieldErrors) setServerErrors(e.fieldErrors);
        if (["token_consumed", "token_expired", "token_locked", "invalid_state"].includes(e.code)) {
          setBlocked(e.message);
          return;
        }
        setFormError(e.message);
        return;
      }
      if (res.data.status === "code_invalid") {
        setCode("");
        const left = res.data.attemptsLeft;
        if (left > 0) setCodeError(`Mã chưa đúng. Bạn còn ${left} lần thử.`);
        else setBlocked(HANDOVER_MESSAGES.codeLocked);
        document.getElementById("receive-code")?.focus();
        return;
      }
      setOutcome({ result: res.data, lines: v.lines });
      router.refresh();
    });
  };

  const summaryLines = outcome
    ? outcome.lines.map((l) => {
        const s = specs.find((x) => x.allocationId === l.allocationId)!;
        return { ...l, title: s.title, unit: s.unit, expectedQty: s.expectedQty };
      })
    : [];

  const title = outcome ? "Đã nhận hàng" : blocked ? "Chưa nhận hàng được" : "Xác nhận nhận hàng";
  const description = (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="inline-flex items-center gap-1.5">
        <PackageCheck aria-hidden className="size-4" />
        Giao về {preview.charityName}
      </span>
      {preview.carrierName ? (
        <span className="inline-flex items-center gap-1.5">
          <UserRound aria-hidden className="size-4" />
          Tình nguyện viên: {preview.carrierName}
        </span>
      ) : null}
    </span>
  );

  const footer = outcome ? (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-2 sm:flex-row sm:justify-end">
      {pickupId ? (
        <Button asChild type="button" variant="outline" size="lg" className="h-12">
          <Link href={`/charity/pickups/${pickupId}`}>
            <Route aria-hidden />
            Xem chuyến
          </Link>
        </Button>
      ) : null}
      <Button type="button" variant="outline" size="lg" className="h-12" onClick={() => onOpenChange(false)}>
        Xong
      </Button>
      <Button type="button" size="lg" className="h-12" onClick={onScanNext}>
        <ScanLine aria-hidden />
        Quét lượt tiếp theo
      </Button>
    </div>
  ) : blocked ? (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-2 sm:flex-row sm:justify-end">
      <Button type="button" size="lg" className="h-12" onClick={() => onOpenChange(false)}>
        Đóng
      </Button>
    </div>
  ) : (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-ink-muted tabular-nums" aria-live="polite">
        Tổng nhận ≈{" "}
        {
          displayKg(
            totalKg(
              specs,
              drafts.map((d) => ({
                allocationId: d.allocationId,
                qty: Number(d.qty.replace(",", ".")) || 0,
              })),
            ),
          ).text
        }
      </p>
      <Button
        type="button"
        size="lg"
        className="h-12 text-base sm:px-8"
        onClick={submit}
        disabled={pending}
        aria-busy={pending}
      >
        {pending ? <Loader2 aria-hidden className="animate-spin" /> : <CircleCheckBig aria-hidden />}
        Xác nhận đã nhận hàng
      </Button>
    </div>
  );

  return (
    <FullscreenDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      closeLabel="Đóng màn nhận hàng"
      footer={footer}
    >
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-5 sm:py-6">
        {outcome ? (
          <>
            <section
              role="status"
              className="flex items-start gap-3 rounded-xl border border-success/30 bg-success-soft p-5"
              data-dropoff-success
            >
              <CircleCheckBig aria-hidden className="mt-0.5 size-8 shrink-0 text-success" />
              <div className="flex flex-col gap-1">
                <p className="text-xl font-semibold text-ink">
                  Đã nhận hàng lúc {formatClock(outcome.result.receivedAt)}
                </p>
                <p className="text-ink-muted tabular-nums">
                  Chuyến hoàn tất. Tổng nhận ≈ {displayKg(totalKg(specs, outcome.lines)).text}; phần từ chối
                  (nếu có) đã ghi kèm lý do.
                </p>
              </div>
            </section>
            <HandoverSummaryLines lines={summaryLines} qtyHeading="Đã nhận" />
            <p className="rounded-lg border bg-surface p-4 text-sm text-ink tabular-nums" data-ledger>
              <span className="font-semibold">Đã ghi vào sổ tác động:</span>{" "}
              {displayKg(outcome.result.kg).text} · {displayMeals(outcome.result.meals).text} ·{" "}
              {displayCo2e(outcome.result.co2eKg).text} tránh được. Cửa hàng liên quan đã được báo; minh chứng
              đến hạn sau 48 giờ.
            </p>
          </>
        ) : blocked ? (
          <section
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger-soft p-5"
          >
            <ShieldAlert aria-hidden className="mt-0.5 size-7 shrink-0 text-danger" />
            <div className="flex flex-col gap-1">
              <p className="text-lg font-semibold text-ink">{blocked}</p>
              <p className="text-sm text-ink-muted">
                Không có gì được ghi lại. Kiểm tra với tình nguyện viên rồi thử lại.
              </p>
            </div>
          </section>
        ) : (
          <>
            {preview.expiresAt ? (
              <p className="text-sm text-ink-muted">
                Mã hiệu lực đến {formatClock(preview.expiresAt)} (
                <Countdown deadline={preview.expiresAt} serverNow={openedAtMs} />
                ).
              </p>
            ) : null}

            {mode.kind === "code" ? (
              <div className="flex flex-col gap-2 rounded-xl border bg-surface p-4">
                <Label htmlFor="receive-code" className="text-base font-semibold">
                  Mã 6 số trên điện thoại tình nguyện viên
                </Label>
                <InputOTP
                  id="receive-code"
                  maxLength={6}
                  value={code}
                  onChange={(v) => {
                    setCode(v);
                    setCodeError(null);
                  }}
                  pattern={REGEXP_ONLY_DIGITS}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  disabled={pending}
                  aria-invalid={codeError ? true : undefined}
                  aria-describedby={codeError ? "receive-code-error" : "receive-code-hint"}
                  containerClassName="gap-2"
                >
                  <InputOTPGroup>
                    {[0, 1, 2].map((i) => (
                      <InputOTPSlot key={i} index={i} className="size-12 text-2xl font-bold tabular-nums" />
                    ))}
                  </InputOTPGroup>
                  <InputOTPSeparator aria-hidden />
                  <InputOTPGroup>
                    {[3, 4, 5].map((i) => (
                      <InputOTPSlot key={i} index={i} className="size-12 text-2xl font-bold tabular-nums" />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
                {codeError ? (
                  <p
                    id="receive-code-error"
                    role="alert"
                    className="flex items-start gap-1.5 text-sm text-danger"
                  >
                    <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                    {codeError}
                  </p>
                ) : (
                  <p id="receive-code-hint" className="text-sm text-ink-subtle">
                    Tình nguyện viên đọc mã dạng “{formatHandoverCode("482913")}”. Nhập sai 5 lần mã sẽ bị
                    khóa.
                  </p>
                )}
              </div>
            ) : null}

            <section aria-labelledby="receive-lines-heading" className="flex flex-col gap-3">
              <h2 id="receive-lines-heading" className="text-lg font-semibold">
                Đối soát từng dòng
              </h2>
              <p className="text-sm text-ink-muted">
                Nhập số thực nhận cho từng dòng (tối đa bằng số đã lấy ở cửa hàng). Hàng không đạt chất lượng
                thì nhận ít hơn và mô tả ngắn — phần này không tính vào tác động.
              </p>
              {formError ? (
                <p
                  role="alert"
                  className="flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger"
                >
                  <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                  {formError}
                </p>
              ) : null}
              <LineEditor
                idPrefix="receive"
                specs={specs}
                drafts={drafts}
                onChange={onDraftsChange}
                errors={errors}
                serverErrors={serverErrors}
                allowedReasons={DROPOFF_REASONS}
                qtyLabel="Số thực nhận"
                disabled={pending}
                lineNote={(s) => {
                  const p = specs.find((x) => x.allocationId === s.allocationId)?.proposal;
                  return p?.qty !== null && p?.qty !== undefined && p.qty !== s.expectedQty
                    ? `Tình nguyện viên báo mang về ${formatQty(p.qty, s.unit)}.`
                    : `Đã lấy ở cửa hàng: ${formatQty(s.expectedQty, s.unit)}.`;
                }}
              />
            </section>
          </>
        )}
      </div>
    </FullscreenDialog>
  );
}
