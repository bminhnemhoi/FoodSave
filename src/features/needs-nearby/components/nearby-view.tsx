"use client";

import {
  CalendarClock,
  EyeOff,
  HandHeart,
  Home,
  List,
  LocateOff,
  Map as MapIcon,
  MapPin,
  Navigation,
  PackagePlus,
  Settings,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState, useSyncExternalStore, useTransition } from "react";

import { Countdown } from "@/components/labels/live-freshness";
import { EmptyState } from "@/components/layout/empty-state";
import { ErrorState } from "@/components/layout/error-state";
import { Button } from "@/components/ui/button";
import { UNIT_LABEL } from "@/features/catalog/labels";
import { formatDayTime } from "@/features/charity-allocations/present";
import { categoryIcon } from "@/features/marketplace/components/category-icon";
import { NeedStatusBadge } from "@/features/needs/components/need-badges";
import { NativeSelect } from "@/features/needs/components/native-select";
import { formatAmount } from "@/features/needs/present";
import { orgSubtypeLabel } from "@/features/organizations/labels";
import { cn } from "@/lib/utils";

import { nearbyHref, toggleCategory, type NearbyFilters, type NearbyView as View } from "../filters";
import { areaText, canRespond, distanceText, type NearbyNeed } from "../present";
import type { NeedPoint, StorePin } from "./nearby-map";
import { NearbyMapLazy } from "./nearby-map-lazy";

type Category = { code: string; name: string; icon: string };

type NearbyViewProps = {
  needs: NearbyNeed[];
  loadFailed: boolean;
  filters: NearbyFilters;
  view: View;
  categories: Category[];
  sites: { id: string; name: string }[];
  stores: StorePin[];
  serverNow: number;
};

const DESKTOP_QUERY = "(min-width: 1024px)";

function subscribeDesktop(cb: () => void) {
  const mq = window.matchMedia(DESKTOP_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/** "Nhu cầu gần bạn" (US-STO-20 AC1–AC3): bộ lọc danh mục (URL) + danh sách + bản đồ đồng bộ chọn. */
export function NearbyView({
  needs,
  loadFailed,
  filters,
  view: initialView,
  categories,
  sites,
  stores,
  serverNow,
}: NearbyViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [view, setView] = useState<View>(initialView);
  const isDesktop = useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false,
  );
  const [mapRequested, setMapRequested] = useState(initialView === "map");
  const showMap = isDesktop || mapRequested;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ needId: string; n: number } | null>(null);

  const catName = useMemo(() => new Map(categories.map((c) => [c.code, c])), [categories]);
  const filtered = filters.categories.length > 0 || filters.siteId !== null;

  function navigate(next: NearbyFilters) {
    setSelectedId(null);
    startTransition(() => router.replace(nearbyHref(pathname, next, view), { scroll: false }));
  }

  function switchView(next: View) {
    setView(next);
    if (next === "map") setMapRequested(true);
    window.history.replaceState(null, "", nearbyHref(pathname, filters, next));
  }

  const points = useMemo<NeedPoint[]>(
    () =>
      needs
        .filter((n) => n.location)
        .map((n) => ({
          needId: n.needId,
          location: n.location!,
          approximate: n.visibility !== "public",
          ariaLabel: [
            `${n.charityName}: cần ${formatAmount(n.quantity)} ${UNIT_LABEL[n.unit]}`,
            n.qtyRemaining > 0 ? `còn thiếu ${formatAmount(n.qtyRemaining)}` : "đã có cửa hàng giữ đủ",
            `cần trước ${formatDayTime(n.neededBy, new Date(serverNow))}`,
            distanceText(n),
            n.visibility === "approximate" ? "vị trí gần đúng" : null,
          ]
            .filter(Boolean)
            .join(", "),
        })),
    [needs, serverNow],
  );
  const hiddenCount = needs.length - points.length;
  const selected = needs.find((n) => n.needId === selectedId) ?? null;

  function selectFromMap(id: string | null) {
    setSelectedId(id);
    if (!id || !isDesktop) return;
    document.querySelector<HTMLElement>(`[data-need="${CSS.escape(id)}"]`)?.scrollIntoView({
      block: "nearest",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }

  function showOnMap(n: NearbyNeed) {
    setSelectedId(n.needId);
    setFocusRequest((prev) => ({ needId: n.needId, n: (prev?.n ?? 0) + 1 }));
    if (!isDesktop) switchView("map");
  }

  const viewSwitch = (
    <div
      role="group"
      aria-label="Chế độ xem"
      className="inline-flex rounded-lg border bg-surface p-1 lg:hidden"
    >
      {(
        [
          { v: "list", label: `Danh sách (${needs.length})`, icon: List },
          { v: "map", label: "Bản đồ", icon: MapIcon },
        ] as const
      ).map(({ v, label, icon: Icon }) => (
        <button
          key={v}
          type="button"
          aria-pressed={view === v}
          onClick={() => switchView(v)}
          className={cn(
            "inline-flex h-10 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors duration-100",
            view === v ? "bg-primary text-primary-foreground" : "text-ink-muted hover:text-ink",
          )}
        >
          <Icon aria-hidden className="size-4" />
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <section
        aria-label="Bộ lọc nhu cầu"
        className="flex flex-col gap-3 rounded-xl border bg-bg-sunken p-3 sm:p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          {sites.length > 1 ? (
            <div className="flex min-w-56 flex-col gap-1">
              <label htmlFor="nearby-site" className="text-xs font-medium text-ink-muted">
                Tính từ chi nhánh
              </label>
              <NativeSelect
                id="nearby-site"
                value={filters.siteId ?? ""}
                onChange={(e) => navigate({ ...filters, siteId: e.target.value || null })}
              >
                <option value="">Mọi chi nhánh của bạn</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          ) : null}
          {viewSwitch}
        </div>
        <div
          role="group"
          aria-label="Lọc theo danh mục"
          className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 max-sm:[scrollbar-width:thin] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0"
        >
          {categories.map((c) => {
            const on = filters.categories.includes(c.code);
            const Icon = categoryIcon(c.icon);
            return (
              <button
                key={c.code}
                type="button"
                aria-pressed={on}
                onClick={() => navigate(toggleCategory(filters, c.code))}
                className={cn(
                  "inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium whitespace-nowrap transition-colors duration-100",
                  on
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border-strong/50 bg-surface text-ink hover:bg-bg",
                )}
              >
                <Icon aria-hidden className="size-4" />
                {c.name}
              </button>
            );
          })}
          {filtered ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-10"
              onClick={() => navigate({ categories: [], siteId: null })}
            >
              <X aria-hidden />
              Xóa lọc
            </Button>
          ) : null}
        </div>
      </section>

      <div className="lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start lg:gap-6">
        <section
          aria-labelledby="nearby-heading"
          aria-busy={pending || undefined}
          className={cn("flex flex-col gap-3", view === "map" && "max-lg:hidden")}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="nearby-heading" className="text-lg font-semibold">
              Tổ chức đang cần
            </h2>
            <p aria-live="polite" className="text-sm text-ink-muted tabular-nums">
              {loadFailed
                ? ""
                : needs.length > 0
                  ? `${needs.length} nhu cầu · gần hạn trước`
                  : "Không có nhu cầu"}
            </p>
          </div>
          <div className={cn("transition-opacity", pending && "opacity-60")}>
            {loadFailed ? (
              <ErrorState
                variant="section"
                title="Không tải được nhu cầu gần bạn"
                description="Đã có lỗi phía FoodSave hoặc kết nối mạng chập chờn. Bộ lọc của bạn vẫn được giữ."
                onRetry={() => startTransition(() => router.refresh())}
              />
            ) : needs.length === 0 ? (
              filtered ? (
                <EmptyState
                  variant="section"
                  icon={HandHeart}
                  title="Không có nhu cầu khớp bộ lọc"
                  description="Thử bỏ bớt danh mục hoặc tính từ mọi chi nhánh."
                  action={
                    <Button type="button" onClick={() => navigate({ categories: [], siteId: null })}>
                      Xóa lọc
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  variant="section"
                  icon={HandHeart}
                  title="Chưa có nhu cầu nào quanh cửa hàng"
                  description={
                    <p>
                      Khi một tổ chức có cửa hàng bạn trong bán kính phục vụ đăng nhu cầu đúng loại thực phẩm
                      bạn thường có, FoodSave sẽ báo và hiện ở đây. Trong lúc chờ, hãy đăng lô để các tổ chức
                      gần bạn chủ động xin nhận.
                    </p>
                  }
                  action={
                    <>
                      <Button asChild>
                        <Link href="/store/inventory/new">
                          <PackagePlus aria-hidden />
                          Đăng lô mới
                        </Link>
                      </Button>
                      <Button asChild variant="outline">
                        <Link href="/store/settings">
                          <Settings aria-hidden />
                          Cập nhật loại thực phẩm thường có
                        </Link>
                      </Button>
                    </>
                  }
                />
              )
            ) : (
              <ul className="flex flex-col gap-3">
                {needs.map((n) => (
                  <li key={n.needId}>
                    <NearbyNeedCard
                      need={n}
                      serverNow={serverNow}
                      categories={n.categoryCodes.map(
                        (c) => catName.get(c) ?? { code: c, name: c, icon: "" },
                      )}
                      selected={n.needId === selectedId}
                      onShowOnMap={n.location ? () => showOnMap(n) : null}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <div
          className={cn(
            "relative max-lg:h-[min(70dvh,560px)] max-lg:min-h-80 lg:sticky lg:top-24 lg:h-[calc(100dvh-7.5rem)] lg:min-h-[480px]",
            view === "list" && "max-lg:hidden",
          )}
        >
          {showMap ? (
            <NearbyMapLazy
              stores={stores}
              points={points}
              hiddenCount={hiddenCount}
              selectedId={selectedId}
              onSelect={selectFromMap}
              focusRequest={focusRequest}
              ariaLabel={`Bản đồ nhu cầu gần bạn: ${points.length} nhu cầu có vị trí công khai hoặc gần đúng${hiddenCount ? `, ${hiddenCount} nhu cầu ẩn vị trí` : ""}. Danh sách có cùng thông tin.`}
            />
          ) : null}
          {!isDesktop && selected ? (
            <section
              aria-label={`Nhu cầu của ${selected.charityName}`}
              className="absolute inset-x-2 bottom-2 z-10 max-h-[60%] overflow-y-auto rounded-xl bg-surface p-2 shadow-3"
            >
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-lg"
                  aria-label="Đóng thẻ nhu cầu"
                  onClick={() => setSelectedId(null)}
                >
                  <X aria-hidden />
                </Button>
              </div>
              <NearbyNeedCard
                need={selected}
                serverNow={serverNow}
                categories={selected.categoryCodes.map(
                  (c) => catName.get(c) ?? { code: c, name: c, icon: "" },
                )}
                selected={false}
                onShowOnMap={null}
              />
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function NearbyNeedCard({
  need: n,
  serverNow,
  categories,
  selected,
  onShowOnMap,
}: {
  need: NearbyNeed;
  serverNow: number;
  categories: Category[];
  selected: boolean;
  onShowOnMap: (() => void) | null;
}) {
  const titleId = `nearby-${n.needId}`;
  const noteId = `nearby-${n.needId}-note`;
  const unit = UNIT_LABEL[n.unit];
  const respond = canRespond(n);
  return (
    <article
      aria-labelledby={titleId}
      data-need={n.needId}
      className={cn(
        "flex flex-col gap-3 rounded-xl border bg-surface p-4 shadow-1 transition-shadow",
        selected && "border-info shadow-2 ring-2 ring-info/30",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id={titleId} className="font-semibold text-ink">
            {n.charityName}
          </h3>
          <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-ink-subtle">
            <Home aria-hidden className="size-3.5" />
            {orgSubtypeLabel("charity", n.charitySubtype)}
            <span aria-hidden>·</span>
            {areaText(n)}
          </p>
        </div>
        <NeedStatusBadge status={n.status} />
      </div>

      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-2xl font-bold text-ink tabular-nums">
          Cần {formatAmount(n.quantity)} {unit}
        </span>
        <span
          className={cn(
            "text-sm font-medium tabular-nums",
            n.qtyRemaining > 0 ? "text-warning" : "text-success",
          )}
        >
          {n.qtyRemaining > 0 ? `còn thiếu ${formatAmount(n.qtyRemaining)}` : "đã có cửa hàng giữ đủ"}
        </span>
      </p>

      <ul aria-label="Danh mục" className="flex flex-wrap gap-1.5">
        {categories.map((c) => {
          const Icon = categoryIcon(c.icon);
          return (
            <li
              key={c.code}
              className="inline-flex items-center gap-1 rounded-full border bg-bg-sunken px-2.5 py-0.5 text-xs text-ink"
            >
              <Icon aria-hidden className="size-3.5 text-ink-muted" />
              {c.name}
            </li>
          );
        })}
      </ul>

      <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
        <div>
          <dt className="flex items-center gap-1.5 text-xs text-ink-subtle">
            <CalendarClock aria-hidden className="size-3.5" />
            Cần trước
          </dt>
          <dd className="font-medium text-ink tabular-nums">
            {formatDayTime(n.neededBy, new Date(serverNow))}{" "}
            <span className="font-normal text-ink-muted">
              (<Countdown deadline={n.neededBy} serverNow={serverNow} />)
            </span>
          </dd>
        </div>
        <div>
          <dt className="flex items-center gap-1.5 text-xs text-ink-subtle">
            <Navigation aria-hidden className="size-3.5" />
            Khoảng cách
          </dt>
          <dd className="flex flex-wrap items-center gap-1.5 font-medium text-ink tabular-nums">
            {distanceText(n)}
            {n.visibility === "approximate" ? (
              <span className="inline-flex items-center gap-1 text-xs font-normal text-ink-muted">
                <LocateOff aria-hidden className="size-3.5" />
                vị trí gần đúng
              </span>
            ) : n.visibility === "hidden" ? (
              <span className="inline-flex items-center gap-1 text-xs font-normal text-ink-muted">
                <EyeOff aria-hidden className="size-3.5" />
                vị trí được ẩn
              </span>
            ) : null}
          </dd>
        </div>
        {n.peopleToServe ? (
          <div>
            <dt className="flex items-center gap-1.5 text-xs text-ink-subtle">
              <Users aria-hidden className="size-3.5" />
              Người được hỗ trợ
            </dt>
            <dd className="font-medium text-ink tabular-nums">{formatAmount(n.peopleToServe)} người</dd>
          </div>
        ) : null}
      </dl>

      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        {respond ? (
          <Button asChild size="sm">
            <Link
              href={`/store/inventory/new?category=${encodeURIComponent(n.categoryCodes[0] ?? "")}`}
              aria-describedby={titleId}
            >
              <PackagePlus aria-hidden />
              Đăng lô phù hợp
            </Link>
          </Button>
        ) : (
          <Button type="button" size="sm" disabled aria-describedby={noteId}>
            <PackagePlus aria-hidden />
            Đăng lô phù hợp
          </Button>
        )}
        {onShowOnMap ? (
          <Button type="button" variant="ghost" size="sm" onClick={onShowOnMap}>
            <MapPin aria-hidden />
            Xem trên bản đồ
          </Button>
        ) : null}
        {!respond ? (
          <p id={noteId} className="w-full text-xs text-ink-muted">
            Đã có cửa hàng giữ đủ cho nhu cầu này — cảm ơn bạn! FoodSave sẽ báo nếu có phần thiếu mới.
          </p>
        ) : null}
      </div>
    </article>
  );
}
