import { Home, Settings } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { loadCharityContext, loadExactLocation, requestNow } from "@/features/charity-allocations/context";
import { MarketplaceView } from "@/features/marketplace/components/marketplace-view";
import { parseFilters, parseView } from "@/features/marketplace/filters";
import { loadCategories, loadMarketplace } from "@/features/marketplace/queries";

export const metadata: Metadata = { title: "Kho tặng — Tổ chức" };

/** Kho tặng (P2-07/08, US-CHA-05/06/07): lô khả thi quanh điểm nhận, bản đồ + danh sách, lọc theo URL. */
export default async function CharityDonationsPage({ searchParams }: PageProps<"/charity/donations">) {
  const ctx = await loadCharityContext();
  const params = await searchParams;
  const filters = parseFilters(params);
  const view = parseView(params);

  if (ctx.sites.length === 0) {
    return (
      <>
        <PageHeader title="Kho tặng" description="Lô tặng quanh điểm nhận của tổ chức." />
        <EmptyState
          icon={Home}
          title="Chưa có điểm nhận đang hoạt động"
          description={
            <p>
              Kho tặng tìm lô quanh một điểm nhận của tổ chức. Hãy thêm hoặc bật lại điểm nhận trong Cài đặt —
              nếu tài khoản của bạn chỉ được giao một số điểm, liên hệ chủ sở hữu tổ chức.
            </p>
          }
          action={
            <Button asChild>
              <Link href="/charity/settings">
                <Settings aria-hidden />
                Mở Cài đặt điểm nhận
              </Link>
            </Button>
          }
        />
      </>
    );
  }

  const site = ctx.sites.find((s) => s.id === filters.siteId) ?? ctx.sites[0]!;
  const categories = await loadCategories();
  const accepted = site.acceptedCategories
    ? categories.filter((c) => site.acceptedCategories!.includes(c.code))
    : categories;
  const [center, result] = await Promise.all([
    loadExactLocation(site.id),
    loadMarketplace({ ...filters, siteId: site.id }, site, categories),
  ]);

  return (
    <>
      <PageHeader
        title="Kho tặng"
        description="Lô tặng bạn còn đến kịp quanh điểm nhận — ưu tiên lô Đỏ, rồi gần trước. Chọn lô và bấm “Xin nhận”."
        breadcrumb={[{ label: "Tổng quan", href: "/charity" }, { label: "Kho tặng" }]}
      />
      <MarketplaceView
        offers={result.ok ? result.offers : []}
        loadFailed={!result.ok}
        filters={{ ...filters, siteId: site.id }}
        view={view}
        site={{
          id: site.id,
          name: site.name,
          radiusKm: site.radiusKm,
          center: center ?? site.publicLocation,
        }}
        sites={ctx.sites.map((s) => ({ id: s.id, name: s.name }))}
        categories={accepted}
        serverNow={requestNow()}
        isPaused={ctx.isPaused}
        pausedReason={ctx.pausedReason}
      />
    </>
  );
}
