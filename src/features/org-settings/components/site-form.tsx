"use client";

import { Loader2, Save, X } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LocationPicker } from "@/features/locations/components/location-picker";
import type { LocationValue } from "@/features/locations/schemas";
import { CharitySiteFields, useCharitySiteState } from "@/features/onboarding/components/charity-site-fields";
import {
  describedBy,
  ErrorSummary,
  FieldErrorText,
  FormField,
  Section,
} from "@/features/onboarding/components/fields";
import type { OrgKind } from "@/features/onboarding/options";
import { MESSAGES, pickValid, siteFields } from "@/features/onboarding/schemas";
import { newUuid } from "@/lib/hash";

import { saveSettingsSite } from "../actions";
import type { SettingsSite } from "../queries";

/**
 * Thêm/sửa một điểm (F-08, US-STO-05 AC1, US-CHA-02 AC2): tên, ghim bản đồ (nguồn sự thật, LocationPicker),
 * với tổ chức thêm bán kính, hiển thị vị trí, loại thực phẩm, sức nhận. Lưu bằng `upsert_site`
 * (`client_op_id` cố định cho mỗi lần mở form ⇒ bấm lại không tạo trùng).
 */
export function SiteForm({
  kind,
  orgId,
  site,
  onDone,
}: {
  kind: OrgKind;
  orgId: string;
  /** `null` = thêm điểm mới. */
  site: SettingsSite | null;
  onDone: () => void;
}) {
  const fields = useMemo(() => siteFields(kind), [kind]);
  const [name, setName] = useState(site?.name ?? "");
  const [location, setLocation] = useState<LocationValue | null>(site?.location ?? null);
  const charity = useCharitySiteState({
    visibility: site?.visibility ?? "approximate",
    radiusKm: site?.radiusKm ?? 5,
    acceptedCategories: site?.acceptedCategories ?? null,
    capacityKg: site?.capacityKg ?? null,
  });
  const [showErrors, setShowErrors] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [serverLocationError, setServerLocationError] = useState<string | null>(null);
  const [opId] = useState(newUuid);
  const [pending, startTransition] = useTransition();

  const charityRaw = charity.raw;
  const raw = useMemo(
    () => (kind === "store" ? { name, location } : { name, location, ...charityRaw }),
    [kind, name, location, charityRaw],
  );
  const { errors } = useMemo(() => pickValid(fields, raw), [fields, raw]);

  const nameError = showErrors && errors.name ? errors.name : null;
  const locationError =
    serverLocationError ??
    (showErrors && !location ? MESSAGES.location : showErrors && errors.location ? errors.location : null);
  const radiusError = errors.radiusKm ?? null;

  const summary = showErrors
    ? [
        nameError ? { id: "site-name", message: nameError } : null,
        locationError ? { id: "site-location", message: locationError } : null,
        radiusError ? { id: "site-radius", message: radiusError } : null,
        errors.acceptedCategories ? { id: "site-categories", message: errors.acceptedCategories } : null,
        errors.capacityKg ? { id: "site-capacity", message: errors.capacityKg } : null,
      ].filter((e): e is { id: string; message: string } => e !== null)
    : [];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setShowErrors(true);
    setServerError(null);
    const bad = Object.keys(errors).length > 0 || !location;
    if (bad) {
      const firstId = errors.name ? "site-name" : !location || errors.location ? "site-location" : null;
      const el = firstId ? document.getElementById(firstId) : null;
      (firstId === "site-location" ? el?.querySelector<HTMLElement>("[role=combobox]") : el)?.focus();
      return;
    }
    startTransition(async () => {
      try {
        const res = await saveSettingsSite({
          orgId,
          siteId: site?.id ?? null,
          clientOpId: opId,
          values: raw,
        });
        if (!res.ok) {
          setServerLocationError(res.error.fieldErrors?.location ?? null);
          setServerError(res.error.message);
          return;
        }
        toast.success(site ? `Đã lưu điểm “${name.trim()}”.` : `Đã thêm điểm “${name.trim()}”.`);
        onDone();
      } catch {
        setServerError("Không có kết nối mạng. Dữ liệu của bạn vẫn còn — hãy thử lại khi có mạng.");
      }
    });
  }

  return (
    <form
      noValidate
      onSubmit={submit}
      className="flex flex-col gap-6"
      aria-label={site ? `Sửa điểm ${site.name}` : "Thêm điểm mới"}
    >
      <ErrorSummary errors={summary} />
      {serverError ? (
        <p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
          {serverError}
        </p>
      ) : null}

      <Section
        title={kind === "store" ? "Vị trí chi nhánh" : "Vị trí điểm nhận"}
        headingId="site-where"
        description="Ghim trên bản đồ là vị trí được lưu — hãy kéo ghim tới đúng cổng ra vào."
      >
        <FormField
          id="site-name"
          label={kind === "store" ? "Tên chi nhánh" : "Tên điểm nhận"}
          required
          error={nameError}
          hint={kind === "store" ? "Ví dụ: Chi nhánh Gia Định." : "Ví dụ: Bếp chính, Cơ sở 2."}
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
          siteId={site?.id ?? null}
          countRefreshKey={null}
          errors={errors}
          showErrors={showErrors}
        />
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending} aria-disabled={pending} className="min-h-11">
          {pending ? <Loader2 aria-hidden className="animate-spin" /> : <Save aria-hidden />}
          {pending ? "Đang lưu…" : site ? "Lưu điểm" : "Thêm điểm"}
        </Button>
        <Button type="button" variant="ghost" className="min-h-11" onClick={onDone} disabled={pending}>
          <X aria-hidden />
          Hủy
        </Button>
      </div>
    </form>
  );
}
