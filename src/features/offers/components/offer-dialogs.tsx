"use client";

import { Ban, Loader2, Scale, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatQty, UNIT_LABEL, type UnitCode } from "@/features/catalog/labels";
import { describedBy, FieldErrorText, FormField } from "@/features/onboarding/components/fields";

import { cancelOffer, deleteDraft, publishDraft, updateOfferQuantity } from "../actions";
import { CANCEL_REASONS, isContinuous, QUANTITY_REASONS, validateNewQuantity } from "../schemas";
import { NETWORK_ERROR, useOpId } from "../use-op-id";
import { ReasonPicker } from "./reason-picker";

/** Nút xác nhận phá hủy: nền `--danger` đặc, chữ trắng (6,6:1 — DESIGN-SYSTEM §3.5, §12.5). */
const DANGER_SOLID =
  "bg-danger text-primary-foreground hover:bg-danger/90 focus-visible:border-danger focus-visible:ring-danger/30";

/**
 * Hộp thoại thao tác nhanh trên một lô (P2-06; US-STO-11, US-STO-12): đăng nháp (cam kết an toàn),
 * cập nhật số lượng (có lý do, không thấp hơn số đã giữ), hủy lô (giải thích hệ quả, lý do bắt buộc),
 * xóa nháp. Mở/đóng do nơi dùng điều khiển (`open`, `onOpenChange`).
 */

export type OfferActionTarget = {
  id: string;
  title: string;
  unit: UnitCode;
  quantity: number;
  committed: number;
  picked: number;
  pending: number;
  confirmed: number;
};

type DialogProps = { offer: OfferActionTarget; open: boolean; onOpenChange: (open: boolean) => void };

export const SAFETY_ATTESTATION = "Tôi cam kết thực phẩm còn an toàn để sử dụng và được bảo quản đúng cách.";

function FormAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
      {message}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Đăng lô nháp
// ---------------------------------------------------------------------------

export function PublishDialog({ offer, open, onOpenChange }: DialogProps) {
  const id = useId();
  const router = useRouter();
  const op = useOpId();
  const [attested, setAttested] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsEdit, setNeedsEdit] = useState(false);
  const [pending, startTransition] = useTransition();

  const change = (next: boolean) => {
    if (pending) return;
    if (next) {
      setAttested(false);
      setError(null);
      setNeedsEdit(false);
    }
    onOpenChange(next);
  };

  const submit = () => {
    if (!attested) {
      setError("Vui lòng xác nhận cam kết an toàn thực phẩm trước khi đăng.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const res = await publishDraft({ offerId: offer.id, attested: true, clientOpId: op.get() });
        op.reset();
        if (!res.ok) {
          const fields = Object.values(res.error.fieldErrors ?? {}).filter((m) => m && m !== "");
          setNeedsEdit(fields.length > 0);
          setError(fields[0] ?? res.error.message);
          return;
        }
        onOpenChange(false);
        toast.success(`Đã đăng lô “${offer.title}”. Các tổ chức phù hợp quanh cửa hàng sẽ thấy lô ngay.`);
        router.refresh();
      } catch {
        setError(NETWORK_ERROR);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg leading-snug font-semibold">Đăng lô “{offer.title}”?</DialogTitle>
          <DialogDescription>
            Lô sẽ mở cho các tổ chức đã được duyệt quanh cửa hàng. FoodSave tính hạn hiệu lực và nhãn
            Xanh/Vàng/Đỏ ngay khi đăng.
          </DialogDescription>
        </DialogHeader>
        <label
          htmlFor={`${id}-attest`}
          className="flex cursor-pointer items-start gap-3 rounded-lg border bg-surface p-3 text-sm"
        >
          <Checkbox
            id={`${id}-attest`}
            checked={attested}
            onCheckedChange={(v) => setAttested(v === true)}
            aria-describedby={error ? `${id}-error` : undefined}
            className="mt-0.5 size-5"
          />
          <span>{SAFETY_ATTESTATION}</span>
        </label>
        {error ? (
          <div className="flex flex-col gap-2">
            <FieldErrorText id={id}>{error}</FieldErrorText>
            {needsEdit ? (
              <Link
                href={`/store/inventory/${offer.id}/edit`}
                className="text-sm font-medium text-primary underline underline-offset-4"
              >
                Sửa lô để chọn lại khung giờ
              </Link>
            ) : null}
          </div>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => change(false)} disabled={pending}>
            Quay lại
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={pending || !attested}
            aria-busy={pending || undefined}
          >
            {pending ? <Loader2 aria-hidden className="animate-spin" /> : <Send aria-hidden />}
            Đăng lô
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Cập nhật số lượng
// ---------------------------------------------------------------------------

export function QuantityDialog({ offer, open, onOpenChange }: DialogProps) {
  const id = useId();
  const router = useRouter();
  const op = useOpId();
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<{ quantity?: string; reason?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [resetKey, setResetKey] = useState(0);

  const change = (next: boolean) => {
    if (pending) return;
    if (next) {
      setQuantity("");
      setReason("");
      setErrors({});
      setFormError(null);
      setResetKey((k) => k + 1);
    }
    onOpenChange(next);
  };

  const submit = () => {
    const e: typeof errors = {};
    const q = validateNewQuantity(quantity, { unit: offer.unit, committed: offer.committed });
    if (!q.ok) e.quantity = q.message;
    if (!reason.trim()) e.reason = "Vui lòng chọn hoặc nhập lý do.";
    setErrors(e);
    setFormError(null);
    if (Object.keys(e).length > 0) {
      if (e.quantity) document.getElementById(`${id}-qty`)?.focus();
      return;
    }
    startTransition(async () => {
      try {
        const res = await updateOfferQuantity({
          offerId: offer.id,
          quantity,
          reason,
          clientOpId: op.get(),
        });
        op.reset();
        if (!res.ok) {
          setErrors({ quantity: res.error.fieldErrors?.quantity, reason: res.error.fieldErrors?.reason });
          if (!res.error.fieldErrors) setFormError(res.error.message);
          return;
        }
        onOpenChange(false);
        toast.success(`Đã cập nhật số lượng: ${formatQty(res.data.quantity, offer.unit)}.`);
        router.refresh();
      } catch {
        setFormError(NETWORK_ERROR);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg leading-snug font-semibold">Cập nhật số lượng</DialogTitle>
          <DialogDescription>
            “{offer.title}” đang đăng {formatQty(offer.quantity, offer.unit)}, đã có tổ chức giữ{" "}
            {formatQty(offer.committed, offer.unit)}. Số mới không được thấp hơn số đã giữ.
          </DialogDescription>
        </DialogHeader>
        <FormAlert message={formError} />
        <FormField
          id={`${id}-qty`}
          label={`Số lượng mới (${UNIT_LABEL[offer.unit]})`}
          required
          error={errors.quantity}
          hint={
            isContinuous(offer.unit)
              ? "Có thể nhập số lẻ, ví dụ 2,5."
              : `Số nguyên, tối thiểu ${formatQty(Math.max(offer.committed, 1), offer.unit)}.`
          }
        >
          <Input
            id={`${id}-qty`}
            inputMode={isContinuous(offer.unit) ? "decimal" : "numeric"}
            autoComplete="off"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            aria-invalid={errors.quantity ? true : undefined}
            aria-describedby={describedBy(`${id}-qty`, true, errors.quantity)}
            className="tabular-nums"
          />
        </FormField>
        <ReasonPicker
          key={resetKey}
          legend="Lý do thay đổi"
          presets={QUANTITY_REASONS}
          error={errors.reason}
          onChange={setReason}
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => change(false)} disabled={pending}>
            Quay lại
          </Button>
          <Button type="button" onClick={submit} disabled={pending} aria-busy={pending || undefined}>
            {pending ? <Loader2 aria-hidden className="animate-spin" /> : <Scale aria-hidden />}
            Cập nhật
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Hủy lô (C11)
// ---------------------------------------------------------------------------

export function cancelConsequences(
  offer: Pick<OfferActionTarget, "pending" | "confirmed" | "picked">,
): string[] {
  const out: string[] = [];
  if (offer.pending > 0)
    out.push(`${offer.pending} yêu cầu đang chờ sẽ bị từ chối; tổ chức được báo và số lượng trả lại lô.`);
  if (offer.confirmed > 0)
    out.push(
      `${offer.confirmed} phân bổ đã xác nhận sẽ bị hủy: tổ chức được báo ngay và cửa hàng bị trừ 5 điểm uy tín cho mỗi phân bổ.`,
    );
  if (offer.picked > 0)
    out.push("Lô đã có hàng được lấy nên sẽ được đóng ở trạng thái Hoàn tất thay vì Đã hủy.");
  if (out.length === 0) out.push("Chưa có tổ chức nào giữ hàng — lô chỉ ngừng hiển thị trong kho tặng.");
  return out;
}

export function CancelOfferDialog({ offer, open, onOpenChange }: DialogProps) {
  const router = useRouter();
  const op = useOpId();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [resetKey, setResetKey] = useState(0);

  const change = (next: boolean) => {
    if (pending) return;
    if (next) {
      setReason("");
      setError(null);
      setFormError(null);
      setResetKey((k) => k + 1);
    }
    onOpenChange(next);
  };

  const submit = () => {
    if (!reason.trim()) {
      setError("Vui lòng chọn hoặc nhập lý do hủy lô.");
      return;
    }
    setError(null);
    setFormError(null);
    startTransition(async () => {
      try {
        const res = await cancelOffer({ offerId: offer.id, reason, clientOpId: op.get() });
        op.reset();
        if (!res.ok) {
          if (res.error.fieldErrors?.reason) setError(res.error.fieldErrors.reason);
          else setFormError(res.error.message);
          return;
        }
        onOpenChange(false);
        toast.success(
          res.data.status === "completed"
            ? `Đã đóng lô “${offer.title}” (đã có hàng được lấy).`
            : `Đã hủy lô “${offer.title}”.`,
        );
        router.refresh();
      } catch {
        setFormError(NETWORK_ERROR);
      }
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={change}>
      <AlertDialogContent className="max-h-[90dvh] overflow-y-auto data-[size=default]:max-w-[calc(100%-2rem)] data-[size=default]:sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lg leading-snug font-semibold">
            Hủy lô “{offer.title}”?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <ul className="list-disc space-y-1 pl-5 text-left text-ink-muted">
              {cancelConsequences(offer).map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FormAlert message={formError} />
        <ReasonPicker
          key={resetKey}
          legend="Lý do hủy lô"
          presets={CANCEL_REASONS}
          error={error}
          onChange={setReason}
        />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Quay lại</AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            className={DANGER_SOLID}
            onClick={submit}
            disabled={pending}
            aria-busy={pending || undefined}
          >
            {pending ? <Loader2 aria-hidden className="animate-spin" /> : <Ban aria-hidden />}
            Hủy lô
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------------------------------------------------------------------------
// Xóa nháp
// ---------------------------------------------------------------------------

export function DeleteDraftDialog({
  offer,
  open,
  onOpenChange,
  redirectTo,
}: DialogProps & { redirectTo?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const change = (next: boolean) => {
    if (pending) return;
    if (next) setError(null);
    onOpenChange(next);
  };

  const submit = () => {
    startTransition(async () => {
      try {
        const res = await deleteDraft({ offerId: offer.id });
        if (!res.ok) {
          setError(res.error.message);
          return;
        }
        onOpenChange(false);
        toast.success(`Đã xóa bản nháp “${offer.title}”.`);
        if (redirectTo) router.push(redirectTo);
        else router.refresh();
      } catch {
        setError(NETWORK_ERROR);
      }
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={change}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lg leading-snug font-semibold">
            Xóa bản nháp “{offer.title}”?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Bản nháp và ảnh của nó bị xóa vĩnh viễn. Bản nháp chưa được đăng nên không tổ chức nào bị ảnh
            hưởng.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FormAlert message={error} />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Quay lại</AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            className={DANGER_SOLID}
            onClick={submit}
            disabled={pending}
            aria-busy={pending || undefined}
          >
            {pending ? <Loader2 aria-hidden className="animate-spin" /> : <Trash2 aria-hidden />}
            Xóa nháp
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
