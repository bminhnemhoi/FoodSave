"use client";

import {
  Bike,
  Clock3,
  EyeOff,
  HandHeart,
  LocateOff,
  MapPin,
  Navigation,
  ShieldCheck,
  Store,
} from "lucide-react";

import { LiveFreshness } from "@/components/labels/live-freshness";
import { Button } from "@/components/ui/button";
import { formatKg, formatQty } from "@/features/catalog/labels";
import { formatMinutes, formatWindow } from "@/features/charity-allocations/present";
import { OrgContactButton } from "@/features/contacts/components/org-contact-button";
import { formatDecimal, formatDistance } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { MarketOffer } from "../queries";
import { OfferThumb } from "./category-icon";

type OfferCardProps = {
  offer: MarketOffer;
  serverNow: number;
  selected: boolean;
  /** Đang có bản đồ cạnh danh sách (desktop) hoặc chuyển được sang bản đồ (mobile). */
  canShowOnMap: boolean;
  disabledReason?: string | null;
  onShowOnMap: () => void;
  onRequest: () => void;
  onHover?: (hovering: boolean) => void;
  /** Thẻ gọn trong khung bản đồ mobile. */
  compact?: boolean;
};

/**
 * Thẻ lô ở Kho tặng (DESIGN-SYSTEM §11.2 OfferCard, US-CHA-05 AC3): ảnh/icon danh mục, tên lô, cửa hàng + uy tín,
 * nhãn tươi + đếm ngược, còn lại (≈ kg), khoảng cách, ETA xe máy (ước tính "~"), khung giờ lấy, nút "Xin nhận".
 */
export function OfferCard({
  offer,
  serverNow,
  selected,
  canShowOnMap,
  disabledReason,
  onShowOnMap,
  onRequest,
  onHover,
  compact = false,
}: OfferCardProps) {
  const titleId = `offer-title-${compact ? "map-" : ""}${offer.offerId}`;
  const kg = offer.qtyAvailable * offer.unitWeightKg;
  const now = new Date(serverNow);
  const hasLocation = offer.lat !== null && offer.lng !== null;

  return (
    <article
      id={compact ? undefined : `offer-${offer.offerId}`}
      aria-labelledby={titleId}
      data-site={offer.storeSiteId}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      onFocus={() => onHover?.(true)}
      onBlur={() => onHover?.(false)}
      className={cn(
        "@container flex scroll-mt-40 flex-col gap-3 rounded-lg border bg-surface p-4 shadow-1 transition-colors duration-100",
        selected ? "border-primary bg-primary-soft/40 ring-1 ring-primary" : "hover:border-border-strong/50",
      )}
    >
      <div className="flex gap-3 sm:gap-4">
        <OfferThumb photoUrl={offer.photoUrl} icon={offer.categoryIcon} title={offer.title} />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h3 id={titleId} className="text-base leading-snug font-semibold text-pretty sm:text-lg">
            {offer.title}
          </h3>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-ink-muted">
            <span className="inline-flex min-w-0 items-center gap-1">
              <Store aria-hidden className="size-4 shrink-0" />
              <span className="truncate">{offer.storeName}</span>
            </span>
            <span
              className="inline-flex items-center gap-1 text-ink-subtle tabular-nums"
              title="Điểm uy tín của cửa hàng (0–100), tính từ lịch sử bàn giao"
            >
              <ShieldCheck aria-hidden className="size-3.5" />
              Uy tín {formatDecimal(offer.trustScore)}
            </span>
          </p>
          <p className="text-sm text-ink-subtle">{offer.categoryName}</p>
          <LiveFreshness
            deadline={offer.effectiveDeadline}
            serverNow={serverNow}
            perishability={offer.perishability}
            size="sm"
          />
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm @xl:grid-cols-3">
        <div className="flex flex-col">
          <dt className="text-xs text-ink-subtle">Còn lại</dt>
          <dd className="font-semibold text-ink tabular-nums">
            {formatQty(offer.qtyAvailable, offer.unit)}
            {offer.unit !== "kg" ? (
              <span className="font-normal text-ink-muted"> · ≈ {formatKg(kg)}</span>
            ) : null}
          </dd>
        </div>
        <div className="flex flex-col">
          <dt className="text-xs text-ink-subtle">Khoảng cách · xe máy</dt>
          <dd className="flex flex-wrap items-center gap-x-2 text-ink tabular-nums">
            <span className="inline-flex items-center gap-1">
              <Navigation aria-hidden className="size-3.5 text-ink-subtle" />
              {formatDistance(offer.distanceKm * 1000)}
            </span>
            <span
              className="inline-flex items-center gap-1"
              title="Ước tính: đường chim bay × 1,4 ở 18 km/h + 10 phút"
            >
              <Bike aria-hidden className="size-3.5 text-ink-subtle" />~{formatMinutes(offer.travelMin)}
            </span>
          </dd>
        </div>
        <div className="col-span-2 flex flex-col @xl:col-span-1">
          <dt className="text-xs text-ink-subtle">Khung giờ lấy</dt>
          <dd className="inline-flex items-center gap-1 text-ink tabular-nums">
            <Clock3 aria-hidden className="size-3.5 text-ink-subtle" />
            {offer.pickupStart && offer.pickupEnd
              ? formatWindow({ start: new Date(offer.pickupStart), end: new Date(offer.pickupEnd) }, now)
              : "—"}
          </dd>
        </div>
      </dl>

      {offer.approximate || !hasLocation ? (
        <p className="inline-flex items-center gap-1.5 text-xs text-ink-subtle">
          {hasLocation ? (
            <>
              <LocateOff aria-hidden className="size-3.5" /> Vị trí gần đúng — địa chỉ chính xác hiện khi bạn
              lên chuyến
            </>
          ) : (
            <>
              <EyeOff aria-hidden className="size-3.5" /> Vị trí được ẩn — địa chỉ hiện khi bạn lên chuyến
            </>
          )}
        </p>
      ) : null}

      {disabledReason ? <p className="text-sm text-warning">{disabledReason}</p> : null}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {!compact ? (
          <OrgContactButton
            orgId={offer.storeOrgId}
            orgName={offer.storeName}
            subject={offer.title}
            className="mr-auto"
          />
        ) : null}
        {canShowOnMap && hasLocation ? (
          <Button type="button" variant="ghost" size="sm" onClick={onShowOnMap} aria-describedby={titleId}>
            <MapPin aria-hidden />
            Xem trên bản đồ
          </Button>
        ) : null}
        <Button type="button" onClick={onRequest} disabled={!!disabledReason} aria-describedby={titleId}>
          <HandHeart aria-hidden />
          Xin nhận
        </Button>
      </div>
    </article>
  );
}
