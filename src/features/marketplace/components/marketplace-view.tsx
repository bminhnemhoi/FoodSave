"use client";

import { List, Map as MapIcon, PackageSearch, PauseCircle, Settings, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useSyncExternalStore, useTransition } from "react";

import { ErrorState } from "@/components/layout/error-state";
import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import type { LatLng } from "@/core/geo/types";
import { LABEL_PRIORITY, type FreshnessLabel } from "@/core/labels";
import { formatDayTime } from "@/features/charity-allocations/present";
import { formatDistance, formatKm } from "@/lib/format";
import { cn } from "@/lib/utils";

import {
  clearFilters,
  countActiveFilters,
  effectiveMaxKm,
  filtersHref,
  type MarketplaceFilters,
  type MarketplaceView as View,
} from "../filters";
import type { FoodCategory, MarketOffer } from "../queries";
import { FilterBar } from "./filter-bar";
import { OfferCard } from "./offer-card";
import type { StorePoint } from "./offer-map";
import { OfferMapLazy } from "./offer-map-lazy";
import { RequestDialog } from "./request-dialog";

const LABEL_TEXT: Record<FreshnessLabel, string> = {
  red: "Đỏ",
  yellow: "Vàng",
  green: "Xanh",
  expired: "Hết hạn",
};

type MarketplaceViewProps = {
  offers: MarketOffer[];
  loadFailed: boolean;
  filters: MarketplaceFilters;
  view: View;
  site: { id: string; name: string; radiusKm: number; center: LatLng | null };
  sites: { id: string; name: string }[];
  categories: FoodCategory[];
  serverNow: number;
  pausedReason: string | null;
  isPaused: boolean;
};

const DESKTOP_QUERY = "(min-width: 1024px)";

function subscribeDesktop(cb: () => void) {
  const mq = window.matchMedia(DESKTOP_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/** Kho tặng: bộ lọc (URL) + danh sách + bản đồ đồng bộ chọn (US-CHA-05, US-CHA-06). */
export function MarketplaceView({
  offers,
  loadFailed,
  filters,
  view: initialView,
  site,
  sites,
  categories,
  serverNow,
  pausedReason,
  isPaused,
}: MarketplaceViewProps) {
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
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [hoveredSiteId, setHoveredSiteId] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ siteId: string; n: number } | null>(null);
  const [requesting, setRequesting] = useState<MarketOffer | null>(null);

  const acceptedCategories = categories;
  const filterKm = effectiveMaxKm(filters.maxKm, site.radiusKm);
  const activeCount = countActiveFilters(filters, site.radiusKm);

  const navigate = useCallback(
    (next: MarketplaceFilters) => {
      setSelectedSiteId(null);
      startTransition(() => {
        router.replace(filtersHref(pathname, next, { radiusKm: site.radiusKm, view }), { scroll: false });
      });
    },
    [pathname, router, site.radiusKm, view],
  );

  function switchView(next: View) {
    setView(next);
    if (next === "map") setMapRequested(true);
    // Chỉ đổi URL (giữ khi quay lại/chia sẻ), không tải lại dữ liệu
    window.history.replaceState(
      null,
      "",
      filtersHref(pathname, filters, { radiusKm: site.radiusKm, view: next }),
    );
  }

  const points = useMemo<StorePoint[]>(() => {
    const groups = new Map<string, MarketOffer[]>();
    for (const o of offers) {
      if (o.lat === null || o.lng === null) continue;
      const list = groups.get(o.storeSiteId) ?? [];
      list.push(o);
      groups.set(o.storeSiteId, list);
    }
    const now = new Date(serverNow);
    return [...groups.values()].map((list) => {
      const first = [...list].sort((a, b) => LABEL_PRIORITY[a.label] - LABEL_PRIORITY[b.label])[0]!;
      return {
        siteId: first.storeSiteId,
        lat: first.lat!,
        lng: first.lng!,
        approximate: first.approximate,
        label: first.label,
        count: list.length,
        ariaLabel: [
          `${first.storeName}, ${list.length} lô`,
          `gấp nhất: Nhãn ${LABEL_TEXT[first.label]}, hạn ${formatDayTime(first.effectiveDeadline, now)}`,
          `cách ${formatDistance(first.distanceKm * 1000)}`,
          first.approximate ? "vị trí gần đúng" : null,
        ]
          .filter(Boolean)
          .join(", "),
      };
    });
  }, [offers, serverNow]);

  const storeCount = useMemo(() => new Set(offers.map((o) => o.storeSiteId)).size, [offers]);
  const selectedOffers = useMemo(
    () => (selectedSiteId ? offers.filter((o) => o.storeSiteId === selectedSiteId) : []),
    [offers, selectedSiteId],
  );

  function selectFromMap(siteId: string | null) {
    setSelectedSiteId(siteId);
    if (!siteId || !isDesktop) return;
    const el = document.querySelector<HTMLElement>(`[data-site="${CSS.escape(siteId)}"]`);
    el?.scrollIntoView({
      block: "nearest",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }

  function showOnMap(o: MarketOffer) {
    setSelectedSiteId(o.storeSiteId);
    setFocusRequest((prev) => ({ siteId: o.storeSiteId, n: (prev?.n ?? 0) + 1 }));
    if (!isDesktop) switchView("map");
  }

  const disabledReason = isPaused
    ? "Tổ chức đang tạm ngưng nhận thực phẩm — bật lại trong Cài đặt để xin nhận."
    : null;

  const viewSwitch = (
    <div
      role="group"
      aria-label="Chế độ xem"
      className="inline-flex rounded-lg border bg-surface p-1 lg:hidden"
    >
      {(
        [
          { v: "list", label: `Danh sách (${offers.length})`, icon: List },
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

  const mapAria = `Bản đồ kho tặng: ${storeCount} cửa hàng quanh ${site.name}, bán kính ${formatKm(site.radiusKm)}. Danh sách lô có cùng thông tin.`;

  return (
    <div className="flex flex-col gap-4">
      {isPaused ? (
        <div
          role="status"
          className="flex flex-wrap items-start gap-3 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-ink"
        >
          <PauseCircle aria-hidden className="mt-0.5 size-5 shrink-0 text-warning" />
          <p className="min-w-0 flex-1">
            <span className="font-semibold">Tổ chức đang tạm ngưng nhận thực phẩm.</span>{" "}
            {pausedReason ? `Lý do: ${pausedReason}. ` : ""}Bạn vẫn xem được kho tặng nhưng chưa gửi được yêu
            cầu.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link href="/charity/settings">
              <Settings aria-hidden />
              Mở Cài đặt
            </Link>
          </Button>
        </div>
      ) : null}

      <FilterBar
        filters={filters}
        sites={sites}
        siteId={site.id}
        radiusKm={site.radiusKm}
        categories={acceptedCategories}
        onChange={navigate}
        viewSwitch={viewSwitch}
      />

      <div className="lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start lg:gap-6">
        <section
          aria-labelledby="offers-heading"
          aria-busy={pending || undefined}
          className={cn("flex flex-col gap-3", view === "map" && "max-lg:hidden")}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="offers-heading" className="text-lg font-semibold">
              Lô tặng phù hợp
            </h2>
            <p aria-live="polite" className="text-sm text-ink-muted tabular-nums">
              {loadFailed
                ? ""
                : offers.length > 0
                  ? `${offers.length} lô từ ${storeCount} cửa hàng · Đỏ trước, gần trước`
                  : "Không có lô"}
            </p>
          </div>

          <div className={cn("transition-opacity", pending && "opacity-60")}>
            {loadFailed ? (
              <ErrorState
                variant="section"
                title="Không tải được kho tặng"
                description="Đã có lỗi phía FoodSave hoặc kết nối mạng chập chờn. Bộ lọc của bạn vẫn được giữ."
                onRetry={() => startTransition(() => router.refresh())}
              />
            ) : offers.length === 0 ? (
              activeCount > 0 ? (
                <EmptyState
                  variant="section"
                  icon={PackageSearch}
                  title="Không có lô khớp bộ lọc"
                  description={
                    <p>
                      Không có lô
                      {filters.labels.length > 0 && filters.labels.length < 3
                        ? ` ${filters.labels.map((l) => LABEL_TEXT[l]).join(", ")}`
                        : ""}
                      {filterKm !== null
                        ? ` trong ${formatKm(filterKm)}`
                        : ` trong bán kính ${formatKm(site.radiusKm)}`}
                      {filters.maxMin !== null ? ` tới được trong ${filters.maxMin} phút` : ""}. Thử mở rộng
                      khoảng cách hoặc bỏ bớt bộ lọc.
                    </p>
                  }
                  action={
                    <>
                      {filterKm !== null ? (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => navigate({ ...filters, maxKm: null })}
                        >
                          Mở rộng tới {formatKm(site.radiusKm)}
                        </Button>
                      ) : null}
                      <Button type="button" onClick={() => navigate(clearFilters(filters))}>
                        Xóa tất cả lọc
                      </Button>
                    </>
                  }
                />
              ) : (
                <EmptyState
                  variant="section"
                  icon={PackageSearch}
                  title={`Chưa có lô phù hợp trong bán kính ${formatKm(site.radiusKm)}`}
                  description={
                    <p>
                      FoodSave chỉ hiện lô bạn còn đến kịp trước hạn hiệu lực và thuộc danh mục điểm nhận chấp
                      nhận. Tăng bán kính phục vụ của điểm nhận để thấy thêm cửa hàng, hoặc quay lại sau — lô
                      mới được đăng liên tục.
                    </p>
                  }
                  action={
                    <Button asChild variant="outline">
                      <Link href="/charity/settings">
                        <Settings aria-hidden />
                        Tăng bán kính trong Cài đặt
                      </Link>
                    </Button>
                  }
                />
              )
            ) : (
              <ul className="flex flex-col gap-3">
                {offers.map((o) => (
                  <li key={o.offerId}>
                    <OfferCard
                      offer={o}
                      serverNow={serverNow}
                      selected={o.storeSiteId === selectedSiteId}
                      canShowOnMap
                      disabledReason={disabledReason}
                      onShowOnMap={() => showOnMap(o)}
                      onRequest={() => setRequesting(o)}
                      onHover={(h) => setHoveredSiteId(h ? o.storeSiteId : null)}
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
            <OfferMapLazy
              key={site.id}
              center={site.center}
              siteName={site.name}
              radiusKm={site.radiusKm}
              filterKm={filterKm}
              points={points}
              selectedSiteId={selectedSiteId}
              highlightedSiteId={hoveredSiteId}
              onSelect={selectFromMap}
              focusRequest={focusRequest}
              ariaLabel={mapAria}
            />
          ) : null}

          {!isDesktop && selectedOffers.length > 0 ? (
            <section
              aria-label={`Lô của ${selectedOffers[0]!.storeName}`}
              className="absolute inset-x-2 bottom-2 z-10 max-h-[55%] overflow-y-auto rounded-lg bg-surface p-2 shadow-3"
            >
              <div className="flex items-center justify-between gap-2 px-2 pb-1">
                <p className="truncate text-sm font-semibold">{selectedOffers[0]!.storeName}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-lg"
                  aria-label="Đóng thẻ lô"
                  onClick={() => setSelectedSiteId(null)}
                >
                  <X aria-hidden />
                </Button>
              </div>
              <ul className="flex flex-col gap-2">
                {selectedOffers.map((o) => (
                  <li key={o.offerId}>
                    <OfferCard
                      offer={o}
                      serverNow={serverNow}
                      selected={false}
                      canShowOnMap={false}
                      compact
                      disabledReason={disabledReason}
                      onShowOnMap={() => undefined}
                      onRequest={() => setRequesting(o)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>

      <RequestDialog
        offer={requesting}
        site={{ id: site.id, name: site.name }}
        serverNow={serverNow}
        onOpenChange={(open) => {
          if (!open) setRequesting(null);
        }}
      />
    </div>
  );
}
