"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Save } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { Controller, useForm, type FieldPath, type Resolver } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import {
  describedBy,
  ErrorSummary,
  FieldErrorText,
  FormField,
  RequiredMark,
  Section,
} from "@/features/onboarding/components/fields";
import { KIND_COPY, SUBTYPES, type OrgKind } from "@/features/onboarding/options";
import { basicsFields, HOTLINE_HELP, todayInVietnam, type BasicsForm } from "@/features/onboarding/schemas";

import { saveProfile } from "../actions";

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

const NETWORK_ERROR = "Không có kết nối mạng. Dữ liệu của bạn vẫn còn — hãy thử lại khi có mạng.";

/**
 * Hồ sơ — trường không pháp lý (US-STO-27 AC2–AC3, F-11 (1)): lưu ngay, không kích hoạt duyệt lại.
 * Cùng schema với bước "Thông tin cơ bản" của wizard (`basicsFields`).
 */
export function ProfileForm({ kind, orgId, initial }: { kind: OrgKind; orgId: string; initial: BasicsForm }) {
  const copy = KIND_COPY[kind];
  const fields = useMemo(() => basicsFields(kind), [kind]);
  const fieldKeys = useMemo(() => Object.keys(fields) as (keyof BasicsForm)[], [fields]);
  const form = useForm<BasicsForm>({
    defaultValues: initial,
    mode: "onTouched",
    resolver: zodResolver(z.object(fields), undefined, { raw: true }) as unknown as Resolver<BasicsForm>,
  });
  const errors = form.formState.errors;
  const [showSummary, setShowSummary] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const err = (k: keyof BasicsForm) => errors[k]?.message ?? null;
  const subtypeOptions = SUBTYPES[kind] as readonly { value: string; label: string }[];

  const onValid = (values: BasicsForm) => {
    setShowSummary(false);
    setFormError(null);
    const payload = Object.fromEntries(fieldKeys.map((k) => [k, values[k] ?? ""]));
    startTransition(async () => {
      try {
        const res = await saveProfile({ orgId, values: payload });
        if (!res.ok) {
          for (const [k, msg] of Object.entries(res.error.fieldErrors ?? {})) {
            if ((fieldKeys as string[]).includes(k))
              form.setError(k as FieldPath<BasicsForm>, { message: msg });
          }
          setFormError(res.error.message);
          return;
        }
        form.reset(values);
        toast.success("Đã lưu hồ sơ.");
      } catch {
        setFormError(NETWORK_ERROR);
      }
    });
  };

  const summary = showSummary
    ? ORDER.filter((k) => fieldKeys.includes(k) && errors[k]?.message).map((k) => ({
        id: `profile-${k}`,
        message: errors[k]!.message!,
      }))
    : [];

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(onValid, () => setShowSummary(true))}
      className="flex flex-col gap-6"
      aria-labelledby="profile-about"
    >
      <ErrorSummary errors={summary} />
      {formError ? (
        <p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
          {formError}
        </p>
      ) : null}

      <Section
        title={`Thông tin ${copy.noun}`}
        headingId="profile-about"
        description="Lưu ngay, không cần FoodSave duyệt lại. Trường có dấu * là bắt buộc."
      >
        <FormField id="profile-name" label={copy.nameLabel} required error={err("name")}>
          <Input
            id="profile-name"
            autoComplete="organization"
            maxLength={160}
            aria-invalid={err("name") ? true : undefined}
            aria-describedby={describedBy("profile-name", null, err("name"))}
            {...form.register("name")}
          />
        </FormField>

        <fieldset
          className="flex flex-col gap-3"
          aria-describedby={err("subtype") ? "profile-subtype-error" : undefined}
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
                className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3"
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
          {err("subtype") ? <FieldErrorText id="profile-subtype">{err("subtype")}</FieldErrorText> : null}
        </fieldset>

        <FormField id="profile-description" label="Mô tả ngắn" error={err("description")}>
          <Textarea
            id="profile-description"
            rows={3}
            maxLength={2000}
            aria-invalid={err("description") ? true : undefined}
            aria-describedby={describedBy("profile-description", null, err("description"))}
            className="min-h-24 bg-surface"
            {...form.register("description")}
          />
        </FormField>

        {kind === "charity" ? (
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              id="profile-beneficiaries"
              label="Số người được hỗ trợ mỗi ngày"
              required
              error={err("beneficiaries")}
              hint="Ước lượng trung bình, ví dụ 45."
            >
              <Input
                id="profile-beneficiaries"
                inputMode="numeric"
                autoComplete="off"
                maxLength={7}
                aria-invalid={err("beneficiaries") ? true : undefined}
                aria-describedby={describedBy("profile-beneficiaries", true, err("beneficiaries"))}
                {...form.register("beneficiaries")}
              />
            </FormField>
            <FormField id="profile-foundedOn" label="Ngày thành lập" error={err("foundedOn")}>
              <Input
                id="profile-foundedOn"
                type="date"
                min="1900-01-01"
                max={todayInVietnam()}
                aria-invalid={err("foundedOn") ? true : undefined}
                aria-describedby={describedBy("profile-foundedOn", null, err("foundedOn"))}
                {...form.register("foundedOn")}
              />
            </FormField>
          </div>
        ) : null}
      </Section>

      <Section
        title="Liên hệ"
        headingId="profile-contact"
        description="Chỉ FoodSave và người quản lý hồ sơ thấy — dùng khi điều phối nhận hàng."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            id="profile-contactPhone"
            label="Số điện thoại liên hệ"
            required
            error={err("contactPhone")}
            hint="Ví dụ: 0901 234 567."
          >
            <Input
              id="profile-contactPhone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={20}
              aria-invalid={err("contactPhone") ? true : undefined}
              aria-describedby={describedBy("profile-contactPhone", true, err("contactPhone"))}
              {...form.register("contactPhone")}
            />
          </FormField>
          <FormField id="profile-contactEmail" label="Email liên hệ" required error={err("contactEmail")}>
            <Input
              id="profile-contactEmail"
              type="email"
              inputMode="email"
              autoComplete="email"
              maxLength={254}
              aria-invalid={err("contactEmail") ? true : undefined}
              aria-describedby={describedBy("profile-contactEmail", null, err("contactEmail"))}
              {...form.register("contactEmail")}
            />
          </FormField>
        </div>
      </Section>

      <div id="profile-hotline" className="scroll-mt-24">
        <Section
          title="Hotline để liên hệ khi trao nhận (không bắt buộc)"
          headingId="profile-hotline-heading"
          description={HOTLINE_HELP}
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              id="profile-hotlinePhone"
              label="Số hotline"
              error={err("hotlinePhone")}
              hint="Di động, máy bàn hoặc 1800/1900. Để trống nếu chưa có."
            >
              <Input
                id="profile-hotlinePhone"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                maxLength={20}
                aria-invalid={err("hotlinePhone") ? true : undefined}
                aria-describedby={describedBy("profile-hotlinePhone", true, err("hotlinePhone"))}
                {...form.register("hotlinePhone")}
              />
            </FormField>
            <FormField
              id="profile-hotlineEmail"
              label="Email công việc"
              error={err("hotlineEmail")}
              hint="Để trống nếu chưa có."
            >
              <Input
                id="profile-hotlineEmail"
                type="email"
                inputMode="email"
                autoComplete="off"
                maxLength={254}
                aria-invalid={err("hotlineEmail") ? true : undefined}
                aria-describedby={describedBy("profile-hotlineEmail", true, err("hotlineEmail"))}
                {...form.register("hotlineEmail")}
              />
            </FormField>
          </div>
        </Section>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending} aria-disabled={pending} className="min-h-11">
          {pending ? <Loader2 aria-hidden className="animate-spin" /> : <Save aria-hidden />}
          {pending ? "Đang lưu…" : "Lưu hồ sơ"}
        </Button>
      </div>
    </form>
  );
}
