"use client";

import { Loader2, OctagonAlert, SkipForward } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { reportTripIncident, skipStop } from "../actions";
import { useIntentId, useOnline } from "../hooks";
import { INCIDENT_KIND_LABEL, INCIDENT_KIND_ORDER, SKIP_REASONS, type IncidentKind } from "../labels";
import { BottomSheet } from "./bottom-sheet";
import { EMPTY_REASON, ReasonPicker, resolveReason, type ReasonValue } from "./reason-picker";

const NETWORK = "Không có kết nối mạng nên chưa gửi được. Hãy thử lại khi có sóng.";

/** "Bỏ qua điểm này" (DATA-MODEL §7 C6, `skip_stop`): bắt buộc lý do; phân bổ của điểm trở về chờ chuyến khác. */
export function SkipStopButton({
  pickupId,
  stopId,
  placeName,
}: {
  pickupId: string;
  stopId: string;
  placeName: string;
}) {
  const online = useOnline();
  const intent = useIntentId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReasonValue>(EMPTY_REASON);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    const text = resolveReason(reason);
    if (!text) {
      setError("Vui lòng chọn hoặc ghi lý do để điều phối viên và cửa hàng biết.");
      return;
    }
    setError(null);
    const clientOpId = intent.idFor(`skip:${stopId}:${text}`);
    startTransition(async () => {
      try {
        const res = await skipStop({ pickupId, stopId, reason: text, clientOpId });
        if (!res.ok) {
          setError(res.error.fieldErrors?.reason ?? res.error.message);
          return;
        }
        intent.done();
        setOpen(false);
        toast.success(`Đã bỏ qua ${placeName}. Điều phối viên và cửa hàng đã được báo.`);
      } catch {
        setError(NETWORK);
      }
    });
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        className="h-11 justify-start px-2 text-base text-ink"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        disabled={!online}
      >
        <SkipForward aria-hidden />
        Bỏ qua điểm này
      </Button>
      <BottomSheet
        open={open}
        onOpenChange={setOpen}
        title={`Bỏ qua ${placeName}?`}
        description="Hàng ở điểm này trở về chờ chuyến khác (nếu lô còn hạn). Điều phối viên và cửa hàng được báo ngay. Không hoàn tác được."
        footer={
          <>
            <Button
              type="button"
              variant="destructive"
              size="lg"
              className="h-12 w-full text-base"
              onClick={submit}
              disabled={pending || !online}
              aria-busy={pending}
            >
              {pending ? <Loader2 aria-hidden className="animate-spin" /> : <SkipForward aria-hidden />}
              Bỏ qua điểm này
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-12 w-full text-base"
              onClick={() => setOpen(false)}
            >
              Quay lại
            </Button>
          </>
        }
      >
        <ReasonPicker
          legend="Vì sao bỏ qua?"
          options={SKIP_REASONS}
          value={reason}
          onChange={(v) => {
            setReason(v);
            setError(null);
          }}
          maxLength={300}
          error={error}
          disabled={pending}
        />
      </BottomSheet>
    </>
  );
}

/**
 * "Báo sự cố" (PRD US-VOL-13; `report_incident`): chọn loại + mô tả 10–2000 ký tự. Tại một điểm lấy hàng, chọn
 * "Cửa hàng không giao được" ⇒ bỏ qua điểm đó luôn (ma trận hủy C6). Điều phối viên nhận thông báo GẤP khi chuyến
 * đang chạy.
 */
export function IncidentButton({
  pickupId,
  stop,
  variant = "ghost",
  className,
}: {
  pickupId: string;
  /** Điểm lấy hàng đang mở (gắn phân bổ để biết cửa hàng liên quan); null = sự cố của cả chuyến. */
  stop: { id: string; placeName: string; allocationId: string | null; canSkip: boolean } | null;
  variant?: "ghost" | "outline";
  className?: string;
}) {
  const online = useOnline();
  const report = useIntentId();
  const skip = useIntentId();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<IncidentKind | "">("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<{ kind?: string; description?: string; form?: string }>({});
  const [pending, startTransition] = useTransition();

  const willSkip = kind === "no_show" && !!stop?.canSkip;

  const submit = () => {
    const next: typeof errors = {};
    if (!kind) next.kind = "Vui lòng chọn loại sự cố.";
    const text = description.trim();
    if (text.length < 10)
      next.description = "Mô tả ít nhất 10 ký tự để điều phối viên hiểu chuyện gì xảy ra.";
    setErrors(next);
    if (next.kind || next.description || !kind) return;
    const key = `incident:${pickupId}:${kind}:${text}:${stop?.id ?? ""}`;
    const clientOpId = report.idFor(key);
    const skipOpId = willSkip ? skip.idFor(key) : null;
    startTransition(async () => {
      try {
        const res = await reportTripIncident({
          pickupId,
          kind,
          description: text,
          allocationId: stop?.allocationId ?? null,
          skipStopId: willSkip && stop ? stop.id : null,
          clientOpId,
          skipOpId,
        });
        if (!res.ok) {
          setErrors({
            description: res.error.fieldErrors?.description,
            form: res.error.fieldErrors?.description ? undefined : res.error.message,
          });
          return;
        }
        report.done();
        skip.done();
        setOpen(false);
        setKind("");
        setDescription("");
        toast.success(
          willSkip && res.data.skipped
            ? "Đã gửi phản ánh và bỏ qua điểm này. Điều phối viên đã được báo gấp."
            : "Đã gửi phản ánh. Điều phối viên đã được báo.",
        );
        if (willSkip && !res.data.skipped)
          toast.warning("Chưa bỏ qua được điểm này (trạng thái vừa thay đổi). Hãy tải lại trang.");
      } catch {
        setErrors({ form: NETWORK });
      }
    });
  };

  return (
    <>
      <Button
        type="button"
        variant={variant}
        className={cn(
          "h-11 justify-start px-2 text-base text-ink",
          variant === "outline" && "px-4",
          className,
        )}
        onClick={() => {
          setErrors({});
          setOpen(true);
        }}
        disabled={!online}
      >
        <OctagonAlert aria-hidden />
        Báo sự cố
      </Button>
      <BottomSheet
        open={open}
        onOpenChange={setOpen}
        title="Báo sự cố"
        description={
          stop
            ? `Tại ${stop.placeName}. Điều phối viên nhận thông báo ngay; cửa hàng chỉ thấy tên tổ chức, không thấy tên bạn.`
            : "Điều phối viên nhận thông báo ngay."
        }
        footer={
          <>
            {errors.form ? (
              <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
                {errors.form}
              </p>
            ) : null}
            <Button
              type="button"
              size="lg"
              className="h-12 w-full text-base"
              onClick={submit}
              disabled={pending || !online}
              aria-busy={pending}
            >
              {pending ? <Loader2 aria-hidden className="animate-spin" /> : <OctagonAlert aria-hidden />}
              {willSkip ? "Gửi và bỏ qua điểm này" : "Gửi phản ánh"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-12 w-full text-base"
              onClick={() => setOpen(false)}
            >
              Quay lại
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <fieldset
            className="flex flex-col gap-2"
            aria-describedby={errors.kind ? `${formId}-kind-error` : undefined}
          >
            <legend className="mb-1 font-medium text-ink">Loại sự cố</legend>
            <RadioGroup
              value={kind}
              onValueChange={(v) => {
                setKind(v as IncidentKind);
                setErrors((e) => ({ ...e, kind: undefined }));
              }}
              aria-invalid={errors.kind ? true : undefined}
              className="grid gap-2"
            >
              {INCIDENT_KIND_ORDER.map((k) => (
                <label
                  key={k}
                  className="flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border bg-surface px-3 py-2.5 has-[[aria-checked=true]]:border-role-accent has-[[aria-checked=true]]:bg-role-accent-soft"
                >
                  <RadioGroupItem value={k} className="mt-1" />
                  <span className="flex flex-col">
                    <span className="text-ink">{INCIDENT_KIND_LABEL[k].label}</span>
                    <span className="text-sm text-ink-muted">{INCIDENT_KIND_LABEL[k].hint}</span>
                  </span>
                </label>
              ))}
            </RadioGroup>
            {errors.kind ? (
              <p id={`${formId}-kind-error`} className="text-sm text-danger">
                {errors.kind}
              </p>
            ) : null}
          </fieldset>
          {willSkip ? (
            <p className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-ink">
              Điểm {stop?.placeName} sẽ được bỏ qua; hàng ở đó trở về chờ chuyến khác.
            </p>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${formId}-desc`} className="font-medium text-ink">
              Mô tả ngắn
            </label>
            <Textarea
              id={`${formId}-desc`}
              rows={3}
              maxLength={2000}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setErrors((x) => ({ ...x, description: undefined }));
              }}
              aria-invalid={errors.description ? true : undefined}
              aria-describedby={errors.description ? `${formId}-desc-error` : `${formId}-desc-hint`}
              className="min-h-24 bg-surface text-base"
            />
            {errors.description ? (
              <p id={`${formId}-desc-error`} className="text-sm text-danger">
                {errors.description}
              </p>
            ) : (
              <p id={`${formId}-desc-hint`} className="text-sm text-ink-subtle">
                Ví dụ: “Cửa hàng đóng cửa lúc 18:10, đã gọi nhưng không ai nghe.” Không ghi số điện thoại hay
                thông tin cá nhân.
              </p>
            )}
          </div>
        </div>
      </BottomSheet>
    </>
  );
}
