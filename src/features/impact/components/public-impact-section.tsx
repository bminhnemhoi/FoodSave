import {
  Cloud,
  ExternalLink,
  type LucideIcon,
  PackageCheck,
  Sprout,
  UtensilsCrossed,
  Weight,
} from "lucide-react";
import { connection } from "next/server";

import { Skeleton } from "@/components/ui/skeleton";
import {
  displayCo2e,
  displayDeliveredLots,
  displayKg,
  displayMeals,
  type DisplayValue,
  type ImpactTotals,
} from "@/core/impact";
import { formatDateTime } from "@/lib/format";

import { getPublicImpact, type FactorSource } from "../queries";
import { CountUp } from "./count-up";

type Metric = {
  key: "kg" | "meals" | "co2e" | "lots";
  label: string;
  group: string;
  icon: LucideIcon;
  value: (t: ImpactTotals) => DisplayValue;
};

const METRICS: Metric[] = [
  {
    key: "kg",
    label: "Thực phẩm được cứu",
    group: "E – Môi trường",
    icon: Weight,
    value: (t) => displayKg(t.kg),
  },
  {
    key: "meals",
    label: "Suất ăn tương đương",
    group: "S – Xã hội",
    icon: UtensilsCrossed,
    value: (t) => displayMeals(t.meals),
  },
  {
    key: "co2e",
    label: "CO₂e tránh được",
    group: "E – Môi trường",
    icon: Cloud,
    value: (t) => displayCo2e(t.co2eKg),
  },
  {
    key: "lots",
    label: "Lô đã giao",
    group: "S – Xã hội",
    icon: PackageCheck,
    value: (t) => displayDeliveredLots(t.deliveries),
  },
];

const vi = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });
const SOURCE_TEXT: Partial<Record<FactorSource["metric"], (s: FactorSource) => string>> = {
  co2e_kg_per_kg: (s) => `CO₂e ${vi.format(s.value)} kg/kg thực phẩm`,
  kg_per_meal: (s) => `${vi.format(s.value)} kg/suất ăn`,
};

/** "FAO (2013). Food wastage…" ⇒ "FAO 2013". */
function shortSource(title: string): string {
  const m = /^([^(]+?)\s*\((\d{4})\)/.exec(title);
  return m ? `${m[1]!.trim()} ${m[2]}` : title;
}

function Shell({ children, busy = false }: { children: React.ReactNode; busy?: boolean }) {
  return (
    <section
      id="tac-dong"
      {...(busy
        ? { "aria-label": "Tác động đã ghi nhận", "aria-busy": true }
        : { "aria-labelledby": "impact-heading" })}
      className="fs-stage fs-grain scroll-mt-4 overflow-hidden"
    >
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 sm:px-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center lg:py-24">
        {children}
      </div>
    </section>
  );
}

function Intro({ updatedAt, demoKg }: { updatedAt?: string | null; demoKg?: number }) {
  return (
    <div className="flex max-w-prose flex-col gap-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-brand-mint">
        <Sprout aria-hidden className="size-4" />
        Sổ tác động
      </p>
      <h2
        id="impact-heading"
        className="font-display text-[clamp(2rem,4.5vw,3rem)] leading-[1.1] font-extrabold text-on-deep"
      >
        Tác động đã ghi nhận
      </h2>
      <p className="text-lg text-on-deep-muted">
        Mỗi con số đến từ một lần bàn giao thật đã được cửa hàng và tổ chức đối soát từng dòng — không có số
        ước đoán hay số mẫu.
      </p>
      {updatedAt ? (
        <p className="text-sm text-on-deep-muted">Cập nhật lần cuối: {formatDateTime(updatedAt)}.</p>
      ) : null}
      {demoKg && demoKg > 0 ? (
        <p className="text-sm text-on-deep-muted">
          <span className="mr-1.5 rounded-full bg-brand-yellow px-2 py-0.5 font-semibold text-ink">
            Dữ liệu demo
          </span>
          Ngoài ra có {displayKg(demoKg).text} trong dữ liệu demo, không tính vào số bên cạnh.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Khối "Tác động đã ghi nhận" trên landing — mảng tối, số lớn (PRD US-PUB-02, F-76; DESIGN-SYSTEM §2.5).
 * Số thật từ `public_impact_stats` (loại demo). Khối render theo request (`connection()`), số liệu nằm trong
 * Data Cache theo thẻ `public-impact` tối đa 10 phút và được hủy ngay (`updateTag`) sau mỗi bàn giao ghi sổ.
 * Sổ trống ⇒ câu trung thực, không hiện số 0. Số đếm lên một lần khi cuộn tới (tắt khi giảm chuyển động).
 */
export async function PublicImpactSection() {
  await connection();
  const impact = await getPublicImpact();

  if (impact.status === "unavailable") {
    return (
      <Shell>
        <Intro />
        <p role="status" className="rounded-xl border border-dashed border-on-deep/30 p-6 text-on-deep-muted">
          Số liệu tác động tạm thời chưa tải được. Vui lòng quay lại sau ít phút.
        </p>
      </Shell>
    );
  }

  const { totals } = impact;
  const isEmpty = totals.deliveries === 0 && totals.kg === 0;
  const sources = impact.factors.sources.filter((s) => SOURCE_TEXT[s.metric]);
  const version = impact.factors.current?.version;

  return (
    <Shell>
      <Intro updatedAt={impact.updatedAt} demoKg={impact.demoKg} />
      <section aria-label="Bộ đếm tác động của FoodSave" className="flex flex-col gap-5">
        {isEmpty ? (
          <div
            role="status"
            data-impact-empty
            className="flex items-start gap-4 rounded-2xl border border-dashed border-on-deep/30 bg-on-deep/5 p-6"
          >
            <Sprout aria-hidden className="mt-1 size-7 shrink-0 text-brand-mint" />
            <div className="flex flex-col gap-1">
              <p className="font-display text-xl font-bold text-on-deep">
                Chưa có lần bàn giao nào — số liệu sẽ cập nhật tự động
              </p>
              <p className="text-on-deep-muted">
                Bộ đếm chỉ tính thực phẩm đã tới tay tổ chức và được hai bên xác nhận. Hãy là cửa hàng đầu
                tiên.
              </p>
            </div>
          </div>
        ) : (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-8 sm:gap-x-10">
            {METRICS.map(({ key, label, group, icon: Icon, value }) => {
              const shown = value(totals);
              return (
                <div
                  key={key}
                  data-metric={key}
                  className="flex min-w-0 flex-col gap-2 border-t border-on-deep/20 pt-4"
                >
                  <dt className="flex items-start gap-2 text-sm font-medium text-on-deep-muted">
                    <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-mint" />
                    <span>{label}</span>
                  </dt>
                  <dd className="flex flex-wrap items-baseline gap-x-2">
                    <CountUp
                      value={shown.value}
                      className="font-display text-[clamp(2.25rem,5.5vw,3.75rem)] leading-none font-extrabold text-on-deep"
                    />
                    <span className="text-base font-semibold text-on-deep-muted">{shown.unit}</span>
                  </dd>
                  <dd className="text-xs font-medium text-on-deep-muted">{group}</dd>
                </div>
              );
            })}
          </dl>
        )}
        <p className="text-xs leading-relaxed text-on-deep-muted">
          Nguồn: sổ tác động FoodSave (chỉ tính hàng đã bàn giao và đối soát).
          {sources.length > 0 ? (
            <>
              {" "}
              Hệ số{version ? ` ${version}` : ""}:{" "}
              {sources.map((s, i) => (
                <span key={s.metric}>
                  {i > 0 ? " · " : ""}
                  {SOURCE_TEXT[s.metric]!(s)} (
                  <a
                    href={s.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-on-deep"
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
        </p>
      </section>
    </Shell>
  );
}

/** Skeleton đúng hình khối tác động (tiêu đề + 4 ô số) trên nền tối. */
export function PublicImpactSectionSkeleton() {
  return (
    <Shell busy>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-4 w-28 bg-on-deep/15" />
        <Skeleton className="h-11 w-72 max-w-full bg-on-deep/15" />
        <Skeleton className="h-16 w-full bg-on-deep/10" />
      </div>
      <div aria-label="Đang tải số liệu tác động" role="status" className="grid grid-cols-2 gap-x-10 gap-y-8">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex flex-col gap-3 border-t border-on-deep/20 pt-4">
            <Skeleton className="h-4 w-32 bg-on-deep/15" />
            <Skeleton className="h-12 w-40 bg-on-deep/15" />
          </div>
        ))}
      </div>
    </Shell>
  );
}
