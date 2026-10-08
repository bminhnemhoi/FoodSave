import { CalendarClock, FilePen, ShieldCheck, Sparkles } from "lucide-react";

import { LiveFreshness } from "@/components/labels/live-freshness";
import { formatQty, UNIT_LABEL } from "@/features/catalog/labels";
import { formatDateTime } from "@/lib/format";

import { formatDeadline, formatWindow } from "../datetime";
import type { InventoryOffer } from "../queries";
import { formatDecimalInput } from "../schemas";
import { OfferThumb } from "./offer-card";
import { QuantityStats } from "./quantity-summary";
import { OfferStatusBadge } from "./status-badges";

/** Thẻ tóm tắt lô ở trang chi tiết: nhãn + đếm ngược, hạn hiệu lực, số lượng, khung lấy, cam kết an toàn. */
export function OfferSummary({ offer, serverNow }: { offer: InventoryOffer; serverNow: number }) {
  const now = new Date(serverNow);
  const live = offer.status === "open" || offer.status === "fully_allocated";

  const rows: { label: string; value: React.ReactNode }[] = [
    {
      label: "Hạn sử dụng",
      value: (
        <>
          {formatDeadline(new Date(offer.expiresAt), now)}
          {offer.expiryIsDateOnly ? (
            <span className="text-ink-subtle"> (chỉ có ngày, tính đến 23:59)</span>
          ) : null}
        </>
      ),
    },
    {
      label: "Khung giờ lấy",
      value:
        offer.pickupStart && offer.pickupEnd
          ? formatWindow(new Date(offer.pickupStart), new Date(offer.pickupEnd), now)
          : "—",
    },
    {
      label: `Khối lượng mỗi ${UNIT_LABEL[offer.unit]}`,
      value: (
        <>
          {formatDecimalInput(offer.unitWeightKg)} kg
          {offer.unit !== "kg" ? (
            <span className="text-ink-subtle">
              {offer.weightSource === "category_default"
                ? " (ước tính theo danh mục)"
                : " (cửa hàng khai báo)"}
            </span>
          ) : null}
        </>
      ),
    },
  ];
  if (offer.siteName) rows.push({ label: "Chi nhánh", value: offer.siteName });
  if (offer.publishedAt) rows.push({ label: "Đăng lúc", value: formatDateTime(offer.publishedAt) });
  if (offer.closedAt) rows.push({ label: "Kết thúc lúc", value: formatDateTime(offer.closedAt) });
  if (offer.unclaimed !== null && offer.unclaimed > 0)
    rows.push({ label: "Chưa được nhận", value: formatQty(offer.unclaimed, offer.unit) });
  if (offer.cancelReason) rows.push({ label: "Lý do đóng/hủy", value: offer.cancelReason });

  return (
    <section
      aria-labelledby="offer-summary-title"
      className="flex flex-col gap-5 rounded-xl border bg-surface p-4 shadow-1 sm:p-5"
    >
      <h2 id="offer-summary-title" className="sr-only">
        Thông tin lô
      </h2>
      <div className="flex gap-4">
        <OfferThumb photoPath={offer.photoPath} icon={offer.icon} size="lg" />
        <div className="flex min-w-0 flex-col gap-2">
          <OfferStatusBadge status={offer.status} />
          {live && offer.effectiveDeadline ? (
            <>
              <LiveFreshness
                deadline={offer.effectiveDeadline}
                serverNow={serverNow}
                perishability={offer.perishability}
              />
              <p className="flex items-center gap-1.5 text-sm text-ink-muted">
                <CalendarClock aria-hidden className="size-4 shrink-0" />
                Hạn hiệu lực{" "}
                <span className="font-semibold text-ink tabular-nums">
                  {formatDeadline(new Date(offer.effectiveDeadline), now)}
                </span>
              </p>
            </>
          ) : null}
          <p className="text-sm text-ink-muted">{offer.categoryName}</p>
        </div>
      </div>

      {offer.status === "draft" ? (
        <p
          role="note"
          className="flex items-start gap-2 rounded-lg border bg-bg-sunken p-3 text-sm text-ink-muted"
        >
          <FilePen aria-hidden className="mt-0.5 size-4 shrink-0" />
          Bản nháp chưa hiển thị với tổ chức nào. Bấm “Đăng lô” khi sẵn sàng — FoodSave tính hạn hiệu lực và
          nhãn ngay lúc đăng.
        </p>
      ) : null}

      <QuantityStats
        quantity={offer.quantity}
        committed={offer.committed}
        picked={offer.stats.picked}
        available={offer.available}
        unit={offer.unit}
        unitWeightKg={offer.unitWeightKg}
      />

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="contents">
            <dt className="text-ink-muted">{r.label}</dt>
            <dd className="tabular-nums">{r.value}</dd>
          </div>
        ))}
      </dl>

      {offer.description ? (
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium text-ink-muted">Mô tả, cách bảo quản</h3>
          <p className="text-sm whitespace-pre-line">{offer.description}</p>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5 border-t pt-4 text-sm text-ink-muted">
        {offer.safetyAttestedAt ? (
          <p className="flex items-center gap-1.5">
            <ShieldCheck aria-hidden className="size-4 text-success" />
            Đã cam kết an toàn thực phẩm lúc {formatDateTime(offer.safetyAttestedAt)}
          </p>
        ) : null}
        {offer.aiAssisted ? (
          <p className="flex items-center gap-1.5">
            <Sparkles aria-hidden className="size-4 text-info" />
            Thông tin ban đầu do AI gợi ý từ ảnh, cửa hàng đã kiểm tra trước khi lưu.
          </p>
        ) : null}
      </div>
    </section>
  );
}
