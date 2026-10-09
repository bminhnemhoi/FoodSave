import { AlarmClock, CircleSlash, Hourglass, Layers, Search } from "lucide-react";
import Form from "next/form";
import Link from "next/link";

import { FreshnessBadge } from "@/components/labels/freshness-badge";
import { LiveFreshness } from "@/components/labels/live-freshness";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatQty, OFFER_STATUS_LABEL, type UnitCode } from "@/features/catalog/labels";
import { NativeSelect } from "@/features/needs/components/native-select";
import { formatDeadline } from "@/features/offers/datetime";
import { KpiTile } from "@/features/offers/components/kpi-tile";
import { OfferStatusBadge } from "@/features/offers/components/status-badges";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import {
  LABEL_ORDER,
  OFFER_VIEWS,
  offersHref,
  toggleLabel,
  TURNING_RED_HOURS,
  type OfferFilters,
  type OfferView,
} from "../filters";
import type { AdminOfferRow, CategoryOption, OfferKpis } from "../queries";
import { ChipLink, ChipRow, DemoBadge, DemoScope, Field } from "./console-ui";

/** Màn "Lô hàng" của Admin (US-ADM-05, F-64): chỉ số, bộ lọc trên URL, bảng (desktop) / thẻ (mobile). */

export const OFFERS_BASE = "/admin/offers";

const VIEW_LABEL: Record<OfferView, string> = {
  live: "Đang diễn ra",
  open: OFFER_STATUS_LABEL.open,
  fully_allocated: OFFER_STATUS_LABEL.fully_allocated,
  draft: OFFER_STATUS_LABEL.draft,
  completed: OFFER_STATUS_LABEL.completed,
  expired: OFFER_STATUS_LABEL.expired,
  cancelled: OFFER_STATUS_LABEL.cancelled,
  all: "Tất cả",
};

const LABEL_TEXT = { red: "Đỏ", yellow: "Vàng", green: "Xanh", expired: "Hết hạn" } as const;

// ---------------------------------------------------------------------------
// Chỉ số
// ---------------------------------------------------------------------------

export function OfferKpiStrip({ kpis, filters }: { kpis: OfferKpis; filters: OfferFilters }) {
  const reset = {
    view: "open" as const,
    labels: [],
    q: "",
    cat: null,
    unclaimed: false,
    soon: false,
    page: 1,
  };
  const openTotal = LABEL_ORDER.reduce((s, l) => s + kpis.openByLabel[l], 0);
  return (
    <div className="grid gap-3 md:grid-cols-3 md:gap-4">
      <section
        aria-labelledby="kpi-open-by-label"
        className="flex flex-col gap-3 rounded-xl border bg-surface p-4 shadow-1 sm:p-5"
      >
        <h2 id="kpi-open-by-label" className="flex items-center gap-2 text-sm font-medium text-ink-muted">
          <span className="grid size-8 place-items-center rounded-md bg-role-accent-soft text-role-accent">
            <Layers aria-hidden className="size-4" />
          </span>
          Lô đang mở theo nhãn
          <span className="ml-auto text-ink tabular-nums">
            <span className="sr-only">Tổng: </span>
            {openTotal}
          </span>
        </h2>
        <ul className="grid grid-cols-2 gap-2">
          {LABEL_ORDER.map((l) => (
            <li key={l}>
              <Link
                href={offersHref(OFFERS_BASE, filters, { ...reset, labels: [l] })}
                aria-label={`Lô đang mở nhãn ${LABEL_TEXT[l]}: ${kpis.openByLabel[l]}`}
                className="flex min-h-11 items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 transition-colors hover:bg-bg-sunken focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <FreshnessBadge label={l} size="sm" />
                <span className="text-lg font-bold text-ink tabular-nums">{kpis.openByLabel[l]}</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="text-xs leading-relaxed text-ink-subtle">
          Nhãn tính lúc đọc từ hạn hiệu lực. &quot;Hết hạn&quot; là lô đã quá hạn, chờ tác vụ đóng lô.
        </p>
      </section>
      <KpiTile
        icon={AlarmClock}
        label={`Sắp chuyển Đỏ trong ${TURNING_RED_HOURS} giờ`}
        value={String(kpis.turningRedSoon)}
        unit="lô"
        hint="Lô đang mở, hiện Xanh hoặc Vàng, sẽ thành Đỏ trước khi hết 3 giờ tới."
        href={offersHref(OFFERS_BASE, filters, { ...reset, soon: true })}
        emphasis={kpis.turningRedSoon > 0}
      />
      <KpiTile
        icon={CircleSlash}
        label="Hết hạn chưa ai nhận hôm nay"
        value={String(kpis.expiredToday)}
        unit="lô"
        hint="Lô đóng vì quá hạn hiệu lực mà không ai lấy được, tính từ 00:00 hôm nay."
        href={offersHref(OFFERS_BASE, filters, { ...reset, view: "expired" })}
        emphasis={kpis.expiredToday > 0}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bộ lọc
// ---------------------------------------------------------------------------

export function OfferFilterBar({
  filters,
  categories,
}: {
  filters: OfferFilters;
  categories: CategoryOption[];
}) {
  const href = (patch: Partial<OfferFilters>) => offersHref(OFFERS_BASE, filters, { ...patch, page: 1 });
  return (
    <div className="flex flex-col gap-3">
      <ChipRow label="Lọc theo trạng thái">
        {OFFER_VIEWS.map((v) => (
          <ChipLink key={v} href={href({ view: v })} active={filters.view === v}>
            {VIEW_LABEL[v]}
          </ChipLink>
        ))}
      </ChipRow>

      <ChipRow label="Lọc theo nhãn và tình trạng giữ hàng">
        {LABEL_ORDER.map((l) => {
          const active = filters.labels.includes(l);
          return (
            <Link
              key={l}
              href={offersHref(OFFERS_BASE, filters, toggleLabel(filters, l))}
              aria-current={active ? "true" : undefined}
              className={cn(
                "inline-flex min-h-10 shrink-0 items-center rounded-full px-1 transition-shadow focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                active && "ring-2 ring-role-accent",
              )}
            >
              <FreshnessBadge label={l} />
              {active ? <span className="sr-only">(đang lọc)</span> : null}
            </Link>
          );
        })}
        <ChipLink href={href({ unclaimed: !filters.unclaimed })} active={filters.unclaimed}>
          <Hourglass aria-hidden className="size-4" />
          Chưa ai nhận
        </ChipLink>
        <ChipLink href={href({ soon: !filters.soon })} active={filters.soon}>
          <AlarmClock aria-hidden className="size-4" />
          Sắp Đỏ trong {TURNING_RED_HOURS} giờ
        </ChipLink>
      </ChipRow>

      <Form action={OFFERS_BASE} role="search" className="flex flex-col gap-2 sm:flex-row sm:items-end">
        {filters.view !== "live" ? <input type="hidden" name="view" value={filters.view} /> : null}
        {filters.labels.length > 0 ? (
          <input type="hidden" name="label" value={filters.labels.join(",")} />
        ) : null}
        {filters.demo ? <input type="hidden" name="demo" value="1" /> : null}
        {filters.unclaimed ? <input type="hidden" name="unclaimed" value="1" /> : null}
        {filters.soon ? <input type="hidden" name="soon" value="1" /> : null}
        <div className="flex flex-1 flex-col gap-1.5 sm:max-w-xs">
          <label htmlFor="offer-store-search" className="text-sm font-medium">
            Cửa hàng
          </label>
          <Input
            id="offer-store-search"
            name="q"
            type="search"
            defaultValue={filters.q}
            placeholder="Tìm theo tên cửa hàng…"
            maxLength={80}
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:w-56">
          <label htmlFor="offer-category" className="text-sm font-medium">
            Danh mục
          </label>
          <NativeSelect id="offer-category" name="cat" defaultValue={filters.cat ?? ""}>
            <option value="">Mọi danh mục</option>
            {categories.map((c) => (
              <option key={c.code} value={c.code}>
                {c.nameVi}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit" variant="outline" className="min-h-11 md:min-h-10">
          <Search aria-hidden />
          Lọc
        </Button>
      </Form>

      <DemoScope demo={filters.demo} realHref={href({ demo: false })} allHref={href({ demo: true })} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Danh sách
// ---------------------------------------------------------------------------

const isLive = (r: AdminOfferRow) => r.status === "open" || r.status === "fully_allocated";

function LabelCell({ row, serverNow }: { row: AdminOfferRow; serverNow: number }) {
  if (isLive(row) && row.effectiveDeadline) {
    return (
      <LiveFreshness
        deadline={row.effectiveDeadline}
        serverNow={serverNow}
        perishability={row.perishability}
        size="sm"
      />
    );
  }
  if (row.label === "expired") return <FreshnessBadge label="expired" size="sm" />;
  return (
    <span className="text-ink-subtle">
      —<span className="sr-only">Không có nhãn (lô không còn nhận)</span>
    </span>
  );
}

function qtyLines(r: { qtyAvailable: number; qtyCommitted: number; quantity: number; unit: UnitCode }) {
  return {
    main: `Còn ${formatQty(r.qtyAvailable, r.unit)}`,
    sub: `Giữ ${formatQty(r.qtyCommitted, r.unit)} · Tổng ${formatQty(r.quantity, r.unit)}`,
  };
}

function PendingCell({ count }: { count: number }) {
  if (count === 0) return <span className="text-ink-subtle tabular-nums">0</span>;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning tabular-nums">
      <Hourglass aria-hidden className="size-3.5" />
      {count} chờ
    </span>
  );
}

function siteText(site: AdminOfferRow["site"]) {
  if (!site) return "—";
  return [site.name, site.ward].filter(Boolean).join(" · ");
}

export function OffersList({ rows, now }: { rows: AdminOfferRow[]; now: Date }) {
  const serverNow = now.getTime();
  return (
    <>
      <div className="hidden rounded-lg border bg-surface lg:block">
        <Table>
          <caption className="sr-only">Danh sách lô tặng, nhãn Đỏ trước, hạn hiệu lực gần trước</caption>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead scope="col" className="px-4">
                Lô
              </TableHead>
              <TableHead scope="col">Cửa hàng · điểm</TableHead>
              <TableHead scope="col" className="text-right">
                Số lượng
              </TableHead>
              <TableHead scope="col" aria-sort="other">
                Nhãn
              </TableHead>
              <TableHead scope="col">Hạn hiệu lực</TableHead>
              <TableHead scope="col">Chờ xác nhận</TableHead>
              <TableHead scope="col">Trạng thái</TableHead>
              <TableHead scope="col" className="pr-4">
                Tạo lúc
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const qty = qtyLines(r);
              return (
                <TableRow key={r.id} data-testid="admin-offer-row">
                  <TableCell className="max-w-64 px-4 py-3 whitespace-normal">
                    <div className="flex flex-col gap-0.5">
                      <Link
                        href={`${OFFERS_BASE}/${r.id}`}
                        className="font-semibold break-words text-ink underline-offset-4 hover:underline focus-visible:underline"
                      >
                        {r.title}
                      </Link>
                      <span className="text-xs text-ink-muted">{r.categoryName}</span>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-60 py-3 whitespace-normal">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium break-words">{r.store.name}</span>
                      <span className="text-xs text-ink-muted">{siteText(r.site)}</span>
                      {r.store.isDemo ? <DemoBadge /> : null}
                    </div>
                  </TableCell>
                  <TableCell className="py-3 text-right">
                    <div className="flex flex-col tabular-nums">
                      <span className="font-medium">{qty.main}</span>
                      <span className="text-xs text-ink-muted">{qty.sub}</span>
                    </div>
                  </TableCell>
                  <TableCell className="py-3 whitespace-normal">
                    <LabelCell row={r} serverNow={serverNow} />
                  </TableCell>
                  <TableCell className="py-3 tabular-nums">
                    {r.effectiveDeadline ? formatDeadline(new Date(r.effectiveDeadline), now) : "—"}
                  </TableCell>
                  <TableCell className="py-3">
                    <PendingCell count={r.pendingRequests} />
                  </TableCell>
                  <TableCell className="py-3">
                    <OfferStatusBadge status={r.status} />
                  </TableCell>
                  <TableCell className="py-3 pr-4 text-ink-muted tabular-nums">
                    {formatDateTime(r.createdAt)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <ul className="flex flex-col gap-3 lg:hidden">
        {rows.map((r) => {
          const qty = qtyLines(r);
          return (
            <li key={r.id}>
              <article
                aria-labelledby={`offer-${r.id}`}
                data-testid="admin-offer-card"
                className="flex flex-col gap-3 rounded-lg border bg-surface p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <h2 id={`offer-${r.id}`} className="text-base font-semibold break-words">
                      <Link href={`${OFFERS_BASE}/${r.id}`} className="underline-offset-4 hover:underline">
                        {r.title}
                      </Link>
                    </h2>
                    <span className="text-xs text-ink-muted">{r.categoryName}</span>
                  </div>
                  <OfferStatusBadge status={r.status} className="shrink-0" />
                </div>
                <LabelCell row={r} serverNow={serverNow} />
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                  <Field label="Cửa hàng" className="col-span-2">
                    <span className="font-medium">{r.store.name}</span>
                    <span className="block text-xs text-ink-muted">{siteText(r.site)}</span>
                    {r.store.isDemo ? <DemoBadge className="mt-1" /> : null}
                  </Field>
                  <Field label="Số lượng">
                    <span className="tabular-nums">{qty.main}</span>
                    <span className="block text-xs text-ink-muted tabular-nums">{qty.sub}</span>
                  </Field>
                  <Field label="Hạn hiệu lực">
                    <span className="tabular-nums">
                      {r.effectiveDeadline ? formatDeadline(new Date(r.effectiveDeadline), now) : "—"}
                    </span>
                  </Field>
                  <Field label="Chờ xác nhận">
                    <PendingCell count={r.pendingRequests} />
                  </Field>
                  <Field label="Tạo lúc">
                    <span className="tabular-nums">{formatDateTime(r.createdAt)}</span>
                  </Field>
                </dl>
              </article>
            </li>
          );
        })}
      </ul>
    </>
  );
}
