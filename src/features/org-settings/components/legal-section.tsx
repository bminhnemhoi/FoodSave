"use client";

import { FilePen, Hourglass, Loader2, Send, ShieldCheck, X } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { describedBy, ErrorSummary, FormField, Section } from "@/features/onboarding/components/fields";
import { SettingsRepresentativeId } from "@/features/onboarding/components/representative-id-field";
import type { OrgKind } from "@/features/onboarding/options";
import { LEGAL_FIELD_LABEL, maskIdLast4, type LegalField } from "@/features/organizations/labels";
import { formatDateTime } from "@/lib/format";
import { newUuid } from "@/lib/hash";

import { submitLegalChange } from "../actions";
import type { ChangeRequestSummary, ProfileData } from "../queries";
import {
  LEGAL_FORM_TO_DB,
  LEGAL_REASON_MAX,
  legalFormKeys,
  validateLegalChanges,
  type LegalFormKey,
} from "../schemas";
import { Notice } from "./notice";

const FORM_LABEL: Record<LegalFormKey, string> = {
  legalName: "Tên pháp lý",
  taxCode: "Mã số thuế",
  registrationNo: "Số quyết định / giấy phép",
  representativeName: "Họ và tên người đại diện",
  representativeTitle: "Chức danh người đại diện",
};

function changeLines(changes: Record<string, string>): string[] {
  return Object.entries(changes).map(([k, v]) => `${LEGAL_FIELD_LABEL[k as LegalField] ?? k}: ${v}`);
}

function RequestStatus({ request }: { request: ChangeRequestSummary }) {
  const lines = changeLines(request.changes);
  if (request.status === "pending") {
    return (
      <Notice
        tone="info"
        icon={Hourglass}
        role="status"
        title="Đề nghị sửa thông tin pháp lý đang chờ FoodSave duyệt"
      >
        <p>Gửi lúc {formatDateTime(request.submittedAt)}. Giá trị mới chỉ áp dụng khi được duyệt:</p>
        <ul className="mt-1 list-disc pl-5">
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        <p className="mt-1">
          Trong lúc chờ, <strong>tổ chức của bạn vẫn ở trạng thái đã duyệt và hoạt động bình thường</strong>.
        </p>
      </Notice>
    );
  }
  if (request.status === "approved") {
    return (
      <Notice tone="success" title="Đề nghị gần nhất đã được duyệt">
        <p>
          FoodSave đã áp dụng thay đổi lúc {request.reviewedAt ? formatDateTime(request.reviewedAt) : "—"}:{" "}
          {lines.join("; ")}.
        </p>
      </Notice>
    );
  }
  return (
    <Notice tone="danger" title="Đề nghị gần nhất chưa được duyệt">
      <p>Thông tin cũ được giữ nguyên. Lý do của FoodSave: {request.reviewNote ?? "—"}</p>
    </Notice>
  );
}

/**
 * Thông tin pháp lý (US-STO-27 AC4, DATA-MODEL §6.8): chỉ đọc; sửa bằng đề nghị `submit_org_change_request`
 * chờ Admin duyệt — tổ chức VẪN `approved` trong lúc chờ. Chỉ chủ sở hữu gửi được.
 */
export function LegalSection({
  kind,
  orgId,
  legal,
  requests,
  canRequest,
}: {
  kind: OrgKind;
  orgId: string;
  legal: ProfileData["legal"];
  requests: ChangeRequestSummary[];
  canRequest: boolean;
}) {
  const uid = useId();
  const keys = legalFormKeys(kind);
  const current: Record<LegalFormKey, string | null> = {
    legalName: legal.legalName,
    taxCode: legal.taxCode,
    registrationNo: legal.registrationNo,
    representativeName: legal.representativeName,
    representativeTitle: legal.representativeTitle,
  };
  const pending = requests.find((r) => r.status === "pending");
  const latestDecided = pending ? null : (requests[0] ?? null);

  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<LegalFormKey, string>>(() => ({
    legalName: legal.legalName ?? "",
    taxCode: legal.taxCode ?? "",
    registrationNo: legal.registrationNo ?? "",
    representativeName: legal.representativeName ?? "",
    representativeTitle: legal.representativeTitle ?? "",
  }));
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Partial<Record<LegalFormKey | "reason" | "form", string>>>({});
  const [opId, setOpId] = useState(newUuid);
  const [busy, startTransition] = useTransition();

  function startEdit() {
    setOpen(true);
    setErrors({});
    setOpId(newUuid());
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next = Object.fromEntries(keys.map((k) => [k, values[k]])) as Partial<Record<LegalFormKey, string>>;
    const local = validateLegalChanges(kind, next, current);
    const reasonError =
      reason.trim().length > LEGAL_REASON_MAX ? `Lý do tối đa ${LEGAL_REASON_MAX} ký tự.` : null;
    if (!local.ok || reasonError) {
      const errs = { ...(local.ok ? {} : local.errors), ...(reasonError ? { reason: reasonError } : {}) };
      setErrors(errs);
      const first = keys.find((k) => errs[k]) ?? (errs.reason ? "reason" : null);
      if (first) document.getElementById(`${uid}-${first}`)?.focus();
      return;
    }
    setErrors({});
    startTransition(async () => {
      try {
        const res = await submitLegalChange({
          orgId,
          clientOpId: opId,
          values: next as Record<string, string>,
          reason,
        });
        if (!res.ok) {
          setErrors({ ...(res.error.fieldErrors ?? {}), form: res.error.message });
          return;
        }
        setOpen(false);
        setReason("");
        toast.success("Đã gửi đề nghị. Kết quả sẽ hiện tại đây khi FoodSave duyệt xong.");
      } catch {
        setErrors({ form: "Không có kết nối mạng. Dữ liệu của bạn vẫn còn — hãy thử lại khi có mạng." });
      }
    });
  }

  const summary = keys.filter((k) => errors[k]).map((k) => ({ id: `${uid}-${k}`, message: errors[k]! }));

  return (
    <Section
      title="Thông tin pháp lý"
      headingId="profile-legal"
      description="Tên pháp lý, mã số và người đại diện đã được FoodSave xác minh khi duyệt hồ sơ. Muốn sửa, hãy gửi đề nghị để FoodSave duyệt lại riêng mục đó."
    >
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {keys.map((k) => (
          <div key={k} className="flex flex-col gap-0.5">
            <dt className="text-sm text-ink-subtle">{LEGAL_FIELD_LABEL[LEGAL_FORM_TO_DB[k]]}</dt>
            <dd className="font-medium break-words">{current[k] ?? "—"}</dd>
          </div>
        ))}
        <div className="flex flex-col gap-0.5">
          <dt className="text-sm text-ink-subtle">
            {legal.representativeId ? "CCCD người đại diện" : LEGAL_FIELD_LABEL.representative_id_last4}
          </dt>
          <dd className="flex flex-wrap items-center gap-2 font-medium tabular-nums">
            <span className="font-mono tracking-wider">
              {legal.representativeId ? legal.representativeId.masked : maskIdLast4(legal.idLast4)}
            </span>
            {legal.idVerifiedAt ? (
              <span className="inline-flex items-center gap-1 text-sm font-normal text-success">
                <ShieldCheck aria-hidden className="size-4" />
                FoodSave đã xác minh
              </span>
            ) : null}
          </dd>
        </div>
      </dl>

      {!legal.representativeId ? (
        <div className="flex flex-col gap-2 rounded-lg border bg-bg p-4" data-representative-id-field>
          <p className="text-sm text-ink-muted">
            Chưa lưu số CCCD người đại diện. Thêm số (nhập tay hoặc quét QR trên CCCD gắn chip) để FoodSave
            xác minh nhanh hơn — FoodSave không lưu ảnh CCCD.
          </p>
          <SettingsRepresentativeId
            orgId={orgId}
            declaredName={legal.representativeName ?? ""}
            initial={null}
            canEdit
          />
        </div>
      ) : legal.representativeId.source === "cccd_qr" ? (
        <SettingsRepresentativeId
          orgId={orgId}
          declaredName={legal.representativeName ?? ""}
          initial={legal.representativeId}
          canEdit={false}
        />
      ) : null}

      {pending ? (
        <RequestStatus request={pending} />
      ) : latestDecided ? (
        <RequestStatus request={latestDecided} />
      ) : null}

      {!canRequest ? (
        <p className="text-sm text-ink-subtle">Chỉ chủ sở hữu gửi được đề nghị sửa thông tin pháp lý.</p>
      ) : pending ? null : !open ? (
        <div>
          <Button type="button" variant="outline" className="min-h-11" onClick={startEdit}>
            <FilePen aria-hidden />
            Đề nghị sửa thông tin pháp lý
          </Button>
        </div>
      ) : (
        <form noValidate onSubmit={submit} className="flex flex-col gap-5 rounded-lg border bg-bg p-4">
          <Notice tone="info" title="Tổ chức của bạn vẫn hoạt động bình thường trong lúc chờ duyệt">
            Chỉ mục bạn sửa được gửi đi. Giá trị hiện tại vẫn hiệu lực cho tới khi FoodSave duyệt; nếu không
            được duyệt, thông tin cũ được giữ nguyên và bạn sẽ thấy lý do tại đây.
          </Notice>
          <ErrorSummary errors={summary} />
          {errors.form ? (
            <p
              role="alert"
              className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger"
            >
              {errors.form}
            </p>
          ) : null}
          <div className="grid gap-5 sm:grid-cols-2">
            {keys.map((k) => (
              <FormField key={k} id={`${uid}-${k}`} label={FORM_LABEL[k]} required error={errors[k] ?? null}>
                <Input
                  id={`${uid}-${k}`}
                  value={values[k]}
                  maxLength={k === "registrationNo" ? 60 : 200}
                  onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))}
                  aria-invalid={errors[k] ? true : undefined}
                  aria-describedby={describedBy(`${uid}-${k}`, null, errors[k])}
                />
              </FormField>
            ))}
          </div>
          <FormField
            id={`${uid}-reason`}
            label="Lý do thay đổi"
            error={errors.reason ?? null}
            hint="Ví dụ: đổi từ hộ kinh doanh sang công ty TNHH. Giúp FoodSave duyệt nhanh hơn."
          >
            <Textarea
              id={`${uid}-reason`}
              rows={3}
              maxLength={LEGAL_REASON_MAX}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-invalid={errors.reason ? true : undefined}
              aria-describedby={describedBy(`${uid}-reason`, true, errors.reason)}
              className="min-h-20 bg-surface"
            />
          </FormField>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy} aria-disabled={busy} className="min-h-11">
              {busy ? <Loader2 aria-hidden className="animate-spin" /> : <Send aria-hidden />}
              {busy ? "Đang gửi…" : "Gửi đề nghị"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              <X aria-hidden />
              Hủy
            </Button>
          </div>
        </form>
      )}
    </Section>
  );
}
