"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Bike,
  Car,
  Footprints,
  Loader2,
  LocateFixed,
  type LucideIcon,
  Motorbike,
  Save,
  X,
} from "lucide-react";
import { useState, useTransition } from "react";
import { Controller, useForm, useWatch, type FieldPath } from "react-hook-form";
import { toast } from "sonner";

import { LocationPickerMapLazy } from "@/components/map/location-picker-map-lazy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import type { LatLng } from "@/core/geo/types";
import {
  describedBy,
  ErrorSummary,
  FieldErrorText,
  FormField,
  RequiredMark,
  Section,
} from "@/features/onboarding/components/fields";

import { saveVolunteerProfile } from "../actions";
import { useOnline } from "../hooks";
import { VEHICLE_LABEL, VEHICLE_ORDER, type VehicleType } from "../labels";
import { profileFormSchema, snapArea, type ProfileFormInput, type ProfileFormValues } from "../schemas";

const VEHICLE_ICON: Record<VehicleType, LucideIcon> = {
  motorbike: Motorbike,
  bicycle: Bike,
  car: Car,
  on_foot: Footprints,
};

const ORDER: (keyof ProfileFormInput)[] = [
  "fullName",
  "phone",
  "vehicle",
  "capacityKg",
  "area",
  "areaLabel",
  "availabilityNote",
];

const NETWORK = "Không có kết nối mạng. Dữ liệu bạn nhập vẫn còn — hãy lưu lại khi có sóng.";

/**
 * Hồ sơ tình nguyện viên (PRD US-VOL-01 AC2; DATA-MODEL §2.1 `volunteer_profiles`, §8.2): tên hiển thị + SĐT
 * (để cửa hàng/tổ chức liên hệ, luôn hiển thị đã che), phương tiện, sức chở, khu vực gần đúng (ghim trên bản đồ,
 * làm tròn ô ~1 km ngay trên máy và lại ở DB — không bao giờ là địa chỉ nhà), ghi chú lịch rảnh.
 */
export function VolunteerProfileForm({ initial }: { initial: ProfileFormInput }) {
  const online = useOnline();
  const form = useForm<ProfileFormInput, unknown, ProfileFormValues>({
    defaultValues: initial,
    mode: "onTouched",
    resolver: zodResolver(profileFormSchema),
  });
  const errors = form.formState.errors;
  const [showSummary, setShowSummary] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState(0);
  const [locating, setLocating] = useState(false);
  const [geoMessage, setGeoMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const err = (k: keyof ProfileFormInput) => (errors[k]?.message as string | undefined) ?? null;
  const area = useWatch({ control: form.control, name: "area" });

  const setArea = (p: LatLng | null, focus = false) => {
    form.setValue("area", p ? snapArea(p) : null, { shouldDirty: true, shouldValidate: true });
    if (focus) setFocusKey((k) => k + 1);
  };

  const locateMe = () => {
    setGeoMessage(null);
    if (!("geolocation" in navigator)) {
      setGeoMessage("Trình duyệt không hỗ trợ định vị. Hãy chạm lên bản đồ để chọn khu vực.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        // Chỉ giữ ô ~1 km, toạ độ chính xác bị bỏ ngay
        setArea({ lat: pos.coords.latitude, lng: pos.coords.longitude }, true);
      },
      (e) => {
        setLocating(false);
        setGeoMessage(
          e.code === 1
            ? "FoodSave chưa được phép dùng vị trí. Hãy chạm lên bản đồ để chọn khu vực."
            : "Chưa lấy được vị trí. Hãy chạm lên bản đồ để chọn khu vực.",
        );
      },
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 300_000 },
    );
  };

  const onValid = () => {
    setShowSummary(false);
    setFormError(null);
    const raw = form.getValues();
    startTransition(async () => {
      try {
        const res = await saveVolunteerProfile(raw);
        if (!res.ok) {
          for (const [k, msg] of Object.entries(res.error.fieldErrors ?? {})) {
            if ((ORDER as string[]).includes(k))
              form.setError(k as FieldPath<ProfileFormInput>, { message: msg });
          }
          setFormError(res.error.message);
          return;
        }
        form.reset(raw);
        toast.success("Đã lưu hồ sơ tình nguyện viên.");
      } catch {
        setFormError(NETWORK);
      }
    });
  };

  const summary = showSummary
    ? ORDER.filter((k) => errors[k]?.message).map((k) => ({
        id: `vp-${k}`,
        message: String(errors[k]!.message),
      }))
    : [];

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(onValid, () => setShowSummary(true))}
      className="flex flex-col gap-5"
      aria-label="Hồ sơ tình nguyện viên"
    >
      <ErrorSummary errors={summary} />
      {formError ? (
        <p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
          {formError}
        </p>
      ) : null}

      <Section
        title="Liên hệ"
        headingId="vp-contact"
        description="Cửa hàng và tổ chức chỉ thấy số đã che một phần (ví dụ 090****567)."
      >
        <FormField id="vp-fullName" label="Tên hiển thị" required error={err("fullName")}>
          <Input
            id="vp-fullName"
            autoComplete="name"
            maxLength={120}
            className="h-12 text-base"
            aria-invalid={err("fullName") ? true : undefined}
            aria-describedby={describedBy("vp-fullName", null, err("fullName"))}
            {...form.register("fullName")}
          />
        </FormField>
        <FormField
          id="vp-phone"
          label="Số điện thoại"
          error={err("phone")}
          hint="Để điều phối viên gọi khi cần. Ví dụ 0901 234 567."
        >
          <Input
            id="vp-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            maxLength={20}
            className="h-12 text-base"
            aria-invalid={err("phone") ? true : undefined}
            aria-describedby={describedBy("vp-phone", true, err("phone"))}
            {...form.register("phone")}
          />
        </FormField>
      </Section>

      <Section title="Phương tiện và sức chở" headingId="vp-vehicle-heading">
        <fieldset
          id="vp-vehicle"
          className="flex flex-col gap-2"
          aria-describedby={err("vehicle") ? "vp-vehicle-error" : undefined}
        >
          <legend className="mb-1 text-sm font-medium">
            Phương tiện <RequiredMark required />
          </legend>
          <Controller
            control={form.control}
            name="vehicle"
            render={({ field }) => (
              <RadioGroup
                value={field.value}
                onValueChange={(v) => {
                  field.onChange(v);
                  field.onBlur();
                }}
                aria-invalid={err("vehicle") ? true : undefined}
                className="grid grid-cols-2 gap-2"
              >
                {VEHICLE_ORDER.map((v, i) => {
                  const Icon = VEHICLE_ICON[v];
                  return (
                    <label
                      key={v}
                      className="flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border bg-surface px-3 py-2.5 has-[[aria-checked=true]]:border-role-accent has-[[aria-checked=true]]:bg-role-accent-soft"
                    >
                      <RadioGroupItem value={v} ref={i === 0 ? field.ref : undefined} />
                      <Icon aria-hidden className="size-5 text-ink-muted" />
                      <span className="text-base">{VEHICLE_LABEL[v]}</span>
                    </label>
                  );
                })}
              </RadioGroup>
            )}
          />
          {err("vehicle") ? <FieldErrorText id="vp-vehicle">{err("vehicle")}</FieldErrorText> : null}
        </fieldset>

        <FormField
          id="vp-capacityKg"
          label="Sức chở mỗi chuyến (kg)"
          required
          error={err("capacityKg")}
          hint="Từ 1 đến 500 kg. Điều phối viên dùng để chia hàng cho vừa xe."
          className="max-w-xs"
        >
          <Input
            id="vp-capacityKg"
            inputMode="decimal"
            autoComplete="off"
            maxLength={6}
            className="h-12 text-base tabular-nums"
            aria-invalid={err("capacityKg") ? true : undefined}
            aria-describedby={describedBy("vp-capacityKg", true, err("capacityKg"))}
            {...form.register("capacityKg")}
          />
        </FormField>
      </Section>

      <Section
        title="Khu vực hoạt động"
        headingId="vp-area-heading"
        description="Chạm lên bản đồ hoặc dùng vị trí hiện tại. FoodSave chỉ lưu ô gần đúng khoảng 1 km — không phải địa chỉ nhà."
      >
        <div id="vp-area" className="flex flex-col gap-3">
          <div className="h-64 sm:h-72">
            <LocationPickerMapLazy
              pin={area}
              focusKey={focusKey}
              radiusKm={area ? 0.7 : undefined}
              onPinChange={(p, phase) => {
                if (phase === "commit") setArea(p);
              }}
              ariaLabel="Bản đồ chọn khu vực hoạt động. Chạm để đặt ghim; ghim được làm tròn về ô khoảng 1 km."
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-12 text-base"
              onClick={locateMe}
              disabled={locating}
              aria-busy={locating}
            >
              {locating ? <Loader2 aria-hidden className="animate-spin" /> : <LocateFixed aria-hidden />}
              Dùng vị trí hiện tại
            </Button>
            {area ? (
              <Button
                type="button"
                variant="ghost"
                size="lg"
                className="h-12 text-base"
                onClick={() => setArea(null)}
              >
                <X aria-hidden />
                Xóa khu vực
              </Button>
            ) : null}
          </div>
          <p role="status" className="text-sm text-ink-muted">
            {geoMessage ??
              (area
                ? "Đã chọn khu vực (làm tròn khoảng 1 km)."
                : "Chưa chọn khu vực — điều phối viên sẽ không biết bạn ở gần điểm nào.")}
          </p>
          {err("area") ? <FieldErrorText id="vp-area">{err("area")}</FieldErrorText> : null}
        </div>
        <FormField
          id="vp-areaLabel"
          label="Tên khu vực"
          error={err("areaLabel")}
          hint="Ví dụ “Phường Bàn Cờ”. Không ghi số nhà."
        >
          <Input
            id="vp-areaLabel"
            maxLength={120}
            className="h-12 text-base"
            aria-invalid={err("areaLabel") ? true : undefined}
            aria-describedby={describedBy("vp-areaLabel", true, err("areaLabel"))}
            {...form.register("areaLabel")}
          />
        </FormField>
        <FormField
          id="vp-availabilityNote"
          label="Lịch rảnh"
          error={err("availabilityNote")}
          hint="Ví dụ “Tối thứ 2–6 sau 18:00, cả ngày Chủ nhật”."
        >
          <Textarea
            id="vp-availabilityNote"
            rows={2}
            maxLength={300}
            className="min-h-20 bg-surface text-base"
            aria-invalid={err("availabilityNote") ? true : undefined}
            aria-describedby={describedBy("vp-availabilityNote", true, err("availabilityNote"))}
            {...form.register("availabilityNote")}
          />
        </FormField>
      </Section>

      <div className="flex flex-col gap-2">
        <Button
          type="submit"
          size="lg"
          className="h-[3.25rem] w-full text-lg sm:w-fit sm:px-8"
          disabled={pending || !online}
          aria-busy={pending}
        >
          {pending ? (
            <Loader2 aria-hidden className="size-5 animate-spin" />
          ) : (
            <Save aria-hidden className="size-5" />
          )}
          Lưu hồ sơ
        </Button>
        {!online ? <p className="text-sm text-ink-muted">Đang ngoại tuyến — cần mạng để lưu hồ sơ.</p> : null}
      </div>
    </form>
  );
}
