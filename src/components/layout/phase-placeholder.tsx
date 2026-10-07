import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

import { EmptyState } from "./empty-state";
import { findNavItem, PORTAL_NAV, type PortalRole } from "./nav-config";
import { PageHeader } from "./page-header";

type PhasePlaceholderProps = {
  role: PortalRole;
  /** Đường dẫn mục nav (lấy tiêu đề, mô tả, icon, giai đoạn). */
  href: string;
  /** Hướng dẫn thêm thay cho câu mặc định. */
  hint?: React.ReactNode;
  /** CTA thay cho nút "Về Tổng quan". */
  action?: React.ReactNode;
};

/**
 * Trang giữ chỗ trung thực cho mục chưa mở (không dữ liệu giả — CLAUDE.md "Không có tính năng giả").
 * Hiển thị đúng tên mục, mô tả và giai đoạn mở theo ROADMAP.
 */
export function PhasePlaceholder({ role, href, hint, action }: PhasePlaceholderProps) {
  const nav = PORTAL_NAV[role];
  const item = findNavItem(role, href);
  const isHome = href === nav.home;
  const phase = item.phase ?? "P2";

  const defaultAction = isHome ? null : (
    <Button asChild variant="outline">
      <Link href={nav.home}>
        <ArrowLeft aria-hidden />
        Về trang đầu
      </Link>
    </Button>
  );

  return (
    <>
      <PageHeader
        title={item.label}
        description={item.description}
        breadcrumb={isHome ? undefined : [{ label: nav.roleLabel, href: nav.home }, { label: item.label }]}
      />
      <EmptyState
        icon={item.icon}
        title={`Tính năng mở ở giai đoạn ${phase}`}
        description={
          hint ?? (
            <p>
              FoodSave đang hoàn thiện mục <strong className="font-semibold text-ink">{item.label}</strong>{" "}
              theo lộ trình. Khi mở, bạn dùng được ngay tại đây, không cần cài đặt thêm. Trong lúc chờ, mục
              này không hiển thị số liệu mẫu.
            </p>
          )
        }
        action={action ?? defaultAction}
      />
    </>
  );
}
