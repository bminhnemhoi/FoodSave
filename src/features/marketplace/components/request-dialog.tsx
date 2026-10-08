"use client";

import { AlarmClock, CircleAlert, HandHeart, Home, Loader2, Store } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { LiveFreshness } from "@/components/labels/live-freshness";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatKg, formatQty, UNIT_LABEL } from "@/features/catalog/labels";
import { formatDayTime, formatMinutes, formatWindow } from "@/features/charity-allocations/present";
import { freshnessLabel } from "@/core/labels";
import { formatDistance } from "@/lib/format";

import { requestOffer } from "../actions";
import { defaultQty, estimateKg, maxRequestable, parseQty, qtyInputValue, validateQty } from "../qty";
import type { MarketOffer } from "../queries";
import { QtyStepper } from "./qty-stepper";

type RequestDialogProps = {
  offer: MarketOffer | null;
  site: { id: string; name: string };
  serverNow: number;
  onOpenChange: (open: boolean) => void;
};

/** Hộp thoại "Xin nhận" — mỗi lần mở là một phiên mới (state reset theo `key` ở nơi gọi). */
export function RequestDialog({ offer, site, serverNow, onOpenChange }: RequestDialogProps) {
  return (
    <Dialog open={offer !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        {offer ? (
          <RequestForm
            key={offer.offerId}
            offer={offer}
            site={site}
            serverNow={serverNow}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function RequestForm({
  offer,
  site,
  serverNow,
  onDone,
}: {
  offer: MarketOffer;
  site: { id: string; name: string };
  serverNow: number;
  onDone: () => void;
}) {
  const router = useRouter();
  const fieldId = useId();
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;
  const [available, setAvailable] = useState(offer.qtyAvailable);
  const [raw, setRaw] = useState(() => qtyInputValue(defaultQty(offer.qtyAvailable, offer.unit)));
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState<{ message: string; available?: number } | null>(null);
  const [pending, startTransition] = useTransition();
  // Một client_op_id cho mỗi ý định (lô + số lượng + điểm nhận): gửi lại cùng ý định không tạo yêu cầu trùng.
  const opRef = useRef<{ key: string; id: string } | null>(null);

  const qty = parseQty(raw);
  const max = maxRequestable(available, offer.unit);
  const qtyError = validateQty(qty, offer.unit, max);
  const kg = estimateKg(qty, offer.unitWeightKg);
  const now = new Date(serverNow);
  const isRed = freshnessLabel(new Date(offer.effectiveDeadline), offer.perishability, new Date()) === "red";
  const unitLabel = UNIT_LABEL[offer.unit];

  function opIdFor(q: number): string {
    const key = `${offer.offerId}:${q}:${site.id}`;
    if (!opRef.current || opRef.current.key !== key) opRef.current = { key, id: crypto.randomUUID() };
    return opRef.current.id;
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (qtyError || qty === null) {
      document.getElementById(fieldId)?.focus();
      return;
    }
    setServerError(null);
    startTransition(async () => {
      const res = await requestOffer({
        offerId: offer.offerId,
        siteId: site.id,
        qty,
        clientOpId: opIdFor(qty),
      });
      if (!res.ok) {
        if (res.error.code === "insufficient_quantity" && res.error.available !== undefined) {
          setAvailable(res.error.available);
        }
        setServerError({ message: res.error.message, available: res.error.available });
        return;
      }
      const confirmed = res.data.status === "confirmed";
      toast.success(
        confirmed
          ? `Cửa hàng đã tự động xác nhận ${formatQty(qty, offer.unit)} ${offer.title}.`
          : `Đã gửi yêu cầu nhận ${formatQty(qty, offer.unit)} ${offer.title}. FoodSave sẽ báo bạn khi ${offer.storeName} trả lời.`,
        {
          duration: 6000,
          action: { label: "Xem yêu cầu của tôi", onClick: () => router.push("/charity#yeu-cau-cua-toi") },
        },
      );
      onDone();
      router.refresh();
    });
  }

  const showQtyError = touched && qtyError;

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <DialogHeader className="pr-8">
        <DialogTitle className="text-lg leading-snug font-semibold">Xin nhận: {offer.title}</DialogTitle>
        <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="inline-flex items-center gap-1">
            <Store aria-hidden className="size-4" />
            {offer.storeName}
          </span>
          <span className="tabular-nums">
            · {formatDistance(offer.distanceKm * 1000)} · ~{formatMinutes(offer.travelMin)} xe máy
          </span>
        </DialogDescription>
      </DialogHeader>

      <LiveFreshness
        deadline={offer.effectiveDeadline}
        serverNow={serverNow}
        perishability={offer.perishability}
      />

      {isRed ? (
        <p className="flex items-start gap-2 rounded-md border border-label-red-border bg-label-red-bg px-3 py-2 text-sm text-label-red-fg">
          <AlarmClock aria-hidden className="mt-0.5 size-4 shrink-0" />
          Lô này cần được lấy trước {formatDayTime(offer.effectiveDeadline, now)}. Chỉ nhận nếu bạn đến kịp.
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <label htmlFor={fieldId} className="text-sm font-medium text-ink">
          Số lượng xin nhận ({unitLabel})
        </label>
        <QtyStepper
          id={fieldId}
          value={raw}
          onChange={(v) => {
            setRaw(v);
            setTouched(true);
            setServerError(null);
          }}
          unit={offer.unit}
          max={max}
          invalid={!!showQtyError}
          describedBy={showQtyError ? `${errorId} ${hintId}` : hintId}
          disabled={pending}
        />
        <p id={hintId} className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink-subtle">
          <span className="tabular-nums">
            Tối đa {formatQty(max, offer.unit)}
            {kg !== null && !showQtyError && offer.unit !== "kg" ? ` · ≈ ${formatKg(kg)}` : ""}
          </span>
          {qty !== max && max > 0 ? (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto px-0"
              onClick={() => {
                setRaw(qtyInputValue(max));
                setServerError(null);
              }}
            >
              Nhận hết {formatQty(max, offer.unit)}
            </Button>
          ) : null}
        </p>
        {showQtyError ? (
          <p id={errorId} className="flex items-start gap-1.5 text-sm text-danger">
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {qtyError}
          </p>
        ) : null}
      </div>

      <section aria-label="Tóm tắt yêu cầu" className="rounded-lg border bg-bg-sunken p-3 text-sm">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
          <dt className="text-ink-subtle">Điểm nhận</dt>
          <dd className="inline-flex items-center gap-1 font-medium text-ink">
            <Home aria-hidden className="size-4 text-role-accent" />
            {site.name}
          </dd>
          <dt className="text-ink-subtle">Số lượng</dt>
          <dd className="font-medium text-ink tabular-nums">
            {qty !== null && !qtyError ? formatQty(qty, offer.unit) : "—"}
            {kg !== null && !qtyError && offer.unit !== "kg" ? (
              <span className="font-normal text-ink-muted"> (≈ {formatKg(kg)})</span>
            ) : null}
          </dd>
          <dt className="text-ink-subtle">Khung giờ lấy</dt>
          <dd className="text-ink tabular-nums">
            {offer.pickupStart && offer.pickupEnd
              ? formatWindow({ start: new Date(offer.pickupStart), end: new Date(offer.pickupEnd) }, now)
              : "—"}
          </dd>
          <dt className="text-ink-subtle">Hạn hiệu lực</dt>
          <dd className="font-medium text-ink tabular-nums">{formatDayTime(offer.effectiveDeadline, now)}</dd>
        </dl>
        <p className="mt-2 text-xs text-ink-muted">
          Số lượng được giữ cho tổ chức ngay khi gửi. Cửa hàng xác nhận xong, bạn tạo chuyến tự đến lấy ở mục
          Chuyến lấy hàng. Đổi điểm nhận ở bộ lọc phía trên Kho tặng.
        </p>
      </section>

      {serverError ? (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger"
        >
          <p className="flex items-start gap-2">
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>
              {serverError.message}
              {serverError.available !== undefined && serverError.available > 0
                ? ` Chỉ còn ${formatQty(serverError.available, offer.unit)} — bạn có muốn nhận ${formatQty(serverError.available, offer.unit)}?`
                : ""}
              {serverError.available === 0 ? " Lô đã được giữ hết." : ""}
            </span>
          </p>
          {serverError.available !== undefined && maxRequestable(serverError.available, offer.unit) > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => {
                setRaw(qtyInputValue(maxRequestable(serverError.available!, offer.unit)));
                setServerError(null);
              }}
            >
              Nhận {formatQty(maxRequestable(serverError.available, offer.unit), offer.unit)}
            </Button>
          ) : null}
        </div>
      ) : null}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          Quay lại
        </Button>
        <Button type="submit" disabled={pending || max <= 0} aria-busy={pending || undefined}>
          {pending ? <Loader2 aria-hidden className="animate-spin" /> : <HandHeart aria-hidden />}
          Gửi yêu cầu
        </Button>
      </DialogFooter>
    </form>
  );
}
