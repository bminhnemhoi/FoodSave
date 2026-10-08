import {
  Cloud,
  Droplets,
  ExternalLink,
  type LucideIcon,
  PackageCheck,
  Sprout,
  UtensilsCrossed,
  Weight,
} from "lucide-react";
import Link from "next/link";

import {
  displayCo2e,
  displayDeliveredLots,
  displayKg,
  displayMeals,
  displayWater,
  type DisplayValue,
  type ImpactTotals,
} from "@/core/impact";
import { cn } from "@/lib/utils";

/**
 * Bộ đếm tác động (KPI row, DESIGN-SYSTEM §11.2 `KpiTile`, §14; ESG-METHODOLOGY §2.2, §9).
 * Server Component thuần: số đã định dạng vi-VN, đơn vị đầy đủ, nhóm E/S có icon + chữ (không chỉ màu),
 * chú thích nguồn hệ số ngay dưới; sổ trống ⇒ trạng thái rỗng trung thực (không hiện "0" giả).
 */

export type ImpactMetricKey = "kg" | "meals" | "co2e" | "water" | "lots";

/** Một hệ số kèm nguồn (cột của `impact_factors`). */
export type ImpactSourceNote = {
  metric: "co2e_kg_per_kg" | "water_l_per_kg" | "kg_per_meal";
  value: number;
  unit: string;
  sourceTitle: string;
  sourceUrl: string;
  sourcePage: string | null;
};

type MetricDef = {
  label: string;
  group: "E" | "S";
  icon: LucideIcon;
  value: (t: ImpactTotals) => DisplayValue | null;
};

const METRICS: Record<ImpactMetricKey, MetricDef> = {
  kg: { label: "Thực phẩm được cứu", group: "E", icon: Weight, value: (t) => displayKg(t.kg) },
  meals: {
    label: "Suất ăn tương đương",
    group: "S",
    icon: UtensilsCrossed,
    value: (t) => displayMeals(t.meals),
  },
  co2e: { label: "CO₂e tránh được", group: "E", icon: Cloud, value: (t) => displayCo2e(t.co2eKg) },
  water: {
    label: "Nước tưới tránh lãng phí (ước tính)",
    group: "E",
    icon: Droplets,
    value: (t) => (t.waterL === null ? null : displayWater(t.waterL)),
  },
  lots: {
    label: "Lô đã giao",
    group: "S",
    icon: PackageCheck,
    value: (t) => displayDeliveredLots(t.deliveries),
  },
};

const GROUP: Record<MetricDef["group"], { text: string; className: string }> = {
  E: { text: "E – Môi trường", className: "text-chart-e" },
  S: { text: "S – Xã hội", className: "text-chart-s" },
};

const vi = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });

const SOURCE_TEXT: Record<ImpactSourceNote["metric"], (s: ImpactSourceNote) => string> = {
  co2e_kg_per_kg: (s) => `CO₂e ${vi.format(s.value)} kg/kg thực phẩm`,
  water_l_per_kg: (s) => `nước tưới ${vi.format(s.value)} L/kg (chỉ nước xanh lam)`,
  kg_per_meal: (s) => `${vi.format(s.value)} kg/suất ăn`,
};

/** "FAO (2013). Food wastage…" ⇒ "FAO 2013". */
function shortSource(title: string): string {
  const m = /^([^(]+?)\s*\((\d{4})\)/.exec(title);
  return m ? `${m[1]!.trim()} ${m[2]}` : title;
}

type ImpactCountersProps = {
  totals: ImpactTotals;
  /** Thứ tự tile; chỉ số nước tự ẩn khi tổng nước null (version hệ số không có nước). */
  metrics?: ImpactMetricKey[];
  /** Phiên bản + nguồn hệ số (bảng `impact_factors`) cho chú thích. */
  factorVersion?: string | null;
  sources?: ImpactSourceNote[];
  /** Có liên kết tới trang phương pháp (khi trang đã có). */
  methodologyHref?: string;
  /** Dữ liệu demo ⇒ nhãn "Dữ liệu demo" (ESG §6.6). */
  isDemo?: boolean;
  variant?: "default" | "hero";
  /** Sổ trống: tiêu đề + hướng dẫn (bắt buộc trung thực, không hiện số 0). */
  empty?: { title: string; description: React.ReactNode };
  /** Tên vùng cho trình đọc màn hình. */
  label?: string;
  className?: string;
};

export function ImpactCounters({
  totals,
  metrics = ["kg", "meals", "co2e", "water"],
  factorVersion,
  sources = [],
  methodologyHref,
  isDemo = false,
  variant = "default",
  empty = {
    title: "Chưa có lần bàn giao nào",
    description: "Số liệu sẽ cập nhật tự động sau mỗi lần bàn giao được đối soát.",
  },
  label = "Tác động",
  className,
}: ImpactCountersProps) {
  const isEmpty = totals.deliveries === 0 && totals.kg === 0;
  const tiles = metrics
    .map((key) => ({ key, def: METRICS[key], shown: METRICS[key].value(totals) }))
    .filter((t): t is { key: ImpactMetricKey; def: MetricDef; shown: DisplayValue } => t.shown !== null);
  const hero = variant === "hero";

  return (
    <section aria-label={label} className={cn("flex flex-col gap-3", className)}>
      {isDemo ? (
        <p className="w-fit rounded-full bg-brand-yellow-soft px-3 py-1 text-sm font-medium text-ink">
          Dữ liệu demo — số liệu minh họa, không phải hoạt động thật.
        </p>
      ) : null}

      {isEmpty ? (
        <div
          role="status"
          className="flex items-start gap-3 rounded-lg border border-dashed bg-surface p-5 text-left"
          data-impact-empty
        >
          <Sprout aria-hidden className="mt-0.5 size-6 shrink-0 text-chart-e" />
          <div>
            <p className="font-semibold text-ink">{empty.title}</p>
            <div className="text-sm text-ink-muted">{empty.description}</div>
          </div>
        </div>
      ) : (
        <dl
          className={cn(
            "grid grid-cols-2 gap-3",
            tiles.length >= 4 ? "lg:grid-cols-4" : tiles.length === 3 ? "lg:grid-cols-3" : "",
          )}
        >
          {tiles.map(({ key, def, shown }) => {
            const Icon = def.icon;
            const group = GROUP[def.group];
            return (
              <div
                key={key}
                data-metric={key}
                className={cn(
                  "flex min-w-0 flex-col gap-2 rounded-lg border bg-surface",
                  hero ? "p-4 sm:p-5" : "p-4",
                )}
              >
                <dt className="flex items-start gap-2 text-sm font-medium text-ink-muted">
                  <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", group.className)} />
                  <span>{def.label}</span>
                </dt>
                <dd className="flex flex-wrap items-baseline gap-x-1.5">
                  <span
                    data-value
                    className={cn(
                      "font-bold text-ink tabular-nums",
                      hero
                        ? "text-[clamp(1.75rem,4vw,2.5rem)] leading-tight"
                        : "text-[2rem] leading-[2.375rem]",
                    )}
                  >
                    {shown.value}
                  </span>
                  <span className="text-sm font-medium text-ink-muted">{shown.unit}</span>
                </dd>
                <dd className="text-xs font-medium text-ink-subtle">{group.text}</dd>
              </div>
            );
          })}
        </dl>
      )}

      <p className="text-xs leading-relaxed text-ink-subtle">
        Nguồn: sổ tác động FoodSave (chỉ tính hàng đã bàn giao và đối soát).
        {sources.length > 0 ? (
          <>
            {" "}
            Hệ số{factorVersion ? ` ${factorVersion}` : ""}:{" "}
            {sources.map((s, i) => (
              <span key={s.metric}>
                {i > 0 ? " · " : ""}
                {SOURCE_TEXT[s.metric](s)} (
                <a
                  href={s.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-ink"
                >
                  {shortSource(s.sourceTitle)}
                  {s.sourcePage ? `, ${s.sourcePage}` : ""}
                  <ExternalLink aria-hidden className="size-3" />
                  <span className="sr-only"> (mở tab mới)</span>
                </a>
                )
              </span>
            ))}
            .
          </>
        ) : null}{" "}
        Số liệu là ước tính, không phải kiểm kê khí nhà kính; suất ăn làm tròn xuống.
        {methodologyHref ? (
          <>
            {" "}
            <Link href={methodologyHref} className="underline underline-offset-2 hover:text-ink">
              Phương pháp tính
            </Link>
          </>
        ) : null}
      </p>
    </section>
  );
}
