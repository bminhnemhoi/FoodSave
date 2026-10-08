import { formatQty, type UnitCode } from "@/features/catalog/labels";

import { SHORTFALL_REASON_LABEL, type ShortfallReason } from "../labels";

export type SummaryLine = {
  allocationId: string;
  title: string;
  unit: UnitCode;
  expectedQty: number;
  qty: number;
  reason: ShortfallReason | null;
  note?: string | null;
};

/** Bảng từng dòng đã bàn giao: số đặt → số giao, lý do nếu thiếu (icon + chữ, không chỉ màu). */
export function HandoverSummaryLines({
  lines,
  qtyHeading = "Đã giao",
}: {
  lines: SummaryLine[];
  qtyHeading?: string;
}) {
  return (
    <ul className="divide-y rounded-lg border bg-surface" aria-label="Các dòng đã bàn giao">
      {lines.map((l) => (
        <li key={l.allocationId} className="flex flex-col gap-1 px-4 py-3" data-received={l.allocationId}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <p className="font-medium text-ink">{l.title}</p>
            <p className="text-sm text-ink-muted tabular-nums">
              {qtyHeading}{" "}
              <span className="font-semibold text-ink" data-qty>
                {formatQty(l.qty, l.unit)}
              </span>
              {l.qty !== l.expectedQty ? <> / đặt {formatQty(l.expectedQty, l.unit)}</> : null}
            </p>
          </div>
          {l.reason ? (
            <p className="text-sm text-warning">
              Thiếu {formatQty(Math.round((l.expectedQty - l.qty) * 1000) / 1000, l.unit)} —{" "}
              {SHORTFALL_REASON_LABEL[l.reason]}
              {l.note ? `: ${l.note}` : ""}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
