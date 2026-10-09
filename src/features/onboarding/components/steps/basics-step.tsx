"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { EyeOff } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm, useWatch, type FieldPath, type Resolver } from "react-hook-form";
import { z } from "zod";

import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { newUuid } from "@/lib/hash";

import { saveBasics } from "../../actions";
import { KIND_COPY, SUBTYPES } from "../../options";
import {
  basicsFields,
  EMPTY_BASICS,
  HOTLINE_HELP,
  isComplete,
  pickValid,
  todayInVietnam,
  type BasicsForm,
} from "../../schemas";
import { useAutosave, type SaveResult } from "../autosave";
import {
  describedBy,
  ErrorSummary,
  FieldErrorText,
  FieldHint,
  FormField,
  RequiredMark,
  Section,
} from "../fields";
import { useWizard } from "../wizard-context";

const ORDER: (keyof BasicsForm)[] = [
  "name",
  "subtype",
  "description",
  "beneficiaries",
  "foundedOn",
  "contactPhone",
  "contactEmail",
  "hotlinePhone",
  "hotlineEmail",
];

/** Bước 1 — Thông tin cơ bản. Lần lưu đầu (đủ tên + loại hình) gọi `create_organization`. */
export function BasicsStep() {
  const { kind, data, accountEmail, orgId, setOrgId, setValidator, reportComplete } = useWizard();
  const copy = KIND_COPY[kind];
  const fields = useMemo(() => basicsFields(kind), [kind]);
  const fieldKeys = useMemo(() => Object.keys(fields) as (keyof BasicsForm)[], [fields]);

  const [defaults] = useState<BasicsForm>(
    () => data.org?.basics ?? { ...EMPTY_BASICS, contactEmail: accountEmail ?? "" },
  );
  const form = useForm<BasicsForm>({
    defaultValues: defaults,
    mode: "onTouched",
    resolver: zodResolver(z.object(fields), undefined, { raw: true }) as unknown as Resolver<BasicsForm>,
  });
  const values = useWatch({ control: form.control }) as BasicsForm;
  const errors = form.formState.errors;
  const [showSummary, setShowSummary] = useState(false);

  // Mỗi lần mở bước là một ý định "tạo nháp": thử lại dùng cùng client_op_id (idempotent).
  const [createOpId] = useState(newUuid);
  const orgIdRef = useRef(orgId);

  // Chỉ lưu các trường đang hợp lệ (US-STO-01 AC1); gửi giá trị thô, server kiểm lại cùng schema.
  const savable = useMemo(() => {
    const raw: Partial<Record<keyof BasicsForm, string>> = {};
    for (const k of fieldKeys) raw[k] = values[k] ?? "";
    const { data: valid } = pickValid(fields, raw);
    const out = Object.fromEntries(Object.keys(valid).map((k) => [k, raw[k as keyof BasicsForm]]));
    if (!orgId && (!("name" in valid) || !("subtype" in valid))) return null;
    return Object.keys(out).length > 0 ? out : null;
  }, [values, fields, fieldKeys, orgId]);

  async function save(v: Record<string, string | undefined>): Promise<SaveResult> {
    const res = await saveBasics({ kind, orgId: orgIdRef.current, clientOpId: createOpId, values: v });
    if (!res.ok) {
      for (const [k, msg] of Object.entries(res.error.fieldErrors ?? {})) {
        if ((fieldKeys as string[]).includes(k)) form.setError(k as FieldPath<BasicsForm>, { message: msg });
      }
      return { ok: false, message: res.error.message };
    }
    if (orgIdRef.current !== res.data.orgId) {
      orgIdRef.current = res.data.orgId;
      setOrgId(res.data.orgId);
    }
    return { ok: true, savedAt: res.data.savedAt };
  }

  useAutosave({ id: "basics", value: savable, save });

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

  const summary = showSummary
    ? ORDER.filter((k) => fieldKeys.includes(k) && errors[k]?.message).map((k) => ({
        id: `basics-${k}`,
        message: errors[k]!.message!,
      }))
    : [];

  const err = (k: keyof BasicsForm) => errors[k]?.message ?? null;
  const subtypeOptions = SUBTYPES[kind] as readonly { value: string; label: string }[];

  return (
    <form noValidate onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-6">
      <p className="text-sm text-ink-subtle">
        Trường có dấu <span className="text-danger">*</span> là bắt buộc. FoodSave tự lưu nháp khi bạn nhập.
      </p>
      <ErrorSummary errors={summary} />

      <Section title={`Về ${copy.noun} của bạn`} headingId="basics-about">
        <FormField
          id="basics-name"
          label={copy.nameLabel}
          required
          error={err("name")}
          hint={
            kind === "store"
              ? "Tên biển hiệu, ví dụ: Tiệm bánh Hạt Lúa."
              : "Tên đầy đủ, ví dụ: Bếp ăn Nắng Mai."
          }
        >
          <Input
            id="basics-name"
            autoComplete="organization"
            maxLength={160}
            aria-invalid={err("name") ? true : undefined}
            aria-describedby={describedBy("basics-name", true, err("name"))}
            {...form.register("name")}
          />
        </FormField>

        <fieldset
          className="flex flex-col gap-3"
          aria-describedby={err("subtype") ? "basics-subtype-error" : undefined}
        >
          <legend className="mb-1 text-sm font-medium">
            Loại hình <RequiredMark required />
          </legend>
          <Controller
            control={form.control}
            name="subtype"
            render={({ field }) => (
              <RadioGroup
                value={field.value}
                onValueChange={(v) => {
                  field.onChange(v);
                  field.onBlur();
                }}
                aria-invalid={err("subtype") ? true : undefined}
                className="grid gap-2 sm:grid-cols-2"
              >
                {subtypeOptions.map((s, i) => (
                  <label
                    key={s.value}
                    className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border bg-surface px-3 py-2.5 has-[[aria-checked=true]]:border-primary has-[[aria-checked=true]]:bg-primary-soft"
                  >
                    <RadioGroupItem value={s.value} ref={i === 0 ? field.ref : undefined} />
                    <span>{s.label}</span>
                  </label>
                ))}
              </RadioGroup>
            )}
          />
          {err("subtype") ? <FieldErrorText id="basics-subtype">{err("subtype")}</FieldErrorText> : null}
          {kind === "charity" && values.subtype === "shelter" ? (
            <p className="flex items-start gap-2 text-sm text-ink-muted">
              <EyeOff aria-hidden className="mt-0.5 size-4 shrink-0" />
              Với nhà mở/nơi tạm lánh, vị trí điểm nhận sẽ được ẩn theo mặc định ở bước sau.
            </p>
          ) : null}
        </fieldset>

        <FormField
          id="basics-description"
          label="Mô tả ngắn"
          error={err("description")}
          hint={
            kind === "store"
              ? "Ví dụ: tiệm bánh mì gia đình, thường dư 20–40 ổ bánh mỗi tối."
              : "Ví dụ: bếp ăn phát bữa trưa miễn phí cho người lao động khó khăn. Nếu chọn “Khác”, hãy ghi rõ loại hình ở đây."
          }
        >
          <Textarea
            id="basics-description"
            rows={3}
            maxLength={2000}
            aria-invalid={err("description") ? true : undefined}
            aria-describedby={describedBy("basics-description", true, err("description"))}
            className="min-h-24 bg-surface"
            {...form.register("description")}
          />
        </FormField>

        {kind === "charity" ? (
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              id="basics-beneficiaries"
              label="Số người được hỗ trợ mỗi ngày"
              required
              error={err("beneficiaries")}
              hint="Ước lượng trung bình, ví dụ 45."
            >
              <Input
                id="basics-beneficiaries"
                inputMode="numeric"
                autoComplete="off"
                maxLength={7}
                aria-invalid={err("beneficiaries") ? true : undefined}
                aria-describedby={describedBy("basics-beneficiaries", true, err("beneficiaries"))}
                {...form.register("beneficiaries")}
              />
            </FormField>
            <FormField
              id="basics-foundedOn"
              label="Ngày thành lập"
              error={err("foundedOn")}
              hint="Theo quyết định thành lập, nếu có."
            >
              <Input
                id="basics-foundedOn"
                type="date"
                min="1900-01-01"
                max={todayInVietnam()}
                aria-invalid={err("foundedOn") ? true : undefined}
                aria-describedby={describedBy("basics-foundedOn", true, err("foundedOn"))}
                {...form.register("foundedOn")}
              />
            </FormField>
          </div>
        ) : null}
      </Section>

      <Section
        title="Liên hệ"
        headingId="basics-contact"
        description="Chỉ FoodSave và người quản lý hồ sơ thấy — dùng để liên hệ khi duyệt và khi điều phối nhận hàng."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            id="basics-contactPhone"
            label="Số điện thoại liên hệ"
            required
            error={err("contactPhone")}
            hint="Ví dụ: 0901 234 567."
          >
            <Input
              id="basics-contactPhone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={20}
              aria-invalid={err("contactPhone") ? true : undefined}
              aria-describedby={describedBy("basics-contactPhone", true, err("contactPhone"))}
              {...form.register("contactPhone")}
            />
          </FormField>
          <FormField id="basics-contactEmail" label="Email liên hệ" required error={err("contactEmail")}>
            <Input
              id="basics-contactEmail"
              type="email"
              inputMode="email"
              autoComplete="email"
              maxLength={254}
              aria-invalid={err("contactEmail") ? true : undefined}
              aria-describedby={describedBy("basics-contactEmail", null, err("contactEmail"))}
              {...form.register("contactEmail")}
            />
          </FormField>
        </div>
      </Section>

      <Section
        title="Hotline để liên hệ khi trao nhận (không bắt buộc)"
        headingId="basics-hotline"
        description={HOTLINE_HELP}
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            id="basics-hotlinePhone"
            label="Số hotline"
            error={err("hotlinePhone")}
            hint="Di động, máy bàn hoặc 1800/1900. Ví dụ: 028 3823 4567."
          >
            <Input
              id="basics-hotlinePhone"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              maxLength={20}
              aria-invalid={err("hotlinePhone") ? true : undefined}
              aria-describedby={describedBy("basics-hotlinePhone", true, err("hotlinePhone"))}
              {...form.register("hotlinePhone")}
            />
          </FormField>
          <FormField
            id="basics-hotlineEmail"
            label="Email công việc"
            error={err("hotlineEmail")}
            hint="Ví dụ: lienhe@tiembanh.vn."
          >
            <Input
              id="basics-hotlineEmail"
              type="email"
              inputMode="email"
              autoComplete="off"
              maxLength={254}
              aria-invalid={err("hotlineEmail") ? true : undefined}
              aria-describedby={describedBy("basics-hotlineEmail", true, err("hotlineEmail"))}
              {...form.register("hotlineEmail")}
            />
          </FormField>
        </div>
      </Section>
      <FieldHint id="basics-footnote">
        Bạn có thể đóng trang bất cứ lúc nào — hồ sơ nháp được giữ lại để làm tiếp.
      </FieldHint>
    </form>
  );
}
