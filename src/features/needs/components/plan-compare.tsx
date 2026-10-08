"use client";

import {
  AlarmClock,
  Check,
  CircleAlert,
  Clock3,
  EyeOff,
  Leaf,
  Loader2,
  LocateOff,
  Navigation,
  PackageSearch,
  RefreshCw,
  Route,
  Store,
  ThumbsUp,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/layout/empty-state";
import { LiveFreshness } from "@/components/labels/live-freshness";
import { Button } from "@/components/ui/button";
import type { LatLng } from "@/core/geo/types";
import { formatQty, UNIT_LABEL } from "@/features/catalog/labels";
import { formatClock, formatDayTime, formatMinutes } from "@/features/charity-allocations/present";
import { NETWORK_ERROR } from "@/features/offers/use-op-id";
import { formatDistance, formatKm } from "@/lib/format";
import { newUuid } from "@/lib/hash";
import { cn } from "@/lib/utils";

import { choosePlan, findPlans } from "../actions";
import { formatAmount, type PlanStopView, type PlanView } from "../present";
import type { PlansData } from "../queries";
import type { MapPlan } from "./plan-map";
import { PlanMapLazy } from "./plan-map-lazy";

type PlanCompareProps = {
  needId: string;
  data: PlansData;
  home: LatLng;
  homeName: string;
  neededBy: string;
  serverNow: number;
  canChoose: boolean;
  disabledReason: string | null;
  heading: string;
  /** Mô tả ngắn dưới tiêu đề (ghép lại phần thiếu…). */
  lead?: React.ReactNode;
};

type Notice = { tone: "danger" | "warning"; text: string };

function stopDistance(s: PlanStopView): string {
  return s.visibility === "public" ? formatDistance(s.distanceKm * 1000) : `~${formatKm(s.distanceKm)}`;
}

function stopAria(s: PlanStopView): string {
  const where =
    s.visibility === "approximate" ? "vị trí gần đúng" : s.visibility === "hidden" ? "vị trí ẩn" : null;
  const what = s.lines.map((l) => `${formatQty(l.qty, l.unit)} ${l.title}`).join(", ");
  return [`Điểm dừng ${s.seq}: ${s.storeName}`, what, `cách ${stopDistance(s)}`, where]
    .filter(Boolean)
    .join(", ");
}

/**
 * So sánh tối đa 3 phương án ghép (BundleCompare, DESIGN-SYSTEM §11.2; US-CHA-10, US-CHA-11): desktop = bản đồ
 * chung + 3 cột; mobile = chọn phương án + bản đồ + thẻ. Rê/focus một thẻ ⇒ bản đồ làm nổi tuyến đó.
 * "Chọn phương án này" ⇒ server tính lại, lấy tuyến xe máy thật (nếu mọi điểm công khai) rồi `reserve_bundle`.
 */
export function PlanCompare({
  needId,
  data: initial,
  home,
  homeName,
  neededBy,
  serverNow,
  canChoose,
  disabledReason,
  heading,
  lead,
}: PlanCompareProps) {
  const [data, setData] = useState(initial);
  const [activeKey, setActiveKey] = useState<string | null>(initial.plans[0]?.key ?? null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [choosing, setChoosing] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pending, startTransition] = useTransition();
  // Một client_op_id cho mỗi ý định "chọn phương án X"; giữ khi lỗi mạng, bỏ khi server đã trả lời
  const ops = useRef(new Map<string, string>());

  const plans = data.plans;
  const unitLabel = UNIT_LABEL[data.unit];
  const active = plans.find((p) => p.key === activeKey) ?? plans[0] ?? null;
  const shownKey = hoverKey && plans.some((p) => p.key === hoverKey) ? hoverKey : (active?.key ?? null);

  const mapPlans = useMemo<MapPlan[]>(
    () =>
      plans.map((p) => ({
        key: p.key,
        rank: p.rank,
        path: p.path,
        stops: p.stops.map((s) => ({
          siteId: s.siteId,
          seq: s.seq,
          location: s.location,
          approximate: s.visibility === "approximate",
          ariaLabel: `Phương án ${p.rank}, ${stopAria(s)}`,
        })),
      })),
    [plans],
  );

  function adopt(next: PlansData) {
    setData(next);
    setActiveKey(next.plans[0]?.key ?? null);
    setHoverKey(null);
  }

  function choose(plan: PlanView) {
    let op = ops.current.get(plan.key);
    if (!op) {
      op = newUuid();
      ops.current.set(plan.key, op);
    }
    const clientOpId = op;
    setNotice(null);
    setChoosing(plan.key);
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof choosePlan>>;
      try {
        res = await choosePlan({ needId, planKey: plan.key, clientOpId });
      } catch {
        setChoosing(null);
        setNotice({ tone: "danger", text: NETWORK_ERROR });
        return;
      }
      ops.current.delete(plan.key);
      setChoosing(null);
      if (!res.ok) {
        setNotice({ tone: res.error.replan ? "warning" : "danger", text: res.error.message });
        if (res.plans) adopt(res.plans);
        return;
      }
      const { requested, confirmed, stores } = res.data;
      toast.success(
        confirmed > 0 && requested === 0
          ? `Đã giữ ${formatAmount(plan.coveredQty)} ${unitLabel} ở ${stores} cửa hàng — tất cả đã tự động xác nhận.`
          : `Đã gửi yêu cầu giữ ${formatAmount(plan.coveredQty)} ${unitLabel} tới ${stores} cửa hàng${confirmed > 0 ? ` (${confirmed} cửa hàng tự động xác nhận)` : ""}. FoodSave sẽ báo bạn khi cửa hàng trả lời.`,
        { duration: 6000 },
      );
      // Trang vừa render lại với "Phương án đã chọn" ⇒ đưa người dùng tới đó (trạng thái từng cửa hàng)
      setTimeout(() => {
        const target = document.getElementById("bundles-heading");
        target?.scrollIntoView({
          block: "start",
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        });
        target?.focus({ preventScroll: true });
      }, 120);
    });
  }

  function refind() {
    setNotice(null);
    startTransition(async () => {
      try {
        const res = await findPlans({ needId });
        if (res.ok) adopt(res.data);
        else setNotice({ tone: "danger", text: res.error.message });
      } catch {
        setNotice({ tone: "danger", text: NETWORK_ERROR });
      }
    });
  }

  function focusStop(siteId: string) {
    const el = document.getElementById(`plan-${active?.rank}-stop-${siteId}`);
    el?.scrollIntoView({
      block: "nearest",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
    el?.focus();
  }

  const noticeBox = notice ? (
    <p
      role="alert"
      className={cn(
        "flex items-start gap-2 rounded-lg border px-4 py-3 text-sm text-ink",
        notice.tone === "danger" ? "border-danger/30 bg-danger-soft" : "border-warning/30 bg-warning-soft",
      )}
    >
      <CircleAlert
        aria-hidden
        className={cn("mt-0.5 size-4 shrink-0", notice.tone === "danger" ? "text-danger" : "text-warning")}
      />
      {notice.text}
    </p>
  ) : null;

  return (
    <section aria-labelledby="plans-heading" aria-busy={pending || undefined} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="plans-heading" className="flex items-center gap-2 text-xl font-semibold">
            <Route aria-hidden className="size-5 text-role-accent" />
            {heading}
          </h2>
          <p className="mt-1 max-w-prose text-sm text-ink-muted">
            {lead ??
              (plans.length > 0
                ? `Từ ${data.candidateLots} lô của ${data.candidateStores} cửa hàng còn đến kịp trong bán kính ${formatKm(data.radiusKm)}. Xếp theo: đáp ứng đủ → ít điểm dừng → tuyến ngắn.`
                : null)}
          </p>
        </div>
        {plans.length > 0 ? (
          <Button type="button" variant="ghost" size="sm" onClick={refind} disabled={pending}>
            <RefreshCw aria-hidden className={cn(pending && !choosing && "animate-spin")} />
            Tính lại
          </Button>
        ) : null}
      </div>

      {noticeBox}

      {plans.length === 0 ? (
        <EmptyState
          variant="section"
          icon={PackageSearch}
          title={data.rematch ? "Chưa có lô cho phần còn thiếu" : "Chưa có lô phù hợp quanh điểm nhận"}
          description={
            <p>
              FoodSave chỉ ghép lô còn đến kịp trước hạn hiệu lực, trong bán kính {formatKm(data.radiusKm)}{" "}
              của điểm nhận. Nhu cầu vẫn mở — bạn sẽ được báo ngay khi có lô mới phù hợp
              {data.rematch ? ` cho ${formatAmount(data.remaining)} ${unitLabel} còn thiếu` : ""}.
            </p>
          }
          action={
            <>
              <Button type="button" variant="outline" onClick={refind} disabled={pending}>
                <RefreshCw aria-hidden className={cn(pending && "animate-spin")} />
                Tìm lại
              </Button>
              <Button asChild variant="ghost">
                <Link href="/charity/donations">Xem kho tặng</Link>
              </Button>
            </>
          }
        />
      ) : (
        <>
          <div
            role="group"
            aria-label="Chọn phương án để xem"
            className="grid grid-cols-3 gap-1 rounded-lg border bg-surface p-1 lg:hidden"
          >
            {plans.map((p) => (
              <button
                key={p.key}
                type="button"
                aria-pressed={p.key === active?.key}
                onClick={() => setActiveKey(p.key)}
                className={cn(
                  "flex min-h-11 flex-col items-center justify-center rounded-md px-1 py-1 text-xs font-medium transition-colors",
                  p.key === active?.key
                    ? "bg-primary text-primary-foreground"
                    : "text-ink-muted hover:text-ink",
                )}
              >
                <span>Phương án {p.rank}</span>
                <span className="tabular-nums opacity-90">
                  {formatAmount(p.coveredQty)}/{formatAmount(p.requestedQty)} · {p.stopCount} điểm
                </span>
              </button>
            ))}
          </div>

          <div className="h-80 sm:h-96 lg:h-[26rem]">
            <PlanMapLazy
              key={plans.map((p) => p.key).join("|")}
              home={home}
              homeName={homeName}
              radiusKm={data.radiusKm}
              plans={mapPlans}
              activeKey={shownKey}
              onSelectStop={focusStop}
              ariaLabel={`Bản đồ phương án ${plans.find((p) => p.key === shownKey)?.rank ?? 1}: điểm nhận ${homeName} và các điểm dừng đánh số theo thứ tự đi. Danh sách điểm dừng trong thẻ phương án có cùng thông tin.`}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {plans.map((p) => (
              <PlanCard
                key={p.key}
                plan={p}
                unitLabel={unitLabel}
                neededBy={neededBy}
                serverNow={serverNow}
                active={p.key === active?.key}
                highlighted={p.key === shownKey}
                choosing={choosing === p.key}
                busy={pending}
                canChoose={canChoose}
                disabledReason={disabledReason}
                onHover={(h) => setHoverKey(h ? p.key : null)}
                onChoose={() => choose(p)}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function PlanCard({
  plan: p,
  unitLabel,
  neededBy,
  serverNow,
  active,
  highlighted,
  choosing,
  busy,
  canChoose,
  disabledReason,
  onHover,
  onChoose,
}: {
  plan: PlanView;
  unitLabel: string;
  neededBy: string;
  serverNow: number;
  active: boolean;
  highlighted: boolean;
  choosing: boolean;
  busy: boolean;
  canChoose: boolean;
  disabledReason: string | null;
  onHover: (h: boolean) => void;
  onChoose: () => void;
}) {
  const titleId = `plan-title-${p.rank}`;
  const noteId = `plan-note-${p.rank}`;
  const now = new Date(serverNow);
  const pct = p.requestedQty > 0 ? Math.min(100, (p.coveredQty / p.requestedQty) * 100) : 0;

  return (
    <article
      id={`plan-card-${p.rank}`}
      aria-labelledby={titleId}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onFocusCapture={() => onHover(true)}
      onBlurCapture={() => onHover(false)}
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border bg-surface shadow-1 transition-[box-shadow,border-color] duration-150",
        highlighted && "border-info shadow-2 ring-2 ring-info/30",
        !active && "max-lg:hidden",
      )}
    >
      <header className="flex flex-col gap-3 border-b bg-bg/60 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 id={titleId} className="text-base font-semibold">
            Phương án {p.rank}
          </h3>
          {p.rank === 1 ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary-soft px-2.5 py-0.5 text-xs font-semibold text-primary">
              <ThumbsUp aria-hidden className="size-3.5" />
              Đề xuất
            </span>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          <p className="flex flex-wrap items-baseline gap-x-1.5">
            <span className="text-sm text-ink-muted">Đáp ứng</span>{" "}
            <span className="text-3xl leading-none font-bold text-ink tabular-nums">
              {formatAmount(p.coveredQty)}/{formatAmount(p.requestedQty)}
            </span>{" "}
            <span className="text-sm text-ink-muted">{unitLabel}</span>
            {p.shortfall > 0 ? (
              <>
                {" "}
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-warning">
                  <TriangleAlert aria-hidden className="size-4 self-center" />— thiếu{" "}
                  {formatAmount(p.shortfall)} {unitLabel}
                </span>
              </>
            ) : (
              <>
                {" "}
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-success">
                  <Check aria-hidden className="size-4 self-center" />
                  đủ
                </span>
              </>
            )}
          </p>
          <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-bg-sunken">
            <span
              className={cn("block h-full rounded-full", p.shortfall > 0 ? "bg-warning" : "bg-success")}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          <Metric icon={Store} label="Điểm dừng" value={`${p.stopCount} cửa hàng`} />
          <Metric icon={Navigation} label="Quãng đường" value={`~${formatDistance(p.estDistanceM)}`} />
          <Metric icon={Clock3} label="Thời gian (xe máy)" value={`~${formatMinutes(p.estDurationS / 60)}`} />
          {p.redLots > 0 ? (
            <Metric icon={AlarmClock} label="Lô Đỏ" value={`${p.redLots} lô`} tone="red" />
          ) : (
            <Metric icon={Leaf} label="Lô Đỏ" value="Không có" />
          )}
        </dl>
        <p className="text-xs text-ink-subtle tabular-nums">
          Ước tính về tới điểm nhận lúc {formatClock(p.endAt)} · tuyến ước tính, chưa gọi chỉ đường
        </p>
        {p.lateForNeed ? (
          <p className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-ink">
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
            Dự kiến về tới điểm nhận lúc {formatClock(p.endAt)}, sau giờ cần ({formatDayTime(neededBy, now)}).
          </p>
        ) : null}
      </header>

      <ol
        aria-label={`Điểm dừng của phương án ${p.rank}, theo thứ tự đi`}
        className="flex flex-1 flex-col divide-y px-4"
      >
        {p.stops.map((s) => (
          <li
            key={s.siteId}
            id={`plan-${p.rank}-stop-${s.siteId}`}
            tabIndex={-1}
            className="flex gap-3 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span
              aria-hidden
              className={cn(
                "mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border-[3px] bg-surface text-sm font-bold text-ink tabular-nums",
                s.visibility === "approximate" ? "border-dashed border-info" : "border-info",
                s.visibility === "hidden" && "border-ink-subtle",
              )}
            >
              {s.seq}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-ink">
                <span className="sr-only">Điểm dừng {s.seq}: </span>
                {s.storeName}
              </p>
              <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-ink-subtle tabular-nums">
                <span className="truncate">{s.siteName}</span>
                <span aria-hidden>·</span>
                <span>cách {stopDistance(s)}</span>
                {s.visibility === "approximate" ? (
                  <span className="inline-flex items-center gap-1">
                    <span aria-hidden>·</span>
                    <LocateOff aria-hidden className="size-3" />
                    vị trí gần đúng
                  </span>
                ) : s.visibility === "hidden" ? (
                  <span className="inline-flex items-center gap-1">
                    <span aria-hidden>·</span>
                    <EyeOff aria-hidden className="size-3" />
                    vị trí ẩn
                  </span>
                ) : null}
              </p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {s.lines.map((l) => (
                  <li key={l.offerId} className="flex flex-col gap-1">
                    <p className="text-sm">
                      <span className="font-semibold text-ink tabular-nums">{formatQty(l.qty, l.unit)}</span>{" "}
                      <span className="text-ink-muted">{l.title}</span>
                    </p>
                    <LiveFreshness
                      deadline={l.effectiveDeadline}
                      serverNow={serverNow}
                      perishability={l.perishability}
                      size="sm"
                    />
                  </li>
                ))}
              </ul>
            </div>
          </li>
        ))}
      </ol>

      <footer className="flex flex-col gap-2 border-t p-4">
        <Button
          type="button"
          size="lg"
          variant={active ? "default" : "outline"}
          className="w-full"
          onClick={onChoose}
          disabled={!canChoose || busy}
          aria-busy={choosing || undefined}
          aria-describedby={noteId}
        >
          {choosing ? <Loader2 aria-hidden className="animate-spin" /> : <Check aria-hidden />}
          {choosing ? "Đang giữ hàng…" : "Chọn phương án này"}
        </Button>
        <p id={noteId} className="text-xs text-ink-subtle">
          {!canChoose && disabledReason
            ? disabledReason
            : `Giữ hàng ở ${p.stopCount} cửa hàng cùng lúc (hoặc không giữ gì nếu một lô vừa hết). ${
                p.allPublic
                  ? "Tuyến xe máy thật được tính khi bạn chọn."
                  : "Có điểm không công khai vị trí nên giữ tuyến ước tính."
              }`}
        </p>
      </footer>
    </article>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  value: string;
  tone?: "red";
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-xs text-ink-subtle">
        <Icon aria-hidden className={cn("size-3.5 shrink-0", tone === "red" && "text-label-red-fg")} />
        {label}
      </dt>
      <dd className={cn("font-semibold tabular-nums", tone === "red" ? "text-label-red-fg" : "text-ink")}>
        {value}
      </dd>
    </div>
  );
}
