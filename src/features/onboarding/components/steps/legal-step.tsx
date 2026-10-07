"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { IdCard, Lock } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch, type FieldPath, type Resolver } from "react-hook-form";
import { z } from "zod";

import { Input } from "@/components/ui/input";

import { saveLegal } from "../../actions";
import { EMPTY_LEGAL, isComplete, legalFields, pickValid, type LegalForm } from "../../schemas";
import { useAutosave, type SaveResult } from "../autosave";
import { describedBy, ErrorSummary, FormField, Section } from "../fields";
import { useWizard } from "../wizard-context";

const ORDER: (keyof LegalForm)[] = [
  "legalName",
  "taxCode",
  "registrationNo",
  "representativeName",
  "representativeTitle",
];

/**
 * Bước 3 — Pháp lý & người đại diện (org_sensitive, chỉ các cột được grant — DATA-MODEL §9.4).
 * KHÔNG thu số CCCD: 4 số cuối do FoodSave ghi khi xác minh (`verify_representative_id`).
 */
export function LegalStep() {
  const { kind, data, orgId, setValidator, reportComplete } = useWizard();
  const fields = useMemo(() => legalFields(kind), [kind]);
  const fieldKeys = useMemo(() => Object.keys(fields) as (keyof LegalForm)[], [fields]);

  const [defaults] = useState<LegalForm>(() => data.org?.legal ?? EMPTY_LEGAL);
  const form = useForm<LegalForm>({
    defaultValues: defaults,
    mode: "onTouched",
    resolver: zodResolver(z.object(fields), undefined, { raw: true }) as unknown as Resolver<LegalForm>,
  });
  const values = useWatch({ control: form.control }) as LegalForm;
  const errors = form.formState.errors;
  const [showSummary, setShowSummary] = useState(false);

  const savable = useMemo(() => {
    if (!orgId) return null;
    const raw: Partial<Record<keyof LegalForm, string>> = {};
    for (const k of fieldKeys) raw[k] = values[k] ?? "";
    const { data: valid } = pickValid(fields, raw);
    const out = Object.fromEntries(Object.keys(valid).map((k) => [k, raw[k as keyof LegalForm]]));
    return Object.keys(out).length > 0 ? out : null;
  }, [values, fields, fieldKeys, orgId]);

  async function save(v: Record<string, string | undefined>): Promise<SaveResult> {
    if (!orgId) return { ok: false, message: "Vui lòng hoàn tất bước Thông tin cơ bản trước." };
    const res = await saveLegal({ orgId, values: v });
    if (!res.ok) {
      for (const [k, msg] of Object.entries(res.error.fieldErrors ?? {})) {
        if ((fieldKeys as string[]).includes(k)) form.setError(k as FieldPath<LegalForm>, { message: msg });
      }
      return { ok: false, message: res.error.message };
    }
    return { ok: true, savedAt: res.data.savedAt };
  }

  useAutosave({ id: "legal", value: savable, save });

  const complete = orgId !== null && isComplete(fields, values);
  useEffect(() => reportComplete(complete), [complete, reportComplete]);

  useEffect(() => {
    // handleSubmit (không phải trigger) để RHF đánh dấu đã gửi ⇒ lỗi tự cập nhật khi gõ lại (reValidateMode onChange)
    setValidator(
      () =>
        new Promise<boolean>((resolve) => {
          void form.handleSubmit(
            () => {
              setShowSummary(false);
              resolve(true);
            },
            () => {
              setShowSummary(true);
              resolve(false);
            },
          )();
        }),
    );
    return () => setValidator(null);
  }, [form, setValidator]);

  const err = (k: keyof LegalForm) => errors[k]?.message ?? null;
  const summary = showSummary
    ? ORDER.filter((k) => fieldKeys.includes(k) && errors[k]?.message).map((k) => ({
        id: `legal-${k}`,
        message: errors[k]!.message!,
      }))
    : [];
  const field = (k: keyof LegalForm, extra: React.ComponentProps<typeof Input> = {}) => (
    <Input
      id={`legal-${k}`}
      aria-invalid={err(k) ? true : undefined}
      aria-describedby={describedBy(`legal-${k}`, true, err(k))}
      {...extra}
      {...form.register(k)}
    />
  );

  return (
    <form noValidate onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-6">
      <p className="flex items-start gap-2 text-sm text-ink-muted">
        <Lock aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-subtle" />
        Chỉ người quản lý hồ sơ và quản trị viên FoodSave xem được thông tin ở bước này.
      </p>
      <ErrorSummary errors={summary} />

      <Section
        title={kind === "store" ? "Thông tin pháp lý" : "Thông tin pháp lý của tổ chức"}
        headingId="legal-entity"
      >
        <FormField
          id="legal-legalName"
          label={kind === "store" ? "Tên doanh nghiệp / hộ kinh doanh" : "Tên tổ chức theo giấy tờ"}
          required
          error={err("legalName")}
          hint="Ghi đúng như trên giấy chứng nhận hoặc quyết định thành lập."
        >
          {field("legalName", { maxLength: 200, autoComplete: "organization" })}
        </FormField>
        {kind === "store" ? (
          <FormField
            id="legal-taxCode"
            label="Mã số thuế"
            required
            error={err("taxCode")}
            hint="10 chữ số, hoặc 13 ký tự với chi nhánh (ví dụ 0312345678-001)."
          >
            {field("taxCode", { maxLength: 14, inputMode: "numeric", autoComplete: "off" })}
          </FormField>
        ) : (
          <FormField
            id="legal-registrationNo"
            label="Số quyết định thành lập hoặc giấy phép"
            error={err("registrationNo")}
            hint="Nếu tổ chức có số đăng ký, hãy ghi để FoodSave đối chiếu nhanh hơn."
          >
            {field("registrationNo", { maxLength: 60, autoComplete: "off" })}
          </FormField>
        )}
      </Section>

      <Section
        title="Người đại diện"
        headingId="legal-representative"
        description="Người chịu trách nhiệm về hồ sơ này trước FoodSave."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            id="legal-representativeName"
            label="Họ và tên"
            required
            error={err("representativeName")}
          >
            {field("representativeName", { maxLength: 120, autoComplete: "name" })}
          </FormField>
          <FormField
            id="legal-representativeTitle"
            label="Chức danh"
            required
            error={err("representativeTitle")}
            hint={
              kind === "store" ? "Ví dụ: Chủ cửa hàng, Giám đốc." : "Ví dụ: Giám đốc, Trưởng ban điều hành."
            }
          >
            {field("representativeTitle", { maxLength: 80, autoComplete: "organization-title" })}
          </FormField>
        </div>
        <div className="flex gap-3 rounded-lg border border-info/30 bg-info-soft p-4 text-sm">
          <IdCard aria-hidden className="mt-0.5 size-5 shrink-0 text-info" />
          <div className="flex flex-col gap-1 text-ink">
            <p className="font-semibold">FoodSave không thu số hay ảnh CCCD</p>
            <p>
              Khi xác minh người đại diện, FoodSave chỉ ghi lại <strong>4 số cuối</strong> của CCCD — không
              lưu số đầy đủ, ngày sinh hay ảnh giấy tờ tùy thân.
            </p>
            {data.org?.idLast4 ? (
              <p>
                Đã ghi nhận: CCCD kết thúc bằng <strong className="tabular-nums">{data.org.idLast4}</strong>.
              </p>
            ) : null}
          </div>
        </div>
      </Section>
    </form>
  );
}
