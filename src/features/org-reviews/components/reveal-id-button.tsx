"use client";

import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { revealRepresentativeIdAction } from "../actions";

/** Số đầy đủ chỉ hiện trong 60 giây rồi tự ẩn (mỗi lần hiện là một dòng nhật ký `representative_id.reveal`). */
const SHOW_MS = 60_000;

/**
 * "Hiện số" CCCD đầy đủ cho Admin duyệt (B2): gọi `reveal_representative_id` (aal2), tự ẩn sau 60 giây. Không có
 * nút sao chép — chỉ để đối chiếu bằng mắt với giấy tờ/cuộc gọi.
 */
export function RevealIdButton({ orgId }: { orgId: string }) {
  const [value, setValue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!value) return;
    const t = setTimeout(() => setValue(null), SHOW_MS);
    return () => clearTimeout(t);
  }, [value]);

  const reveal = () => {
    setError(null);
    startTransition(async () => {
      const res = await revealRepresentativeIdAction(orgId).catch(() => null);
      if (res?.ok) setValue(res.idNumber);
      else setError(res?.message ?? "Chưa hiện được số. Vui lòng thử lại.");
    });
  };

  return (
    <div className="flex flex-col gap-1.5">
      {value ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-lg tracking-wider text-ink tabular-nums" data-revealed-id>
            {value}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-11 md:min-h-9"
            onClick={() => setValue(null)}
          >
            <EyeOff aria-hidden />
            Ẩn số
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11 w-fit md:min-h-9"
          onClick={reveal}
          disabled={pending}
          aria-busy={pending}
        >
          {pending ? <Loader2 aria-hidden className="animate-spin" /> : <Eye aria-hidden />}
          Hiện số
        </Button>
      )}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : (
        <p className="text-xs text-ink-subtle">Mỗi lần hiện số đều được ghi nhật ký; số tự ẩn sau 60 giây.</p>
      )}
    </div>
  );
}
