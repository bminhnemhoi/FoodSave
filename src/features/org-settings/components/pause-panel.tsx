"use client";

import { Loader2, PauseCircle, PlayCircle } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { describedBy, FormField, Section } from "@/features/onboarding/components/fields";
import type { OrgKind } from "@/features/onboarding/options";

import { setPaused } from "../actions";
import { PAUSE_REASON_MAX } from "../schemas";
import { Notice } from "./notice";

const COPY = {
  store: {
    action: "Tạm ngưng cửa hàng",
    question: "Tạm ngưng cửa hàng trên FoodSave?",
    effect:
      "Cửa hàng được đánh dấu tạm ngưng: FoodSave không gợi ý cửa hàng cho tổ chức và không gửi thông báo nhu cầu mới tới bạn cho tới khi bật lại. Lô và phân bổ đang chạy vẫn hoàn tất bình thường.",
    active: "Cửa hàng đang hoạt động bình thường.",
    paused: "Cửa hàng đang tạm ngưng",
  },
  charity: {
    action: "Tạm ngưng nhận donation",
    question: "Tạm ngưng nhận donation?",
    effect:
      "Tổ chức được đánh dấu tạm ngưng: FoodSave không gửi thông báo lô mới và không gợi ý tổ chức trong ghép đơn cho tới khi bật lại. Phân bổ đang chạy vẫn hoàn tất bình thường.",
    active: "Tổ chức đang nhận donation bình thường.",
    paused: "Đang tạm ngưng nhận donation",
  },
} as const;

/** Tab "Tạm ngưng" (US-CHA-37, F-11 (7)): `set_org_paused` kèm lý do; bật lại bất cứ lúc nào. */
export function PausePanel({
  kind,
  orgId,
  isPaused,
  pausedReason,
}: {
  kind: OrgKind;
  orgId: string;
  isPaused: boolean;
  pausedReason: string | null;
}) {
  const uid = useId();
  const copy = COPY[kind];
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function apply(paused: boolean) {
    setError(null);
    if (paused && reason.trim().length > PAUSE_REASON_MAX) {
      setError(`Lý do tối đa ${PAUSE_REASON_MAX} ký tự.`);
      return;
    }
    startTransition(async () => {
      try {
        const res = await setPaused({ orgId, paused, reason: paused ? reason : "" });
        if (!res.ok) {
          setError(res.error.fieldErrors?.reason ?? res.error.message);
          return;
        }
        setOpen(false);
        setReason("");
        toast.success(
          paused
            ? `Đã bật tạm ngưng. ${copy.paused}.`
            : "Đã bật lại. FoodSave hoạt động bình thường với bạn.",
        );
      } catch {
        setError("Không có kết nối mạng. Dữ liệu của bạn vẫn còn — hãy thử lại khi có mạng.");
      }
    });
  }

  return (
    <Section
      title={copy.action}
      headingId={`${uid}-title`}
      description="Dùng khi tạm nghỉ (sửa chữa, nghỉ lễ dài ngày). Bạn bật lại bất cứ lúc nào."
    >
      {isPaused ? (
        <>
          <Notice tone="warning" role="status" title={copy.paused}>
            {pausedReason ? <p>Lý do: {pausedReason}</p> : <p>Không ghi lý do.</p>}
          </Notice>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <div>
            <Button
              type="button"
              className="min-h-11"
              onClick={() => apply(false)}
              disabled={pending}
              aria-disabled={pending}
            >
              {pending ? <Loader2 aria-hidden className="animate-spin" /> : <PlayCircle aria-hidden />}
              {pending ? "Đang bật lại…" : "Bật lại"}
            </Button>
          </div>
        </>
      ) : (
        <>
          <Notice tone="success" role="status" title={copy.active} />
          <FormField
            id={`${uid}-reason`}
            label="Lý do tạm ngưng"
            hint="Không bắt buộc. Ví dụ: Bếp sửa chữa tới hết tháng 11."
          >
            <Textarea
              id={`${uid}-reason`}
              rows={3}
              maxLength={PAUSE_REASON_MAX}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-describedby={describedBy(`${uid}-reason`, true, null)}
              className="min-h-20 bg-surface sm:max-w-xl"
            />
          </FormField>
          <AlertDialog
            open={open}
            onOpenChange={(next) => {
              if (pending) return;
              setError(null);
              setOpen(next);
            }}
          >
            <AlertDialogTrigger asChild>
              <Button type="button" variant="outline" className="min-h-11 w-fit">
                <PauseCircle aria-hidden />
                {copy.action}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="data-[size=default]:max-w-[calc(100%-2rem)] data-[size=default]:sm:max-w-md">
              <AlertDialogHeader className="place-items-start text-left">
                <AlertDialogTitle className="text-lg font-semibold">{copy.question}</AlertDialogTitle>
                <AlertDialogDescription className="text-left text-ink-muted">
                  {copy.effect}
                </AlertDialogDescription>
              </AlertDialogHeader>
              {error ? (
                <p
                  role="alert"
                  className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger"
                >
                  {error}
                </p>
              ) : null}
              <AlertDialogFooter>
                <AlertDialogCancel disabled={pending} className="min-h-11">
                  Quay lại
                </AlertDialogCancel>
                <Button type="button" className="min-h-11" onClick={() => apply(true)} disabled={pending}>
                  {pending ? <Loader2 aria-hidden className="animate-spin" /> : <PauseCircle aria-hidden />}
                  {pending ? "Đang lưu…" : "Tạm ngưng"}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </Section>
  );
}
