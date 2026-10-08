"use client";

import { REGEXP_ONLY_DIGITS } from "input-otp";
import { CircleAlert, CircleCheckBig, Home, Loader2, ScanLine, ShieldAlert, UserRound } from "lucide-react";
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

import { confirmHandover, type ConfirmOutcome } from "../actions";
import { HANDOVER_MESSAGES, tokenConsumedMessage } from "../errors";
import { formatClock } from "../format";
import { STORE_SHORTFALL_REASONS } from "../labels";
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

import { HandoverSummaryLines } from "./handover-summary";
import { LineEditor } from "./line-editor";

export type ReviewMode = { kind: "qr"; token: string } | { kind: "code" };

type HandoverReviewProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: HandoverPreview;
  mode: ReviewMode;
  /** Sau khi xong: quét lượt tiếp theo. */
  onScanNext: () => void;
  /** `Date.now()` lúc mở (ms) — mốc đầu cho đồng hồ đếm ngược. */
  openedAtMs: number;
};

/** Lý do không đối soát được ngay (cờ của bản xem trước) — đã là câu tiếng Việt. */
function blockedReason(p: HandoverPreview): string | null {
  if (p.consumedAt) return tokenConsumedMessage(p.consumedAt);
  if (p.locked) return HANDOVER_MESSAGES.codeLocked;
  if (p.expired) return RPC_MESSAGES.tokenExpired;
  if (!p.inWindow) return RPC_MESSAGES.outsidePickupWindow;
  return null;
}

/**
 * Đối soát và xác nhận bàn giao tại cửa hàng (PRD US-STO-17/18; DESIGN-SYSTEM §11.2 `HandoverLineReconcile`):
 * thông tin người nhận, (đường nhập mã) ô 6 số, từng dòng số thực giao ≤ số đặt + lý do thiếu, rồi xác nhận.
 * `client_op_id` giữ nguyên qua các lần gửi lại do mất mạng, đổi sau mỗi phản hồi của server (AC4).
 */
export function HandoverReview({
  open,
  onOpenChange,
  preview,
  mode,
  onScanNext,
  openedAtMs,
}: HandoverReviewProps) {
  const router = useRouter();
  const specs = preview.lines;
  const [drafts, setDrafts] = useState<LineDraft[]>(() =>
    specs.map((l) => draftFromSpec(l, l.proposal ?? undefined)),
  );
  const [errors, setErrors] = useState<Record<string, LineError>>({});
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(() => blockedReason(preview));
  const [outcome, setOutcome] = useState<{
    result: Extract<ConfirmOutcome, { status: "done" }>;
    lines: LineInput[];
  } | null>(null);
  const [pending, startTransition] = useTransition();
  const opIdRef = useRef<string | null>(null);

  // Sau lần gửi đầu, kiểm lại ngay khi sửa để lỗi cũ không còn treo trên dòng đã sửa đúng
  const onDraftsChange = (next: LineDraft[]) => {
    setDrafts(next);
    setFormError(null);
    setServerErrors({});
    if (Object.keys(errors).length > 0) {
      const r = validateLines(specs, next, STORE_SHORTFALL_REASONS);
      setErrors(r.ok ? {} : r.errors);
    }
  };

  const submit = () => {
    setFormError(null);
    setServerErrors({});
    const v = validateLines(specs, drafts, STORE_SHORTFALL_REASONS);
    let codeOk = true;
    if (mode.kind === "code" && !/^\d{6}$/.test(code)) {
      setCodeError("Vui lòng nhập đủ 6 chữ số.");
      codeOk = false;
    }
    if (!v.ok) {
      setErrors(v.errors);
      setFormError("Có dòng chưa hợp lệ. Vui lòng kiểm tra các dòng được đánh dấu.");
      const first = Object.keys(v.errors)[0];
      if (first) document.getElementById(`review-${first}-qty`)?.focus();
      return;
    }
    setErrors({});
    if (!codeOk) {
      document.getElementById("handover-code")?.focus();
      return;
    }
    setCodeError(null);
    opIdRef.current ??= crypto.randomUUID();
    const clientOpId = opIdRef.current;

    startTransition(async () => {
      let res: Awaited<ReturnType<typeof confirmHandover>>;
      try {
        res =
          mode.kind === "qr"
            ? await confirmHandover({ method: "qr", token: mode.token, lines: v.lines, clientOpId })
            : await confirmHandover({
                method: "code",
                handoverId: preview.handoverId,
                code,
                lines: v.lines,
                clientOpId,
              });
      } catch {
        // Mất mạng giữa chừng: giữ client_op_id để gửi lại không tạo bàn giao thứ hai
        setFormError("Không có kết nối mạng. Dữ liệu của bạn vẫn còn — hãy thử lại khi có mạng.");
        return;
      }
      opIdRef.current = null; // đã có phản hồi xác định ⇒ lần gửi sau là ý định mới

      if (!res.ok) {
        const e = res.error;
        if (e.fieldErrors?.code) {
          setCodeError(e.fieldErrors.code);
          return;
        }
        if (e.fieldErrors) setServerErrors(e.fieldErrors);
        if (["token_consumed", "token_expired", "token_locked", "outside_pickup_window"].includes(e.code)) {
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
        document.getElementById("handover-code")?.focus();
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

  const title = outcome ? "Đã bàn giao" : blocked ? "Chưa bàn giao được" : "Xác nhận bàn giao";
  const description = (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="inline-flex items-center gap-1.5">
        <Home aria-hidden className="size-4" />
        {preview.charityName}
      </span>
      {preview.carrierName ? (
        <span className="inline-flex items-center gap-1.5">
          <UserRound aria-hidden className="size-4" />
          Người nhận: {preview.carrierName}
        </span>
      ) : null}
    </span>
  );

  const footer = outcome ? (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-2 sm:flex-row sm:justify-end">
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
        Tổng giao ≈{" "}
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
        Xác nhận bàn giao
      </Button>
    </div>
  );

  return (
    <FullscreenDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      closeLabel="Đóng màn bàn giao"
      footer={footer}
    >
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-5 sm:py-6">
        {outcome ? (
          <>
            <section
              role="status"
              className="flex items-start gap-3 rounded-xl border border-success/30 bg-success-soft p-5"
              data-handover-success
            >
              <CircleCheckBig aria-hidden className="mt-0.5 size-8 shrink-0 text-success" />
              <div className="flex flex-col gap-1">
                <p className="text-xl font-semibold text-ink">
                  Đã bàn giao cho {preview.charityName} lúc {formatClock(outcome.result.consumedAt)}
                </p>
                <p className="text-ink-muted tabular-nums">
                  Tổng ≈ {displayKg(totalKg(specs, outcome.lines)).text}. Hàng thiếu (nếu có) đã ghi kèm lý
                  do.
                </p>
              </div>
            </section>
            <HandoverSummaryLines lines={summaryLines} />
            {outcome.result.dropoff ? (
              <p className="rounded-lg border bg-surface p-4 text-sm text-ink tabular-nums">
                <span className="font-semibold">Đã ghi vào sổ tác động</span> (tổ chức tự đến lấy):{" "}
                {displayKg(outcome.result.dropoff.kg).text} ·{" "}
                {displayMeals(outcome.result.dropoff.meals).text} ·{" "}
                {displayCo2e(outcome.result.dropoff.co2eKg).text} tránh được.
              </p>
            ) : (
              <p className="text-sm text-ink-muted">
                Tác động được ghi khi hàng tới tổ chức. Bạn sẽ thấy minh chứng sau khi tổ chức đăng.
              </p>
            )}
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
                Không có gì được ghi lại. Kiểm tra với người nhận rồi thử lại.
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
                <Label htmlFor="handover-code" className="text-base font-semibold">
                  Mã 6 số trên điện thoại người nhận
                </Label>
                <InputOTP
                  id="handover-code"
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
                  aria-describedby={codeError ? "handover-code-error" : "handover-code-hint"}
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
                    id="handover-code-error"
                    role="alert"
                    className="flex items-start gap-1.5 text-sm text-danger"
                  >
                    <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                    {codeError}
                  </p>
                ) : (
                  <p id="handover-code-hint" className="text-sm text-ink-subtle">
                    Người nhận đọc mã dạng “{formatHandoverCode("482913")}”. Nhập sai 5 lần mã sẽ bị khóa.
                  </p>
                )}
              </div>
            ) : null}

            <section aria-labelledby="review-lines-heading" className="flex flex-col gap-3">
              <h2 id="review-lines-heading" className="text-lg font-semibold">
                Đối soát từng dòng
              </h2>
              <p className="text-sm text-ink-muted">
                Nhập số thực giao cho từng dòng. Giao thiếu thì chọn lý do — FoodSave ghi đúng số này cho cả
                hai bên.
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
                idPrefix="review"
                specs={specs}
                drafts={drafts}
                onChange={onDraftsChange}
                errors={errors}
                serverErrors={serverErrors}
                allowedReasons={STORE_SHORTFALL_REASONS}
                qtyLabel="Số thực giao"
                disabled={pending}
                lineNote={(s) => {
                  const p = specs.find((x) => x.allocationId === s.allocationId)?.proposal;
                  return p?.qty !== null && p?.qty !== undefined && p.qty !== s.expectedQty
                    ? `Người nhận đề xuất mang ${formatQty(p.qty, s.unit)}.`
                    : null;
                }}
              />
            </section>
          </>
        )}
      </div>
    </FullscreenDialog>
  );
}
