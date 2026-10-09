import {
  BadgeCheck,
  Ban,
  CircleX,
  Clock,
  FileClock,
  FileCheck2,
  History,
  Info,
  Lock,
  MapPin,
  MessageSquareQuote,
  MessageSquareWarning,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";

import { StatusBadge } from "@/components/labels/status-badge";
import { compareNames, namesMatch } from "@/features/onboarding/cccd";
import { CONSENT_PURPOSE_LABEL, maskIdLast4, SITE_VISIBILITY_LABEL } from "@/features/organizations/labels";
import { formatDate, formatDateTime, formatKm, formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import { buildChangeDiff, describeActor, describeAuditEntry, type HistoryTone } from "../present";
import type { OrgReviewDetail, ReviewChangeRequest, ReviewSite } from "../queries";
import { DocumentList } from "./document-list";
import { ChangeRequestButtons, OrgStandingButton, ReviewDecisionButtons } from "./review-actions";
import { SiteMap } from "./site-map";
import { RevealIdButton } from "./reveal-id-button";
import { VerifyIdForm } from "./verify-id-form";

const VERIFY_METHOD_TEXT: Record<string, string> = {
  cccd_qr: " (quét QR CCCD)",
  manual_document: " (đối chiếu giấy tờ)",
  video_call: " (đối chiếu qua gọi video)",
};

/** Khối nội dung trang chi tiết hồ sơ (Server Component). */

export function Section({
  id,
  title,
  icon: Icon,
  note,
  children,
  className,
}: {
  id?: string;
  title: string;
  icon?: LucideIcon;
  note?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const headingId = `${id ?? title.replace(/\W+/g, "-")}-title`;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn("flex scroll-mt-24 flex-col gap-4 rounded-xl border bg-surface p-5 sm:p-6", className)}
    >
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="flex items-center gap-2 text-lg font-semibold">
          {Icon ? <Icon aria-hidden className="size-5 text-ink-subtle" /> : null}
          {title}
        </h2>
        {note ? <p className="text-sm text-ink-subtle">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

export type InfoItem = { label: string; value: React.ReactNode; wide?: boolean };

export function InfoList({ items }: { items: InfoItem[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map((i) => (
        <div key={i.label} className={cn("flex min-w-0 flex-col gap-0.5", i.wide && "sm:col-span-2")}>
          <dt className="text-sm text-ink-subtle">{i.label}</dt>
          <dd className="break-words whitespace-pre-line text-ink">{i.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

const orDash = (v: string | number | null | undefined) =>
  v === null || v === undefined || v === "" ? "—" : String(v);

// ---------------------------------------------------------------------------
// Pháp lý — CCCD: dạng che + "Hiện số" (aal2, có nhật ký); không bao giờ có ảnh CCCD
// ---------------------------------------------------------------------------

export function LegalSection({
  orgId,
  legal,
  canVerify,
}: {
  orgId: string;
  legal: OrgReviewDetail["legal"];
  canVerify: boolean;
}) {
  if (!legal) {
    return (
      <Section title="Thông tin pháp lý" icon={Lock}>
        <p className="text-ink-muted">Chưa có thông tin pháp lý.</p>
      </Section>
    );
  }
  const verified = legal.idVerifiedAt
    ? `Đã xác minh lúc ${formatDateTime(legal.idVerifiedAt)}${VERIFY_METHOD_TEXT[legal.idVerificationMethod ?? ""] ?? ""}`
    : "Chưa xác minh";
  const rep = legal.representativeId;
  const match = rep?.nameOnCard ? compareNames(rep.nameOnCard, legal.representativeName) : null;
  return (
    <Section
      title="Thông tin pháp lý"
      icon={Lock}
      note="Chỉ Admin và chủ/quản lý của tổ chức xem được. FoodSave không lưu ảnh CCCD; số đầy đủ chỉ Admin (xác thực hai lớp) xem được, mỗi lần xem có nhật ký."
    >
      <InfoList
        items={[
          { label: "Tên pháp lý", value: orDash(legal.legalName) },
          { label: "Mã số thuế", value: <span className="tabular-nums">{orDash(legal.taxCode)}</span> },
          { label: "Số giấy phép / quyết định", value: orDash(legal.registrationNo) },
          { label: "Người đại diện", value: orDash(legal.representativeName) },
          { label: "Chức danh", value: orDash(legal.representativeTitle) },
          ...(rep
            ? [
                {
                  label: "Số CCCD người đại diện",
                  value: (
                    <div className="flex flex-col gap-2">
                      <span className="font-mono tracking-wider tabular-nums" data-masked-id>
                        {rep.masked}
                      </span>
                      <RevealIdButton orgId={orgId} />
                    </div>
                  ),
                },
                {
                  label: "Nguồn số CCCD",
                  value: rep.source === "cccd_qr" ? "Quét QR trên CCCD gắn chip" : "Nhập tay",
                },
                {
                  label: "Họ tên khớp",
                  value:
                    match === null ? (
                      <span className="text-ink-muted">— (nhập tay, không có họ tên trên thẻ để so)</span>
                    ) : namesMatch(match) ? (
                      <span className="inline-flex items-center gap-1.5 text-success" data-name-match="yes">
                        <BadgeCheck aria-hidden className="size-4" />
                        Có{match === "no_diacritics" ? " (khác dấu)" : ""} — trên thẻ: {rep.nameOnCard}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-danger" data-name-match="no">
                        <CircleX aria-hidden className="size-4" />
                        Không — trên thẻ: {rep.nameOnCard}
                      </span>
                    ),
                },
              ]
            : [
                {
                  label: "CCCD người đại diện (4 số cuối)",
                  value: (
                    <span className="font-mono tracking-wider tabular-nums">
                      {maskIdLast4(legal.representativeIdLast4)}
                    </span>
                  ),
                },
              ]),
          {
            label: "Xác minh CCCD",
            value: (
              <span
                className={cn(
                  "inline-flex items-center gap-1.5",
                  legal.idVerifiedAt ? "text-success" : "text-ink",
                )}
              >
                {legal.idVerifiedAt ? (
                  <BadgeCheck aria-hidden className="size-4" />
                ) : (
                  <Clock aria-hidden className="size-4" />
                )}
                {verified}
              </span>
            ),
            wide: true,
          },
          { label: "Email liên hệ", value: orDash(legal.contactEmail) },
          {
            label: "Số điện thoại liên hệ",
            value: <span className="tabular-nums">{orDash(legal.contactPhone)}</span>,
          },
        ]}
      />
      {canVerify && !legal.idVerifiedAt ? (
        <VerifyIdForm orgId={orgId} declaredLast4={legal.representativeIdLast4} />
      ) : null}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Điểm + bản đồ (tọa độ chính xác chỉ cho Admin)
// ---------------------------------------------------------------------------

const DOW = ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
const hhmm = (t: string) => t.slice(0, 5);

function SiteBlock({ site, kind }: { site: ReviewSite; kind: "store" | "charity" }) {
  const items: InfoItem[] = [
    { label: "Địa chỉ", value: site.exact?.address ?? "Không đọc được địa chỉ chính xác", wide: true },
    { label: "Phường/xã", value: orDash(site.ward) },
    { label: "Tỉnh/thành", value: site.city },
    { label: "Hiển thị vị trí", value: SITE_VISIBILITY_LABEL[site.visibility] },
    {
      label: "Nguồn tọa độ",
      value:
        site.locationSource === "pin"
          ? "Ghim trên bản đồ"
          : site.locationSource === "gps"
            ? "Vị trí thiết bị"
            : "Từ địa chỉ",
    },
  ];
  if (kind === "charity") {
    items.push({ label: "Bán kính phục vụ", value: formatKm(site.radiusKm) });
    items.push({ label: "Sức nhận", value: site.capacityKg ? `${site.capacityKg} kg/ngày` : "—" });
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">{site.name}</h3>
        {site.isPrimary ? (
          <span className="rounded-full bg-bg-sunken px-2 py-0.5 text-xs font-medium text-ink-muted">
            Điểm chính
          </span>
        ) : null}
        {!site.isActive ? (
          <span className="rounded-full bg-bg-sunken px-2 py-0.5 text-xs font-medium text-ink-muted">
            Ngừng hoạt động
          </span>
        ) : null}
      </div>
      {site.exact ? (
        <SiteMap
          siteId={site.id}
          name={site.name}
          lat={site.exact.lat}
          lng={site.exact.lng}
          kind={kind}
          address={site.exact.address}
        />
      ) : null}
      <InfoList items={items} />
      <div>
        <p className="text-sm text-ink-subtle">{kind === "store" ? "Giờ mở cửa" : "Giờ nhận hàng"}</p>
        {site.hours.length === 0 ? (
          <p className="text-ink">Chưa khai giờ (coi như mở cả ngày)</p>
        ) : (
          <ul className="mt-1 grid gap-x-6 gap-y-0.5 text-ink sm:grid-cols-2">
            {site.hours.map((h, i) => (
              <li key={`${h.dow}-${h.opens}-${i}`} className="tabular-nums">
                {DOW[h.dow]}: {hhmm(h.opens)}–{hhmm(h.closes)}
                {h.closesNextDay ? " (hôm sau)" : ""}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function SitesSection({ sites, kind }: { sites: ReviewSite[]; kind: "store" | "charity" }) {
  return (
    <Section
      title={kind === "store" ? "Điểm của cửa hàng" : "Điểm nhận của tổ chức"}
      icon={MapPin}
      note="Vị trí chính xác chỉ hiển thị cho Admin và thành viên tổ chức."
    >
      {sites.length === 0 ? (
        <p className="text-ink-muted">Hồ sơ chưa có điểm nào.</p>
      ) : (
        <div className="flex flex-col gap-6 divide-y">
          {sites.map((s) => (
            <div key={s.id} className="pb-6 last:pb-0">
              <SiteBlock site={s} kind={kind} />
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Quyết định (thẻ bên phải)
// ---------------------------------------------------------------------------

export function DecisionCard({ detail, selfDealing }: { detail: OrgReviewDetail; selfDealing: boolean }) {
  const { org } = detail;
  const reviewedLine =
    org.reviewedAt && org.reviewedByName
      ? `Bởi Admin ${org.reviewedByName} lúc ${formatDateTime(org.reviewedAt)}`
      : org.reviewedAt
        ? `Lúc ${formatDateTime(org.reviewedAt)}`
        : null;

  return (
    <Section title="Quyết định" icon={ShieldAlert}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-ink-subtle">Trạng thái hiện tại:</span>
        <StatusBadge status={org.status} />
      </div>

      {selfDealing ? (
        <p
          role="note"
          className="flex gap-2 rounded-lg border border-warning/30 bg-warning-soft p-3 text-sm text-ink"
        >
          <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
          Bạn là thành viên hoặc người tạo của tổ chức này nên không thể tự ra quyết định. Hãy nhờ một Admin
          khác.
        </p>
      ) : null}

      {org.status === "submitted" ? (
        <>
          {org.reviewedAt && org.rejectionReason ? (
            <ReasonBox
              icon={MessageSquareQuote}
              title="Gửi lại sau lần yêu cầu bổ sung trước"
              reason={org.rejectionReason}
              meta={reviewedLine}
            />
          ) : null}
          {!selfDealing ? <ReviewDecisionButtons orgId={org.id} orgName={org.name} /> : null}
        </>
      ) : null}

      {org.status === "needs_changes" || org.status === "rejected" ? (
        <ReasonBox
          icon={org.status === "rejected" ? CircleX : MessageSquareWarning}
          title={org.status === "rejected" ? "Lý do từ chối" : "Nội dung đã yêu cầu bổ sung"}
          reason={org.rejectionReason ?? "—"}
          meta={reviewedLine}
        />
      ) : null}
      {org.status === "needs_changes" ? (
        <p className="text-sm text-ink-muted">Hồ sơ sẽ quay lại hàng đợi khi bên đăng ký sửa và gửi lại.</p>
      ) : null}

      {org.status === "approved" ? (
        <>
          <p className="flex items-start gap-2 text-sm text-ink-muted">
            <BadgeCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
            {reviewedLine ? `Đã duyệt. ${reviewedLine}.` : "Đã duyệt."}
          </p>
          {!selfDealing ? <OrgStandingButton orgId={org.id} orgName={org.name} status="approved" /> : null}
        </>
      ) : null}

      {org.status === "suspended" ? (
        <>
          <p className="flex items-start gap-2 text-sm text-ink-muted">
            <Ban aria-hidden className="mt-0.5 size-4 shrink-0 text-danger" />
            Tổ chức đang tạm khóa. Lý do nằm trong lịch sử bên dưới.
          </p>
          {!selfDealing ? <OrgStandingButton orgId={org.id} orgName={org.name} status="suspended" /> : null}
        </>
      ) : null}

      {org.status === "draft" ? (
        <p className="text-sm text-ink-muted">Hồ sơ còn ở bản nháp, chưa gửi duyệt.</p>
      ) : null}
      {org.status === "closed" ? <p className="text-sm text-ink-muted">Tổ chức đã đóng.</p> : null}
    </Section>
  );
}

function ReasonBox({
  icon: Icon,
  title,
  reason,
  meta,
}: {
  icon: LucideIcon;
  title: string;
  reason: string;
  meta: string | null;
}) {
  return (
    <div className="flex gap-3 rounded-lg border border-warning/30 bg-warning-soft p-3">
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
      <div className="min-w-0 text-sm">
        <p className="font-semibold text-ink">{title}</p>
        <p className="break-words whitespace-pre-line text-ink">{reason}</p>
        {meta ? <p className="mt-1 text-ink-muted">{meta}</p> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Yêu cầu cập nhật thông tin pháp lý (so sánh cũ/mới)
// ---------------------------------------------------------------------------

const CHANGE_STATUS_TEXT = { pending: "Đang chờ", approved: "Đã duyệt", rejected: "Bị từ chối" } as const;

export function ChangeRequestSection({
  orgName,
  requests,
  documents,
  canDecide,
}: {
  orgName: string;
  requests: ReviewChangeRequest[];
  documents: OrgReviewDetail["documents"];
  canDecide: boolean;
}) {
  if (requests.length === 0) return null;
  const pending = requests.find((r) => r.status === "pending");
  const past = requests.filter((r) => r.status !== "pending");
  return (
    <Section
      id="change-request"
      title="Yêu cầu cập nhật thông tin pháp lý"
      icon={FileClock}
      note="Tổ chức vẫn hoạt động bình thường trong lúc chờ; giá trị mới chỉ áp dụng khi bạn duyệt."
    >
      {pending ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink-muted">
            Gửi lúc {formatDateTime(pending.submittedAt)}
            {pending.submittedByName ? ` bởi ${pending.submittedByName}` : ""}
          </p>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <caption className="sr-only">So sánh giá trị hiện tại và giá trị đề nghị</caption>
              <thead className="bg-bg-sunken text-left">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Trường
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Giá trị hiện tại
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Giá trị mới
                  </th>
                </tr>
              </thead>
              <tbody>
                {buildChangeDiff(pending.previous, pending.changes).map((row) => (
                  <tr key={row.field} className="border-t align-top">
                    <th scope="row" className="px-3 py-2 text-left font-medium">
                      {row.label}
                    </th>
                    <td className="px-3 py-2 break-words text-ink-muted">
                      <span className="sr-only">Cũ: </span>
                      {row.before}
                    </td>
                    <td className="bg-info-soft/60 px-3 py-2 font-medium break-words text-ink">
                      <span className="sr-only">Mới: </span>
                      {row.after}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pending.reason ? (
            <ReasonBox
              icon={MessageSquareQuote}
              title="Giải thích của tổ chức"
              reason={pending.reason}
              meta={null}
            />
          ) : null}
          <div className="flex flex-col gap-2">
            <h3 className="font-semibold">Giấy tờ kèm theo</h3>
            <DocumentList
              documents={documents.filter((d) => d.changeRequestId === pending.id)}
              orgName={orgName}
            />
          </div>
          {canDecide ? <ChangeRequestButtons requestId={pending.id} orgName={orgName} /> : null}
        </div>
      ) : null}

      {past.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="font-semibold">Yêu cầu trước đây</h3>
          <ul className="flex flex-col gap-2 text-sm">
            {past.map((r) => (
              <li key={r.id} className="rounded-lg border p-3">
                <p>
                  <span className="font-medium">{CHANGE_STATUS_TEXT[r.status]}</span> · gửi{" "}
                  {formatDate(r.submittedAt)}
                  {r.reviewedAt ? ` · xử lý ${formatDate(r.reviewedAt)}` : ""}
                  {r.reviewedByName ? ` bởi Admin ${r.reviewedByName}` : ""}
                </p>
                {r.reviewNote ? (
                  <p className="mt-1 whitespace-pre-line text-ink-muted">{r.reviewNote}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Đồng ý đã ghi nhận + lịch sử
// ---------------------------------------------------------------------------

export function ConsentsSection({ consents }: { consents: OrgReviewDetail["consents"] }) {
  return (
    <Section
      title="Đồng ý đã ghi nhận"
      icon={FileCheck2}
      note="Của chủ hồ sơ, theo phiên bản chính sách tại thời điểm đồng ý."
    >
      {consents.length === 0 ? (
        <p className="text-sm text-ink-muted">Chưa có bản ghi đồng ý.</p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {consents.map((c, i) => (
            <li key={`${c.purpose}-${c.grantedAt}-${i}`} className="flex flex-col">
              <span className="font-medium">{CONSENT_PURPOSE_LABEL[c.purpose]}</span>
              <span className="text-ink-muted">
                Phiên bản {c.policyVersion} · {formatDateTime(c.grantedAt)}
                {c.withdrawnAt ? ` · đã rút lại ${formatDateTime(c.withdrawnAt)}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

const TONE_DOT: Record<HistoryTone, string> = {
  neutral: "bg-border-strong",
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

export function HistorySection({ history, now }: { history: OrgReviewDetail["history"]; now: Date }) {
  return (
    <Section title="Lịch sử" icon={History} note="Nhật ký chỉ đọc: ai làm gì, lúc nào, với lý do gì.">
      {history.length === 0 ? (
        <p className="text-sm text-ink-muted">Chưa có hoạt động nào được ghi.</p>
      ) : (
        <ol className="border-border-subtle relative flex flex-col gap-4 border-l pl-5">
          {history.map((h) => {
            const d = describeAuditEntry({ action: h.action, after: h.after, actorKind: h.actorKind });
            return (
              <li key={h.id} className="relative flex flex-col gap-0.5 text-sm">
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-1.5 -left-[25px] size-2.5 rounded-full ring-4 ring-surface",
                    TONE_DOT[d.tone],
                  )}
                />
                <p className="font-medium text-ink">{d.title}</p>
                <p className="text-ink-muted">
                  {describeActor(h.actorKind, h.actorName)} ·{" "}
                  <time dateTime={h.at} title={formatDateTime(h.at)}>
                    {formatRelativeTime(h.at, now)}
                  </time>
                </p>
                {h.reason ? (
                  <p className="mt-1 rounded-md bg-bg-sunken px-2.5 py-1.5 break-words whitespace-pre-line text-ink">
                    {h.reason}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </Section>
  );
}
