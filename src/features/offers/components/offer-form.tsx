"use client";

import { ChevronDown, CircleAlert, Info, Loader2, Lock, Save, Send } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { TimeInput } from "@/components/forms/time-input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { formatKg, UNIT_LABEL, type UnitCode } from "@/features/catalog/labels";
import {
  describedBy,
  ErrorSummary,
  FieldErrorText,
  FieldHint,
  FormField,
  RequiredMark,
  Section,
} from "@/features/onboarding/components/fields";
import { cn } from "@/lib/utils";

import { draftOfferFromPhoto, previewSiteClose, saveOffer } from "../actions";
import { AI_FAILURE_MESSAGES, mapAiDraftToForm, type AiFilledField } from "../ai-mapping";
import { CategoryIcon, offerPhotoUrl } from "../category-icons";
import { addDays, formatDeadline, isDateKey, roundUpToStep, vnDateKey, vnTime } from "../datetime";
import {
  buildOfferPatch,
  formatDecimalInput,
  isContinuous,
  OFFER_FIELD_ORDER,
  OFFER_LIMITS,
  parseDecimal,
  parseOfferTimes,
  UNIT_CODES,
  validateOfferForm,
  type CategoryOption,
  type OfferFieldErrors,
  type OfferFieldKey,
  type OfferFormValues,
  type SiteOption,
} from "../schemas";
import { photoForAi, preparePhoto, uploadOfferPhoto } from "../upload";
import { NETWORK_ERROR, useOpId } from "../use-op-id";
import { AiFieldFrame } from "./ai-hint";
import { SAFETY_ATTESTATION } from "./offer-dialogs";
import { OfferPreview } from "./offer-preview";
import { PhotoField } from "./photo-field";

/**
 * Form đăng/sửa lô tặng (P2-04, P2-05; US-STO-07, -08, -09, -12). Một schema/quy tắc dùng chung với server
 * (`validateOfferForm`); lỗi RPC (PT422) quay lại đúng trường. "Lưu nháp" không cần cam kết; "Đăng lô" chỉ bật
 * khi đã tick cam kết an toàn. Mỗi lần bấm giữ một `client_op_id` (gửi lại khi mất mạng không tạo trùng).
 */

export type OfferFormStatus = "new" | "draft" | "open" | "fully_allocated";

type Props = {
  orgId: string;
  offerId: string | null;
  status: OfferFormStatus;
  /** Lô đã đăng và đã có phân bổ ⇒ chỉ sửa tên, mô tả, ảnh (`update_offer`). */
  hasAllocations: boolean;
  initial: OfferFormValues;
  categories: CategoryOption[];
  sites: SiteOption[];
  aiAvailable: boolean;
  serverNow: number;
  /** Hôm nay theo giờ VN (YYYY-MM-DD). */
  today: string;
  isPaused: boolean;
};

type Intent = "draft" | "publish" | "save";

const FIELD_ID: Record<OfferFieldKey, string> = {
  photoPath: "offer-photo-anchor",
  siteId: "offer-site",
  categoryCode: "offer-category",
  title: "offer-title",
  description: "offer-description",
  quantity: "offer-quantity",
  unit: "offer-unit",
  unitWeightKg: "offer-weight",
  expiryDate: "offer-expiry-date",
  expiryTime: "offer-expiry-time",
  pickupStart: "offer-start-date",
  pickupEnd: "offer-end-date",
  attested: "offer-attest",
};

/** Ô `<select>` gốc (bàn phím/trình đọc màn hình chuẩn, bảng chọn native trên điện thoại). */
function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        {...props}
        className={cn(
          "h-11 w-full appearance-none rounded-lg border border-input bg-surface pr-9 pl-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:h-10 md:text-sm",
          className,
        )}
      />
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-muted"
      />
    </div>
  );
}

function useNow(serverNow: number): Date {
  const [now, setNow] = useState(() => new Date(serverNow));
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

type PhotoState = { blob: Blob | null; previewUrl: string | null; uploadedPath: string | null };

export function OfferForm(props: Props) {
  const { orgId, categories, sites, serverNow, today, isPaused } = props;
  const router = useRouter();
  const now = useNow(serverNow);
  const saveOp = useOpId();
  const publishOp = useOpId();

  const [values, setValues] = useState<OfferFormValues>(props.initial);
  // Giá trị mới nhất cho tác vụ bất đồng bộ (AI trả lời sau vài giây trong lúc người dùng vẫn gõ)
  const valuesRef = useRef(values);
  useEffect(() => {
    valuesRef.current = values;
  }, [values]);
  const [baseline] = useState<OfferFormValues>(props.initial);
  const [offerId, setOfferId] = useState<string | null>(props.offerId);
  const [status, setStatus] = useState<OfferFormStatus>(props.status);
  const isPublished = status === "open" || status === "fully_allocated";
  const locked = isPublished && props.hasAllocations;

  const [touched, setTouched] = useState<Set<OfferFieldKey>>(() => new Set());
  const [attempt, setAttempt] = useState<Intent | null>(null);
  const [serverErrors, setServerErrors] = useState<OfferFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [suggestedEnd, setSuggestedEnd] = useState<string | null>(null);
  const [attested, setAttested] = useState(false);
  const [aiFilled, setAiFilled] = useState<Set<AiFilledField>>(() => new Set());
  const [photo, setPhoto] = useState<PhotoState>(() => ({
    blob: null,
    previewUrl: props.initial.photoPath ? offerPhotoUrl(props.initial.photoPath) : null,
    uploadedPath: null,
  }));
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [aiRunning, setAiRunning] = useState(false);
  const [pending, startTransition] = useTransition();
  const [pendingIntent, setPendingIntent] = useState<Intent | null>(null);

  const category = categories.find((c) => c.code === values.categoryCode) ?? null;
  const site = sites.find((s) => s.id === values.siteId) ?? null;
  const unit = values.unit || null;

  // ---- Giờ đóng cửa của điểm (xem trước) -------------------------------------------------
  const times = parseOfferTimes(values);
  const closeAt = (
    times.pickupStart && times.pickupStart > now ? times.pickupStart : roundUpToStep(now, 5)
  ).toISOString();
  const closeKey = `${values.siteId}|${closeAt}`;
  const [siteClose, setSiteClose] = useState<{ key: string; value: string | null; failed: boolean } | null>(
    null,
  );
  useEffect(() => {
    if (!/^[0-9a-f-]{36}$/i.test(values.siteId)) return;
    let cancelled = false;
    const t = setTimeout(() => {
      previewSiteClose({ siteId: values.siteId, at: closeAt })
        .then((res) => {
          if (!cancelled)
            setSiteClose({ key: closeKey, value: res.ok ? res.data.closeAt : null, failed: !res.ok });
        })
        .catch(() => {
          if (!cancelled) setSiteClose({ key: closeKey, value: null, failed: true });
        });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [closeKey, closeAt, values.siteId]);
  const siteCloseValue =
    siteClose && siteClose.key === closeKey && !siteClose.failed ? siteClose.value : undefined;

  // ---- Lỗi -----------------------------------------------------------------------------
  const validationMode = attempt === "publish" || isPublished ? "publish" : "draft";
  const clientErrors = useMemo(
    () =>
      validateOfferForm(values, {
        mode: validationMode,
        now,
        attested: attempt === "publish" ? attested : true,
        categories,
        skipQuantity: isPublished,
      }),
    [values, validationMode, now, attempt, attested, categories, isPublished],
  );
  const errorOf = (k: OfferFieldKey): string | null =>
    serverErrors[k] ?? (attempt || touched.has(k) ? (clientErrors[k] ?? null) : null) ?? null;
  const summary = attempt
    ? OFFER_FIELD_ORDER.map((k) => ({ k, m: errorOf(k) }))
        .filter((e): e is { k: OfferFieldKey; m: string } => Boolean(e.m))
        .map((e) => ({ id: FIELD_ID[e.k], message: e.m }))
    : [];

  const touch = (k: OfferFieldKey) => setTouched((prev) => (prev.has(k) ? prev : new Set(prev).add(k)));

  function clearField(...keys: OfferFieldKey[]) {
    setServerErrors((prev) => {
      if (!keys.some((k) => prev[k])) return prev;
      const next = { ...prev };
      for (const k of keys) delete next[k];
      return next;
    });
  }

  function update(patch: Partial<OfferFormValues>, fields: OfferFieldKey[], ai: AiFilledField[] = []) {
    setValues((v) => ({ ...v, ...patch }));
    clearField(...fields);
    if (ai.length > 0) {
      setAiFilled((prev) => {
        if (!ai.some((k) => prev.has(k))) return prev;
        const next = new Set(prev);
        for (const k of ai) next.delete(k);
        return next;
      });
    }
  }

  // ---- Danh mục / đơn vị / khối lượng (US-STO-07 AC1) -----------------------------------
  function pickCategory(code: string) {
    const cat = categories.find((c) => c.code === code);
    if (!cat) return;
    update(
      {
        categoryCode: code,
        unit: cat.defaultUnit,
        unitWeightKg: cat.defaultUnit === "kg" ? "" : formatDecimalInput(cat.defaultUnitWeightKg),
        weightSource: cat.defaultUnit === "kg" ? "declared" : "category_default",
      },
      ["categoryCode", "unit", "unitWeightKg", "quantity"],
      ["categoryCode", "unit", "unitWeightKg"],
    );
    touch("categoryCode");
  }

  function pickUnit(next: UnitCode) {
    if (next === "kg") {
      update(
        { unit: next, unitWeightKg: "", weightSource: "declared" },
        ["unit", "unitWeightKg", "quantity"],
        ["unit"],
      );
    } else if (category && next === category.defaultUnit) {
      update(
        {
          unit: next,
          unitWeightKg: formatDecimalInput(category.defaultUnitWeightKg),
          weightSource: "category_default",
        },
        ["unit", "unitWeightKg", "quantity"],
        ["unit", "unitWeightKg"],
      );
    } else {
      update(
        {
          unit: next,
          unitWeightKg: values.weightSource === "declared" ? values.unitWeightKg : "",
          weightSource: "declared",
        },
        ["unit", "unitWeightKg", "quantity"],
        ["unit"],
      );
    }
  }

  const weightIsDefault =
    unit !== null &&
    unit !== "kg" &&
    values.weightSource === "category_default" &&
    category?.defaultUnit === unit;
  const canUseDefaultWeight =
    unit !== null && unit !== "kg" && category?.defaultUnit === unit && values.weightSource === "declared";
  const qtyNum = parseDecimal(values.quantity);
  const weightNum = unit === "kg" ? 1 : parseDecimal(values.unitWeightKg);

  // ---- Ảnh + AI ---------------------------------------------------------------------------
  async function runAi(source: Blob) {
    setAiRunning(true);
    try {
      const small = await photoForAi(source);
      if (!small.ok) {
        toast.error(small.error);
        return;
      }
      const res = await draftOfferFromPhoto({ orgId, image: small.value });
      if (!res.ok) {
        toast.warning(res.message, { duration: 6000 });
        return;
      }
      const m = mapAiDraftToForm(res.data, { categories, current: valuesRef.current, today });
      if (!m.recognized) {
        toast.warning(AI_FAILURE_MESSAGES.invalid_output, { duration: 6000 });
        return;
      }
      setValues((current) => ({ ...current, ...m.patch }));
      setAiFilled(new Set(m.filled));
      clearField("categoryCode", "title", "quantity", "unit", "unitWeightKg", "expiryDate", "description");
      toast.success(
        m.lowConfidence
          ? "AI đã gợi ý nhưng chưa chắc chắn. Hãy kiểm tra kỹ từng mục được đánh dấu."
          : "AI đã điền gợi ý. Hãy kiểm tra lại các mục được đánh dấu trước khi đăng.",
      );
    } catch {
      toast.error(NETWORK_ERROR);
    } finally {
      setAiRunning(false);
    }
  }

  async function pickPhoto(file: File, opts: { runAi: boolean }) {
    setPhotoError(null);
    setPreparing(true);
    const prepared = await preparePhoto(file);
    setPreparing(false);
    if (!prepared.ok) {
      setPhotoError(prepared.error);
      return;
    }
    setPhoto((prev) => {
      if (prev.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(prev.previewUrl);
      return { blob: prepared.value.blob, previewUrl: prepared.value.previewUrl, uploadedPath: null };
    });
    clearField("photoPath");
    if (opts.runAi) void runAi(prepared.value.blob);
  }

  function removePhoto() {
    setPhoto((prev) => {
      if (prev.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(prev.previewUrl);
      return { blob: null, previewUrl: null, uploadedPath: null };
    });
    update({ photoPath: null }, ["photoPath"]);
  }

  // ---- Gửi ---------------------------------------------------------------------------------
  function focusFirst(errors: OfferFieldErrors) {
    const first = OFFER_FIELD_ORDER.find((k) => errors[k]);
    if (!first) return;
    const el =
      first === "categoryCode"
        ? document.querySelector<HTMLElement>(`#${FIELD_ID.categoryCode} [role="radio"]`)
        : document.getElementById(FIELD_ID[first]);
    el?.focus();
  }

  function submit(intent: Intent) {
    setAttempt(intent);
    setFormError(null);
    setSuggestedEnd(null);
    const errors = validateOfferForm(values, {
      mode: intent === "publish" || isPublished ? "publish" : "draft",
      now: new Date(),
      attested: intent === "publish" ? attested : true,
      categories,
      skipQuantity: isPublished,
    });
    if (Object.keys(errors).length > 0) {
      requestAnimationFrame(() => focusFirst(errors));
      return;
    }
    if (intent === "save" && !photo.blob) {
      const patch = buildOfferPatch(baseline, values, {
        isDraft: false,
        hasAllocations: props.hasAllocations,
      });
      if (Object.keys(patch).length === 0) {
        toast.info("Bạn chưa thay đổi mục nào.");
        return;
      }
    }

    setPendingIntent(intent);
    startTransition(async () => {
      let photoPath = values.photoPath;
      if (photo.blob) {
        if (photo.uploadedPath) photoPath = photo.uploadedPath;
        else {
          const up = await uploadOfferPhoto(orgId, photo.blob);
          if (!up.ok) {
            setPhotoError(up.error);
            setPendingIntent(null);
            document.getElementById(FIELD_ID.photoPath)?.scrollIntoView({ block: "center" });
            return;
          }
          photoPath = up.value;
          setPhoto((p) => ({ ...p, uploadedPath: up.value }));
        }
      }
      const sent = { ...values, photoPath };
      try {
        const res = await saveOffer({
          offerId,
          values: sent,
          intent,
          attested: intent === "publish" && attested,
          ops: { save: saveOp.get(), publish: publishOp.get() },
        });
        saveOp.reset();
        publishOp.reset();
        if (!res.ok) {
          if (res.offerId && !offerId) {
            setOfferId(res.offerId);
            setStatus("draft");
            setValues(sent);
            setPhoto((p) => ({ ...p, blob: null }));
            window.history.replaceState(null, "", `/store/inventory/${res.offerId}/edit`);
          }
          if (res.draftSaved) {
            toast.info("Đã lưu nháp. Sửa các mục được đánh dấu rồi bấm “Đăng lô” lại.", { duration: 6000 });
          }
          const fieldErrors = (res.error.fieldErrors ?? {}) as OfferFieldErrors;
          setServerErrors(fieldErrors);
          setSuggestedEnd(res.error.suggestedEnd ?? null);
          setFormError(res.error.message);
          requestAnimationFrame(() => focusFirst(fieldErrors));
          return;
        }
        const id = res.data.offerId;
        if (intent === "publish") {
          toast.success("Đã đăng lô. Các tổ chức phù hợp quanh cửa hàng sẽ thấy lô ngay.");
          router.push("/store/inventory");
        } else if (intent === "draft") {
          toast.success("Đã lưu nháp. Lô chưa hiển thị với tổ chức nào cho tới khi bạn đăng.");
          router.push(`/store/inventory/${id}`);
        } else {
          toast.success("Đã lưu thay đổi.");
          router.push(`/store/inventory/${id}`);
        }
      } catch {
        setFormError(NETWORK_ERROR);
      } finally {
        setPendingIntent(null);
      }
    });
  }

  const busy = pending || preparing || aiRunning;
  const canPublish = !isPublished;
  const publishBlocked = !attested || isPaused;

  // ---- Giao diện ---------------------------------------------------------------------------
  const err = errorOf;
  const field = (k: OfferFieldKey) => ({
    "aria-invalid": err(k) ? true : undefined,
    onBlur: () => touch(k),
  });

  return (
    <form
      noValidate
      onSubmit={(e) => e.preventDefault()}
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start xl:grid-cols-[minmax(0,1fr)_24rem]"
      aria-label={isPublished ? "Sửa lô tặng" : "Đăng lô tặng"}
    >
      <div className="flex min-w-0 flex-col gap-6">
        <ErrorSummary errors={summary} />
        {formError && summary.length < 2 ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger"
          >
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {formError}
          </p>
        ) : null}
        {locked ? (
          <p
            role="note"
            className="flex items-start gap-2 rounded-lg border border-info/30 bg-info-soft p-3 text-sm text-ink"
          >
            <Lock aria-hidden className="mt-0.5 size-4 shrink-0 text-info" />
            Lô đã có tổ chức giữ hàng nên chỉ sửa được tên, mô tả và ảnh. Số lượng đổi bằng “Cập nhật số
            lượng” ở trang chi tiết lô.
          </p>
        ) : null}

        <Section
          title="Ảnh lô hàng"
          headingId="offer-photo-heading"
          description={
            props.aiAvailable && !isPublished
              ? "Chụp một ảnh rõ của lô — AI có thể điền sẵn danh mục, tên và số lượng để bạn kiểm tra."
              : "Ảnh giúp tổ chức hình dung lô hàng. Một ảnh rõ, đủ sáng là đủ."
          }
        >
          <div id={FIELD_ID.photoPath} tabIndex={-1} className="outline-none">
            <PhotoField
              previewUrl={photo.previewUrl}
              preparing={preparing}
              error={photoError ?? serverErrors.photoPath ?? null}
              aiAvailable={props.aiAvailable && !isPublished}
              aiRunning={aiRunning}
              onPick={(file, opts) => void pickPhoto(file, opts)}
              onRemove={removePhoto}
              onAi={() => {
                if (photo.blob) void runAi(photo.blob);
                else toast.info("Hãy chọn một ảnh mới để AI nhận diện.");
              }}
            />
          </div>
        </Section>

        <Section
          title="Thông tin lô"
          headingId="offer-info-heading"
          description="Mỗi lô là một mặt hàng. Trường có dấu * là bắt buộc."
        >
          {sites.length > 1 ? (
            <FormField id={FIELD_ID.siteId} label="Lấy hàng tại chi nhánh" required error={err("siteId")}>
              <NativeSelect
                id={FIELD_ID.siteId}
                value={values.siteId}
                disabled={locked || busy}
                onChange={(e) => update({ siteId: e.target.value }, ["siteId", "pickupStart", "pickupEnd"])}
                aria-describedby={describedBy(FIELD_ID.siteId, null, err("siteId"))}
                {...field("siteId")}
              >
                <option value="" disabled>
                  Chọn chi nhánh
                </option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.ward ? ` — ${s.ward}` : ""}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          ) : site ? (
            <p className="text-sm text-ink-muted">
              Lấy hàng tại <span className="font-medium text-ink">{site.name}</span>
              {site.ward ? ` — ${site.ward}` : ""}
            </p>
          ) : null}

          <fieldset
            id={FIELD_ID.categoryCode}
            className="flex flex-col gap-3"
            aria-describedby={err("categoryCode") ? `${FIELD_ID.categoryCode}-error` : undefined}
            disabled={locked || busy}
          >
            <legend className="mb-1 text-sm font-medium">
              Danh mục <RequiredMark required />
            </legend>
            <AiFieldFrame active={aiFilled.has("categoryCode")}>
              <RadioGroup
                value={values.categoryCode}
                onValueChange={pickCategory}
                aria-invalid={err("categoryCode") ? true : undefined}
                className="grid grid-cols-2 gap-2 sm:grid-cols-3"
              >
                {categories.map((c) => {
                  return (
                    <label
                      key={c.code}
                      htmlFor={`offer-cat-${c.code}`}
                      className="flex min-h-14 cursor-pointer items-center gap-2.5 rounded-lg border bg-surface px-3 py-2 text-sm transition-colors hover:border-border-strong/50 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 has-[[aria-checked=true]]:border-primary has-[[aria-checked=true]]:bg-primary-soft"
                    >
                      <RadioGroupItem id={`offer-cat-${c.code}`} value={c.code} className="sr-only" />
                      <CategoryIcon iconName={c.icon} className="size-5 shrink-0 text-role-accent" />
                      <span className="leading-snug">{c.nameVi}</span>
                    </label>
                  );
                })}
              </RadioGroup>
            </AiFieldFrame>
            {err("categoryCode") ? (
              <FieldErrorText id={FIELD_ID.categoryCode}>{err("categoryCode")}</FieldErrorText>
            ) : null}
          </fieldset>

          <AiFieldFrame active={aiFilled.has("title")}>
            <FormField
              id={FIELD_ID.title}
              label="Tên lô"
              required
              error={err("title")}
              hint="Ngắn gọn, ví dụ “Bánh mì thịt nướng” hoặc “Sữa tươi tiệt trùng 1 lít”."
            >
              <Input
                id={FIELD_ID.title}
                value={values.title}
                maxLength={OFFER_LIMITS.titleMax}
                autoComplete="off"
                disabled={busy}
                onChange={(e) => update({ title: e.target.value }, ["title"], ["title"])}
                aria-describedby={describedBy(FIELD_ID.title, true, err("title"))}
                {...field("title")}
              />
            </FormField>
          </AiFieldFrame>

          <AiFieldFrame active={aiFilled.has("description")}>
            <FormField
              id={FIELD_ID.description}
              label="Mô tả, cách bảo quản"
              error={err("description")}
              hint="Ví dụ: để nơi khô thoáng, dùng trong ngày; có hành, không cay."
            >
              <Textarea
                id={FIELD_ID.description}
                rows={3}
                value={values.description}
                maxLength={OFFER_LIMITS.descriptionMax}
                disabled={busy}
                onChange={(e) => update({ description: e.target.value }, ["description"], ["description"])}
                aria-describedby={describedBy(FIELD_ID.description, true, err("description"))}
                className="min-h-20 bg-surface"
                {...field("description")}
              />
            </FormField>
          </AiFieldFrame>
        </Section>

        <Section
          title="Số lượng và khối lượng"
          headingId="offer-qty-heading"
          description="Đơn vị đếm (ổ, suất, hộp…) nhập số nguyên; kg và lít nhập được số lẻ."
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <AiFieldFrame active={aiFilled.has("quantity")}>
              <FormField
                id={FIELD_ID.quantity}
                label="Số lượng"
                required
                error={isPublished ? null : err("quantity")}
                hint={
                  isPublished
                    ? "Đổi số lượng bằng “Cập nhật số lượng” ở trang chi tiết lô."
                    : unit && isContinuous(unit)
                      ? "Có thể nhập số lẻ, ví dụ 2,5."
                      : "Số nguyên, ví dụ 20."
                }
              >
                <Input
                  id={FIELD_ID.quantity}
                  value={values.quantity}
                  inputMode={unit && isContinuous(unit) ? "decimal" : "numeric"}
                  autoComplete="off"
                  disabled={isPublished || busy}
                  onChange={(e) => update({ quantity: e.target.value }, ["quantity"], ["quantity"])}
                  aria-describedby={describedBy(
                    FIELD_ID.quantity,
                    true,
                    isPublished ? null : err("quantity"),
                  )}
                  className="tabular-nums"
                  {...field("quantity")}
                />
              </FormField>
            </AiFieldFrame>
            <AiFieldFrame active={aiFilled.has("unit")}>
              <FormField id={FIELD_ID.unit} label="Đơn vị" required error={err("unit")}>
                <NativeSelect
                  id={FIELD_ID.unit}
                  value={values.unit}
                  disabled={locked || busy}
                  onChange={(e) => pickUnit(e.target.value as UnitCode)}
                  aria-describedby={describedBy(FIELD_ID.unit, null, err("unit"))}
                  {...field("unit")}
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
            </AiFieldFrame>
          </div>

          {unit && unit !== "kg" ? (
            <AiFieldFrame active={aiFilled.has("unitWeightKg")}>
              <div className="flex flex-col gap-2">
                <label
                  htmlFor={FIELD_ID.unitWeightKg}
                  className="flex flex-wrap items-center gap-2 text-sm font-medium"
                >
                  Khối lượng mỗi {UNIT_LABEL[unit]} (kg) <RequiredMark required />
                  {weightIsDefault ? (
                    <span className="rounded-full border border-border-strong/40 bg-bg-sunken px-2 py-0.5 text-xs font-medium text-ink-muted">
                      Ước tính theo danh mục
                    </span>
                  ) : null}
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    id={FIELD_ID.unitWeightKg}
                    value={values.unitWeightKg}
                    inputMode="decimal"
                    autoComplete="off"
                    disabled={locked || busy}
                    onChange={(e) =>
                      update(
                        { unitWeightKg: e.target.value, weightSource: "declared" },
                        ["unitWeightKg"],
                        ["unitWeightKg"],
                      )
                    }
                    aria-invalid={err("unitWeightKg") ? true : undefined}
                    aria-describedby={describedBy(FIELD_ID.unitWeightKg, true, err("unitWeightKg"))}
                    onBlur={() => touch("unitWeightKg")}
                    className="max-w-40 tabular-nums"
                  />
                  {canUseDefaultWeight && category ? (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={locked || busy}
                      onClick={() =>
                        update(
                          {
                            unitWeightKg: formatDecimalInput(category.defaultUnitWeightKg),
                            weightSource: "category_default",
                          },
                          ["unitWeightKg"],
                          ["unitWeightKg"],
                        )
                      }
                    >
                      Dùng mức ước tính ({formatDecimalInput(category.defaultUnitWeightKg)} kg)
                    </Button>
                  ) : null}
                </div>
                {err("unitWeightKg") ? (
                  <FieldErrorText id={FIELD_ID.unitWeightKg}>{err("unitWeightKg")}</FieldErrorText>
                ) : (
                  <FieldHint id={FIELD_ID.unitWeightKg}>
                    {qtyNum && weightNum
                      ? `Tổng khoảng ${formatKg(qtyNum * weightNum)} — dùng để tính tác động (kg cứu được).`
                      : "Dùng để quy đổi ra kg khi tính tác động. Không cần chính xác tuyệt đối."}
                  </FieldHint>
                )}
              </div>
            </AiFieldFrame>
          ) : null}
        </Section>

        <Section
          title="Hạn dùng và khung giờ lấy"
          headingId="offer-time-heading"
          description="Giờ theo định dạng 24 giờ, giờ Việt Nam. Hạn hiệu lực là mốc đến trước: hạn dùng, hết khung lấy hoặc giờ đóng cửa."
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <AiFieldFrame active={aiFilled.has("expiryDate")}>
              <FormField
                id={FIELD_ID.expiryDate}
                label="Hạn sử dụng (ngày)"
                required
                error={err("expiryDate")}
              >
                <Input
                  id={FIELD_ID.expiryDate}
                  type="date"
                  value={values.expiryDate}
                  min={isPublished ? undefined : today}
                  disabled={locked || busy}
                  onChange={(e) =>
                    update({ expiryDate: e.target.value }, ["expiryDate", "pickupEnd"], ["expiryDate"])
                  }
                  aria-describedby={describedBy(FIELD_ID.expiryDate, null, err("expiryDate"))}
                  {...field("expiryDate")}
                />
              </FormField>
              {!locked ? (
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: "Hôm nay", date: today },
                    { label: "Ngày mai", date: addDays(today, 1) },
                  ].map((q) => (
                    <Button
                      key={q.label}
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      aria-pressed={values.expiryDate === q.date}
                      onClick={() => {
                        update({ expiryDate: q.date }, ["expiryDate", "pickupEnd"], ["expiryDate"]);
                        touch("expiryDate");
                      }}
                      className="min-h-11 md:min-h-9"
                    >
                      {q.label}
                    </Button>
                  ))}
                </div>
              ) : null}
            </AiFieldFrame>
            <FormField
              id={FIELD_ID.expiryTime}
              label="Giờ hết hạn"
              error={err("expiryTime")}
              hint="Bỏ trống nếu bao bì chỉ ghi ngày — FoodSave tính đến 23:59 ngày đó."
            >
              <TimeInput
                id={FIELD_ID.expiryTime}
                value={values.expiryTime}
                disabled={locked || busy}
                onValueChange={(v) => update({ expiryTime: v }, ["expiryTime", "pickupEnd"])}
                onBlur={() => touch("expiryTime")}
                aria-invalid={err("expiryTime") ? true : undefined}
                aria-describedby={describedBy(FIELD_ID.expiryTime, true, err("expiryTime"))}
                className="max-w-32"
              />
            </FormField>
          </div>

          <PickupRow
            legend="Bắt đầu lấy"
            idDate={FIELD_ID.pickupStart}
            idTime="offer-start-time"
            date={values.pickupStartDate}
            time={values.pickupStartTime}
            error={err("pickupStart")}
            disabled={locked || busy}
            onDate={(d) => {
              const follow =
                values.pickupEndDate === values.pickupStartDate || !isDateKey(values.pickupEndDate);
              update(follow ? { pickupStartDate: d, pickupEndDate: d } : { pickupStartDate: d }, [
                "pickupStart",
                "pickupEnd",
              ]);
            }}
            onTime={(t) => update({ pickupStartTime: t }, ["pickupStart", "pickupEnd"])}
            onBlur={() => touch("pickupStart")}
          />
          <PickupRow
            legend="Kết thúc lấy"
            idDate={FIELD_ID.pickupEnd}
            idTime="offer-end-time"
            date={values.pickupEndDate}
            time={values.pickupEndTime}
            error={err("pickupEnd")}
            disabled={locked || busy}
            onDate={(d) => update({ pickupEndDate: d }, ["pickupEnd"])}
            onTime={(t) => update({ pickupEndTime: t }, ["pickupEnd"])}
            onBlur={() => touch("pickupEnd")}
            hint="Tổ chức cần đến lấy trong khung này. Khung nên kết thúc trước giờ đóng cửa và trước hạn sử dụng."
            extra={
              suggestedEnd && !locked ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11 w-fit md:min-h-9"
                  onClick={() => {
                    const d = new Date(suggestedEnd);
                    update({ pickupEndDate: vnDateKey(d), pickupEndTime: vnTime(d) }, ["pickupEnd"]);
                    setSuggestedEnd(null);
                  }}
                >
                  Dùng {formatDeadline(new Date(suggestedEnd), now)}
                </Button>
              ) : null
            }
          />
        </Section>

        {canPublish ? (
          <Section
            title="Cam kết an toàn thực phẩm"
            headingId="offer-attest-heading"
            description="Bắt buộc khi đăng lô. Không cần khi chỉ lưu nháp."
          >
            <div className="flex flex-col gap-2">
              <label
                htmlFor={FIELD_ID.attested}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border bg-bg p-3.5",
                  attested && "border-primary bg-primary-soft",
                )}
              >
                <Checkbox
                  id={FIELD_ID.attested}
                  checked={attested}
                  disabled={busy}
                  onCheckedChange={(v) => {
                    setAttested(v === true);
                    clearField("attested");
                  }}
                  aria-invalid={err("attested") ? true : undefined}
                  aria-describedby={err("attested") ? `${FIELD_ID.attested}-error` : undefined}
                  className="mt-0.5 size-5"
                />
                <span className="text-sm leading-relaxed">{SAFETY_ATTESTATION}</span>
              </label>
              {err("attested") ? (
                <FieldErrorText id={FIELD_ID.attested}>{err("attested")}</FieldErrorText>
              ) : null}
            </div>
          </Section>
        ) : null}
      </div>

      <aside
        className="lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-1"
        aria-label="Xem trước lô"
      >
        <OfferPreview
          values={values}
          category={category}
          siteName={sites.length > 1 ? (site?.name ?? null) : null}
          photoUrl={photo.previewUrl}
          siteClose={siteClose && siteClose.key === closeKey && siteClose.failed ? null : siteCloseValue}
          serverNow={serverNow}
          now={now}
        />
      </aside>

      <div className="flex flex-col gap-3 rounded-xl border bg-surface p-4 sm:flex-row sm:items-center sm:justify-end lg:col-start-1">
        {canPublish ? (
          <>
            <p id="offer-publish-hint" className="flex items-start gap-1.5 text-sm text-ink-muted sm:mr-auto">
              <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
              {isPaused
                ? "Cửa hàng đang tạm ngưng nên chưa đăng được lô — bạn vẫn lưu nháp được."
                : attested
                  ? "Lô sẽ hiển thị ngay với các tổ chức phù hợp quanh cửa hàng."
                  : "Tick ô cam kết an toàn thực phẩm để bật nút “Đăng lô”."}
            </p>
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={busy}
              aria-busy={pendingIntent === "draft" || undefined}
              onClick={() => submit("draft")}
            >
              {pendingIntent === "draft" ? (
                <Loader2 aria-hidden className="animate-spin" />
              ) : (
                <Save aria-hidden />
              )}
              Lưu nháp
            </Button>
            <Button
              type="button"
              size="lg"
              disabled={busy || publishBlocked}
              aria-describedby="offer-publish-hint"
              aria-busy={pendingIntent === "publish" || undefined}
              onClick={() => submit("publish")}
            >
              {pendingIntent === "publish" ? (
                <Loader2 aria-hidden className="animate-spin" />
              ) : (
                <Send aria-hidden />
              )}
              Đăng lô
            </Button>
          </>
        ) : (
          <>
            <Button asChild variant="ghost" size="lg">
              <Link href={offerId ? `/store/inventory/${offerId}` : "/store/inventory"}>Hủy</Link>
            </Button>
            <Button
              type="button"
              size="lg"
              disabled={busy}
              aria-busy={pendingIntent === "save" || undefined}
              onClick={() => submit("save")}
            >
              {pendingIntent === "save" ? (
                <Loader2 aria-hidden className="animate-spin" />
              ) : (
                <Save aria-hidden />
              )}
              Lưu thay đổi
            </Button>
          </>
        )}
      </div>
    </form>
  );
}

/** Một mốc của khung giờ lấy: ngày + giờ 24h (không dùng `<input type="time">`). */
function PickupRow({
  legend,
  idDate,
  idTime,
  date,
  time,
  error,
  disabled,
  onDate,
  onTime,
  onBlur,
  hint,
  extra,
}: {
  legend: string;
  idDate: string;
  idTime: string;
  date: string;
  time: string;
  error: string | null;
  disabled: boolean;
  onDate: (d: string) => void;
  onTime: (t: string) => void;
  onBlur: () => void;
  hint?: string;
  extra?: React.ReactNode;
}) {
  const describe = error ? `${idDate}-error` : hint ? `${idDate}-hint` : undefined;
  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={describe}>
      <legend className="mb-1 text-sm font-medium">
        {legend} <RequiredMark required />
      </legend>
      <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3 sm:max-w-md">
        <div className="flex flex-col gap-1">
          <label htmlFor={idDate} className="text-xs text-ink-subtle">
            Ngày<span className="sr-only"> {legend.toLowerCase()}</span>
          </label>
          <Input
            id={idDate}
            type="date"
            value={date}
            disabled={disabled}
            onChange={(e) => onDate(e.target.value)}
            onBlur={onBlur}
            aria-invalid={error ? true : undefined}
            aria-describedby={describe}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={idTime} className="text-xs text-ink-subtle">
            Giờ<span className="sr-only"> {legend.toLowerCase()}</span>
          </label>
          <TimeInput
            id={idTime}
            value={time}
            disabled={disabled}
            onValueChange={onTime}
            onBlur={onBlur}
            aria-invalid={error ? true : undefined}
            aria-describedby={describe}
          />
        </div>
      </div>
      {error ? (
        <FieldErrorText id={idDate}>{error}</FieldErrorText>
      ) : hint ? (
        <FieldHint id={idDate}>{hint}</FieldHint>
      ) : null}
      {extra}
    </fieldset>
  );
}
