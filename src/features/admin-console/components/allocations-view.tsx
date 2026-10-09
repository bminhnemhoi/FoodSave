import { Hourglass, ScrollText, Truck, X } from "lucide-react";
import Link from "next/link";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ALLOCATION_STATUS_LABEL, formatQty, PICKUP_STATUS_LABEL } from "@/features/catalog/labels";
import { SHORTFALL_REASON_LABEL } from "@/features/handover/labels";
import { AllocationStatusBadge } from "@/features/offers/components/status-badges";
import { formatDateTime } from "@/lib/format";

import {
  ALLOCATION_VIEWS,
  allocationsHref,
  STALE_REQUEST_MINUTES,
  type AllocationFilters,
  type AllocationView,
} from "../filters";
import { CANCEL_ACTOR_LABEL, formatWaiting, PICKUP_MODE_LABEL } from "../present";
import type { AdminAllocationItem, AdminAllocationRow } from "../queries";
import { ChipLink, ChipRow, DemoBadge, DemoScope, Field } from "./console-ui";

/** Màn "Phân bổ & chuyến" của Admin (US-ADM-07, F-65) và danh sách phân bổ trong trang chi tiết lô. */

export const ALLOCATIONS_BASE = "/admin/allocations";

const VIEW_LABEL: Record<AllocationView, string> = {
  all: "Tất cả",
  ...ALLOCATION_STATUS_LABEL,
};

export function AllocationFilterBar({
  filters,
  quickCounts,
}: {
  filters: AllocationFilters;
  quickCounts: { stale: number; running: number };
}) {
  const href = (patch: Partial<AllocationFilters>) =>
    allocationsHref(ALLOCATIONS_BASE, filters, { id: null, ...patch, page: 1 });
  return (
    <div className="flex flex-col gap-3">
      <ChipRow label="Lọc nhanh">
        <ChipLink
          href={href(
            filters.quick === "stale" ? { quick: null, view: "all" } : { quick: "stale", view: "requested" },
          )}
          active={filters.quick === "stale"}
          count={quickCounts.stale}
        >
          <Hourglass aria-hidden className="size-4" />
          Chờ cửa hàng quá {STALE_REQUEST_MINUTES / 60} giờ
        </ChipLink>
        <ChipLink
          href={href({ quick: filters.quick === "running" ? null : "running" })}
          active={filters.quick === "running"}
          count={quickCounts.running}
        >
          <Truck aria-hidden className="size-4" />
          Chuyến đang chạy
        </ChipLink>
      </ChipRow>
      <ChipRow label="Lọc theo trạng thái">
        {ALLOCATION_VIEWS.map((v) => (
          <ChipLink
            key={v}
            href={href({ view: v, quick: filters.quick === "stale" ? null : filters.quick })}
            active={filters.view === v && filters.quick !== "stale"}
          >
            {VIEW_LABEL[v]}
          </ChipLink>
        ))}
      </ChipRow>
      <DemoScope demo={filters.demo} realHref={href({ demo: false })} allHref={href({ demo: true })} />
      {filters.id ? (
        <p className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
          Đang xem một phân bổ:{" "}
          <code className="rounded bg-bg-sunken px-1.5 py-0.5 font-mono text-xs text-ink">{filters.id}</code>
          <Link
            href={href({})}
            className="inline-flex min-h-6 items-center gap-1 font-medium text-primary underline underline-offset-4"
          >
            <X aria-hidden className="size-3.5" />
            Bỏ chọn phân bổ
          </Link>
        </p>
      ) : null}
    </div>
  );
}

function wardText(site: { name: string; ward: string | null } | null) {
  return site ? [site.name, site.ward].filter(Boolean).join(" · ") : "—";
}

function QtyCell({ a }: { a: AdminAllocationItem }) {
  return (
    <div className="flex flex-col tabular-nums">
      <span className="font-medium">Đặt {formatQty(a.qtyReserved, a.unit)}</span>
      <span className="text-xs text-ink-muted">
        Lấy {formatQty(a.qtyPicked, a.unit)} · Giao {formatQty(a.qtyDelivered, a.unit)}
        {a.qtyReleased > 0 ? ` · Trả lại ${formatQty(a.qtyReleased, a.unit)}` : ""}
      </span>
    </div>
  );
}

function StatusCell({ a, now }: { a: AdminAllocationItem; now: Date }) {
  const waitingMs = now.getTime() - new Date(a.requestedAt).getTime();
  const stale = a.status === "requested" && waitingMs >= STALE_REQUEST_MINUTES * 60_000;
  return (
    <div className="flex flex-col items-start gap-1">
      <AllocationStatusBadge status={a.status} />
      {a.status === "requested" ? (
        <span className={stale ? "text-xs font-semibold text-warning" : "text-xs text-ink-muted"}>
          Đã chờ {formatWaiting(waitingMs)}
        </span>
      ) : null}
      {a.autoConfirmed ? <span className="text-xs text-ink-muted">Tự động xác nhận</span> : null}
    </div>
  );
}

function TripCell({ a }: { a: AdminAllocationItem }) {
  if (!a.pickup) return <span className="text-ink-subtle">Chưa lên chuyến</span>;
  return (
    <div className="flex flex-col">
      <span className={a.pickup.status === "in_progress" ? "font-semibold text-info" : undefined}>
        {PICKUP_STATUS_LABEL[a.pickup.status]}
      </span>
      <span className="text-xs text-ink-muted">{PICKUP_MODE_LABEL[a.pickup.mode]}</span>
    </div>
  );
}

function ReasonCell({ a }: { a: AdminAllocationItem }) {
  const parts: string[] = [];
  if (a.shortfallReason) parts.push(SHORTFALL_REASON_LABEL[a.shortfallReason]);
  if (a.status === "cancelled" && a.cancelActor) {
    parts.push(`Hủy bởi ${(CANCEL_ACTOR_LABEL[a.cancelActor] ?? a.cancelActor).toLowerCase()}`);
  }
  return parts.length ? (
    <span className="whitespace-normal">{parts.join(" · ")}</span>
  ) : (
    <span className="text-ink-subtle">—</span>
  );
}

function AuditLink({ id }: { id: string }) {
  return (
    <Link
      href={`/admin/audit?type=allocation&id=${id}`}
      className="inline-flex min-h-6 items-center gap-1 text-sm font-medium text-primary underline underline-offset-4"
    >
      <ScrollText aria-hidden className="size-3.5" />
      Nhật ký
    </Link>
  );
}

/** Bảng phân bổ toàn hệ thống (desktop) / thẻ (mobile). */
export function AllocationsList({ rows, now }: { rows: AdminAllocationRow[]; now: Date }) {
  return (
    <>
      <div className="hidden rounded-lg border bg-surface lg:block">
        <Table>
          <caption className="sr-only">Danh sách phân bổ giữa cửa hàng và tổ chức</caption>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead scope="col" className="px-4">
                Yêu cầu lúc
              </TableHead>
              <TableHead scope="col">Tổ chức nhận</TableHead>
              <TableHead scope="col">Cửa hàng · lô</TableHead>
              <TableHead scope="col" className="text-right">
                Số lượng
              </TableHead>
              <TableHead scope="col">Trạng thái</TableHead>
              <TableHead scope="col">Chuyến</TableHead>
              <TableHead scope="col">Lý do thiếu / hủy</TableHead>
              <TableHead scope="col" className="pr-4">
                Cập nhật
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((a) => (
              <TableRow key={a.id} data-testid="admin-allocation-row">
                <TableCell className="px-4 py-3 tabular-nums">{formatDateTime(a.requestedAt)}</TableCell>
                <TableCell className="max-w-56 min-w-40 py-3 whitespace-normal">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium break-words">{a.charity.name}</span>
                    <span className="text-xs text-ink-muted">{wardText(a.charitySite)}</span>
                    {a.charity.isDemo || a.store.isDemo ? <DemoBadge /> : null}
                  </div>
                </TableCell>
                <TableCell className="max-w-60 min-w-40 py-3 whitespace-normal">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium break-words">{a.store.name}</span>
                    <Link
                      href={`/admin/offers/${a.offerId}`}
                      className="text-xs break-words text-primary underline underline-offset-4"
                    >
                      {a.offerTitle}
                    </Link>
                  </div>
                </TableCell>
                <TableCell className="py-3 text-right">
                  <QtyCell a={a} />
                </TableCell>
                <TableCell className="py-3">
                  <StatusCell a={a} now={now} />
                </TableCell>
                <TableCell className="py-3">
                  <TripCell a={a} />
                </TableCell>
                <TableCell className="max-w-48 py-3 whitespace-normal">
                  <ReasonCell a={a} />
                </TableCell>
                <TableCell className="py-3 pr-4">
                  <div className="flex flex-col items-start gap-0.5">
                    <span className="text-ink-muted tabular-nums">{formatDateTime(a.updatedAt)}</span>
                    <AuditLink id={a.id} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="flex flex-col gap-3 lg:hidden">
        {rows.map((a) => (
          <li key={a.id}>
            <article
              aria-labelledby={`alloc-${a.id}`}
              data-testid="admin-allocation-card"
              className="flex flex-col gap-3 rounded-lg border bg-surface p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 id={`alloc-${a.id}`} className="min-w-0 text-base font-semibold break-words">
                  {a.charity.name}
                  <span className="sr-only"> nhận từ {a.store.name}</span>
                </h2>
                <StatusCell a={a} now={now} />
              </div>
              {a.charity.isDemo || a.store.isDemo ? <DemoBadge /> : null}
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                <Field label="Cửa hàng · lô" className="col-span-2">
                  <span className="font-medium">{a.store.name}</span>
                  <Link
                    href={`/admin/offers/${a.offerId}`}
                    className="block text-xs text-primary underline underline-offset-4"
                  >
                    {a.offerTitle}
                  </Link>
                </Field>
                <Field label="Số lượng">
                  <QtyCell a={a} />
                </Field>
                <Field label="Chuyến">
                  <TripCell a={a} />
                </Field>
                <Field label="Yêu cầu lúc">
                  <span className="tabular-nums">{formatDateTime(a.requestedAt)}</span>
                </Field>
                <Field label="Lý do thiếu / hủy">
                  <ReasonCell a={a} />
                </Field>
              </dl>
              <AuditLink id={a.id} />
            </article>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Phân bổ của một lô (trang chi tiết lô) — danh sách gọn theo tổ chức nhận. */
export function OfferAllocationsList({ rows, now }: { rows: AdminAllocationItem[]; now: Date }) {
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((a) => (
        <li key={a.id}>
          <article
            aria-labelledby={`offer-alloc-${a.id}`}
            data-testid="offer-allocation"
            className="flex flex-col gap-3 rounded-lg border p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <h3 id={`offer-alloc-${a.id}`} className="font-semibold break-words">
                  {a.charity.name}
                </h3>
                <span className="text-xs text-ink-muted">{wardText(a.charitySite)}</span>
                {a.charity.isDemo ? <DemoBadge className="mt-1" /> : null}
              </div>
              <StatusCell a={a} now={now} />
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
              <Field label="Số lượng">
                <QtyCell a={a} />
              </Field>
              <Field label="Chuyến">
                <TripCell a={a} />
              </Field>
              <Field label="Yêu cầu lúc">
                <span className="tabular-nums">{formatDateTime(a.requestedAt)}</span>
              </Field>
              <Field label="Lý do thiếu / hủy">
                <ReasonCell a={a} />
              </Field>
            </dl>
            {a.cancelReason ? (
              <p className="text-sm text-ink-muted">
                <span className="font-medium text-ink">Ghi chú hủy:</span> {a.cancelReason}
              </p>
            ) : null}
            <AuditLink id={a.id} />
          </article>
        </li>
      ))}
    </ul>
  );
}
