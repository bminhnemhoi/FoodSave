"use client";

import { Loader2, Store } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { LocationPicker } from "@/features/locations/components/location-picker";
import type { LocationValue } from "@/features/locations/schemas";
import { formatKm } from "@/lib/format";
import { newUuid } from "@/lib/hash";
import { createClient } from "@/lib/supabase/client";

import { saveHours, saveSite } from "../../actions";
import { defaultHours, hoursFromRows, hoursToRows, validateHours, type HoursValue } from "../../hours";
import {
  FOOD_CATEGORIES,
  FOOD_CATEGORY_CODES,
  KIND_COPY,
  VISIBILITY_OPTIONS,
  type SiteVisibility,
} from "../../options";
import { MESSAGES, pickValid, RADIUS_MAX_KM, RADIUS_MIN_KM, siteFields } from "../../schemas";
import { stableKey, useAutosave, type SaveResult } from "../autosave";
import { describedBy, ErrorSummary, FieldErrorText, FormField, RequiredMark, Section } from "../fields";
import { useWizard } from "../wizard-context";
import { HoursEditor } from "./hours-editor";

type CountState =
  | { status: "idle" }
  | { status: "loading"; prev?: { n: number; radius: number } }
  | { status: "done"; n: number; radius: number }
  | { status: "error" };

/** Số cửa hàng đã duyệt trong bán kính (count_stores_within, gọi thẳng RPC đọc từ trình duyệt — ARCHITECTURE §5). */
function useStoreCount(siteId: string | null, radius: number | null, refreshKey: string | null): CountState {
  const requestKey = siteId && radius !== null ? `${siteId}|${radius}|${refreshKey ?? ""}` : null;
  const [result, setResult] = useState<
    { key: string; n: number; radius: number } | { key: string; error: true } | null
  >(null);
  useEffect(() => {
    if (!siteId || radius === null || !requestKey) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data, error } = await createClient().rpc("count_stores_within", {
        p_site_id: siteId,
        p_radius_km: radius,
      });
      if (cancelled) return;
      setResult(
        error || typeof data !== "number"
          ? { key: requestKey, error: true }
          : { key: requestKey, n: data, radius },
      );
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [siteId, radius, requestKey]);

  if (!requestKey) return { status: "idle" };
  if (!result || result.key !== requestKey) {
    const prev = result && "n" in result ? { n: result.n, radius: result.radius } : undefined;
    return { status: "loading", prev };
  }
  return "error" in result ? { status: "error" } : { status: "done", n: result.n, radius: result.radius };
}

function CountLine({ state, hasSite }: { state: CountState; hasSite: boolean }) {
  let text: React.ReactNode;
  if (!hasSite) text = "Ghim điểm nhận trên bản đồ để xem số cửa hàng trong vùng.";
  else if (state.status === "error") text = "Chưa đếm được số cửa hàng trong vùng. Bạn vẫn có thể tiếp tục.";
  else {
    const shown = state.status === "done" ? state : state.status === "loading" ? state.prev : undefined;
    if (!shown) text = "Đang đếm cửa hàng trong bán kính…";
    else
      text =
        shown.n > 0 ? (
          <>
            Có <strong className="tabular-nums">{shown.n}</strong> cửa hàng đã duyệt trong bán kính{" "}
            {formatKm(shown.radius)}.
          </>
        ) : (
          <>Chưa có cửa hàng trong bán kính {formatKm(shown.radius)} — FoodSave sẽ báo khi có.</>
        );
  }
  return (
    <p
      aria-live="polite"
      data-testid="store-count"
      className="flex items-start gap-2 rounded-lg border border-info/30 bg-info-soft p-3 text-sm text-ink"
    >
      {state.status === "loading" ? (
        <Loader2 aria-hidden className="mt-0.5 size-4 shrink-0 animate-spin text-info" />
      ) : (
        <Store aria-hidden className="mt-0.5 size-4 shrink-0 text-info" />
      )}
      <span>{text}</span>
    </p>
  );
}

/** Bước 2 — Địa điểm: ghim (nguồn sự thật), tên điểm, cài đặt điểm nhận (tổ chức), giờ (P1-03, P1-05, P1-06). */
export function LocationStep() {
  const { kind, data, orgId, setValidator, reportComplete } = useWizard();
  const copy = KIND_COPY[kind];
  const site = data.site;
  const fields = useMemo(() => siteFields(kind), [kind]);

  const [name, setName] = useState(site?.name ?? data.org?.basics.name ?? "");
  const [location, setLocation] = useState<LocationValue | null>(site?.location ?? null);
  const [visibility, setVisibility] = useState<SiteVisibility>(
    site?.visibility ?? (data.org?.basics.subtype === "shelter" ? "hidden" : "approximate"),
  );
  const [radius, setRadius] = useState<number>(site?.radiusKm ?? 5);
  const [radiusText, setRadiusText] = useState(String(site?.radiusKm ?? 5).replace(".", ","));
  const [categories, setCategories] = useState<string[]>(
    site?.acceptedCategories ?? [...FOOD_CATEGORY_CODES],
  );
  const [capacity, setCapacity] = useState(
    site?.capacityKg != null ? String(site.capacityKg).replace(".", ",") : "",
  );
  const [hours, setHours] = useState<HoursValue>(() =>
    site ? hoursFromRows(data.hours, true, kind) : defaultHours(kind),
  );
  const [siteId, setSiteId] = useState<string | null>(site?.id ?? null);
  const [siteSavedAt, setSiteSavedAt] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [serverLocationError, setServerLocationError] = useState<string | null>(null);

  const siteIdRef = useRef(siteId);
  const opRef = useRef<{ key: string; id: string } | null>(null);

  const raw = useMemo(
    () =>
      kind === "store"
        ? { name, location }
        : {
            name,
            location,
            visibility,
            radiusKm: radius,
            acceptedCategories: categories,
            capacityKg: capacity.replace(",", "."),
          },
    [kind, name, location, visibility, radius, categories, capacity],
  );
  const { data: valid, errors } = useMemo(() => pickValid(fields, raw), [fields, raw]);

  const savable = useMemo(() => {
    if (!orgId) return null;
    const out = Object.fromEntries(Object.keys(valid).map((k) => [k, raw[k as keyof typeof raw]]));
    if (!siteId && (!("name" in valid) || !("location" in valid))) return null;
    return Object.keys(out).length > 0 ? out : null;
  }, [orgId, valid, raw, siteId]);

  async function saveSiteFn(v: Record<string, unknown>): Promise<SaveResult> {
    if (!orgId) return { ok: false, message: "Vui lòng hoàn tất bước Thông tin cơ bản trước." };
    const key = stableKey(v);
    if (opRef.current?.key !== key) opRef.current = { key, id: newUuid() };
    const res = await saveSite({ orgId, siteId: siteIdRef.current, clientOpId: opRef.current.id, values: v });
    if (!res.ok) {
      setServerLocationError(res.error.fieldErrors?.location ?? null);
      return { ok: false, message: res.error.message };
    }
    opRef.current = null;
    setServerLocationError(null);
    siteIdRef.current = res.data.siteId;
    setSiteId(res.data.siteId);
    setSiteSavedAt(res.data.savedAt);
    return { ok: true, savedAt: res.data.savedAt };
  }

  useAutosave({ id: "site", value: savable, save: saveSiteFn });

  const hoursErrors = useMemo(() => validateHours(hours), [hours]);
  const hoursRows = hoursErrors ? null : hoursToRows(hours);
  const [hoursBaseline] = useState(() => (site ? hoursToRows(hoursFromRows(data.hours, true, kind)) : null));
  useAutosave({
    id: "hours",
    value: hoursRows,
    enabled: siteId !== null,
    baseline: hoursBaseline,
    save: async (rows) => {
      if (!siteIdRef.current) return { ok: false, message: "Vui lòng chọn vị trí trước khi lưu giờ." };
      const res = await saveHours({ siteId: siteIdRef.current, rows });
      return res.ok ? { ok: true, savedAt: res.data.savedAt } : { ok: false, message: res.error.message };
    },
  });

  useEffect(() => reportComplete(siteId !== null), [siteId, reportComplete]);

  const radiusValid = !("radiusKm" in errors);
  const count = useStoreCount(kind === "charity" ? siteId : null, radiusValid ? radius : null, siteSavedAt);

  // ---- kiểm tra khi bấm "Tiếp tục" ----
  const nameError = showErrors && errors.name ? errors.name : null;
  const locationError = serverLocationError ?? (showErrors && !location ? MESSAGES.location : null);
  const radiusError = errors.radiusKm ?? null;
  const categoriesError = showErrors && errors.acceptedCategories ? errors.acceptedCategories : null;
  const capacityError = errors.capacityKg ?? null;
  const visibleHoursErrors =
    hoursErrors && (showErrors || Object.keys(hoursErrors.days).length > 0) ? hoursErrors : null;

  useEffect(() => {
    setValidator(() => {
      setShowErrors(true);
      const order: [string, boolean][] = [
        ["site-name", !!errors.name],
        ["site-location", !location],
        ["site-radius", !!errors.radiusKm],
        ["site-categories", !!errors.acceptedCategories],
        ["site-capacity", !!errors.capacityKg],
        ["site-hours", !!hoursErrors],
      ];
      const first = order.find(([, bad]) => bad);
      if (first) {
        const el = document.getElementById(first[0]);
        const target =
          first[0] === "site-location"
            ? el?.querySelector<HTMLElement>("[role=combobox]")
            : first[0] === "site-categories" || first[0] === "site-hours"
              ? el?.querySelector<HTMLElement>("button, input")
              : el;
        target?.focus();
        return false;
      }
      return true;
    });
    return () => setValidator(null);
  }, [setValidator, errors, location, hoursErrors]);

  const summary = showErrors
    ? [
        nameError ? { id: "site-name", message: nameError } : null,
        locationError ? { id: "site-location", message: locationError } : null,
        radiusError ? { id: "site-radius", message: radiusError } : null,
        categoriesError ? { id: "site-categories", message: categoriesError } : null,
        capacityError ? { id: "site-capacity", message: capacityError } : null,
        hoursErrors ? { id: "site-hours", message: "Giờ hoạt động chưa hợp lệ." } : null,
      ].filter((e): e is { id: string; message: string } => e !== null)
    : [];

  function updateRadiusText(text: string) {
    setRadiusText(text);
    const n = Number(text.replace(",", "."));
    if (text.trim() !== "" && Number.isFinite(n)) setRadius(n);
    else setRadius(Number.NaN);
  }

  function toggleCategory(code: string, on: boolean) {
    setCategories((c) => (on ? [...new Set([...c, code])] : c.filter((x) => x !== code)));
  }

  return (
    <form noValidate onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-6">
      <ErrorSummary errors={summary} />

      <Section
        title={kind === "store" ? "Vị trí cửa hàng" : "Vị trí điểm nhận"}
        headingId="site-where"
        description="Ghim trên bản đồ là vị trí được lưu — hãy kéo ghim tới đúng cổng ra vào."
      >
        <FormField
          id="site-name"
          label={kind === "store" ? "Tên điểm cửa hàng" : "Tên điểm nhận"}
          required
          error={nameError}
          hint={kind === "store" ? "Ví dụ: Chi nhánh Nguyễn Trãi." : "Ví dụ: Bếp chính, Cơ sở 2."}
        >
          <Input
            id="site-name"
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={describedBy("site-name", true, nameError)}
          />
        </FormField>

        <div id="site-location" className="flex flex-col gap-2">
          <LocationPicker
            defaultValue={site?.location ?? null}
            onChange={(v) => {
              setLocation(v);
              setServerLocationError(null);
            }}
            radiusKm={kind === "charity" && radiusValid ? radius : undefined}
            label="Tìm địa chỉ *"
          />
          {locationError ? <FieldErrorText id="site-location">{locationError}</FieldErrorText> : null}
        </div>
      </Section>

      {kind === "charity" ? (
        <>
          <Section
            title="Bán kính phục vụ"
            headingId="site-radius-heading"
            description="Bạn sẽ thấy lô tặng và nhận thông báo từ các cửa hàng trong vùng này."
          >
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-4">
                <input
                  type="range"
                  min={RADIUS_MIN_KM}
                  max={RADIUS_MAX_KM}
                  step={0.5}
                  value={radiusValid ? radius : 5}
                  onChange={(e) => updateRadiusText(e.target.value.replace(".", ","))}
                  aria-label="Thanh kéo bán kính phục vụ"
                  aria-valuetext={radiusValid ? formatKm(radius) : undefined}
                  className="h-11 min-w-48 flex-1 accent-primary"
                />
                <div className="flex items-center gap-2">
                  <Label htmlFor="site-radius" className="sr-only">
                    Bán kính phục vụ (km)
                  </Label>
                  <Input
                    id="site-radius"
                    inputMode="decimal"
                    value={radiusText}
                    onChange={(e) => updateRadiusText(e.target.value)}
                    aria-invalid={radiusError ? true : undefined}
                    aria-describedby={radiusError ? "site-radius-error" : "site-radius-hint"}
                    className="w-24 text-right tabular-nums"
                  />
                  <span className="text-sm text-ink-muted">km</span>
                </div>
              </div>
              {radiusError ? (
                <FieldErrorText id="site-radius">{radiusError}</FieldErrorText>
              ) : (
                <p id="site-radius-hint" className="text-sm text-ink-subtle">
                  Từ 0,5 đến 30 km, mặc định 5 km. Vòng nét đứt trên bản đồ thể hiện vùng phục vụ.
                </p>
              )}
              <CountLine state={count} hasSite={siteId !== null} />
            </div>
          </Section>

          <Section
            title="Hiển thị vị trí"
            headingId="site-visibility-heading"
            description="Thành viên của bạn và tình nguyện viên đang giao hàng tới luôn thấy vị trí chính xác."
          >
            <RadioGroup
              value={visibility}
              onValueChange={(v) => setVisibility(v as SiteVisibility)}
              aria-labelledby="site-visibility-heading"
              className="grid gap-2"
            >
              {VISIBILITY_OPTIONS.map((o) => (
                <label
                  key={o.value}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border bg-surface p-3 has-[[aria-checked=true]]:border-primary has-[[aria-checked=true]]:bg-primary-soft"
                >
                  <RadioGroupItem value={o.value} className="mt-1" aria-describedby={`vis-${o.value}-desc`} />
                  <span className="flex flex-col gap-0.5">
                    <span className="flex flex-wrap items-center gap-2 font-medium">
                      {o.label}
                      {o.recommended ? (
                        <span className="rounded-full border border-primary/30 bg-surface px-2 py-0.5 text-xs font-medium text-primary">
                          Khuyên dùng
                        </span>
                      ) : null}
                    </span>
                    <span id={`vis-${o.value}-desc`} className="text-sm text-ink-muted">
                      {o.description}
                    </span>
                  </span>
                </label>
              ))}
            </RadioGroup>
          </Section>

          <Section
            title="Thực phẩm nhận"
            headingId="site-categories-heading"
            description="FoodSave chỉ gợi ý lô thuộc các loại bạn chọn."
          >
            <fieldset id="site-categories" className="flex flex-col gap-3">
              <legend className="sr-only">
                Loại thực phẩm nhận <RequiredMark required />
              </legend>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {FOOD_CATEGORIES.map((c) => (
                  <label
                    key={c.code}
                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border bg-surface px-3 py-2"
                  >
                    <Checkbox
                      checked={categories.includes(c.code)}
                      onCheckedChange={(v) => toggleCategory(c.code, v === true)}
                    />
                    <span className="text-sm">{c.label}</span>
                  </label>
                ))}
              </div>
              {categoriesError ? (
                <FieldErrorText id="site-categories">{categoriesError}</FieldErrorText>
              ) : null}
            </fieldset>
            <FormField
              id="site-capacity"
              label="Sức nhận mỗi ngày (kg)"
              error={capacityError}
              hint="Khối lượng thực phẩm tối đa bạn bảo quản và dùng hết trong một ngày."
              className="sm:max-w-xs"
            >
              <Input
                id="site-capacity"
                inputMode="decimal"
                value={capacity}
                maxLength={10}
                onChange={(e) => setCapacity(e.target.value)}
                aria-invalid={capacityError ? true : undefined}
                aria-describedby={describedBy("site-capacity", true, capacityError)}
              />
            </FormField>
          </Section>
        </>
      ) : null}

      <Section
        title={copy.hoursTitle}
        headingId="site-hours-heading"
        description={
          kind === "store"
            ? "Dùng để tính hạn lấy hàng của mỗi lô. Giờ theo giờ Việt Nam."
            : "Thời gian tình nguyện viên có thể giao hàng tới. Giờ theo giờ Việt Nam."
        }
      >
        <div id="site-hours">
          <HoursEditor
            value={hours}
            onChange={setHours}
            errors={visibleHoursErrors}
            openLabel={copy.hoursOpenLabel}
          />
        </div>
        {siteId === null ? (
          <p className="text-sm text-ink-subtle">Giờ sẽ được lưu ngay khi bạn chọn vị trí trên bản đồ.</p>
        ) : null}
      </Section>
    </form>
  );
}
