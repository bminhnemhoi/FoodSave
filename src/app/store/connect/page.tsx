import { MapPinOff, PackagePlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { NearbyView } from "@/features/needs-nearby/components/nearby-view";
import { parseNearbyFilters, parseNearbyView } from "@/features/needs-nearby/filters";
import { loadNearbyNeeds, loadStoreLocations } from "@/features/needs-nearby/queries";
import { requestNow } from "@/features/charity-allocations/context";
import { loadCategories, loadStoreContext } from "@/features/offers/queries";

export const metadata: Metadata = { title: "Nhu cầu gần bạn — Cửa hàng" };

/**
 * "Nhu cầu gần bạn" (P3-07; US-STO-20, US-STO-21 AC3): nhu cầu của các tổ chức có cửa hàng bạn trong bán kính
 * phục vụ — bản đồ + danh sách, lọc danh mục. Vị trí tổ chức chỉ ở mức công khai (gần đúng / ẩn).
 */
export default async function StoreConnectPage({ searchParams }: PageProps<"/store/connect">) {
  const ctx = await loadStoreContext();
  const params = await searchParams;
  const now = requestNow();

  const header = (
    <PageHeader
      title="Nhu cầu gần bạn"
      description="Tổ chức quanh cửa hàng đang cần gì — vị trí mái ấm chỉ hiện gần đúng để bảo vệ người được hỗ trợ."
      breadcrumb={[{ label: "Tổng quan", href: "/store" }, { label: "Nhu cầu gần bạn" }]}
      actions={
        ctx.sites.length > 0 ? (
          <Button asChild>
            <Link href="/store/inventory/new">
              <PackagePlus aria-hidden />
              Đăng lô mới
            </Link>
          </Button>
        ) : undefined
      }
    />
  );

  if (ctx.sites.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          icon={MapPinOff}
          title="Chưa có chi nhánh đang hoạt động"
          description={
            ctx.canCancel
              ? "FoodSave tìm nhu cầu quanh từng chi nhánh của cửa hàng. Hãy thêm hoặc bật lại chi nhánh trong Cài đặt."
              : "Tài khoản của bạn chưa được giao chi nhánh nào. Liên hệ chủ cửa hàng để được giao chi nhánh."
          }
          action={
            ctx.canCancel ? (
              <Button asChild>
                <Link href="/store/settings?tab=sites">Thêm chi nhánh</Link>
              </Button>
            ) : undefined
          }
        />
      </>
    );
  }

  const categories = await loadCategories();
  const filters = parseNearbyFilters(
    params,
    categories.map((c) => c.code),
  );
  const siteId = filters.siteId && ctx.sites.some((s) => s.id === filters.siteId) ? filters.siteId : null;
  const [result, locations] = await Promise.all([
    loadNearbyNeeds(siteId, filters.categories),
    loadStoreLocations(siteId ? [siteId] : ctx.sites.map((s) => s.id)),
  ]);

  return (
    <>
      {header}
      <NearbyView
        needs={result.ok ? result.needs : []}
        loadFailed={!result.ok}
        filters={{ ...filters, siteId }}
        view={parseNearbyView(params)}
        categories={categories.map((c) => ({ code: c.code, name: c.nameVi, icon: c.icon }))}
        sites={ctx.sites.map((s) => ({ id: s.id, name: s.name }))}
        stores={ctx.sites
          .filter((s) => locations[s.id])
          .map((s) => ({ siteId: s.id, name: s.name, location: locations[s.id]! }))}
        serverNow={now}
      />
    </>
  );
}
