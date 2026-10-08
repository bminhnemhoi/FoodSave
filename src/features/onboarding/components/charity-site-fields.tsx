"use client";

import { Loader2, Store } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { formatKm } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

import { FOOD_CATEGORIES, FOOD_CATEGORY_CODES, VISIBILITY_OPTIONS, type SiteVisibility } from "../options";
import { RADIUS_MAX_KM, RADIUS_MIN_KM } from "../schemas";
import { describedBy, FieldErrorText, FormField, RequiredMark, Section } from "./fields";

/**
 * Cài đặt điểm nhận của tổ chức (P1-05, US-CHA-02, US-CHA-03, US-CHA-35): bán kính phục vụ + đếm cửa hàng,
 * chế độ hiển thị vị trí, loại thực phẩm nhận, sức nhận. Dùng chung cho wizard và trang Cài đặt.
 */

export type CharitySiteInit = {
  visibility: SiteVisibility;
  radiusKm: number;
  acceptedCategories: string[] | null;
  capacityKg: number | null;
};

/** Trạng thái form điểm nhận; `raw` là giá trị thô đưa vào `siteFields("charity")`. */
export function useCharitySiteState(init: CharitySiteInit) {
  const [visibility, setVisibility] = useState<SiteVisibility>(init.visibility);
  const [radius, setRadius] = useState<number>(init.radiusKm);
  const [radiusText, setRadiusText] = useState(String(init.radiusKm).replace(".", ","));
  const [categories, setCategories] = useState<string[]>(init.acceptedCategories ?? [...FOOD_CATEGORY_CODES]);
  const [capacity, setCapacity] = useState(
    init.capacityKg != null ? String(init.capacityKg).replace(".", ",") : "",
  );

  function updateRadiusText(text: string) {
    setRadiusText(text);
    const n = Number(text.replace(",", "."));
    if (text.trim() !== "" && Number.isFinite(n)) setRadius(n);
    else setRadius(Number.NaN);
  }

  function toggleCategory(code: string, on: boolean) {
    setCategories((c) => (on ? [...new Set([...c, code])] : c.filter((x) => x !== code)));
  }

  /** Giá trị thô cho `siteFields("charity")` (trừ tên và vị trí); giữ nguyên tham chiếu khi không đổi. */
  const raw = useMemo(
    () => ({
      visibility,
      radiusKm: radius,
      acceptedCategories: categories,
      capacityKg: capacity.replace(",", "."),
    }),
    [visibility, radius, categories, capacity],
  );

  return {
    raw,
    visibility,
    setVisibility,
    radius,
    radiusText,
    updateRadiusText,
    categories,
    toggleCategory,
    capacity,
    setCapacity,
  };
}

export type CharitySiteState = ReturnType<typeof useCharitySiteState>;

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

export function CharitySiteFields({
  state,
  siteId,
  countRefreshKey,
  errors,
  showErrors,
}: {
  state: CharitySiteState;
  /** Điểm đã lưu (để đếm cửa hàng trong bán kính); `null` khi chưa có điểm. */
  siteId: string | null;
  /** Đổi giá trị ⇒ đếm lại (vd. thời điểm lưu vị trí mới). */
  countRefreshKey: string | null;
  errors: Partial<Record<"radiusKm" | "acceptedCategories" | "capacityKg", string>>;
  /** Hiện lỗi "chưa chọn" (sau khi bấm Tiếp tục/Lưu). Lỗi định dạng luôn hiện. */
  showErrors: boolean;
}) {
  const { visibility, setVisibility, radius, radiusText, updateRadiusText, categories, toggleCategory } =
    state;
  const radiusError = errors.radiusKm ?? null;
  const radiusValid = !radiusError;
  const categoriesError = showErrors && errors.acceptedCategories ? errors.acceptedCategories : null;
  const capacityError = errors.capacityKg ?? null;
  const count = useStoreCount(siteId, radiusValid ? radius : null, countRefreshKey);

  return (
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
          {categoriesError ? <FieldErrorText id="site-categories">{categoriesError}</FieldErrorText> : null}
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
            value={state.capacity}
            maxLength={10}
            onChange={(e) => state.setCapacity(e.target.value)}
            aria-invalid={capacityError ? true : undefined}
            aria-describedby={describedBy("site-capacity", true, capacityError)}
          />
        </FormField>
      </Section>
    </>
  );
}
