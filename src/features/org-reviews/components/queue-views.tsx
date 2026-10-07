import {
  ChevronLeft,
  ChevronRight,
  FileStack,
  History,
  MapPin,
  RotateCcw,
  Search,
  Store,
  HandHeart,
} from "lucide-react";
import Form from "next/form";
import Link from "next/link";

import { StatusBadge } from "@/components/labels/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ORG_KIND_LABEL } from "@/features/organizations/status-copy";
import { LEGAL_FIELD_LABEL, orgSubtypeLabel, type LegalField } from "@/features/organizations/labels";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import { waitingDays, waitingLabel } from "../present";
import type { ChangeRequestRow, OrgListRow } from "../queries";
import { queueHref, type QueueFilters } from "../schemas";

/** Thành phần trình bày (Server Component) của hàng đợi duyệt và danh sách tổ chức. */

export type Tab<V extends string> = { view: V; label: string; count?: number };

export function StatusTabs<V extends string>({
  base,
  filters,
  tabs,
  defaultView,
  label,
}: {
  base: string;
  filters: QueueFilters<V>;
  tabs: Tab<V>[];
  defaultView: V;
  label: string;
}) {
  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex w-max min-w-full gap-1 border-b">
        {tabs.map((t) => {
          const active = t.view === filters.view;
          return (
            <li key={t.view}>
              <Link
                href={queueHref(base, filters, { view: t.view, page: 1 }, defaultView)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex min-h-11 items-center gap-2 rounded-t-md border-b-2 px-3 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  active
                    ? "border-role-accent text-ink"
                    : "border-transparent text-ink-muted hover:border-border-strong/40 hover:text-ink",
                )}
              >
                {t.label}
                {t.count !== undefined ? (
                  <span
                    className={cn(
                      "min-w-6 rounded-full px-1.5 py-0.5 text-center text-xs font-semibold tabular-nums",
                      t.count > 0 ? "bg-ink text-surface" : "bg-bg-sunken text-ink-muted",
                    )}
                  >
                    <span className="sr-only">: </span>
                    {t.count}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

const KIND_FILTERS = [
  { kind: null, label: "Tất cả" },
  { kind: "store", label: "Cửa hàng" },
  { kind: "charity", label: "Tổ chức" },
] as const;

export function QueueToolbar<V extends string>({
  base,
  filters,
  defaultView,
  total,
  unit,
  sortNote,
}: {
  base: string;
  filters: QueueFilters<V>;
  defaultView: V;
  total: number;
  unit: string;
  sortNote: string;
}) {
  const filtered = filters.kind !== null || filters.q !== "";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <nav aria-label="Lọc theo loại" className="flex flex-wrap gap-2">
          {KIND_FILTERS.map((k) => {
            const active = filters.kind === k.kind;
            return (
              <Link
                key={k.label}
                href={queueHref(base, filters, { kind: k.kind, page: 1 }, defaultView)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  active
                    ? "border-role-accent bg-role-accent-soft text-ink"
                    : "border-border-strong/40 bg-surface text-ink-muted hover:text-ink",
                )}
              >
                {k.label}
              </Link>
            );
          })}
        </nav>
        <Form action={base} className="flex w-full gap-2 lg:w-auto" role="search">
          {filters.view !== defaultView ? <input type="hidden" name="view" value={filters.view} /> : null}
          {filters.kind ? <input type="hidden" name="kind" value={filters.kind} /> : null}
          <label htmlFor="queue-search" className="sr-only">
            Tìm theo tên
          </label>
          <Input
            id="queue-search"
            name="q"
            type="search"
            defaultValue={filters.q}
            placeholder="Tìm theo tên…"
            maxLength={80}
            className="lg:w-72"
          />
          <Button type="submit" variant="outline" className="min-h-11 md:min-h-10">
            <Search aria-hidden />
            Tìm
          </Button>
        </Form>
      </div>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted" aria-live="polite">
        <span>
          <strong className="font-semibold text-ink tabular-nums">{total}</strong> {unit} · {sortNote}
        </span>
        {filtered ? (
          <Link
            href={queueHref(base, filters, { kind: null, q: "", page: 1 }, defaultView)}
            className="inline-flex min-h-6 items-center gap-1 font-medium text-primary underline underline-offset-4"
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Xóa lọc
          </Link>
        ) : null}
      </p>
    </div>
  );
}

function KindCell({ kind, subtype }: { kind: OrgListRow["kind"]; subtype: string }) {
  const Icon = kind === "store" ? Store : HandHeart;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon aria-hidden className="size-4 text-ink-subtle" />
      {ORG_KIND_LABEL[kind]} · {orgSubtypeLabel(kind, subtype)}
    </span>
  );
}

function ResubmitTag() {
  return (
    <span className="inline-flex w-fit items-center gap-1 rounded-full border border-info/30 bg-info-soft px-2 py-0.5 text-xs font-medium text-info">
      <History aria-hidden className="size-3.5" />
      Gửi lại
    </span>
  );
}

function wardText(ward: string | null, city: string | null) {
  return [ward, city].filter(Boolean).join(", ") || "Chưa có điểm";
}

/** Danh sách hồ sơ: bảng (≥ 768 px) / thẻ (mobile). `mode="queue"` hiện thời gian chờ. */
export function OrgList({
  rows,
  mode,
  detailBase,
  now,
  rowAction,
}: {
  rows: OrgListRow[];
  mode: "queue" | "decided";
  detailBase: string;
  now: Date;
  rowAction?: (row: OrgListRow) => React.ReactNode;
}) {
  const timeLabel = mode === "queue" ? "Gửi lúc" : "Quyết định lúc";
  return (
    <>
      <div className="hidden rounded-lg border bg-surface md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead scope="col" className="px-4">
                Hồ sơ
              </TableHead>
              <TableHead scope="col">Loại</TableHead>
              <TableHead scope="col">Phường/xã</TableHead>
              <TableHead scope="col" aria-sort={mode === "queue" ? "ascending" : "descending"}>
                {timeLabel}
              </TableHead>
              <TableHead scope="col" className="text-right">
                Giấy tờ
              </TableHead>
              <TableHead scope="col">Trạng thái</TableHead>
              {rowAction ? (
                <TableHead scope="col" className="pr-4 text-right">
                  <span className="sr-only">Thao tác</span>
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const at = mode === "queue" ? r.submittedAt : (r.reviewedAt ?? r.submittedAt);
              return (
                <TableRow key={r.id}>
                  <TableCell className="max-w-72 px-4 py-3 whitespace-normal">
                    <div className="flex flex-col gap-1">
                      <Link
                        href={`${detailBase}/${r.id}`}
                        className="font-semibold break-words text-ink underline-offset-4 hover:underline focus-visible:underline"
                      >
                        {r.name}
                      </Link>
                      {r.isResubmission ? <ResubmitTag /> : null}
                    </div>
                  </TableCell>
                  <TableCell className="py-3 whitespace-normal">
                    <KindCell kind={r.kind} subtype={r.subtype} />
                  </TableCell>
                  <TableCell className="max-w-56 py-3 whitespace-normal text-ink-muted">
                    {wardText(r.ward, r.city)}
                  </TableCell>
                  <TableCell className="py-3">
                    <div className="flex flex-col">
                      <span className="tabular-nums">{at ? formatDateTime(at) : "—"}</span>
                      {mode === "queue" ? (
                        <span className="text-xs text-ink-subtle">
                          {waitingLabel(waitingDays(r.submittedAt, now))}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="py-3 text-right tabular-nums">{r.documentsCount}</TableCell>
                  <TableCell className="py-3">
                    <StatusBadge status={r.status} />
                  </TableCell>
                  {rowAction ? <TableCell className="py-3 pr-4 text-right">{rowAction(r)}</TableCell> : null}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <ul className="flex flex-col gap-3 md:hidden">
        {rows.map((r) => {
          const at = mode === "queue" ? r.submittedAt : (r.reviewedAt ?? r.submittedAt);
          return (
            <li key={r.id}>
              <article
                aria-labelledby={`org-${r.id}`}
                className="flex flex-col gap-3 rounded-lg border bg-surface p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 id={`org-${r.id}`} className="min-w-0 text-base font-semibold break-words">
                    <Link href={`${detailBase}/${r.id}`} className="underline-offset-4 hover:underline">
                      {r.name}
                    </Link>
                  </h2>
                  <StatusBadge status={r.status} className="shrink-0" />
                </div>
                {r.isResubmission ? <ResubmitTag /> : null}
                <dl className="grid grid-cols-1 gap-1.5 text-sm text-ink-muted">
                  <div className="flex gap-2">
                    <dt className="sr-only">Loại</dt>
                    <dd>
                      <KindCell kind={r.kind} subtype={r.subtype} />
                    </dd>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <dt>
                      <MapPin aria-hidden className="size-4 text-ink-subtle" />
                      <span className="sr-only">Phường/xã</span>
                    </dt>
                    <dd>{wardText(r.ward, r.city)}</dd>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <dt>
                      <FileStack aria-hidden className="size-4 text-ink-subtle" />
                      <span className="sr-only">Giấy tờ</span>
                    </dt>
                    <dd>
                      <span className="tabular-nums">{r.documentsCount}</span> giấy tờ
                    </dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt className="text-ink-subtle">{timeLabel}:</dt>
                    <dd className="tabular-nums">
                      {at ? formatDate(at) : "—"}
                      {mode === "queue" ? ` · ${waitingLabel(waitingDays(r.submittedAt, now))}` : ""}
                    </dd>
                  </div>
                </dl>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm" className="min-h-11">
                    <Link href={`${detailBase}/${r.id}`}>Xem hồ sơ</Link>
                  </Button>
                  {rowAction ? rowAction(r) : null}
                </div>
              </article>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function fieldLabel(key: string): string {
  return LEGAL_FIELD_LABEL[key as LegalField] ?? key;
}

/** Yêu cầu cập nhật thông tin pháp lý đang chờ (US-ADM-02 AC3). */
export function ChangeRequestList({ rows, now }: { rows: ChangeRequestRow[]; now: Date }) {
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => (
        <li key={r.id}>
          <article
            aria-labelledby={`change-${r.id}`}
            className="flex flex-col gap-3 rounded-lg border bg-surface p-4 md:flex-row md:items-center md:justify-between"
          >
            <div className="flex min-w-0 flex-col gap-1.5">
              <p className="text-sm font-medium text-info">Cập nhật hồ sơ</p>
              <h2 id={`change-${r.id}`} className="text-base font-semibold break-words">
                <Link
                  href={`/admin/reviews/${r.orgId}#change-request`}
                  className="underline-offset-4 hover:underline"
                >
                  {r.orgName}
                </Link>
              </h2>
              <p className="text-sm text-ink-muted">
                <KindCell kind={r.kind} subtype={r.subtype} />
                {r.ward ? ` · ${r.ward}` : ""}
              </p>
              <p className="text-sm text-ink-muted">
                Thay đổi: {r.fields.length ? r.fields.map(fieldLabel).join(", ") : "—"}
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-2 md:items-end">
              <p className="text-sm text-ink-muted tabular-nums">
                {formatDateTime(r.submittedAt)} · {waitingLabel(waitingDays(r.submittedAt, now))}
              </p>
              <Button asChild variant="outline" size="sm" className="min-h-11 md:min-h-9">
                <Link href={`/admin/reviews/${r.orgId}#change-request`}>Xem và so sánh</Link>
              </Button>
            </div>
          </article>
        </li>
      ))}
    </ul>
  );
}

export function Pagination<V extends string>({
  base,
  filters,
  defaultView,
  total,
  pageSize,
}: {
  base: string;
  filters: QueueFilters<V>;
  defaultView: V;
  total: number;
  pageSize: number;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const prev = filters.page > 1 ? queueHref(base, filters, { page: filters.page - 1 }, defaultView) : null;
  const next =
    filters.page < pages ? queueHref(base, filters, { page: filters.page + 1 }, defaultView) : null;
  const linkCls =
    "inline-flex min-h-11 items-center gap-1 rounded-lg border bg-surface px-3 text-sm font-medium hover:bg-bg-sunken focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";
  return (
    <nav aria-label="Phân trang" className="flex items-center justify-between gap-3 pt-2">
      {prev ? (
        <Link href={prev} className={linkCls} rel="prev">
          <ChevronLeft aria-hidden className="size-4" />
          Trang trước
        </Link>
      ) : (
        <span aria-hidden className="w-24" />
      )}
      <p className="text-sm text-ink-muted tabular-nums">
        Trang {Math.min(filters.page, pages)}/{pages}
      </p>
      {next ? (
        <Link href={next} className={linkCls} rel="next">
          Trang sau
          <ChevronRight aria-hidden className="size-4" />
        </Link>
      ) : (
        <span aria-hidden className="w-24" />
      )}
    </nav>
  );
}
