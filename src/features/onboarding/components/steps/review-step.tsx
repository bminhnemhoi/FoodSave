"use client";

import { CircleAlert, CircleCheck, ExternalLink, Loader2, Pencil, Send, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { formatKm } from "@/lib/format";
import { newUuid } from "@/lib/hash";

import { submitOnboarding } from "../../actions";
import { CONSENT_ITEMS, consentParts, type ConsentKey } from "../../consent";
import type { MissingItem } from "../../errors";
import { hoursFromRows, summarizeHours } from "../../hours";
import {
  DOC_SLOTS,
  FOOD_CATEGORIES,
  FOOD_CATEGORY_CODES,
  KIND_COPY,
  subtypeLabel,
  VISIBILITY_OPTIONS,
} from "../../options";
import { computeProgress, snapshotOf, stepTitle, type StepKey } from "../../progress";
import { consentSchema } from "../../schemas";
import { FieldErrorText } from "../fields";
import { useWizard } from "../wizard-context";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm text-ink-subtle">{label}</dt>
      <dd className="text-sm break-words text-ink">
        {value || <span className="text-ink-subtle">Chưa nhập</span>}
      </dd>
    </div>
  );
}

function SummaryCard({
  step,
  complete,
  onEdit,
  children,
}: {
  step: StepKey;
  complete: boolean;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  const { kind } = useWizard();
  const title = stepTitle(kind, step);
  return (
    <section
      aria-labelledby={`review-${step}`}
      className="flex flex-col gap-4 rounded-xl border bg-surface p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={`review-${step}`} className="text-lg font-semibold">
            {title}
          </h2>
          {complete ? (
            <p className="flex items-center gap-1.5 text-sm text-success">
              <CircleCheck aria-hidden className="size-4" />
              Đã đủ thông tin
            </p>
          ) : (
            <p className="flex items-center gap-1.5 text-sm text-warning">
              <TriangleAlert aria-hidden className="size-4" />
              Còn thiếu thông tin bắt buộc
            </p>
          )}
        </div>
        <Button type="button" variant="outline" className="min-h-11" onClick={onEdit}>
          <Pencil aria-hidden />
          Sửa<span className="sr-only"> {title.toLowerCase()}</span>
        </Button>
      </div>
      <dl className="flex flex-col gap-3">{children}</dl>
    </section>
  );
}

/** Bước 5 — Xem lại, cam kết (grant_consent 'terms') và gửi duyệt (submit_organization) — P1-07, US-STO-01 AC4. */
export function ReviewStep() {
  const { kind, data, orgId, navigate } = useWizard();
  const router = useRouter();
  const copy = KIND_COPY[kind];
  const steps = computeProgress(kind, snapshotOf(data));
  const done = (k: StepKey) => steps.find((s) => s.key === k)?.complete ?? false;
  const go = (k: StepKey) => void navigate(`/onboarding/${kind}/${k}`);

  const [consents, setConsents] = useState<Record<ConsentKey, boolean>>({
    terms: false,
    truthful: false,
    commitment: false,
  });
  const [consentErrors, setConsentErrors] = useState<Partial<Record<ConsentKey, string>>>({});
  const [clientOpId] = useState(newUuid);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ message: string; missing?: MissingItem[] } | null>(null);

  const b = data.org?.basics;
  const l = data.org?.legal;
  const site = data.site;
  const hoursLines = site ? summarizeHours(hoursFromRows(data.hours, true, kind)) : [];
  const allCategories =
    !site?.acceptedCategories || FOOD_CATEGORY_CODES.every((c) => site.acceptedCategories!.includes(c));

  async function submit() {
    if (pending || !orgId) return;
    setError(null);
    const parsed = consentSchema.safeParse(consents);
    if (!parsed.success) {
      const errs: Partial<Record<ConsentKey, string>> = {};
      for (const i of parsed.error.issues) errs[i.path[0] as ConsentKey] ??= i.message;
      setConsentErrors(errs);
      const first = CONSENT_ITEMS[kind].find((c) => errs[c.key]);
      if (first) document.getElementById(`consent-${first.key}`)?.focus();
      return;
    }
    setConsentErrors({});
    setPending(true);
    const res = await submitOnboarding({ kind, orgId, clientOpId, consents });
    if (!res.ok) {
      setPending(false);
      setError({ message: res.error.message, missing: res.error.missing });
      return;
    }
    router.push(res.data.redirectTo);
  }

  const missing = steps.filter((s) => s.key !== "review" && !s.complete);

  return (
    <div className="flex flex-col gap-6">
      {missing.length > 0 ? (
        <div className="flex gap-3 rounded-lg border border-warning/30 bg-warning-soft p-4 text-sm">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
          <div className="min-w-0">
            <p className="font-semibold text-ink">Hồ sơ còn thiếu {missing.length} bước bắt buộc</p>
            <ul className="mt-1.5 list-disc pl-5 text-ink">
              {missing.map((m) => (
                <li key={m.key}>
                  <button type="button" className="underline underline-offset-4" onClick={() => go(m.key)}>
                    {m.title}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <SummaryCard step="basics" complete={done("basics")} onEdit={() => go("basics")}>
        <Row label={copy.nameLabel} value={b?.name} />
        <Row label="Loại hình" value={subtypeLabel(kind, b?.subtype)} />
        <Row label="Mô tả" value={b?.description} />
        {kind === "charity" ? (
          <>
            <Row label="Người được hỗ trợ mỗi ngày" value={b?.beneficiaries} />
            <Row
              label="Ngày thành lập"
              value={b?.foundedOn ? b.foundedOn.split("-").reverse().join("/") : null}
            />
          </>
        ) : null}
        <Row label="Số điện thoại" value={b?.contactPhone} />
        <Row label="Email" value={b?.contactEmail} />
      </SummaryCard>

      <SummaryCard step="location" complete={done("location")} onEdit={() => go("location")}>
        <Row label={kind === "store" ? "Tên điểm" : "Tên điểm nhận"} value={site?.name} />
        <Row
          label="Địa chỉ"
          value={
            site
              ? [site.location.addressLine, site.location.ward, site.location.city].filter(Boolean).join(", ")
              : null
          }
        />
        {kind === "charity" && site ? (
          <>
            <Row label="Bán kính phục vụ" value={formatKm(site.radiusKm)} />
            <Row
              label="Hiển thị vị trí"
              value={VISIBILITY_OPTIONS.find((v) => v.value === site.visibility)?.label}
            />
            <Row
              label="Thực phẩm nhận"
              value={
                allCategories
                  ? "Tất cả loại thực phẩm"
                  : FOOD_CATEGORIES.filter((c) => site.acceptedCategories!.includes(c.code))
                      .map((c) => c.label)
                      .join(", ")
              }
            />
            <Row
              label="Sức nhận mỗi ngày"
              value={site.capacityKg != null ? `${String(site.capacityKg).replace(".", ",")} kg` : null}
            />
          </>
        ) : null}
        <Row
          label={copy.hoursTitle}
          value={
            hoursLines.length > 0 ? (
              <ul className="flex flex-col gap-0.5">
                {hoursLines.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            ) : null
          }
        />
      </SummaryCard>

      <SummaryCard step="legal" complete={done("legal")} onEdit={() => go("legal")}>
        <Row label="Tên pháp lý" value={l?.legalName} />
        {kind === "store" ? (
          <Row label="Mã số thuế" value={l?.taxCode} />
        ) : (
          <Row label="Số quyết định / giấy phép" value={l?.registrationNo || "Không có"} />
        )}
        <Row
          label="Người đại diện"
          value={
            l?.representativeName
              ? `${l.representativeName}${l.representativeTitle ? ` — ${l.representativeTitle}` : ""}`
              : null
          }
        />
      </SummaryCard>

      <SummaryCard step="documents" complete={done("documents")} onEdit={() => go("documents")}>
        {DOC_SLOTS[kind].map((slot) => {
          const n = data.documents.filter((d) => d.docType === slot.type).length;
          return (
            <Row
              key={slot.type}
              label={slot.title}
              value={n > 0 ? `${n} tệp` : slot.requirement === "optional" ? "Không có" : null}
            />
          );
        })}
      </SummaryCard>

      <section
        aria-labelledby="review-consent"
        className="flex flex-col gap-4 rounded-xl border-2 border-primary/30 bg-surface p-4 sm:p-6"
      >
        <div className="flex flex-col gap-1">
          <h2 id="review-consent" className="text-lg font-semibold">
            Cam kết
          </h2>
          <p className="text-sm text-ink-muted">
            Đọc kỹ và đánh dấu từng mục. FoodSave lưu lại thời điểm và phiên bản văn bản bạn đồng ý.
          </p>
        </div>
        <ul className="flex flex-col gap-3">
          {CONSENT_ITEMS[kind].map((item) => {
            const id = `consent-${item.key}`;
            const errorText = consentErrors[item.key];
            return (
              <li key={item.key} className="flex flex-col gap-1.5">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id={id}
                    checked={consents[item.key]}
                    onCheckedChange={(v) => {
                      setConsents((c) => ({ ...c, [item.key]: v === true }));
                      if (v === true) setConsentErrors((e) => ({ ...e, [item.key]: undefined }));
                    }}
                    aria-invalid={errorText ? true : undefined}
                    aria-describedby={errorText ? `${id}-error` : undefined}
                    className="mt-1"
                  />
                  <label htmlFor={id} className="text-sm leading-6 text-ink">
                    {consentParts(item.template).map((p, i) =>
                      p.kind === "link" ? (
                        <a
                          key={i}
                          href={p.href}
                          target="_blank"
                          rel="noopener"
                          className="inline-flex items-center gap-0.5 font-medium text-primary underline underline-offset-4"
                        >
                          {p.text}
                          <ExternalLink aria-hidden className="size-3.5" />
                          <span className="sr-only"> (mở thẻ mới)</span>
                        </a>
                      ) : (
                        <span key={i}>{p.text}</span>
                      ),
                    )}
                  </label>
                </div>
                {errorText ? <FieldErrorText id={id}>{errorText}</FieldErrorText> : null}
              </li>
            );
          })}
        </ul>
      </section>

      {error ? (
        <div
          role="alert"
          className="flex gap-3 rounded-lg border border-danger/30 bg-danger-soft p-4 text-sm"
        >
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-danger" />
          <div className="min-w-0 text-ink">
            <p className="font-semibold text-danger">{error.message}</p>
            {error.missing && error.missing.length > 0 ? (
              <ul className="mt-1.5 list-disc pl-5">
                {error.missing.map((m) => (
                  <li key={`${m.step}-${m.message}`}>
                    {m.message}{" "}
                    {m.step !== "review" ? (
                      <button
                        type="button"
                        className="underline underline-offset-4"
                        onClick={() => go(m.step)}
                      >
                        Bổ sung
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 rounded-xl bg-bg-sunken p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <p className="text-sm text-ink-muted">
          Sau khi gửi, hồ sơ được khóa để FoodSave duyệt. Bạn sẽ nhận email khi có kết quả.
        </p>
        <Button
          type="button"
          size="lg"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void submit()}
          disabled={pending || missing.length > 0}
          aria-busy={pending}
          className="shrink-0"
        >
          {pending ? <Loader2 aria-hidden className="animate-spin" /> : <Send aria-hidden />}
          {pending ? "Đang gửi…" : "Gửi duyệt"}
        </Button>
      </div>
    </div>
  );
}
