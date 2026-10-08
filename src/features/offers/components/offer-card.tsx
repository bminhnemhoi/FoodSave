import { CalendarClock, ChevronRight, ClipboardList, MapPin, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { LiveFreshness } from "@/components/labels/live-freshness";
import { formatQty } from "@/features/catalog/labels";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import { CategoryIcon, offerPhotoUrl } from "../category-icons";
import { formatDeadline, formatWindow } from "../datetime";
import type { InventoryOffer } from "../queries";
import { OfferActions } from "./offer-actions";
import { QuantityLine } from "./quantity-summary";
import { OfferStatusBadge } from "./status-badges";

/** Ảnh lô 64/96 px, `object-cover`; không có ảnh ⇒ icon danh mục (DESIGN-SYSTEM §2.3). */
export function OfferThumb({
  photoPath,
  icon,
  size = "md",
  className,
}: {
  photoPath: string | null;
  icon: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const px = size === "sm" ? 48 : size === "md" ? 72 : 96;
  return (
    <div
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-lg border bg-role-accent-soft text-role-accent",
        size === "sm" ? "size-12" : size === "md" ? "size-16 sm:size-[4.5rem]" : "size-24",
        className,
      )}
    >
      {photoPath ? (
        <Image
          src={offerPhotoUrl(photoPath)}
          alt=""
          width={px}
          height={px}
          unoptimized
          className="size-full object-cover"
        />
      ) : (
        <CategoryIcon iconName={icon} className={size === "sm" ? "size-6" : "size-8"} strokeWidth={1.75} />
      )}
    </div>
  );
}

/**
 * Thẻ lô trong "Lô tặng" (P2-06, US-STO-10): nhãn + đếm ngược cho lô đang mở, số lượng đã đăng/giữ/lấy/còn,
 * số yêu cầu chờ xác nhận, thao tác nhanh. Lô nháp/đã kết thúc hiện thông tin phù hợp trạng thái.
 */
export function OfferCard({
  offer,
  serverNow,
  showSite,
  canCancel,
}: {
  offer: InventoryOffer;
  serverNow: number;
  showSite: boolean;
  canCancel: boolean;
}) {
  const now = new Date(serverNow);
  const href = `/store/inventory/${offer.id}`;
  const live = offer.status === "open" || offer.status === "fully_allocated";
  const closed = !live && offer.status !== "draft";
  const { stats } = offer;

  return (
    <article
      aria-labelledby={`offer-${offer.id}`}
      className={cn(
        "flex h-full gap-3 rounded-xl border bg-surface p-4 shadow-1 sm:gap-4",
        offer.label === "red" && "border-label-red-border",
      )}
    >
      <OfferThumb photoPath={offer.photoPath} icon={offer.icon} />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <div className="min-w-0">
            <h3 id={`offer-${offer.id}`} className="text-base leading-snug font-semibold">
              <Link
                href={href}
                className="rounded-sm underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                {offer.title}
              </Link>
            </h3>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-ink-muted">
              <span>{offer.categoryName}</span>
              {showSite && offer.siteName ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin aria-hidden className="size-3.5" />
                  {offer.siteName}
                </span>
              ) : null}
              {offer.aiAssisted ? (
                <span className="inline-flex items-center gap-1 text-info">
                  <Sparkles aria-hidden className="size-3.5" />
                  AI hỗ trợ điền
                </span>
              ) : null}
            </p>
          </div>
          {live && offer.effectiveDeadline ? (
            <LiveFreshness
              deadline={offer.effectiveDeadline}
              serverNow={serverNow}
              perishability={offer.perishability}
              size="sm"
            />
          ) : (
            <OfferStatusBadge status={offer.status} />
          )}
        </div>

        {live ? (
          <>
            {offer.effectiveDeadline ? (
              <p className="flex items-center gap-1.5 text-sm text-ink-muted">
                <CalendarClock aria-hidden className="size-4 shrink-0" />
                <span>
                  Hạn hiệu lực{" "}
                  <span className="font-medium text-ink tabular-nums">
                    {formatDeadline(new Date(offer.effectiveDeadline), now)}
                  </span>
                  {offer.status === "fully_allocated" ? " · đã được giữ hết" : null}
                </span>
              </p>
            ) : null}
            <QuantityLine
              quantity={offer.quantity}
              committed={offer.committed}
              picked={stats.picked}
              available={offer.available}
              unit={offer.unit}
              unitWeightKg={offer.unitWeightKg}
            />
          </>
        ) : offer.status === "draft" ? (
          <p className="text-sm text-ink-muted">
            <span className="tabular-nums">{formatQty(offer.quantity, offer.unit)}</span>
            {offer.pickupStart && offer.pickupEnd ? (
              <>
                {" · Lấy "}
                <span className="tabular-nums">
                  {formatWindow(new Date(offer.pickupStart), new Date(offer.pickupEnd), now)}
                </span>
              </>
            ) : null}
            {" · Sửa lần cuối "}
            {formatRelativeTime(offer.updatedAt, now)}
          </p>
        ) : closed ? (
          <p className="text-sm text-ink-muted">
            {offer.closedAt ? <>Kết thúc {formatDateTime(offer.closedAt)}</> : null}
            {offer.unclaimed !== null && offer.unclaimed > 0 ? (
              <>
                {" · "}
                <span className="font-medium text-ink tabular-nums">
                  {formatQty(offer.unclaimed, offer.unit)}
                </span>{" "}
                chưa được nhận
              </>
            ) : null}
            {stats.picked > 0 ? (
              <>
                {" · Đã lấy "}
                <span className="tabular-nums">{formatQty(stats.picked, offer.unit)}</span>
              </>
            ) : null}
            {offer.status === "cancelled" && offer.cancelReason ? <> · Lý do: {offer.cancelReason}</> : null}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2">
          {live && stats.pending > 0 ? (
            <Link
              href={`${href}#yeu-cau`}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-warning/30 bg-warning-soft px-3 text-sm font-medium text-warning hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none md:min-h-9"
            >
              <ClipboardList aria-hidden className="size-4" />
              {stats.pending} yêu cầu chờ xác nhận
              <ChevronRight aria-hidden className="size-4" />
            </Link>
          ) : (
            <span />
          )}
          {closed ? (
            <Link
              href={href}
              className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline md:min-h-9"
            >
              Xem chi tiết
              <ChevronRight aria-hidden className="size-4" />
            </Link>
          ) : (
            <OfferActions
              status={offer.status}
              canCancel={canCancel}
              offer={{
                id: offer.id,
                title: offer.title,
                unit: offer.unit,
                quantity: offer.quantity,
                committed: offer.committed,
                picked: stats.picked,
                pending: stats.pending,
                confirmed: stats.confirmed,
              }}
            />
          )}
        </div>
      </div>
    </article>
  );
}
