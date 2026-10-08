import { HandHeart, Home, PauseCircle, Settings } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { loadCharityContext, requestNow } from "@/features/charity-allocations/context";
import { NeedCard } from "@/features/needs/components/need-card";
import { PublishNeedDialog } from "@/features/needs/components/publish-need-dialog";
import { RefreshError } from "@/features/needs/components/refresh-error";
import { loadNeedCategories, loadNeedsList } from "@/features/needs/queries";

export const metadata: Metadata = { title: "Nhu cầu — Tổ chức" };

/** Nhu cầu của tổ chức (P3-05; US-CHA-09, US-CHA-13): đăng nhu cầu, theo dõi tiến độ, hủy, mở phương án ghép. */
export default async function CharityNeedsPage() {
  const ctx = await loadCharityContext();
  const now = requestNow();

  if (ctx.sites.length === 0) {
    return (
      <>
        <PageHeader title="Nhu cầu" description="Đăng nhu cầu để FoodSave ghép từ nhiều cửa hàng." />
        <EmptyState
          icon={Home}
          title="Chưa có điểm nhận đang hoạt động"
          description={
            <p>
              Nhu cầu gắn với một điểm nhận để FoodSave tìm cửa hàng quanh đó. Hãy thêm hoặc bật lại điểm nhận
              trong Cài đặt — nếu tài khoản của bạn chỉ được giao một số điểm, liên hệ chủ sở hữu tổ chức.
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

  const [list, categories] = await Promise.all([
    loadNeedsList(
      ctx.sites.map((s) => s.id),
      now,
    ),
    loadNeedCategories(),
  ]);
  const catName = new Map(categories.map((c) => [c.code, c.name]));
  const siteName = new Map(ctx.sites.map((s) => [s.id, s.name]));
  const publishSites = ctx.sites.map((s) => ({
    id: s.id,
    name: s.name,
    ward: s.ward,
    acceptedCategories: s.acceptedCategories,
  }));
  const publishCategories = categories.map((c) => ({
    code: c.code,
    name: c.name,
    icon: c.icon,
    defaultUnit: c.defaultUnit,
  }));

  const publish = (label?: string, variant?: "default" | "outline") => (
    <PublishNeedDialog
      sites={publishSites}
      categories={publishCategories}
      serverNow={now}
      isPaused={ctx.isPaused}
      label={label}
      variant={variant}
    />
  );

  return (
    <>
      <PageHeader
        title="Nhu cầu"
        description="Đăng điều tổ chức cần — FoodSave ghép từ nhiều cửa hàng gần bạn và đề xuất tối đa 3 phương án lấy hàng."
        breadcrumb={[{ label: "Tổng quan", href: "/charity" }, { label: "Nhu cầu" }]}
        actions={publish()}
      />

      {ctx.isPaused ? (
        <div
          role="status"
          className="mb-6 flex flex-wrap items-start gap-3 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-ink"
        >
          <PauseCircle aria-hidden className="mt-0.5 size-5 shrink-0 text-warning" />
          <p className="min-w-0 flex-1">
            <span className="font-semibold">Tổ chức đang tạm ngưng nhận thực phẩm.</span>{" "}
            {ctx.pausedReason ? `Lý do: ${ctx.pausedReason}. ` : ""}Bạn vẫn xem được nhu cầu nhưng chưa đăng
            mới hoặc giữ hàng được.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link href="/charity/settings">
              <Settings aria-hidden />
              Mở Cài đặt
            </Link>
          </Button>
        </div>
      ) : null}

      {list === null ? (
        <RefreshError
          title="Không tải được danh sách nhu cầu"
          description="Đã có lỗi phía FoodSave hoặc kết nối mạng chập chờn. Vui lòng thử lại."
        />
      ) : list.live.length === 0 && list.closed.length === 0 ? (
        <EmptyState
          icon={HandHeart}
          title="Chưa có nhu cầu nào"
          description={
            <p>
              Ví dụ “cần 50 ổ bánh mì trước 15:00 thứ Bảy”. FoodSave sẽ tìm từ nhiều cửa hàng quanh điểm nhận,
              đề xuất phương án trên bản đồ và báo các cửa hàng gần bạn.
            </p>
          }
          action={publish("Đăng nhu cầu đầu tiên")}
        />
      ) : (
        <div className="flex flex-col gap-10">
          <section aria-labelledby="live-needs" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="live-needs" className="text-xl font-semibold">
                Đang diễn ra
              </h2>
              <p className="text-sm text-ink-muted tabular-nums">
                {list.live.length > 0 ? `${list.live.length} nhu cầu · gần hạn trước` : ""}
              </p>
            </div>
            {list.live.length === 0 ? (
              <EmptyState
                variant="section"
                icon={HandHeart}
                title="Không có nhu cầu đang mở"
                description="Các nhu cầu trước đã đóng. Đăng nhu cầu mới khi tổ chức cần thêm thực phẩm."
                action={publish(undefined, "outline")}
              />
            ) : (
              <ul className="grid gap-4 xl:grid-cols-2">
                {list.live.map((n) => (
                  <li key={n.id}>
                    <NeedCard
                      need={n}
                      siteName={siteName.get(n.siteId) ?? "Điểm nhận"}
                      categoryNames={n.categoryCodes.map((c) => catName.get(c) ?? c)}
                      serverNow={now}
                      canCancel={ctx.canCancel}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {list.closed.length > 0 ? (
            <section aria-labelledby="closed-needs" className="flex flex-col gap-3">
              <h2 id="closed-needs" className="text-xl font-semibold">
                Đã đóng trong 30 ngày qua
              </h2>
              <ul className="grid gap-3 xl:grid-cols-2">
                {list.closed.map((n) => (
                  <li key={n.id}>
                    <NeedCard
                      need={n}
                      siteName={siteName.get(n.siteId) ?? "Điểm nhận"}
                      categoryNames={n.categoryCodes.map((c) => catName.get(c) ?? c)}
                      serverNow={now}
                      canCancel={false}
                      compact
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </>
  );
}
