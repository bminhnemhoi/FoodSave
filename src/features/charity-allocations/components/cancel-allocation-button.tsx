"use client";

import { CircleAlert, Loader2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import type { AllocationStatus } from "@/features/catalog/labels";

import { cancelAllocation } from "../actions";
import { CANCEL_REASONS, type CancelReasonValue } from "../schemas";

type CancelAllocationButtonProps = {
  allocationId: string;
  status: Extract<AllocationStatus, "requested" | "confirmed" | "assigned">;
  title: string;
  storeName: string;
  packed: boolean;
};

/**
 * Hủy yêu cầu (DESIGN-SYSTEM §12.5): câu hỏi cụ thể, nêu hệ quả; lý do bắt buộc khi đã xác nhận;
 * nút "Quay lại" là focus mặc định. Hệ quả theo ma trận hủy C1/C2 (DATA-MODEL §7).
 */
export function CancelAllocationButton({
  allocationId,
  status,
  title,
  storeName,
  packed,
}: CancelAllocationButtonProps) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<CancelReasonValue | null>(null);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const opRef = useRef<{ key: string; id: string } | null>(null);
  const requireReason = status !== "requested";

  const consequences = [
    "Số lượng đang giữ được trả lại cho lô để tổ chức khác nhận.",
    `${storeName} sẽ được báo ngay.`,
    status === "assigned"
      ? "Lô được gỡ khỏi chuyến lấy hàng; điểm dừng không còn lô nào sẽ được bỏ qua."
      : null,
    packed
      ? "Cửa hàng đã đóng gói lô này — hủy bây giờ sẽ trừ 2 điểm uy tín của tổ chức."
      : status === "requested"
        ? "Cửa hàng chưa xác nhận nên không ảnh hưởng điểm uy tín."
        : "Không ảnh hưởng điểm uy tín vì cửa hàng chưa đóng gói.",
  ].filter((x): x is string => !!x);

  function submit() {
    const payload = { reason, note: note.trim() || null };
    const key = JSON.stringify(payload);
    if (!opRef.current || opRef.current.key !== key) opRef.current = { key, id: crypto.randomUUID() };
    setFormError(null);
    startTransition(async () => {
      const res = await cancelAllocation({
        allocationId,
        requireReason,
        ...payload,
        clientOpId: opRef.current!.id,
      });
      if (!res.ok) {
        setErrors(res.error.fieldErrors ?? {});
        if (!res.error.fieldErrors) setFormError(res.error.message);
        return;
      }
      setOpen(false);
      toast.success(`Đã hủy yêu cầu nhận ${title}. ${storeName} đã được báo.`);
      router.refresh();
    });
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setErrors({});
          setFormError(null);
        }
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-danger hover:bg-danger-soft hover:text-danger"
        >
          <XCircle aria-hidden />
          Hủy yêu cầu
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lg font-semibold">Hủy yêu cầu nhận “{title}”?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <ul className="list-disc space-y-1 pl-5 text-left text-ink-muted">
              {consequences.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <fieldset
          className="flex flex-col gap-2"
          aria-describedby={errors.reason ? `${id}-reason-error` : undefined}
        >
          <legend className="mb-1 text-sm font-medium text-ink">
            Lý do hủy{requireReason ? " *" : " (không bắt buộc)"}
          </legend>
          <RadioGroup
            value={reason ?? ""}
            onValueChange={(v) => {
              setReason(v as CancelReasonValue);
              setErrors({});
            }}
            aria-invalid={!!errors.reason || undefined}
          >
            {CANCEL_REASONS.map((r) => (
              <div key={r.value} className="flex min-h-9 items-center gap-2.5">
                <RadioGroupItem id={`${id}-${r.value}`} value={r.value} />
                <Label htmlFor={`${id}-${r.value}`} className="font-normal">
                  {r.label}
                </Label>
              </div>
            ))}
          </RadioGroup>
          {errors.reason ? (
            <p id={`${id}-reason-error`} className="flex items-center gap-1.5 text-sm text-danger">
              <CircleAlert aria-hidden className="size-4" />
              {errors.reason}
            </p>
          ) : null}
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-note`}>
            Ghi chú cho cửa hàng{reason === "other" ? " *" : " (không bắt buộc)"}
          </Label>
          <Textarea
            id={`${id}-note`}
            value={note}
            maxLength={400}
            onChange={(e) => {
              setNote(e.target.value);
              setErrors({});
            }}
            aria-invalid={!!errors.note || undefined}
            aria-describedby={errors.note ? `${id}-note-error` : undefined}
          />
          {errors.note ? (
            <p id={`${id}-note-error`} className="flex items-center gap-1.5 text-sm text-danger">
              <CircleAlert aria-hidden className="size-4" />
              {errors.note}
            </p>
          ) : null}
        </div>

        {formError ? (
          <p
            role="alert"
            className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger"
          >
            {formError}
          </p>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel autoFocus disabled={pending}>
            Quay lại
          </AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            onClick={submit}
            disabled={pending}
            aria-busy={pending || undefined}
          >
            {pending ? <Loader2 aria-hidden className="animate-spin" /> : <XCircle aria-hidden />}
            Hủy yêu cầu
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
