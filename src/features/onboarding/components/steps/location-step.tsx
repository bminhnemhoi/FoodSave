"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { LocationPicker } from "@/features/locations/components/location-picker";
import type { LocationValue } from "@/features/locations/schemas";
import { newUuid } from "@/lib/hash";

import { saveHours, saveSite } from "../../actions";
import { defaultHours, hoursFromRows, hoursToRows, validateHours, type HoursValue } from "../../hours";
import { KIND_COPY } from "../../options";
import { MESSAGES, pickValid, siteFields } from "../../schemas";
import { stableKey, useAutosave, type SaveResult } from "../autosave";
import { CharitySiteFields, useCharitySiteState } from "../charity-site-fields";
import { describedBy, ErrorSummary, FieldErrorText, FormField, Section } from "../fields";
import { useWizard } from "../wizard-context";
import { HoursEditor } from "./hours-editor";

/** Bước 2 — Địa điểm: ghim (nguồn sự thật), tên điểm, cài đặt điểm nhận (tổ chức), giờ (P1-03, P1-05, P1-06). */
export function LocationStep() {
  const { kind, data, orgId, setValidator, reportComplete } = useWizard();
  const copy = KIND_COPY[kind];
  const site = data.site;
  const fields = useMemo(() => siteFields(kind), [kind]);

  const [name, setName] = useState(site?.name ?? data.org?.basics.name ?? "");
  const [location, setLocation] = useState<LocationValue | null>(site?.location ?? null);
  const charity = useCharitySiteState({
    visibility: site?.visibility ?? (data.org?.basics.subtype === "shelter" ? "hidden" : "approximate"),
    radiusKm: site?.radiusKm ?? 5,
    acceptedCategories: site?.acceptedCategories ?? null,
    capacityKg: site?.capacityKg ?? null,
  });
  const [hours, setHours] = useState<HoursValue>(() =>
    site ? hoursFromRows(data.hours, true, kind) : defaultHours(kind),
  );
  const [siteId, setSiteId] = useState<string | null>(site?.id ?? null);
  const [siteSavedAt, setSiteSavedAt] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [serverLocationError, setServerLocationError] = useState<string | null>(null);

  const siteIdRef = useRef(siteId);
  const opRef = useRef<{ key: string; id: string } | null>(null);

  const charityRaw = charity.raw;
  const raw = useMemo(
    () => (kind === "store" ? { name, location } : { name, location, ...charityRaw }),
    [kind, name, location, charityRaw],
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
            radiusKm={kind === "charity" && !radiusError ? charity.radius : undefined}
            label="Tìm địa chỉ *"
          />
          {locationError ? <FieldErrorText id="site-location">{locationError}</FieldErrorText> : null}
        </div>
      </Section>

      {kind === "charity" ? (
        <CharitySiteFields
          state={charity}
          siteId={siteId}
          countRefreshKey={siteSavedAt}
          errors={errors}
          showErrors={showErrors}
        />
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
