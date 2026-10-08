"use client";

import { CircleAlert, Loader2, XCircle } from "lucide-react";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { NETWORK_ERROR, useOpId } from "@/features/offers/use-op-id";

import { cancelNeed } from "../actions";
import { CANCEL_NEED_REASONS, NEED_LIMITS } from "../schemas";

const OTHER = "__other__";

/**
 * Hủy nhu cầu (C12, US-CHA-13 AC2; DESIGN-SYSTEM §12.5): câu hỏi cụ thể, nêu hệ quả, lý do bắt buộc, "Quay lại"
 * là focus mặc định. Chỉ owner/manager (nơi gọi đã ẩn nút với vai trò khác; RPC vẫn kiểm).
 */
export function CancelNeedButton({
  needId,
  summary,
  liveStores,
  size = "sm",
}: {
  needId: string;
  /** "50 ổ bánh mì". */
  summary: string;
  /** Số cửa hàng đang giữ hàng cho nhu cầu (chưa lấy); null = có nhưng không đếm (danh sách). */
  liveStores: number | null;
  size?: "sm" | "default";
}) {
  const router = useRouter();
  const id = useId();
  const op = useOpId();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<string>("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reason = choice === OTHER ? note.trim() : choice;
  const consequences = [
    liveStores === null
      ? "Các cửa hàng đang giữ hàng sẽ được báo; yêu cầu chưa lấy được hủy và số lượng trả lại cho lô."
      : liveStores > 0
        ? `${liveStores} cửa hàng đang giữ hàng sẽ được báo; yêu cầu chưa lấy được hủy và số lượng trả lại cho lô.`
        : "Nhu cầu không còn hiện với các cửa hàng gần bạn.",
    "Hàng đã lấy (đang trên đường) vẫn giao về bình thường.",
    "Nếu cửa hàng đã đóng gói, tổ chức bị trừ 2 điểm uy tín cho mỗi lô đó.",
  ];

  function submit() {
    if (!reason) {
      setError(choice === OTHER ? "Vui lòng nhập lý do hủy." : "Vui lòng chọn hoặc nhập lý do hủy.");
      return;
    }
    if (reason.length > NEED_LIMITS.reasonMax) {
      setError("Lý do tối đa 500 ký tự.");
      return;
    }
    setError(null);
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof cancelNeed>>;
      try {
        res = await cancelNeed({ needId, reason, clientOpId: op.get() });
      } catch {
        setError(NETWORK_ERROR);
        return;
      }
      op.reset();
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      setOpen(false);
      toast.success(`Đã hủy nhu cầu ${summary}.${liveStores !== 0 ? " Các cửa hàng đã được báo." : ""}`);
      router.refresh();
    });
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setError(null);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size={size}
          className="text-danger hover:bg-danger-soft hover:text-danger"
        >
          <XCircle aria-hidden />
          Hủy nhu cầu
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lg font-semibold">Hủy nhu cầu {summary}?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <ul className="list-disc space-y-1 pl-5 text-left text-ink-muted">
              {consequences.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <fieldset className="flex flex-col gap-2" aria-describedby={error ? `${id}-error` : undefined}>
          <legend className="mb-1 text-sm font-medium text-ink">
            Lý do hủy <span className="text-danger">*</span>
          </legend>
          <RadioGroup
            value={choice}
            onValueChange={(v) => {
              setChoice(v);
              setError(null);
            }}
            aria-invalid={!!error || undefined}
          >
            {[...CANCEL_NEED_REASONS, OTHER].map((r, i) => (
              <div key={r} className="flex min-h-9 items-center gap-2.5">
                <RadioGroupItem id={`${id}-r${i}`} value={r} />
                <Label htmlFor={`${id}-r${i}`} className="font-normal">
                  {r === OTHER ? "Lý do khác" : r}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </fieldset>

        {choice === OTHER ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-note`}>Lý do khác *</Label>
            <Textarea
              id={`${id}-note`}
              value={note}
              maxLength={NEED_LIMITS.reasonMax}
              rows={3}
              onChange={(e) => {
                setNote(e.target.value);
                setError(null);
              }}
              aria-invalid={!!error || undefined}
              aria-describedby={error ? `${id}-error` : undefined}
            />
          </div>
        ) : null}

        {error ? (
          <p id={`${id}-error`} role="alert" className="flex items-start gap-1.5 text-sm text-danger">
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {error}
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
            Hủy nhu cầu
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
