"use client";

import {
  Cloud,
  ExternalLink,
  type LucideIcon,
  PackageCheck,
  Sprout,
  UtensilsCrossed,
  Weight,
} from "lucide-react";

import {
  displayCo2e,
  displayDeliveredLots,
  displayKg,
  displayMeals,
  type DisplayValue,
  type ImpactTotals,
} from "@/core/impact";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { FactorSource, PublicImpact } from "../queries";
import { CountUp } from "./count-up";
import { usePublicImpact } from "./use-public-impact";

/** Khối giữ chỗ tĩnh (không nhấp nháy): số liệu thường về trong vài trăm ms, tránh chuyển động thừa ở màn đầu. */
function Bone({ className }: { className?: string }) {
  return <span aria-hidden className={cn("block rounded-md bg-muted", className)} />;
}

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

const CELL = "flex min-w-0 flex-col gap-2 border-t border-on-deep/20 pt-4";

/**
 * Bộ đếm tác động trên landing (PRD US-PUB-02, F-76) — phần dữ liệu của khối "Tác động đã ghi nhận".
 * Landing tĩnh ⇒ số lấy phía trình duyệt từ `/api/public-impact` (sổ tác động thật, loại demo). Trạng thái
 * nằm ở `data-impact-state` (loading → ready | empty | unavailable) để test chờ đúng lúc. Đang tải ⇒ skeleton
 * cùng hình 4 ô; sổ trống ⇒ câu trung thực, không hiện số 0. Số đếm lên một lần khi cuộn tới.
 */
export function ImpactBoard() {
  const impact = usePublicImpact();
  const state =
    impact === null
      ? "loading"
      : impact.status === "unavailable"
        ? "unavailable"
        : impact.totals.deliveries === 0 && impact.totals.kg === 0
          ? "empty"
          : "ready";

  return (
    <section
      aria-label="Bộ đếm tác động của FoodSave"
      aria-busy={state === "loading"}
      data-impact-state={state}
      className="flex flex-col gap-5"
    >
      {impact === null ? (
        <>
          <div
            role="status"
            aria-label="Đang tải số liệu tác động"
            className="grid grid-cols-2 gap-x-6 gap-y-8 sm:gap-x-10"
          >
            {METRICS.map((m) => (
              <div key={m.key} className={CELL}>
                <Bone className="h-5 w-32 max-w-full bg-on-deep/15" />
                <Bone className="h-12 w-36 max-w-full bg-on-deep/15 sm:h-[3.75rem]" />
                <Bone className="h-4 w-24 bg-on-deep/10" />
              </div>
            ))}
          </div>
          <noscript>
            <p className="text-sm text-on-deep-muted">Bật JavaScript để xem số liệu tác động mới nhất.</p>
          </noscript>
        </>
      ) : impact.status === "unavailable" ? (
        <p role="status" className="rounded-xl border border-dashed border-on-deep/30 p-6 text-on-deep-muted">
          Số liệu tác động tạm thời chưa tải được. Vui lòng quay lại sau ít phút.
        </p>
      ) : state === "empty" ? (
        <div
          role="status"
          data-impact-empty
          className="flex items-start gap-4 rounded-2xl border border-dashed border-on-deep/30 bg-on-deep/5 p-6"
        >
          <Sprout aria-hidden className="mt-1 size-7 shrink-0 text-brand-mint" />
          <div className="flex flex-col gap-1">
            <p className="font-display text-xl font-extrabold text-on-deep">
              Chưa có lần bàn giao nào — số liệu sẽ cập nhật tự động
            </p>
            <p className="text-on-deep-muted">
              Bộ đếm chỉ tính thực phẩm đã tới tay tổ chức và được hai bên xác nhận. Hãy là cửa hàng đầu tiên.
            </p>
          </div>
        </div>
      ) : (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-8 sm:gap-x-10">
          {METRICS.map(({ key, label, group, icon: Icon, value }) => {
            const shown = value(impact.totals);
            return (
              <div key={key} data-metric={key} className={CELL}>
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
      {impact?.status === "ok" ? <Footnote impact={impact} /> : null}
    </section>
  );
}

function Footnote({ impact }: { impact: Extract<PublicImpact, { status: "ok" }> }) {
  const sources = impact.factors.sources.filter((s) => SOURCE_TEXT[s.metric]);
  const version = impact.factors.current?.version;
  return (
    <div className="flex flex-col gap-3 text-xs leading-relaxed text-on-deep-muted">
      {impact.demoKg > 0 ? (
        <p className="text-sm">
          <span className="mr-1.5 rounded-full bg-brand-yellow px-2 py-0.5 font-semibold text-ink">
            Dữ liệu demo
          </span>
          Ngoài ra có {displayKg(impact.demoKg).text} trong dữ liệu demo, không tính vào số trên.
        </p>
      ) : null}
      <p>
        Nguồn: sổ tác động FoodSave (chỉ tính hàng đã bàn giao và đối soát)
        {impact.updatedAt ? `, cập nhật ${formatDateTime(impact.updatedAt)}` : ""}.
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
                  className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-on-deep focus-visible:outline-on-deep"
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
    </div>
  );
}
