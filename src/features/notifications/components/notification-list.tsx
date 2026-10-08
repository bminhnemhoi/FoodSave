"use client";

import {
  Ban,
  Bell,
  BellRing,
  Building2,
  CircleCheck,
  CircleX,
  ClipboardList,
  Clock,
  HandHeart,
  Inbox,
  Package,
  PackageCheck,
  RefreshCw,
  Route,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";

import { NoNotificationsIllustration } from "@/components/illustrations";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import { groupNotifications, iconKind, type NotificationEvent, type NotificationItem } from "../model";

/** Icon theo loại (DESIGN-SYSTEM §6: Thông báo `Bell` · GẤP `BellRing`). */
function NotificationIcon({ event, urgent }: { event: NotificationEvent; urgent: boolean }) {
  const props = { "aria-hidden": true, className: "size-4" } as const;
  if (urgent) return <BellRing {...props} />;
  switch (iconKind(event)) {
    case "offer":
      return <Package {...props} />;
    case "request":
      return <Inbox {...props} />;
    case "confirmed":
      return <CircleCheck {...props} />;
    case "rejected":
      return <CircleX {...props} />;
    case "expired":
      return <Clock {...props} />;
    case "cancelled":
      return <Ban {...props} />;
    case "packed":
      return <PackageCheck {...props} />;
    case "trip":
      return <Route {...props} />;
    case "delivered":
      return <HandHeart {...props} />;
    case "need":
      return <ClipboardList {...props} />;
    case "org":
      return <Building2 {...props} />;
    case "warning":
      return <TriangleAlert {...props} />;
    default:
      return <Bell {...props} />;
  }
}

type ListProps = {
  items: NotificationItem[];
  status: "ready" | "loading" | "error";
  onOpenItem: (item: NotificationItem) => void;
  onRetry: () => void;
  className?: string;
};

/** Danh sách trong popover/sheet: nhóm GẤP → Hôm nay → Hôm qua → Trước đó; trạng thái tải/lỗi/rỗng. */
export function NotificationList({ items, status, onOpenItem, onRetry, className }: ListProps) {
  if (items.length === 0 && status === "loading") {
    return (
      <div
        className={cn("flex flex-col gap-3 p-4", className)}
        aria-busy="true"
        aria-label="Đang tải thông báo"
      >
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0 && status === "error") {
    return (
      <div role="alert" className={cn("flex flex-col items-center gap-3 px-6 py-10 text-center", className)}>
        <TriangleAlert aria-hidden className="size-8 text-danger" />
        <p className="text-sm font-semibold text-ink">Không tải được thông báo</p>
        <p className="text-sm text-ink-muted">Kiểm tra kết nối mạng rồi thử lại.</p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw aria-hidden />
          Thử lại
        </Button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className={cn("flex flex-col items-center gap-3 px-6 py-10 text-center", className)}>
        <NoNotificationsIllustration className="h-20" />
        <p className="text-sm font-semibold text-ink">Bạn đã xem hết thông báo</p>
        <p className="max-w-72 text-sm text-ink-muted">
          FoodSave sẽ báo ở đây ngay khi có lô mới gần bạn, yêu cầu nhận lô hoặc thay đổi trạng thái.
        </p>
      </div>
    );
  }

  const now = new Date();
  return (
    <div className={cn("flex flex-col gap-1 p-2", className)}>
      {status === "error" ? (
        <p role="status" className="mx-2 rounded-md bg-warning-soft px-3 py-2 text-xs text-ink">
          Chưa cập nhật được danh sách mới nhất.{" "}
          <button type="button" onClick={onRetry} className="font-semibold underline underline-offset-2">
            Thử lại
          </button>
        </p>
      ) : null}
      {groupNotifications(items, now).map((group) => (
        <section key={group.key} aria-labelledby={`notif-group-${group.key}`} className="flex flex-col">
          <h3
            id={`notif-group-${group.key}`}
            className={cn(
              "flex items-center gap-1.5 px-3 pt-2 pb-1 text-xs font-semibold tracking-wide uppercase",
              group.key === "urgent" ? "text-danger" : "text-ink-muted",
            )}
          >
            {group.key === "urgent" ? <BellRing aria-hidden className="size-3.5" /> : null}
            {group.label}
          </h3>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => (
              <li key={item.id}>
                <NotificationRow item={item} now={now} onOpen={onOpenItem} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function NotificationRow({
  item,
  now,
  onOpen,
}: {
  item: NotificationItem;
  now: Date;
  onOpen: (item: NotificationItem) => void;
}) {
  const highlight = item.urgent && !item.read;
  const content = (
    <>
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-full",
          highlight ? "bg-danger text-primary-foreground" : "bg-muted text-ink-muted",
        )}
      >
        <NotificationIcon event={item.event} urgent={item.urgent} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn("line-clamp-2 text-sm text-ink", item.read ? "font-normal" : "font-semibold")}>
          {item.title}
        </span>
        {item.body ? <span className="mt-0.5 line-clamp-2 text-sm text-ink-muted">{item.body}</span> : null}
        <span className="mt-1 flex items-center gap-2 text-xs text-ink-muted">
          <time dateTime={item.at}>{formatRelativeTime(item.at, now)}</time>
          {item.urgent ? (
            <span className="inline-flex items-center gap-1 font-semibold text-danger">
              <BellRing aria-hidden className="size-3" />
              GẤP
            </span>
          ) : null}
        </span>
      </span>
      {item.read ? null : (
        <span className="mt-1.5 flex shrink-0 items-center">
          <span aria-hidden className="size-2.5 rounded-full bg-primary" />
          <span className="sr-only">Chưa đọc</span>
        </span>
      )}
    </>
  );
  const className = cn(
    "flex w-full gap-3 rounded-md px-3 py-2.5 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
    highlight && "bg-danger-soft hover:bg-danger-soft/80",
  );

  if (item.href) {
    return (
      <Link href={item.href} prefetch={false} className={className} onClick={() => onOpen(item)}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" className={className} onClick={() => onOpen(item)}>
      {content}
    </button>
  );
}
