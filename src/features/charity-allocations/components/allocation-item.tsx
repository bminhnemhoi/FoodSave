import { Clock3, Home, PackageCheck, Route, Store } from "lucide-react";
import Link from "next/link";

import { Countdown } from "@/components/labels/live-freshness";
import { Button } from "@/components/ui/button";
import { formatKg, formatQty } from "@/features/catalog/labels";
import { OrgContactButton } from "@/features/contacts/components/org-contact-button";

import { formatDayTime, formatWindow } from "../present";
import type { CharityAllocation } from "../queries";
import { AllocationStatusBadge } from "./allocation-status-badge";
import { CancelAllocationButton } from "./cancel-allocation-button";

const CANCEL_ACTOR_TEXT: Record<string, string> = {
  charity: "Tổ chức đã hủy",
  store: "Cửa hàng đã hủy",
  admin: "FoodSave đã hủy",
  system: "Hệ thống đã đóng",
};

/** Một phân bổ trong Tổng quan: lô, cửa hàng, số lượng (≈ kg), mốc thời gian theo trạng thái, hành động. */
export function AllocationItem({
  a,
  serverNow,
  canCancel,
  showSite,
}: {
  a: CharityAllocation;
  serverNow: number;
  canCancel: boolean;
  /** Tổ chức có nhiều điểm nhận ⇒ hiện tên điểm nhận. */
  showSite: boolean;
}) {
  const now = new Date(serverNow);
  const qty = a.status === "delivered" ? a.qtyDelivered : a.status === "picked_up" ? a.qtyPicked : a.qtyHeld;
  const kg = a.status === "delivered" ? a.kgDelivered : qty * a.unitWeightKg;
  const cancellable = a.status === "requested" || a.status === "confirmed" || a.status === "assigned";
  const window =
    a.pickupStart && a.pickupEnd ? { start: new Date(a.pickupStart), end: new Date(a.pickupEnd) } : null;

  return (
    <article
      aria-label={`${a.offerTitle} — ${a.storeName}`}
      className="flex flex-col gap-3 rounded-lg border bg-surface p-4 shadow-1 sm:flex-row sm:items-start sm:justify-between"
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-base font-semibold text-pretty">{a.offerTitle}</h4>
          <AllocationStatusBadge status={a.status} />
          {a.packedAt && (a.status === "confirmed" || a.status === "assigned") ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success-soft px-2 py-0.5 text-xs font-medium text-success">
              <PackageCheck aria-hidden className="size-3.5" />
              Cửa hàng đã đóng gói
            </span>
          ) : null}
        </div>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
          <span className="inline-flex items-center gap-1">
            <Store aria-hidden className="size-4" />
            {a.storeName}
            {a.storeSiteName && a.storeSiteName !== a.storeName ? ` · ${a.storeSiteName}` : ""}
          </span>
          <span className="font-medium text-ink tabular-nums">
            {formatQty(qty, a.unit)}
            {a.unit !== "kg" ? <span className="font-normal text-ink-muted"> (≈ {formatKg(kg)})</span> : null}
          </span>
          {showSite ? (
            <span className="inline-flex items-center gap-1">
              <Home aria-hidden className="size-4 text-role-accent" />
              {a.charitySiteName}
            </span>
          ) : null}
        </p>

        <p className="flex items-start gap-1.5 text-sm text-ink-muted tabular-nums">
          <Clock3 aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-subtle" />
          <span>
            {a.status === "requested" && a.reservedUntil ? (
              <>
                Cửa hàng cần trả lời trước {formatDayTime(a.reservedUntil, now)} (
                <Countdown deadline={a.reservedUntil} serverNow={serverNow} />)
              </>
            ) : a.status === "confirmed" || a.status === "assigned" ? (
              <>
                Lấy trong khung {formatWindow(window, now)}
                {a.effectiveDeadline ? ` · hạn hiệu lực ${formatDayTime(a.effectiveDeadline, now)}` : ""}
              </>
            ) : a.status === "picked_up" ? (
              <>Đã lấy {formatQty(a.qtyPicked, a.unit)} — đang mang về điểm nhận</>
            ) : a.status === "delivered" && a.deliveredAt ? (
              <>Đã nhận lúc {formatDayTime(a.deliveredAt, now)}</>
            ) : a.closedAt ? (
              <>
                {a.status === "cancelled"
                  ? (CANCEL_ACTOR_TEXT[a.cancelActor ?? ""] ?? "Đã hủy")
                  : a.status === "rejected"
                    ? "Cửa hàng từ chối"
                    : "Hết hạn"}{" "}
                lúc {formatDayTime(a.closedAt, now)}
                {a.cancelReason ? ` — ${a.cancelReason}` : ""}
              </>
            ) : (
              <>Gửi yêu cầu lúc {formatDayTime(a.requestedAt, now)}</>
            )}
          </span>
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
        {a.status === "requested" ||
        a.status === "confirmed" ||
        a.status === "assigned" ||
        a.status === "picked_up" ? (
          <OrgContactButton orgId={a.storeOrgId} orgName={a.storeName} subject={a.offerTitle} />
        ) : null}
        {a.pickupId && (a.status === "assigned" || a.status === "picked_up" || a.status === "delivered") ? (
          <Button asChild variant="outline" size="sm">
            <Link href={`/charity/pickups/${a.pickupId}`}>
              <Route aria-hidden />
              Mở chuyến
            </Link>
          </Button>
        ) : null}
        {cancellable && canCancel ? (
          <CancelAllocationButton
            allocationId={a.id}
            status={a.status as "requested" | "confirmed" | "assigned"}
            title={a.offerTitle}
            storeName={a.storeName}
            packed={!!a.packedAt}
          />
        ) : null}
      </div>
    </article>
  );
}
