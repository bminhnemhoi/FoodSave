"use client";

import { Loader2, type LucideIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
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
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import type { ActionResult } from "../actions";
import { REASON_MAX, REASON_MIN } from "../schemas";

type Variant = "default" | "outline" | "destructive";

export type ConfirmPayload = { reason: string; confirmName: string; clientOpId: string };

type ConfirmActionDialogProps = {
  triggerLabel: string;
  triggerIcon: LucideIcon;
  triggerVariant?: Variant;
  /** Câu hỏi cụ thể (DESIGN-SYSTEM §12.5). */
  title: string;
  /** Hệ quả của thao tác. */
  consequence: React.ReactNode;
  confirmLabel: string;
  confirmVariant?: Variant;
  /** Lý do: `required` ⇒ ≥ 10 ký tự; `none` ⇒ không có ô lý do. */
  reason?: { mode: "required" | "none"; label: string; presets?: string[]; hint?: string };
  /** Gõ lại tên để xác nhận (tạm khóa tổ chức). */
  confirmText?: { expected: string; label: string };
  onConfirm: (payload: ConfirmPayload) => Promise<ActionResult<object>>;
  /** Câu toast khi thành công (có thể dựa trên kết quả). */
  successMessage: (result: ActionResult<object> & { ok: true }) => string;
  successWarning?: (result: ActionResult<object> & { ok: true }) => string | null;
  className?: string;
};

/**
 * Hộp xác nhận cho thao tác không hoàn tác của Admin: AlertDialog, nút "Quay lại" là focus mặc định,
 * lý do bắt buộc khi cần, `client_op_id` cố định cho mỗi lần mở hộp thoại (retry dùng lại cùng ID).
 */
export function ConfirmActionDialog({
  triggerLabel,
  triggerIcon: Icon,
  triggerVariant = "outline",
  title,
  consequence,
  confirmLabel,
  confirmVariant = "default",
  reason,
  confirmText,
  onConfirm,
  successMessage,
  successWarning,
  className,
}: ConfirmActionDialogProps) {
  const ids = useId();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [opId, setOpId] = useState("");
  const [text, setText] = useState("");
  const [typed, setTyped] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const reasonId = `${ids}-reason`;
  const typedId = `${ids}-typed`;

  const onOpenChange = (next: boolean) => {
    if (pending) return;
    if (next) {
      setOpId(crypto.randomUUID());
      setText("");
      setTyped("");
      setErrors({});
      setFormError(undefined);
    }
    setOpen(next);
  };

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    const trimmed = text.trim();
    if (reason?.mode === "required" && trimmed.length < REASON_MIN) {
      e.reason = `Vui lòng nhập ${reason.label.toLowerCase()} (ít nhất ${REASON_MIN} ký tự).`;
    } else if (trimmed.length > REASON_MAX) {
      e.reason = `Vui lòng viết ngắn hơn ${REASON_MAX} ký tự.`;
    }
    if (confirmText && typed.trim() !== confirmText.expected.trim()) {
      e.confirmName = "Tên gõ lại chưa khớp. Gõ chính xác tên tổ chức để xác nhận.";
    }
    return e;
  };

  const submit = () => {
    const e = validate();
    setErrors(e);
    setFormError(undefined);
    if (Object.keys(e).length > 0) {
      document.getElementById(e.reason ? reasonId : typedId)?.focus();
      return;
    }
    startTransition(async () => {
      let res: ActionResult<object>;
      try {
        res = await onConfirm({ reason: text.trim(), confirmName: typed.trim(), clientOpId: opId });
      } catch {
        res = {
          ok: false,
          kind: "network",
          message: "Không kết nối được tới máy chủ. Dữ liệu của bạn vẫn còn — hãy thử lại.",
        };
      }
      if (res.ok) {
        setOpen(false);
        toast.success(successMessage(res));
        const warning = successWarning?.(res);
        if (warning) toast.warning(warning, { duration: 8000 });
        return;
      }
      if (res.fieldErrors && Object.keys(res.fieldErrors).length > 0) {
        setErrors({
          reason: res.fieldErrors.reason ?? res.fieldErrors.note ?? "",
          confirmName: res.fieldErrors.confirmName ?? "",
        });
      }
      setFormError(res.message);
      if (res.kind === "mfa_required") {
        toast.error(res.message, {
          action: {
            label: "Xác thực lại",
            onClick: () => router.push(`/admin/mfa?next=${encodeURIComponent(pathname)}`),
          },
        });
      }
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogTrigger asChild>
        <Button variant={triggerVariant} className={className ?? "min-h-11"}>
          <Icon aria-hidden />
          {triggerLabel}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto data-[size=default]:max-w-[calc(100%-2rem)] data-[size=default]:sm:max-w-lg">
        <AlertDialogHeader className="place-items-start text-left">
          <AlertDialogTitle className="text-lg font-semibold">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-left text-ink-muted">{consequence}</AlertDialogDescription>
        </AlertDialogHeader>

        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(ev) => {
            ev.preventDefault();
            submit();
          }}
        >
          {formError ? (
            <p
              role="alert"
              className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger"
            >
              {formError}
            </p>
          ) : null}

          {reason && reason.mode !== "none" ? (
            <Field data-invalid={errors.reason ? true : undefined}>
              <FieldLabel htmlFor={reasonId}>
                {reason.label} <span aria-hidden>*</span>
              </FieldLabel>
              {reason.presets && reason.presets.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  <p className="text-sm text-ink-subtle" id={`${reasonId}-presets`}>
                    Lý do mẫu (bấm để chèn, sửa lại nếu cần):
                  </p>
                  <div className="flex flex-wrap gap-2" role="group" aria-labelledby={`${reasonId}-presets`}>
                    {reason.presets.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setText(p)}
                        className="min-h-9 rounded-full border border-border-strong/50 bg-surface px-3 py-1.5 text-left text-sm text-ink hover:bg-bg-sunken focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <Textarea
                id={reasonId}
                name="reason"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={4}
                maxLength={REASON_MAX}
                required
                aria-invalid={errors.reason ? true : undefined}
                aria-describedby={errors.reason ? `${reasonId}-error` : `${reasonId}-hint`}
                className="min-h-28 bg-surface"
              />
              {errors.reason ? (
                <FieldError id={`${reasonId}-error`}>{errors.reason}</FieldError>
              ) : (
                <p id={`${reasonId}-hint`} className="text-sm text-ink-subtle">
                  {reason.hint ?? `Ít nhất ${REASON_MIN} ký tự.`}{" "}
                  <span className="tabular-nums">
                    ({text.trim().length}/{REASON_MAX})
                  </span>
                </p>
              )}
            </Field>
          ) : null}

          {confirmText ? (
            <Field data-invalid={errors.confirmName ? true : undefined}>
              <FieldLabel htmlFor={typedId}>{confirmText.label}</FieldLabel>
              <Input
                id={typedId}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                aria-invalid={errors.confirmName ? true : undefined}
                aria-describedby={errors.confirmName ? `${typedId}-error` : undefined}
              />
              {errors.confirmName ? (
                <FieldError id={`${typedId}-error`}>{errors.confirmName}</FieldError>
              ) : null}
            </Field>
          ) : null}

          <AlertDialogFooter className="mt-1">
            <AlertDialogCancel disabled={pending} className="min-h-11">
              Quay lại
            </AlertDialogCancel>
            <Button
              type="submit"
              variant={confirmVariant}
              disabled={pending}
              aria-disabled={pending}
              className="min-h-11"
            >
              {pending ? <Loader2 aria-hidden className="animate-spin" /> : null}
              {pending ? "Đang xử lý…" : confirmLabel}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
