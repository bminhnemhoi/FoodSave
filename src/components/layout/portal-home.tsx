import { CalendarClock, LayoutDashboard } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "./empty-state";
import { PORTAL_NAV, type Phase, type PortalRole } from "./nav-config";
import { PageHeader } from "./page-header";

const HOME_COPY: Record<PortalRole, { title: string; phase: Phase; body: string }> = {
  store: {
    title: "Tổng quan",
    phase: "P2",
    body: "Khi mở, trang này hiện lô đang mở theo nhãn Xanh/Vàng/Đỏ, yêu cầu nhận lô chờ duyệt và lượng thực phẩm cửa hàng đã trao đi.",
  },
  charity: {
    title: "Tổng quan",
    phase: "P2",
    body: "Khi mở, trang này hiện lô phù hợp quanh điểm nhận, nhu cầu đang mở, chuyến lấy hàng hôm nay và số suất ăn đã nhận.",
  },
  admin: {
    title: "Tổng quan",
    phase: "P4",
    body: "Khi mở, trang này hiện KPI toàn hệ thống: hồ sơ chờ duyệt, lô đang mở, phân bổ và tác động theo tháng.",
  },
  volunteer: {
    title: "Hôm nay",
    phase: "P3",
    body: "Khi mở, trang này hiện chuyến được giao hôm nay, điểm dừng kế tiếp và nút mở chỉ đường.",
  },
};

/**
 * Trang đầu của cổng khi chưa có dữ liệu thật: chào người dùng, giải thích trung thực khi nào mở,
 * và liệt kê các mục theo giai đoạn (không số liệu mẫu).
 */
export function PortalHome({
  role,
  userName,
  orgName,
}: {
  role: PortalRole;
  userName: string;
  orgName?: string;
}) {
  const nav = PORTAL_NAV[role];
  const copy = HOME_COPY[role];
  const upcoming = nav.items.filter((i) => i.href !== nav.home);

  return (
    <>
      <PageHeader
        title={copy.title}
        description={orgName ? `Xin chào ${userName} · ${orgName}` : `Xin chào ${userName}`}
      />
      <div className="flex flex-col gap-8">
        <EmptyState
          icon={role === "volunteer" ? CalendarClock : LayoutDashboard}
          title={`Tính năng mở ở giai đoạn ${copy.phase}`}
          description={
            <p>
              {copy.body} Trong lúc chờ, FoodSave không hiển thị số liệu mẫu; các mục bên dưới mở dần theo lộ
              trình, bạn không cần làm gì thêm.
            </p>
          }
        />
        {upcoming.length > 0 ? (
          <section aria-labelledby="portal-sections">
            <h2 id="portal-sections" className="text-[1.375rem] leading-[1.875rem] font-semibold">
              Các mục trong cổng {nav.roleLabel}
            </h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 md:gap-4 xl:grid-cols-3">
              {upcoming.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="flex h-full gap-3 rounded-lg border bg-surface p-4 shadow-1 transition-colors duration-100 hover:border-border-strong/50 hover:bg-bg"
                    >
                      <span className="grid size-10 shrink-0 place-items-center rounded-md bg-role-accent-soft text-role-accent">
                        <Icon aria-hidden className="size-5" />
                      </span>
                      <span className="flex min-w-0 flex-col gap-1">
                        <span className="flex flex-wrap items-center gap-x-2 font-semibold">
                          {item.label}
                          {item.phase ? (
                            <span className="text-xs font-medium text-ink-subtle">
                              Mở ở giai đoạn {item.phase}
                            </span>
                          ) : null}
                        </span>
                        <span className="text-sm text-ink-muted">{item.description}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
      </div>
    </>
  );
}
