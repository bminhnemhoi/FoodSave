"use client";

import {
  Bike,
  CircleAlert,
  Clock3,
  Home,
  Info,
  Loader2,
  MapPin,
  Sparkles,
  UserPlus,
  Users,
  Weight,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { LatLng } from "@/core/geo/types";
import { formatKg } from "@/features/catalog/labels";
import { formatClock, formatMinutes } from "@/features/charity-allocations/present";
import type { CharityAllocation } from "@/features/charity-allocations/queries";
import { vehicleLabel, volunteerName } from "@/features/volunteers/present";
import type { VolunteerRow } from "@/features/volunteers/queries";
import { formatDistance } from "@/lib/format";
import { cn } from "@/lib/utils";

import { assignVolunteerTrips } from "../dispatch-actions";
import type { PlannerStoreSite } from "../queries";
import {
  firstStoreLocation,
  planVolunteerTrips,
  rankVolunteers,
  type PlanFailure,
  type PlannedTrip,
} from "../volunteer-plan";
import type { RouteTone, TripMapStop } from "./trip-map";
import { TripMapLazy } from "./trip-map-lazy";

export type VolunteerOption = Pick<
  VolunteerRow,
  | "userId"
  | "name"
  | "phoneMasked"
  | "vehicle"
  | "capacityKg"
  | "base"
  | "areaLabel"
  | "openTrips"
  | "pausedAt"
>;

type VolunteerPlannerProps = {
  siteId: string;
  siteName: string;
  chosen: CharityAllocation[];
  stores: PlannerStoreSite[];
  dropoff: LatLng | null;
  volunteers: VolunteerOption[];
  serverNow: number;
  /** Lỗi chọn lô (khác điểm nhận…) — chặn giao chuyến. */
  blocked: boolean;
};

const FAILURE_TEXT: Record<PlanFailure, string> = {
  no_allocations: "Chọn ít nhất một lô để lên chuyến.",
  no_volunteer: "Chọn 1 hoặc 2 tình nguyện viên.",
  too_many_volunteers: "Mỗi lần chỉ chia tối đa cho 2 tình nguyện viên.",
  split_needs_two_stores:
    "Các lô đang chọn chỉ ở 1 cửa hàng nên không chia được cho 2 người. Bỏ chọn bớt một tình nguyện viên.",
  missing_location:
    "Có cửa hàng ẩn vị trí nên FoodSave không chia tuyến tự động được. Hãy giao cho 1 tình nguyện viên.",
  too_many_stops: "Một chuyến đi tối đa 5 cửa hàng. Hãy bỏ bớt lô hoặc chia cho 2 tình nguyện viên.",
};

const TONE_SWATCH: Record<RouteTone, string> = {
  0: "rounded-full border-info",
  1: "rounded-md border-chart-e",
};

/**
 * Giao chuyến cho tình nguyện viên (PRD US-CHA-16, US-CHA-17; ROADMAP P3-09): gợi ý người phù hợp (gần cửa
 * hàng đầu tiên, đủ sức chở, đang rảnh), chọn 1 hoặc 2 người; 2 người ⇒ FoodSave chia tuyến
 * (`splitBetweenTwo`) và vẽ hai tuyến khác màu trên bản đồ kèm tổng km, thời gian, kg từng người.
 */
export function VolunteerPlanner({
  siteId,
  siteName,
  chosen,
  stores,
  dropoff,
  volunteers,
  serverNow,
  blocked,
}: VolunteerPlannerProps) {
  const id = useId();
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const opRef = useRef<{ key: string; ids: string[] } | null>(null);

  const planAllocations = useMemo(
    () =>
      chosen.map((a) => ({
        id: a.id,
        storeSiteId: a.storeSiteId,
        kg: a.qtyHeld * a.unitWeightKg,
        pickupStart: a.pickupStart,
        effectiveDeadline: a.effectiveDeadline,
      })),
    [chosen],
  );
  const planStores = useMemo(
    () =>
      stores.map((s) => ({
        siteId: s.siteId,
        name: s.name,
        location: s.location,
        approximate: s.approximate,
      })),
    [stores],
  );
  const totalKg = planAllocations.reduce((s, a) => s + a.kg, 0);

  const ranked = useMemo(
    () =>
      rankVolunteers(
        volunteers.map((v) => ({
          ...v,
          name: volunteerName(v),
          capacityKg: v.capacityKg ?? 20,
          paused: v.pausedAt !== null,
        })),
        firstStoreLocation({ stores: planStores, allocations: planAllocations }),
        totalKg,
      ),
    [volunteers, planStores, planAllocations, totalKg],
  );
  const result = useMemo(() => {
    const byId = new Map(ranked.map((v) => [v.userId, v]));
    const picked = selected.map((uid) => byId.get(uid)).filter((v): v is (typeof ranked)[number] => !!v);
    if (picked.length === 0 || !dropoff) return null;
    return planVolunteerTrips({
      dropoff: { siteId, location: dropoff },
      stores: planStores,
      allocations: planAllocations,
      volunteers: picked.map((v) => ({
        userId: v.userId,
        name: v.name,
        base: v.base,
        capacityKg: v.capacityKg,
      })),
      departAt: serverNow,
    });
  }, [selected, ranked, dropoff, siteId, planStores, planAllocations, serverNow]);

  function toggle(userId: string, on: boolean) {
    setError(null);
    setSelected((prev) =>
      on ? (prev.includes(userId) ? prev : [...prev, userId].slice(0, 2)) : prev.filter((x) => x !== userId),
    );
  }

  const plan = result?.ok ? result.plan : null;
  const canSubmit = !!plan && !blocked && !pending;

  function submit() {
    if (!plan) return;
    const groups = plan.trips.map((t) => ({
      assigneeUserId: t.volunteer.userId,
      allocationIds: t.allocationIds,
    }));
    const key = JSON.stringify(groups);
    if (!opRef.current || opRef.current.key !== key)
      opRef.current = { key, ids: groups.map(() => crypto.randomUUID()) };
    const ids = opRef.current.ids;
    setError(null);
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof assignVolunteerTrips>>;
      try {
        res = await assignVolunteerTrips({
          siteId,
          trips: groups.map((g, i) => ({ ...g, clientOpId: ids[i]! })),
        });
      } catch {
        setError("Không có kết nối mạng. Lựa chọn của bạn vẫn còn — hãy thử lại khi có mạng.");
        return;
      }
      if (!res.ok) {
        setError(res.error.message);
        router.refresh();
        return;
      }
      const names = plan.trips.map((t) => t.volunteer.name);
      toast.success(
        names.length === 2
          ? `Đã giao 2 chuyến cho ${names[0]} và ${names[1]}. Tình nguyện viên sẽ nhận thông báo.`
          : `Đã giao chuyến cho ${names[0]}. Tình nguyện viên sẽ nhận thông báo.`,
      );
      if (res.data.pickupIds.length === 1) router.push(`/charity/pickups/${res.data.pickupIds[0]}`);
      else {
        setSelected([]);
        router.refresh();
      }
    });
  }

  if (volunteers.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed bg-bg p-4">
        <p className="flex items-start gap-2 text-sm text-ink">
          <Users aria-hidden className="mt-0.5 size-4 shrink-0 text-role-accent" />
          Tổ chức chưa có tình nguyện viên nào. Mời tình nguyện viên qua email — họ nhận chuyến ngay trên điện
          thoại.
        </p>
        <Button asChild variant="outline" className="min-h-11">
          <Link href="/charity/volunteers">
            <UserPlus aria-hidden />
            Mời tình nguyện viên
          </Link>
        </Button>
      </div>
    );
  }

  const mapStops: TripMapStop[] = plan
    ? [
        ...plan.trips.flatMap((t, ti) =>
          t.stops
            .filter((s) => s.location)
            .map((s) => ({
              id: `${ti}:${s.siteId}`,
              seq: s.seq,
              kind: "pickup" as const,
              done: false,
              skipped: false,
              location: s.location!,
              approximate: s.approximate,
              tone: ti as RouteTone,
              ariaLabel: `Tuyến ${ti + 1}, điểm ${s.seq}: ${s.name}${s.approximate ? ", vị trí gần đúng" : ""}`,
            })),
        ),
        ...(dropoff
          ? [
              {
                id: "dropoff",
                seq: 0,
                kind: "dropoff" as const,
                done: false,
                skipped: false,
                location: dropoff,
                approximate: false,
                ariaLabel: `Điểm giao về: ${siteName}`,
              },
            ]
          : []),
      ]
    : [];

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-base font-semibold">Chọn tình nguyện viên (tối đa 2)</legend>
        <p id={`${id}-vol-hint`} className="text-sm text-ink-muted">
          Gợi ý theo thứ tự: đủ sức chở ≈ {formatKg(totalKg)}, đang rảnh, ở gần cửa hàng cần lấy trước. Chọn 2
          người để FoodSave chia tuyến.
        </p>
        <ul className="grid gap-2 lg:grid-cols-2">
          {ranked.map((v) => {
            const cid = `${id}-v-${v.userId}`;
            const order = selected.indexOf(v.userId);
            const checked = order !== -1;
            const disabled = v.paused || (!checked && selected.length >= 2);
            return (
              <li
                key={v.userId}
                className={cn(
                  "flex items-start gap-3 rounded-md border bg-surface p-3",
                  checked && "border-info bg-info-soft/40",
                  v.paused && "bg-bg-sunken",
                )}
              >
                <Checkbox
                  id={cid}
                  checked={checked}
                  disabled={disabled}
                  onCheckedChange={(on) => toggle(v.userId, on === true)}
                  className="mt-0.5 size-5"
                  aria-describedby={`${cid}-meta`}
                />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <label
                    htmlFor={cid}
                    className="flex cursor-pointer flex-wrap items-center gap-2 font-medium text-ink"
                  >
                    {v.name}
                    {checked ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-ink-muted">
                        <span
                          aria-hidden
                          className={cn("block size-3 border-2", TONE_SWATCH[order as RouteTone])}
                        />
                        Tuyến {order + 1}
                      </span>
                    ) : null}
                    {v.suggested ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-info/30 bg-info-soft px-2 py-0.5 text-xs font-medium text-info">
                        <Sparkles aria-hidden className="size-3.5" />
                        Gợi ý
                      </span>
                    ) : null}
                  </label>
                  <p
                    id={`${cid}-meta`}
                    className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-ink-muted tabular-nums"
                  >
                    <span className="inline-flex items-center gap-1">
                      <Bike aria-hidden className="size-4" />
                      {vehicleLabel(volunteers.find((x) => x.userId === v.userId)?.vehicle ?? null)}
                    </span>
                    <span className={cn("inline-flex items-center gap-1", !v.fitsLoad && "text-warning")}>
                      <Weight aria-hidden className="size-4" />
                      Chở {formatKg(v.capacityKg)}
                      {!v.fitsLoad ? " — ít hơn tổng hàng" : ""}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MapPin aria-hidden className="size-4" />
                      {v.distanceKm !== null
                        ? `cách cửa hàng đầu ≈ ${String(v.distanceKm).replace(".", ",")} km`
                        : (volunteers.find((x) => x.userId === v.userId)?.areaLabel ?? "chưa khai khu vực")}
                    </span>
                    {v.paused ? <span className="text-warning">Đang tạm ngưng</span> : null}
                    {!v.paused && v.busy ? <span>Đang có {v.openTrips} chuyến</span> : null}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </fieldset>

      {!dropoff ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-danger">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          Không đọc được vị trí của {siteName}. Hãy tải lại trang.
        </p>
      ) : result && !result.ok ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-ink"
        >
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
          {FAILURE_TEXT[result.reason]}
        </p>
      ) : null}

      {plan ? (
        <section aria-labelledby={`${id}-preview`} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h4 id={`${id}-preview`} className="text-base font-semibold">
              {plan.trips.length === 2 ? "Phương án chia 2 tuyến" : "Tuyến đề xuất"}
            </h4>
            {plan.makespanS !== null && plan.distanceM !== null ? (
              <p className="text-sm text-ink-muted tabular-nums" aria-live="polite">
                Tổng ≈ {formatDistance(plan.distanceM)} · xong sau khoảng {formatMinutes(plan.makespanS / 60)}
                {plan.trips.length === 2 ? " (tuyến dài hơn)" : ""}
              </p>
            ) : null}
          </div>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <ol className="flex flex-col gap-3">
              {plan.trips.map((t, i) => (
                <li key={t.volunteer.userId}>
                  <TripPreview trip={t} index={i as RouteTone} siteName={siteName} />
                </li>
              ))}
            </ol>
            <div className="h-[30rem] lg:h-auto lg:min-h-96">
              <TripMapLazy
                key={plan.trips
                  .map((t) => `${t.volunteer.userId}:${t.stops.map((s) => s.siteId).join(",")}`)
                  .join("|")}
                stops={mapStops}
                routes={plan.trips
                  .map((t, i) =>
                    t.line
                      ? {
                          id: `plan-${i}`,
                          line: { type: "LineString" as const, coordinates: t.line },
                          estimated: true,
                          tone: i as RouteTone,
                          label: `Tuyến ${i + 1} · ${t.volunteer.name} (ước tính)`,
                        }
                      : null,
                  )
                  .filter((r): r is NonNullable<typeof r> => r !== null)}
                activeStopId={null}
                onSelectStop={() => {}}
                ariaLabel={`Bản đồ phương án: ${plan.trips.length} tuyến ước tính. Danh sách bên cạnh có cùng thông tin.`}
              />
            </div>
          </div>
          <p className="flex items-start gap-2 text-sm text-ink-subtle">
            <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
            {plan.method === "deadline"
              ? "Có cửa hàng ẩn vị trí: FoodSave sắp theo hạn hiệu lực sớm nhất và chưa ước tính được giờ tới."
              : "Tuyến và giờ tới là ước tính (đường chim bay × 1,4, xe máy 18 km/h, 10 phút mỗi điểm). Khi bạn giao chuyến, FoodSave lấy tuyến xe máy thật nếu mọi cửa hàng công khai vị trí."}
          </p>
        </section>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          aria-busy={pending || undefined}
          className="h-auto min-h-11 w-full py-2 whitespace-normal sm:w-auto"
        >
          {pending ? <Loader2 aria-hidden className="animate-spin" /> : <Bike aria-hidden />}
          {plan?.trips.length === 2
            ? `Giao 2 chuyến cho ${plan.trips[0]!.volunteer.name} và ${plan.trips[1]!.volunteer.name}`
            : plan
              ? `Giao chuyến cho ${plan.trips[0]!.volunteer.name}`
              : "Giao chuyến cho tình nguyện viên"}
        </Button>
      </div>
    </div>
  );
}

function TripPreview({ trip, index, siteName }: { trip: PlannedTrip; index: RouteTone; siteName: string }) {
  const headingId = useId();
  return (
    <article aria-labelledby={headingId} className="flex flex-col gap-2 rounded-lg border bg-surface p-3">
      <h5 id={headingId} className="flex flex-wrap items-center gap-2 font-semibold text-ink">
        <span aria-hidden className={cn("block size-3.5 border-[3px]", TONE_SWATCH[index])} />
        Tuyến {index + 1} · {trip.volunteer.name}
      </h5>
      <p className="text-sm text-ink-muted tabular-nums">
        {trip.stops.length} điểm lấy · ≈ {formatKg(trip.kg)} / sức chở {formatKg(trip.volunteer.capacityKg)}
        {trip.distanceM !== null && trip.durationS !== null
          ? ` · ≈ ${formatDistance(trip.distanceM)} · khoảng ${formatMinutes((trip.elapsedS ?? trip.durationS) / 60)}`
          : ""}
      </p>
      {trip.overCapacity ? (
        <p className="flex items-start gap-1.5 text-sm text-warning">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          Vượt sức chở của {trip.volunteer.name}. Hãy chọn thêm người thứ hai để chia tuyến, hoặc bỏ bớt lô.
        </p>
      ) : null}
      <ol className="flex flex-col gap-1 text-sm">
        {trip.stops.map((s) => (
          <li key={s.siteId} className="flex items-start gap-2">
            <span
              aria-hidden
              className={cn(
                "grid size-6 shrink-0 place-items-center border-2 text-xs font-bold tabular-nums",
                TONE_SWATCH[index],
              )}
            >
              {s.seq}
            </span>
            <span className="min-w-0">
              <span className="sr-only">Điểm {s.seq}: </span>
              <span className="text-ink">{s.name}</span>
              {s.arriveAt ? (
                <span className="text-ink-muted tabular-nums">
                  {" "}
                  · tới khoảng {formatClock(s.arriveAt)}
                  {s.deadline ? ` (hạn ${formatClock(s.deadline)})` : ""}
                </span>
              ) : null}
              {s.lateMin > 0 ? (
                <span className="block text-warning">Có thể trễ hạn khoảng {Math.ceil(s.lateMin)} phút.</span>
              ) : null}
            </span>
          </li>
        ))}
        <li className="flex items-start gap-2">
          <span
            aria-hidden
            className="grid size-6 shrink-0 place-items-center rounded-full bg-ink text-white"
          >
            <Home className="size-3.5" />
          </span>
          <span className="text-ink">
            Giao về {siteName}
            {trip.dropoffEta ? (
              <span className="text-ink-muted tabular-nums"> · khoảng {formatClock(trip.dropoffEta)}</span>
            ) : null}
          </span>
        </li>
      </ol>
      {trip.stops.some((s) => s.arriveAt === null) ? (
        <p className="flex items-center gap-1.5 text-xs text-ink-subtle">
          <Clock3 aria-hidden className="size-3.5" />
          Chưa ước tính được giờ tới vì có cửa hàng ẩn vị trí.
        </p>
      ) : null}
    </article>
  );
}
