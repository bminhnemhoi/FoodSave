import { formatKg, formatQty, type UnitCode } from "@/features/catalog/labels";
import { cn } from "@/lib/utils";

/**
 * Số lượng của lô (US-STO-10 AC3): đã đăng / đã giữ / đã lấy / còn lại, đúng đơn vị + kg tương ứng.
 * Thanh 3 lớp luôn đi kèm chữ (không dùng màu làm tín hiệu duy nhất); không dùng token nhãn tươi.
 */

type Props = {
  quantity: number;
  /** `qty_committed` = Σ(giữ − trả lại) của mọi phân bổ. */
  committed: number;
  picked: number;
  available: number;
  unit: UnitCode;
  unitWeightKg: number;
};

function Bar({
  quantity,
  committed,
  picked,
  className,
}: Pick<Props, "quantity" | "committed" | "picked"> & { className?: string }) {
  const total = quantity > 0 ? quantity : 1;
  const pickedPct = Math.min(100, (picked / total) * 100);
  const heldPct = Math.min(100 - pickedPct, (Math.max(0, committed - picked) / total) * 100);
  return (
    <div aria-hidden className={cn("flex h-2 w-full overflow-hidden rounded-full bg-bg-sunken", className)}>
      <span className="h-full bg-primary" style={{ width: `${pickedPct}%` }} />
      <span className="h-full bg-primary/40" style={{ width: `${heldPct}%` }} />
    </div>
  );
}

/** Dòng gọn cho thẻ trong danh sách. */
export function QuantityLine(props: Props) {
  const { quantity, committed, picked, available, unit } = props;
  return (
    <div className="flex flex-col gap-1.5">
      <Bar quantity={quantity} committed={committed} picked={picked} />
      <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-ink-muted tabular-nums">
        <span>
          Còn lại <strong className="font-semibold text-ink">{formatQty(available, unit)}</strong>
        </span>
        <span>Đã giữ {formatQty(committed, unit)}</span>
        <span>Đã lấy {formatQty(picked, unit)}</span>
        <span>Đã đăng {formatQty(quantity, unit)}</span>
      </p>
    </div>
  );
}

/** Bảng 4 ô cho trang chi tiết. */
export function QuantityStats(props: Props) {
  const { quantity, committed, picked, available, unit, unitWeightKg } = props;
  const kg = (q: number) => formatKg(q * unitWeightKg);
  const items = [
    { label: "Đã đăng", value: quantity },
    { label: "Đã giữ", value: committed },
    { label: "Đã lấy", value: picked },
    { label: "Còn lại", value: available, strong: true },
  ];
  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {items.map((i) => (
          <div
            key={i.label}
            className={cn("rounded-lg border bg-bg p-3", i.strong && "border-primary/30 bg-primary-soft/50")}
          >
            <dt className="text-xs font-medium text-ink-subtle">{i.label}</dt>
            <dd className="mt-1 text-lg leading-6 font-semibold tabular-nums">{formatQty(i.value, unit)}</dd>
            <dd className="text-xs text-ink-subtle tabular-nums">≈ {kg(i.value)}</dd>
          </div>
        ))}
      </dl>
      <Bar quantity={quantity} committed={committed} picked={picked} />
      <p className="text-xs text-ink-subtle">
        Thanh đậm: đã lấy · thanh nhạt: đã giữ, chờ lấy · phần trống: còn lại cho tổ chức khác.
      </p>
    </div>
  );
}
