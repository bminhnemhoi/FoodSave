"use client";

import {
  BadgeCheck,
  Check,
  EyeOff,
  Loader2,
  LocateOff,
  MapPin,
  PackageCheck,
  PackageX,
  ShieldCheck,
  Undo2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { Countdown } from "@/components/labels/live-freshness";
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
import { formatKg, formatQty } from "@/features/catalog/labels";
import { CallVolunteerButton } from "@/features/contacts/components/call-volunteer-button";
import { OrgContactButton } from "@/features/contacts/components/org-contact-button";
import { SHORTFALL_REASON_LABEL } from "@/features/handover/labels";
import { formatDeadline } from "@/features/offers/datetime";
import { ReasonPicker } from "@/features/offers/components/reason-picker";
import { AllocationStatusBadge } from "@/features/offers/components/status-badges";
import { NETWORK_ERROR, useOpId } from "@/features/offers/use-op-id";
import { orgSubtypeLabel } from "@/features/organizations/labels";
import { formatDecimal, formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import { confirmRequest, rejectRequest, setPacked } from "../actions";
import type { StoreAllocation } from "../queries";
import { PACK_UNDO_MS, REJECT_REASONS } from "../schemas";

/** Nút xác nhận phá hủy: nền `--danger` đặc, chữ trắng (6,6:1 — DESIGN-SYSTEM §3.5, §12.5). */
const DANGER_SOLID =
  "bg-danger text-primary-foreground hover:bg-danger/90 focus-visible:border-danger focus-visible:ring-danger/30";

/**
 * Một yêu cầu nhận lô / phân bổ ở phía cửa hàng (P2-10; US-STO-13, US-STO-16):
 * tổ chức (tên, loại hình, điểm uy tín), số lượng, thời điểm gửi, hạn phản hồi, điểm nhận ở đúng mức riêng tư
 * mà RLS cho thấy (`approximate`/`hidden` chỉ hiện phường/xã). Không bao giờ hiển thị vị trí tình nguyện viên.
 */

function qtyText(a: StoreAllocation): string {
  const live = a.qtyReserved - a.qtyReleased;
  return `${formatQty(live, a.unit)} (≈ ${formatKg(live * a.unitWeightKg)})`;
}

function ReceivingSite({ site }: { site: StoreAllocation["receivingSite"] }) {
  if (!site) {
    return (
      <span className="inline-flex items-center gap-1">
        <LocateOff aria-hidden className="size-3.5" />
        Điểm nhận không còn hiển thị
      </span>
    );
  }
  if (site.visibility === "public") {
    return (
      <span className="inline-flex min-w-0 items-start gap-1">
        <MapPin aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        <span className="min-w-0">
          {site.name}
          {site.area ? ` — ${site.area}` : ""}
        </span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-start gap-1">
      <EyeOff aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      <span>
        {site.area || "Khu vực được ẩn"} ·{" "}
        {site.visibility === "approximate" ? "vị trí gần đúng để bảo vệ tổ chức" : "vị trí được ẩn"}
      </span>
    </span>
  );
}

export function RequestCard({
  allocation: a,
  serverNow,
  showOffer = false,
  headingLevel = 3,
}: {
  allocation: StoreAllocation;
  serverNow: number;
  showOffer?: boolean;
  headingLevel?: 3 | 4;
}) {
  const router = useRouter();
  const now = new Date(serverNow);
  const confirmOp = useOpId();
  const [pending, startTransition] = useTransition();
  const [rejectOpen, setRejectOpen] = useState(false);
  const Heading = headingLevel === 3 ? "h3" : "h4";
  const charityName = a.charity?.name ?? "Tổ chức (không còn hoạt động)";

  const confirm = () => {
    startTransition(async () => {
      try {
        const res = await confirmRequest({ allocationId: a.id, clientOpId: confirmOp.get() });
        confirmOp.reset();
        if (!res.ok) {
          toast.error(res.error.message);
          router.refresh();
          return;
        }
        toast.success(`Đã xác nhận ${formatQty(a.qtyReserved - a.qtyReleased, a.unit)} cho ${charityName}.`);
        router.refresh();
      } catch {
        toast.error(NETWORK_ERROR);
      }
    });
  };

  return (
    <article
      aria-labelledby={`alloc-${a.id}`}
      className={cn(
        "flex flex-col gap-3 rounded-xl border bg-surface p-4 shadow-1",
        a.status === "requested" && "border-warning/40",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Heading id={`alloc-${a.id}`} className="text-base leading-snug font-semibold">
            {charityName}
          </Heading>
          {a.charity ? (
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-ink-muted">
              <span>{orgSubtypeLabel("charity", a.charity.subtype)}</span>
              <span className="inline-flex items-center gap-1">
                <ShieldCheck aria-hidden className="size-3.5" />
                <span>
                  Uy tín <span className="tabular-nums">{formatDecimal(a.charity.trustScore)}/100</span>
                </span>
              </span>
            </p>
          ) : null}
        </div>
        <AllocationStatusBadge status={a.status} />
      </div>

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-ink-muted">Số lượng</dt>
        <dd className="font-semibold tabular-nums">{qtyText(a)}</dd>
        {showOffer ? (
          <>
            <dt className="text-ink-muted">Lô</dt>
            <dd>
              <Link
                href={`/store/inventory/${a.offerId}#yeu-cau`}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                {a.offerTitle}
              </Link>
            </dd>
          </>
        ) : null}
        <dt className="text-ink-muted">Gửi yêu cầu</dt>
        <dd>
          <time dateTime={a.requestedAt} suppressHydrationWarning>
            {formatRelativeTime(a.requestedAt, now)}
          </time>
        </dd>
        <dt className="text-ink-muted">Điểm nhận</dt>
        <dd className="text-ink-muted">
          <ReceivingSite site={a.receivingSite} />
        </dd>
        {a.status === "requested" && a.reservedUntil ? (
          <>
            <dt className="text-ink-muted">Cần phản hồi</dt>
            <dd className="tabular-nums">
              trước {formatDeadline(new Date(a.reservedUntil), now)} ·{" "}
              <Countdown
                deadline={a.reservedUntil}
                serverNow={serverNow}
                className="font-medium text-warning"
              />
            </dd>
          </>
        ) : null}
        {a.confirmedAt && (a.status === "confirmed" || a.status === "assigned") ? (
          <>
            <dt className="text-ink-muted">Xác nhận</dt>
            <dd className="inline-flex items-center gap-1">
              <BadgeCheck aria-hidden className="size-3.5 text-info" />
              {formatDeadline(new Date(a.confirmedAt), now)}
              {a.autoConfirmed ? " (tự động chấp nhận)" : ""}
            </dd>
          </>
        ) : null}
        {a.status === "delivered" ? (
          <>
            <dt className="text-ink-muted">Tổ chức đã nhận</dt>
            <dd className="tabular-nums">
              {formatQty(a.qtyDelivered, a.unit)} (≈ {formatKg(a.qtyDelivered * a.unitWeightKg)})
            </dd>
          </>
        ) : null}
        {a.rejectedOnReceipt ? (
          <>
            <dt className="text-ink-muted">Bị từ chối khi nhận</dt>
            <dd className="inline-flex flex-wrap items-center gap-x-1.5 text-danger">
              <PackageX aria-hidden className="size-3.5 shrink-0" />
              <span>
                <span className="font-medium tabular-nums">{formatQty(a.rejectedOnReceipt.qty, a.unit)}</span>{" "}
                · Lý do: {SHORTFALL_REASON_LABEL[a.rejectedOnReceipt.reason]}
              </span>
            </dd>
          </>
        ) : null}
        {(a.status === "rejected" || a.status === "cancelled") && a.cancelReason ? (
          <>
            <dt className="text-ink-muted">Lý do</dt>
            <dd>{a.cancelReason}</dd>
          </>
        ) : null}
      </dl>

      {a.charity && ["requested", "confirmed", "assigned", "picked_up"].includes(a.status) ? (
        <div className="flex flex-wrap items-center gap-2">
          <OrgContactButton orgId={a.charityOrgId} orgName={charityName} subject={a.offerTitle} />
          {a.status === "assigned" && a.pickupId ? (
            <CallVolunteerButton
              pickupId={a.pickupId}
              fallbackOrg={{ id: a.charityOrgId, name: charityName }}
              className="md:min-h-9"
            />
          ) : null}
        </div>
      ) : null}

      {a.status === "requested" ? (
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="lg"
            disabled={pending}
            onClick={() => setRejectOpen(true)}
          >
            <X aria-hidden />
            Từ chối
          </Button>
          <Button
            type="button"
            size="lg"
            disabled={pending}
            aria-busy={pending || undefined}
            onClick={confirm}
          >
            {pending ? <Loader2 aria-hidden className="animate-spin" /> : <Check aria-hidden />}
            Xác nhận
          </Button>
          <RejectDialog
            allocation={a}
            charityName={charityName}
            open={rejectOpen}
            onOpenChange={setRejectOpen}
          />
        </div>
      ) : a.status === "confirmed" || a.status === "assigned" ? (
        <PackedControl allocation={a} charityName={charityName} />
      ) : null}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Từ chối (lý do bắt buộc — US-STO-13 AC3)
// ---------------------------------------------------------------------------

function RejectDialog({
  allocation: a,
  charityName,
  open,
  onOpenChange,
}: {
  allocation: StoreAllocation;
  charityName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const op = useOpId();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [pending, startTransition] = useTransition();

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
      setError("Vui lòng chọn hoặc nhập lý do từ chối.");
      return;
    }
    setError(null);
    setFormError(null);
    startTransition(async () => {
      try {
        const res = await rejectRequest({ allocationId: a.id, reason, clientOpId: op.get() });
        op.reset();
        if (!res.ok) {
          if (res.error.fieldErrors?.reason) setError(res.error.fieldErrors.reason);
          else setFormError(res.error.message);
          return;
        }
        onOpenChange(false);
        toast.success(`Đã từ chối yêu cầu của ${charityName}. Số lượng đã trả lại lô.`);
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
            Từ chối yêu cầu của {charityName}?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-left">
            {formatQty(a.qtyReserved - a.qtyReleased, a.unit)} sẽ trả lại lô “{a.offerTitle}” cho tổ chức
            khác. {charityName} được báo ngay kèm lý do bạn chọn.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {formError ? (
          <p
            role="alert"
            className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger"
          >
            {formError}
          </p>
        ) : null}
        <ReasonPicker
          key={resetKey}
          legend="Lý do từ chối"
          presets={REJECT_REASONS}
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
            {pending ? <Loader2 aria-hidden className="animate-spin" /> : <X aria-hidden />}
            Từ chối yêu cầu
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------------------------------------------------------------------------
// Đã đóng gói (US-STO-16): đánh dấu + hoàn tác trong 2 phút
// ---------------------------------------------------------------------------

function useClock(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

function PackedControl({ allocation: a, charityName }: { allocation: StoreAllocation; charityName: string }) {
  const router = useRouter();
  const packOp = useOpId();
  const unpackOp = useOpId();
  const [packedAt, setPackedAt] = useState<string | null>(a.packedAt);
  const [synced, setSynced] = useState<string | null>(a.packedAt);
  if (a.packedAt !== synced) {
    setSynced(a.packedAt);
    setPackedAt(a.packedAt);
  }
  const [pending, startTransition] = useTransition();
  const now = useClock(Boolean(packedAt));
  const canUndo = packedAt !== null && now - Date.parse(packedAt) < PACK_UNDO_MS;

  const run = (packed: boolean) => {
    const op = packed ? packOp : unpackOp;
    startTransition(async () => {
      try {
        const res = await setPacked({ allocationId: a.id, packed, clientOpId: op.get() });
        op.reset();
        if (!res.ok) {
          toast.error(res.error.message);
          router.refresh();
          return;
        }
        setPackedAt(res.data.packedAt);
        if (packed) {
          toast.success(`Đã báo ${charityName}: hàng đã đóng gói, sẵn sàng bàn giao.`, {
            action: { label: "Hoàn tác", onClick: () => run(false) },
            duration: 5000,
          });
        } else {
          toast.info("Đã hoàn tác “Đã đóng gói”.");
        }
        router.refresh();
      } catch {
        toast.error(NETWORK_ERROR);
      }
    });
  };

  if (packedAt) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-success/30 bg-success-soft px-3 py-2">
        <p className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
          <PackageCheck aria-hidden className="size-4" />
          Đã đóng gói lúc{" "}
          <time dateTime={packedAt} className="tabular-nums">
            {new Intl.DateTimeFormat("vi-VN", {
              timeZone: "Asia/Ho_Chi_Minh",
              hour: "2-digit",
              minute: "2-digit",
              hourCycle: "h23",
            }).format(new Date(packedAt))}
          </time>
        </p>
        {canUndo ? (
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => run(false)}
            className="min-h-11 md:min-h-9"
          >
            {pending ? <Loader2 aria-hidden className="animate-spin" /> : <Undo2 aria-hidden />}
            Hoàn tác
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-ink-muted">
        Đóng gói xong thì báo để tổ chức và tình nguyện viên biết hàng đã sẵn sàng.
      </p>
      <Button
        type="button"
        variant="outline"
        size="lg"
        disabled={pending}
        aria-busy={pending || undefined}
        onClick={() => run(true)}
      >
        {pending ? <Loader2 aria-hidden className="animate-spin" /> : <PackageCheck aria-hidden />}
        Đánh dấu đã đóng gói
      </Button>
    </div>
  );
}
