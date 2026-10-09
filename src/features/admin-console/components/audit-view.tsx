import { Search, X } from "lucide-react";
import Form from "next/form";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NativeSelect } from "@/features/needs/components/native-select";

import {
  actorDisplayName,
  actorRoleLabel,
  auditActionLabel,
  auditEntityHref,
  AUDIT_ENTITY_LABEL,
  AUDIT_GROUP_LABEL,
  entityTypeLabel,
  prettyAuditJson,
  shortId,
} from "../audit-present";
import { AUDIT_ACTION_GROUPS, AUDIT_ENTITY_TYPES, auditHref, type AuditFilters } from "../filters";
import type { AuditRow } from "../queries";
import { ExpandableRow } from "./expandable-row";

/** Màn "Nhật ký kiểm toán" của Admin (US-ADM-11, F-63): chỉ đọc, lọc trên URL, mở rộng xem trước/sau. */

export const AUDIT_BASE = "/admin/audit";

const atFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Ho_Chi_Minh",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** "09/10/2026 11:42:05" — 24 giờ, giờ Việt Nam. */
export function formatAuditAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = Object.fromEntries(atFormat.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second}`;
}

export function AuditFilterBar({ filters }: { filters: AuditFilters }) {
  return (
    <div className="flex flex-col gap-3">
      <Form
        action={AUDIT_BASE}
        role="search"
        aria-label="Lọc nhật ký"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(5,minmax(0,1fr))_auto] lg:items-end"
      >
        {filters.id ? <input type="hidden" name="id" value={filters.id} /> : null}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="audit-act" className="text-sm font-medium">
            Nhóm hành động
          </label>
          <NativeSelect id="audit-act" name="act" defaultValue={filters.act ?? ""}>
            <option value="">Mọi hành động</option>
            {AUDIT_ACTION_GROUPS.map((g) => (
              <option key={g} value={g}>
                {AUDIT_GROUP_LABEL[g]} ({g}.)
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="audit-type" className="text-sm font-medium">
            Loại đối tượng
          </label>
          <NativeSelect id="audit-type" name="type" defaultValue={filters.type ?? ""}>
            <option value="">Mọi loại</option>
            {AUDIT_ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {AUDIT_ENTITY_LABEL[t]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="audit-actor" className="text-sm font-medium">
            Người thực hiện
          </label>
          <Input
            id="audit-actor"
            name="actor"
            type="search"
            defaultValue={filters.actor}
            placeholder="Tên hoặc email…"
            maxLength={80}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="audit-from" className="text-sm font-medium">
            Từ ngày
          </label>
          <Input id="audit-from" name="from" type="date" defaultValue={filters.from ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="audit-to" className="text-sm font-medium">
            Đến ngày
          </label>
          <Input id="audit-to" name="to" type="date" defaultValue={filters.to ?? ""} />
        </div>
        <Button type="submit" variant="outline" className="min-h-11 md:min-h-10">
          <Search aria-hidden />
          Lọc
        </Button>
      </Form>
      {filters.id ? (
        <p className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
          Đang xem một đối tượng:{" "}
          <code className="rounded bg-bg-sunken px-1.5 py-0.5 font-mono text-xs text-ink">{filters.id}</code>
          <Link
            href={auditHref(AUDIT_BASE, filters, { id: null, page: 1 })}
            className="inline-flex min-h-6 items-center gap-1 font-medium text-primary underline underline-offset-4"
          >
            <X aria-hidden className="size-3.5" />
            Bỏ chọn đối tượng
          </Link>
        </p>
      ) : null}
      <p className="text-xs text-ink-subtle">
        Ngày tính theo giờ Việt Nam, trọn ngày. Nhật ký chỉ đọc: không ai sửa hoặc xóa được dòng nào.
      </p>
    </div>
  );
}

function JsonBlock({ title, value }: { title: string; value: string | null }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <p className="text-sm font-medium">{title}</p>
      {value ? (
        <pre
          tabIndex={0}
          aria-label={`Dữ liệu ${title.toLowerCase()}`}
          className="max-h-72 overflow-auto rounded-lg border bg-surface p-3 font-mono text-xs leading-relaxed whitespace-pre text-ink focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {value}
        </pre>
      ) : (
        <p className="rounded-lg border border-dashed bg-surface px-3 py-2 text-sm text-ink-muted">
          Không có dữ liệu
        </p>
      )}
    </div>
  );
}

function AuditDetail({ row }: { row: AuditRow }) {
  return (
    <div className="flex flex-col gap-4" data-testid="audit-detail">
      <div className="grid gap-4 md:grid-cols-2">
        <JsonBlock title="Trước" value={prettyAuditJson(row.before)} />
        <JsonBlock title="Sau" value={prettyAuditJson(row.after)} />
      </div>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {row.reason ? (
          <div className="flex flex-col gap-0.5 sm:col-span-2">
            <dt className="text-ink-subtle">Lý do</dt>
            <dd className="break-words whitespace-pre-line text-ink">{row.reason}</dd>
          </div>
        ) : null}
        <div className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-ink-subtle">Mã đối tượng</dt>
          <dd className="font-mono text-xs break-all text-ink">{row.entityId ?? "—"}</dd>
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-ink-subtle">Mã dòng nhật ký</dt>
          <dd className="font-mono text-xs text-ink">#{row.id}</dd>
        </div>
      </dl>
    </div>
  );
}

function ActorCell({ row }: { row: AuditRow }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-medium break-words">
        {actorDisplayName(row.actorKind, row.actorId, row.actor)}
      </span>
      <span className="text-xs text-ink-muted">{actorRoleLabel(row.actorKind, row.actorOrgRole)}</span>
    </div>
  );
}

function ActionCell({ row }: { row: AuditRow }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-medium">{auditActionLabel(row.action, row.after)}</span>
      <code className="w-fit font-mono text-xs text-ink-subtle">{row.action}</code>
    </div>
  );
}

function EntityCell({ row }: { row: AuditRow }) {
  const href = auditEntityHref(row.entityType, row.entityId, row.orgId);
  const label = entityTypeLabel(row.entityType);
  const id = shortId(row.entityId);
  return (
    <div className="flex flex-col gap-0.5">
      <span>{label}</span>
      {href ? (
        <Link
          href={href}
          className="w-fit font-mono text-xs text-primary underline underline-offset-4"
          aria-label={`Mở ${label.toLowerCase()} ${id}`}
        >
          {id}
        </Link>
      ) : (
        <code className="w-fit font-mono text-xs text-ink-subtle">{id}</code>
      )}
    </div>
  );
}

function OrgCell({ row }: { row: AuditRow }) {
  if (row.org) {
    return (
      <Link
        href={`/admin/reviews/${row.org.id}`}
        className="break-words text-primary underline underline-offset-4"
      >
        {row.org.name}
      </Link>
    );
  }
  return <span className="text-ink-subtle">{row.orgId ? shortId(row.orgId) : "—"}</span>;
}

export function AuditList({ rows }: { rows: AuditRow[] }) {
  return (
    <>
      <div className="hidden rounded-lg border bg-surface lg:block">
        <Table>
          <caption className="sr-only">Nhật ký kiểm toán, mới nhất trước</caption>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead scope="col" className="px-4" aria-sort="descending">
                Thời gian
              </TableHead>
              <TableHead scope="col">Người thực hiện</TableHead>
              <TableHead scope="col">Hành động</TableHead>
              <TableHead scope="col">Đối tượng</TableHead>
              <TableHead scope="col">Tổ chức</TableHead>
              <TableHead scope="col" className="pr-4 text-right">
                <span className="sr-only">Chi tiết</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <ExpandableRow
                key={r.id}
                testId="audit-row"
                colSpan={6}
                label={`${auditActionLabel(r.action, r.after)} lúc ${formatAuditAt(r.at)}`}
                cells={
                  <>
                    <TableCell className="px-4 py-3 tabular-nums">{formatAuditAt(r.at)}</TableCell>
                    <TableCell className="max-w-56 py-3 whitespace-normal">
                      <ActorCell row={r} />
                    </TableCell>
                    <TableCell className="max-w-64 py-3 whitespace-normal">
                      <ActionCell row={r} />
                    </TableCell>
                    <TableCell className="py-3">
                      <EntityCell row={r} />
                    </TableCell>
                    <TableCell className="max-w-56 py-3 whitespace-normal">
                      <OrgCell row={r} />
                    </TableCell>
                  </>
                }
                detail={<AuditDetail row={r} />}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="flex flex-col gap-3 lg:hidden">
        {rows.map((r) => (
          <li key={r.id}>
            <article
              aria-labelledby={`audit-${r.id}`}
              data-testid="audit-card"
              className="flex flex-col gap-3 rounded-lg border bg-surface p-4"
            >
              <div className="flex flex-col gap-0.5">
                <h2 id={`audit-${r.id}`} className="text-base font-semibold">
                  {auditActionLabel(r.action, r.after)}
                </h2>
                <code className="w-fit font-mono text-xs text-ink-subtle">{r.action}</code>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div className="col-span-2 flex flex-col gap-0.5">
                  <dt className="text-xs text-ink-subtle">Thời gian</dt>
                  <dd className="tabular-nums">{formatAuditAt(r.at)}</dd>
                </div>
                <div className="col-span-2 flex flex-col gap-0.5">
                  <dt className="text-xs text-ink-subtle">Người thực hiện</dt>
                  <dd>
                    <ActorCell row={r} />
                  </dd>
                </div>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <dt className="text-xs text-ink-subtle">Đối tượng</dt>
                  <dd>
                    <EntityCell row={r} />
                  </dd>
                </div>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <dt className="text-xs text-ink-subtle">Tổ chức</dt>
                  <dd>
                    <OrgCell row={r} />
                  </dd>
                </div>
              </dl>
              <details className="group rounded-lg border bg-bg-sunken/40">
                <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-medium">
                  Xem dữ liệu trước / sau
                </summary>
                <div className="border-t p-3">
                  <AuditDetail row={r} />
                </div>
              </details>
            </article>
          </li>
        ))}
      </ul>
    </>
  );
}
