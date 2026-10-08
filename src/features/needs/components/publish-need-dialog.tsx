"use client";

import { CircleAlert, HandHeart, Home, Loader2, PauseCircle, Plus, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { TimeInput } from "@/components/forms/time-input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { UNIT_LABEL, type UnitCode } from "@/features/catalog/labels";
import { categoryIcon } from "@/features/marketplace/components/category-icon";
import { NETWORK_ERROR, useOpId } from "@/features/offers/use-op-id";
import {
  describedBy,
  ErrorSummary,
  FieldErrorText,
  FieldHint,
  FormField,
  RequiredMark,
} from "@/features/onboarding/components/fields";
import { cn } from "@/lib/utils";

import { publishNeed } from "../actions";
import {
  defaultNeededBy,
  describeNeededBy,
  isContinuousUnit,
  NEED_FIELD_ORDER,
  NEED_LIMITS,
  neededByDateBounds,
  UNIT_CODES,
  validateNeedForm,
  type NeedFieldErrors,
  type NeedFieldKey,
  type NeedFormValues,
} from "../schemas";
import { NativeSelect } from "./native-select";

export type PublishSite = {
  id: string;
  name: string;
  ward: string | null;
  acceptedCategories: string[] | null;
};
export type PublishCategory = { code: string; name: string; icon: string; defaultUnit: UnitCode };

const FIELD_ID: Record<NeedFieldKey, string> = {
  siteId: "need-site",
  categoryCodes: "need-categories",
  quantity: "need-quantity",
  unit: "need-unit",
  neededBy: "need-needed-by-date",
  peopleToServe: "need-people",
  note: "need-note",
};

type PublishNeedDialogProps = {
  sites: PublishSite[];
  categories: PublishCategory[];
  serverNow: number;
  isPaused: boolean;
  /** Nhãn nút mở (trang rỗng dùng "Đăng nhu cầu đầu tiên"). */
  label?: string;
  variant?: "default" | "outline";
};

/** "Đăng nhu cầu" (US-CHA-09): hộp thoại form; thành công ⇒ mở ngay trang phương án ghép của nhu cầu. */
export function PublishNeedDialog({
  sites,
  categories,
  serverNow,
  isPaused,
  label = "Đăng nhu cầu",
  variant = "default",
}: PublishNeedDialogProps) {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(0);
  return (
    <>
      <Button
        type="button"
        variant={variant}
        onClick={() => {
          setSession((n) => n + 1);
          setOpen(true);
        }}
      >
        <Plus aria-hidden />
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
          {open ? (
            <PublishNeedForm
              key={session}
              sites={sites}
              categories={categories}
              serverNow={serverNow}
              isPaused={isPaused}
              onCancel={() => setOpen(false)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function initialValues(sites: PublishSite[], now: Date): NeedFormValues {
  const at = defaultNeededBy(now);
  return {
    siteId: sites[0]?.id ?? "",
    categoryCodes: [],
    quantity: "",
    unit: "",
    neededByDate: at.date,
    neededByTime: at.time,
    peopleToServe: "",
    note: "",
  };
}

/** Mốc "bây giờ" cho kiểm tra phía client (cập nhật mỗi 30 giây; server vẫn kiểm lại). */
function useNow(serverNow: number): Date {
  const [now, setNow] = useState(() => new Date(Math.max(serverNow, Date.now())));
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function PublishNeedForm({
  sites,
  categories,
  serverNow,
  isPaused,
  onCancel,
}: {
  sites: PublishSite[];
  categories: PublishCategory[];
  serverNow: number;
  isPaused: boolean;
  onCancel: () => void;
}) {
  const router = useRouter();
  const op = useOpId();
  const [pending, startTransition] = useTransition();
  const now = useNow(serverNow);
  const [values, setValues] = useState<NeedFormValues>(() => initialValues(sites, now));
  const [touched, setTouched] = useState<ReadonlySet<NeedFieldKey>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<NeedFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const site = sites.find((s) => s.id === values.siteId) ?? null;
  const offered = useMemo(
    () =>
      site?.acceptedCategories
        ? categories.filter((c) => site.acceptedCategories!.includes(c.code))
        : categories,
    [categories, site],
  );
  const bounds = neededByDateBounds(now);
  const clientErrors = validateNeedForm(values, {
    now,
    acceptedCategories: site?.acceptedCategories ?? null,
  });
  const errors: NeedFieldErrors = { ...clientErrors, ...serverErrors };
  const err = (k: NeedFieldKey) => ((submitted || touched.has(k)) && errors[k] ? errors[k]! : null);
  const summary = submitted
    ? NEED_FIELD_ORDER.filter((k) => errors[k]).map((k) => ({ id: FIELD_ID[k], message: errors[k]! }))
    : [];

  function update(patch: Partial<NeedFormValues>, keys: NeedFieldKey[]) {
    setValues((v) => ({ ...v, ...patch }));
    setServerErrors((e) => {
      const next = { ...e };
      for (const k of keys) delete next[k];
      return next;
    });
    setFormError(null);
  }
  const touch = (k: NeedFieldKey) => setTouched((t) => new Set(t).add(k));

  function toggleCategory(code: string, checked: boolean) {
    const next = checked
      ? [...values.categoryCodes.filter((c) => c !== code), code]
      : values.categoryCodes.filter((c) => c !== code);
    const patch: Partial<NeedFormValues> = { categoryCodes: next };
    // Đơn vị mặc định theo danh mục chọn đầu tiên (vẫn đổi được)
    if (checked && !values.unit) patch.unit = categories.find((c) => c.code === code)?.defaultUnit ?? "";
    update(patch, ["categoryCodes", "unit"]);
    touch("categoryCodes");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    const first = NEED_FIELD_ORDER.find((k) => clientErrors[k]);
    if (first) {
      document.getElementById(FIELD_ID[first])?.focus();
      return;
    }
    setFormError(null);
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof publishNeed>>;
      try {
        res = await publishNeed({ values, clientOpId: op.get() });
      } catch {
        setFormError(NETWORK_ERROR); // giữ client_op_id: gửi lại là idempotent
        return;
      }
      op.reset();
      if (!res.ok) {
        if (res.fieldErrors && Object.keys(res.fieldErrors).length > 0) {
          setServerErrors(res.fieldErrors);
          const k = NEED_FIELD_ORDER.find((x) => res.fieldErrors![x]);
          if (k) requestAnimationFrame(() => document.getElementById(FIELD_ID[k])?.focus());
        } else setFormError(res.error.message);
        return;
      }
      toast.success(
        `Đã đăng nhu cầu ${values.quantity.trim()} ${values.unit ? UNIT_LABEL[values.unit] : ""}. FoodSave đang tìm phương án ghép.`,
      );
      router.push(`/charity/needs/${res.data.needId}`);
    });
  }

  const neededByText = describeNeededBy(values, now);
  const unit = values.unit || null;
  const noteLength = values.note.trim().length;
  const busy = pending;
  const timeId = "need-needed-by-time";

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <DialogHeader className="pr-8">
        <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
          <HandHeart aria-hidden className="size-5 text-role-accent" />
          Đăng nhu cầu
        </DialogTitle>
        <DialogDescription>
          FoodSave ghép ngay từ nhiều cửa hàng quanh điểm nhận và đề xuất tối đa 3 phương án lấy hàng.
        </DialogDescription>
      </DialogHeader>

      <p className="text-sm text-ink-subtle">
        Trường có dấu <span className="text-danger">*</span> là bắt buộc.
      </p>

      {isPaused ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-ink"
        >
          <PauseCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
          Tổ chức đang tạm ngưng nhận thực phẩm. Bật lại hoạt động trong Cài đặt để đăng nhu cầu.
        </p>
      ) : null}

      <ErrorSummary errors={summary} />

      {sites.length > 1 ? (
        <fieldset
          className="flex flex-col gap-2"
          aria-describedby={describedBy(FIELD_ID.siteId, null, err("siteId"))}
        >
          <legend className="mb-1 text-sm font-medium">
            Điểm nhận <RequiredMark required />
          </legend>
          <RadioGroup
            id={FIELD_ID.siteId}
            value={values.siteId}
            onValueChange={(v) => {
              const nextSite = sites.find((s) => s.id === v);
              update(
                {
                  siteId: v,
                  categoryCodes: nextSite?.acceptedCategories
                    ? values.categoryCodes.filter((c) => nextSite.acceptedCategories!.includes(c))
                    : values.categoryCodes,
                },
                ["siteId", "categoryCodes"],
              );
            }}
            className="gap-2"
          >
            {sites.map((s) => (
              <label
                key={s.id}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border bg-surface px-3 py-2 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary-soft"
              >
                <RadioGroupItem value={s.id} disabled={busy} />
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium text-ink">{s.name}</span>
                  {s.ward ? <span className="text-xs text-ink-subtle">{s.ward}</span> : null}
                </span>
              </label>
            ))}
          </RadioGroup>
          {err("siteId") ? <FieldErrorText id={FIELD_ID.siteId}>{err("siteId")}</FieldErrorText> : null}
        </fieldset>
      ) : site ? (
        <div className="flex items-center gap-2 rounded-lg border bg-bg-sunken px-3 py-2 text-sm">
          <Home aria-hidden className="size-4 text-role-accent" />
          <span className="text-ink-muted">Điểm nhận:</span>
          <span className="font-medium text-ink">{site.name}</span>
        </div>
      ) : null}

      <fieldset
        className="flex flex-col gap-2"
        aria-describedby={describedBy(FIELD_ID.categoryCodes, true, err("categoryCodes"))}
      >
        <legend className="mb-1 text-sm font-medium">
          Danh mục <RequiredMark required />
        </legend>
        <div id={FIELD_ID.categoryCodes} tabIndex={-1} className="grid gap-2 outline-none sm:grid-cols-2">
          {offered.map((c) => {
            const checked = values.categoryCodes.includes(c.code);
            const full = !checked && values.categoryCodes.length >= NEED_LIMITS.categoriesMax;
            const Icon = categoryIcon(c.icon);
            const id = `need-cat-${c.code}`;
            return (
              <label
                key={c.code}
                htmlFor={id}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border bg-surface px-3 py-2 text-sm transition-colors",
                  checked && "border-primary bg-primary-soft",
                  full && "cursor-not-allowed opacity-60",
                )}
              >
                <Checkbox
                  id={id}
                  checked={checked}
                  disabled={busy || full}
                  onCheckedChange={(v) => toggleCategory(c.code, v === true)}
                  aria-invalid={err("categoryCodes") ? true : undefined}
                />
                <Icon aria-hidden className="size-4 shrink-0 text-ink-muted" />
                <span className="text-ink">{c.name}</span>
              </label>
            );
          })}
        </div>
        {err("categoryCodes") ? (
          <FieldErrorText id={FIELD_ID.categoryCodes}>{err("categoryCodes")}</FieldErrorText>
        ) : (
          <FieldHint id={FIELD_ID.categoryCodes}>
            Chọn 1–3 loại thay thế được cho nhau, ví dụ “Bánh mì & bakery” hoặc “Bánh ngọt & dessert”.
          </FieldHint>
        )}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <FormField
          id={FIELD_ID.quantity}
          label="Số lượng cần"
          required
          error={err("quantity")}
          hint={unit && isContinuousUnit(unit) ? "Có thể nhập số lẻ, ví dụ 12,5." : "Số nguyên, ví dụ 50."}
        >
          <Input
            id={FIELD_ID.quantity}
            value={values.quantity}
            inputMode={unit && isContinuousUnit(unit) ? "decimal" : "numeric"}
            autoComplete="off"
            disabled={busy}
            onChange={(e) => update({ quantity: e.target.value }, ["quantity"])}
            onBlur={() => touch("quantity")}
            aria-invalid={err("quantity") ? true : undefined}
            aria-describedby={describedBy(FIELD_ID.quantity, true, err("quantity"))}
            className="tabular-nums"
          />
        </FormField>
        <FormField id={FIELD_ID.unit} label="Đơn vị" required error={err("unit")}>
          <NativeSelect
            id={FIELD_ID.unit}
            value={values.unit}
            disabled={busy}
            onChange={(e) => update({ unit: e.target.value as UnitCode }, ["unit", "quantity"])}
            onBlur={() => touch("unit")}
            aria-invalid={err("unit") ? true : undefined}
            aria-describedby={describedBy(FIELD_ID.unit, null, err("unit"))}
          >
            <option value="" disabled>
              Chọn đơn vị
            </option>
            {UNIT_CODES.map((u) => (
              <option key={u} value={u}>
                {UNIT_LABEL[u]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </div>

      <fieldset
        className="flex flex-col gap-2"
        aria-describedby={describedBy(FIELD_ID.neededBy, true, err("neededBy"))}
      >
        <legend className="mb-1 text-sm font-medium">
          Cần trước <RequiredMark required />
        </legend>
        <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3 sm:max-w-md">
          <div className="flex flex-col gap-1">
            <label htmlFor={FIELD_ID.neededBy} className="text-xs text-ink-subtle">
              Ngày<span className="sr-only"> cần nhận</span>
            </label>
            <Input
              id={FIELD_ID.neededBy}
              type="date"
              min={bounds.min}
              max={bounds.max}
              value={values.neededByDate}
              disabled={busy}
              onChange={(e) => update({ neededByDate: e.target.value }, ["neededBy"])}
              onBlur={() => touch("neededBy")}
              aria-invalid={err("neededBy") ? true : undefined}
              aria-describedby={describedBy(FIELD_ID.neededBy, true, err("neededBy"))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={timeId} className="text-xs text-ink-subtle">
              Giờ<span className="sr-only"> cần nhận (24 giờ)</span>
            </label>
            <TimeInput
              id={timeId}
              value={values.neededByTime}
              disabled={busy}
              onValueChange={(t) => update({ neededByTime: t }, ["neededBy"])}
              onBlur={() => touch("neededBy")}
              aria-invalid={err("neededBy") ? true : undefined}
              aria-describedby={describedBy(FIELD_ID.neededBy, true, err("neededBy"))}
            />
          </div>
        </div>
        {err("neededBy") ? (
          <FieldErrorText id={FIELD_ID.neededBy}>{err("neededBy")}</FieldErrorText>
        ) : (
          <FieldHint id={FIELD_ID.neededBy}>
            {neededByText ? `Cần trước ${neededByText}. ` : ""}Từ 1 giờ tới 7 ngày nữa, giờ 24 giờ.
          </FieldHint>
        )}
      </fieldset>

      <FormField
        id={FIELD_ID.peopleToServe}
        label="Số người được hỗ trợ"
        error={err("peopleToServe")}
        hint="Giúp cửa hàng hiểu nhu cầu, ví dụ 45 trẻ."
      >
        <Input
          id={FIELD_ID.peopleToServe}
          value={values.peopleToServe}
          inputMode="numeric"
          autoComplete="off"
          disabled={busy}
          onChange={(e) => update({ peopleToServe: e.target.value }, ["peopleToServe"])}
          onBlur={() => touch("peopleToServe")}
          aria-invalid={err("peopleToServe") ? true : undefined}
          aria-describedby={describedBy(FIELD_ID.peopleToServe, true, err("peopleToServe"))}
          className="max-w-40 tabular-nums"
        />
      </FormField>

      <FormField
        id={FIELD_ID.note}
        label="Ghi chú"
        error={err("note")}
        hint={`Chỉ tổ chức của bạn và cửa hàng được ghép thấy. Không ghi số điện thoại hay tên người được hỗ trợ. ${noteLength}/${NEED_LIMITS.noteMax} ký tự.`}
      >
        <Textarea
          id={FIELD_ID.note}
          value={values.note}
          rows={3}
          maxLength={NEED_LIMITS.noteMax + 50}
          disabled={busy}
          onChange={(e) => update({ note: e.target.value }, ["note"])}
          onBlur={() => touch("note")}
          aria-invalid={err("note") ? true : undefined}
          aria-describedby={describedBy(FIELD_ID.note, true, err("note"))}
        />
      </FormField>

      {formError ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-ink"
        >
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-danger" />
          {formError}
        </p>
      ) : null}

      <DialogFooter className="gap-2 sm:gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
          Quay lại
        </Button>
        <Button type="submit" disabled={busy || isPaused} aria-busy={busy || undefined}>
          {busy ? <Loader2 aria-hidden className="animate-spin" /> : <Send aria-hidden />}
          {busy ? "Đang đăng…" : "Đăng nhu cầu"}
        </Button>
      </DialogFooter>
    </form>
  );
}
