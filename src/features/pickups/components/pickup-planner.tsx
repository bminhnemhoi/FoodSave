"use client";

import { Bike, CircleAlert, Clock3, Footprints, Home, Loader2, Route, Store } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Countdown } from "@/components/labels/live-freshness";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { LatLng } from "@/core/geo/types";
import { formatKg, formatQty } from "@/features/catalog/labels";
import { formatDayTime, formatWindow } from "@/features/charity-allocations/present";
import type { CharityAllocation } from "@/features/charity-allocations/queries";
import { cn } from "@/lib/utils";

import { createSelfPickup } from "../actions";
import { checkPlan, MAX_PICKUP_STOPS } from "../plan";
import type { PlannerStoreSite } from "../queries";
import { VolunteerPlanner, type VolunteerOption } from "./volunteer-planner";

type PickupPlannerProps = {
  siteId: string;
  siteName: string;
  allocations: CharityAllocation[];
  serverNow: number;
  headingLevel?: 2 | 3;
  /** Toạ độ công khai của các cửa hàng (xem trước tuyến cho chế độ tình nguyện viên). */
  stores?: PlannerStoreSite[];
  /** Toạ độ điểm nhận (chính xác — điểm của chính tổ chức). */
  dropoff?: LatLng | null;
  volunteers?: VolunteerOption[];
};

type Mode = "self" | "volunteer";

/**
 * Chọn các phân bổ đã xác nhận của một điểm nhận để lên chuyến: "Tự đến lấy" (US-CHA-20 AC1) hoặc "Tình
 * nguyện viên" (US-CHA-16/17: 1 người ⇒ thứ tự tối ưu, 2 người ⇒ chia tuyến). Mặc định chọn hết; tối đa 5
 * cửa hàng mỗi chuyến (kiểm trước ở client, DB kiểm lại).
 */
export function PickupPlanner({
  siteId,
  siteName,
  allocations,
  serverNow,
  headingLevel = 2,
  stores = [],
  dropoff = null,
  volunteers = [],
}: PickupPlannerProps) {
  const router = useRouter();
  const id = useId();
  const [mode, setMode] = useState<Mode>("self");
  const [selected, setSelected] = useState<Set<string>>(() => new Set(allocations.map((a) => a.id)));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const opRef = useRef<{ key: string; id: string } | null>(null);
  const now = new Date(serverNow);
  const Heading = headingLevel === 2 ? "h2" : "h3";

  const chosen = useMemo(() => allocations.filter((a) => selected.has(a.id)), [allocations, selected]);
  const check = checkPlan(
    chosen.map((a) => ({ id: a.id, storeSiteId: a.storeSiteId, charitySiteId: a.charitySiteId })),
    // 2 tình nguyện viên chia tuyến: tối đa 5 cửa hàng mỗi người (planner kiểm từng tuyến)
    mode === "volunteer" ? MAX_PICKUP_STOPS * 2 : MAX_PICKUP_STOPS,
  );
  const totalKg = chosen.reduce((s, a) => s + a.qtyHeld * a.unitWeightKg, 0);

  function toggle(allocationId: string, on: boolean) {
    setError(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(allocationId);
      else next.delete(allocationId);
      return next;
    });
  }

  function submit() {
    if (!check.ok) return;
    const ids = chosen.map((a) => a.id).sort();
    const key = ids.join(",");
    if (!opRef.current || opRef.current.key !== key) opRef.current = { key, id: crypto.randomUUID() };
    setError(null);
    startTransition(async () => {
      const res = await createSelfPickup({ siteId, allocationIds: ids, clientOpId: opRef.current!.id });
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      toast.success(`Đã tạo chuyến tự đến lấy ${check.stores} điểm dừng. Mở mã bàn giao khi tới cửa hàng.`);
      router.push(`/charity/pickups/${res.data.pickupId}`);
    });
  }

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-4 rounded-lg border bg-surface p-4 shadow-1"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Heading id={`${id}-title`} className="flex items-center gap-2 text-lg font-semibold">
          <Home aria-hidden className="size-5 text-role-accent" />
          Giao về {siteName}
        </Heading>
        <p className="text-sm text-ink-muted tabular-nums">
          Đã chọn {chosen.length}/{allocations.length} lô · {check.stores} cửa hàng · ≈ {formatKg(totalKg)}
        </p>
      </div>

      <RadioGroup
        value={mode}
        onValueChange={(v) => {
          setError(null);
          setMode(v as Mode);
        }}
        aria-label={`Cách lấy hàng cho điểm ${siteName}`}
        className="grid gap-2 sm:grid-cols-2"
      >
        {(
          [
            {
              value: "self",
              icon: Footprints,
              label: "Tự đến lấy",
              hint: "Nhân viên tổ chức đi lấy, hiện mã bàn giao tại cửa hàng.",
            },
            {
              value: "volunteer",
              icon: Bike,
              label: "Tình nguyện viên",
              hint: "Giao cho 1 hoặc 2 tình nguyện viên, FoodSave chia tuyến.",
            },
          ] as const
        ).map((o) => (
          <div
            key={o.value}
            onClick={() => {
              setError(null);
              setMode(o.value);
            }}
            className={cn(
              "flex min-h-11 cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors duration-100",
              mode === o.value ? "border-primary bg-primary-soft" : "bg-surface hover:bg-bg",
            )}
          >
            <RadioGroupItem
              id={`${id}-mode-${o.value}`}
              value={o.value}
              className="mt-0.5"
              aria-describedby={`${id}-mode-${o.value}-hint`}
            />
            <span className="flex flex-col gap-0.5">
              <label
                htmlFor={`${id}-mode-${o.value}`}
                className="flex cursor-pointer items-center gap-1.5 font-medium text-ink"
              >
                <o.icon aria-hidden className="size-4" />
                {o.label}
              </label>
              <span id={`${id}-mode-${o.value}-hint`} className="text-sm text-ink-muted">
                {o.hint}
              </span>
            </span>
          </div>
        ))}
      </RadioGroup>

      <fieldset>
        <legend className="sr-only">Chọn lô cho chuyến giao về {siteName}</legend>
        <ul className="flex flex-col divide-y rounded-md border">
          {allocations.map((a) => {
            const window =
              a.pickupStart && a.pickupEnd
                ? { start: new Date(a.pickupStart), end: new Date(a.pickupEnd) }
                : null;
            const cid = `${id}-${a.id}`;
            return (
              <li key={a.id} className="flex items-start gap-3 p-3">
                <Checkbox
                  id={cid}
                  checked={selected.has(a.id)}
                  onCheckedChange={(v) => toggle(a.id, v === true)}
                  className="mt-1 size-5"
                  aria-describedby={`${cid}-meta`}
                />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <label htmlFor={cid} className="cursor-pointer font-medium text-ink">
                    {a.offerTitle}{" "}
                    <span className="font-normal text-ink-muted tabular-nums">
                      · {formatQty(a.qtyHeld, a.unit)}
                      {a.unit !== "kg" ? ` (≈ ${formatKg(a.qtyHeld * a.unitWeightKg)})` : ""}
                    </span>
                  </label>
                  <p
                    id={`${cid}-meta`}
                    className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-ink-muted tabular-nums"
                  >
                    <span className="inline-flex items-center gap-1">
                      <Store aria-hidden className="size-4" />
                      {a.storeName}
                    </span>
                    <span className="inline-flex items-start gap-1">
                      <Clock3 aria-hidden className="mt-0.5 size-4 shrink-0" />
                      <span>Lấy {formatWindow(window, now)}</span>
                    </span>
                    {a.effectiveDeadline ? (
                      <span>
                        Hạn {formatDayTime(a.effectiveDeadline, now)} (
                        <Countdown deadline={a.effectiveDeadline} serverNow={serverNow} />)
                      </span>
                    ) : null}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </fieldset>

      {!check.ok && check.reason === "too_many_stops" ? (
        <p className="flex items-start gap-1.5 text-sm text-warning">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {mode === "volunteer"
            ? `Hai tình nguyện viên lấy tối đa ${MAX_PICKUP_STOPS * 2} cửa hàng (đang chọn ${check.stores}). Bỏ bớt lô.`
            : `Một chuyến đi tối đa ${MAX_PICKUP_STOPS} cửa hàng (đang chọn ${check.stores}). Bỏ bớt rồi tạo thêm chuyến thứ hai.`}
        </p>
      ) : null}

      {mode === "self" ? (
        <>
          {error ? (
            <p
              role="alert"
              className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger"
            >
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-prose text-sm text-ink-subtle">
              FoodSave sắp điểm dừng theo hạn hiệu lực sớm nhất trước, điểm cuối là {siteName}. Hàng được ghi
              nhận đã giao ngay khi cửa hàng xác nhận bàn giao.
            </p>
            <Button
              type="button"
              onClick={submit}
              disabled={!check.ok || pending}
              aria-busy={pending || undefined}
            >
              {pending ? <Loader2 aria-hidden className="animate-spin" /> : <Route aria-hidden />}
              Tạo chuyến tự đến lấy
            </Button>
          </div>
        </>
      ) : (
        <VolunteerPlanner
          siteId={siteId}
          siteName={siteName}
          chosen={chosen}
          stores={stores}
          dropoff={dropoff}
          volunteers={volunteers}
          serverNow={serverNow}
          blocked={!check.ok}
        />
      )}
    </section>
  );
}
