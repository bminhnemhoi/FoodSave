"use client";

import { Bell, BellRing, CheckCheck, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

import { loadNotifications, markNotificationsRead } from "../data";
import {
  badgeText,
  bellLabel,
  mergeNotifications,
  type NotificationItem,
  type NotificationRow,
  toNotificationItem,
} from "../model";
import { NotificationList } from "./notification-list";

const DESKTOP_QUERY = "(min-width: 768px)";
/** Đợt công bằng (deliver_after) không phát Realtime khi tới hạn ⇒ làm mới định kỳ khi tab đang mở. */
const POLL_MS = 60_000;

function subscribeDesktop(onChange: () => void) {
  const mq = window.matchMedia(DESKTOP_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

type Props = { userId: string };

/**
 * Chuông + trung tâm thông báo (P2-15, F-55, DESIGN-SYSTEM §10.1): popover 400 px trên desktop, sheet toàn
 * màn hình trên mobile. Realtime `postgres_changes` INSERT lọc theo `user_id` (RLS quyết định ai nhận) ⇒
 * cập nhật danh sách + toast cho thông báo GẤP; mất kết nối rồi nối lại ⇒ tải lại; hủy kênh khi unmount.
 */
export function NotificationCenter({ userId }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const headingId = useId();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [status, setStatus] = useState<"ready" | "loading" | "error">("loading");
  const [open, setOpen] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const isDesktop = useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false,
  );
  const requestSeq = useRef(0);

  const refresh = useCallback(async () => {
    const seq = ++requestSeq.current;
    try {
      const snap = await loadNotifications(supabase, userId);
      if (seq !== requestSeq.current) return; // một lần tải mới hơn đã bắt đầu
      setItems(snap.items);
      setUnread(snap.unread);
      setStatus("ready");
    } catch {
      if (seq === requestSeq.current) setStatus("error");
    }
  }, [supabase, userId]);

  // Tải lần đầu, khi quay lại tab, khi có mạng lại, và mỗi phút.
  useEffect(() => {
    const first = window.setTimeout(() => void refresh(), 0);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    const timer = window.setInterval(onVisible, POLL_MS);
    return () => {
      window.clearTimeout(first);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
      window.clearInterval(timer);
    };
  }, [refresh]);

  // Realtime: INSERT của chính người dùng. supabase-js tự nối lại; lần SUBSCRIBED sau sự cố ⇒ tải lại.
  useEffect(() => {
    let active = true;
    let interrupted = false;
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          if (!active) return;
          const item = toNotificationItem(payload.new as NotificationRow);
          setItems((current) => mergeNotifications(current, [item]));
          if (!item.read) setUnread((n) => n + 1);
          if (item.urgent) {
            toast.error(item.title, {
              id: `notification-${item.id}`,
              description: item.body || undefined,
              icon: <BellRing aria-hidden className="size-4" />,
              duration: 12_000,
              action: item.href
                ? {
                    label: "Xem",
                    onClick: () => {
                      void markNotificationsRead(supabase, [item.id]).then(refresh, refresh);
                      router.push(item.href!);
                    },
                  }
                : undefined,
            });
          } else {
            setAnnouncement(`Thông báo mới: ${item.title}`);
          }
          // Realtime chỉ là tín hiệu: đọc lại qua RLS để số chưa đọc luôn đúng (ARCHITECTURE §9).
          void refresh();
        },
      )
      .subscribe((state) => {
        if (state === "SUBSCRIBED") {
          if (interrupted) void refresh();
          interrupted = false;
        } else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT" || state === "CLOSED") {
          interrupted = true;
        }
      });
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [supabase, userId, refresh, router]);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) void refresh();
  };

  // Lần tải đang chạy đã đọc dữ liệu TRƯỚC thao tác của người dùng ⇒ bỏ kết quả của nó, tải lại sau khi ghi.
  const discardInFlight = () => {
    requestSeq.current += 1;
  };

  const openItem = (item: NotificationItem) => {
    setOpen(false);
    if (item.read) return;
    discardInFlight();
    setItems((current) => current.map((i) => (i.id === item.id ? { ...i, read: true } : i)));
    setUnread((n) => Math.max(0, n - 1));
    markNotificationsRead(supabase, [item.id]).then(refresh, refresh);
  };

  const markAll = async () => {
    setMarkingAll(true);
    discardInFlight();
    try {
      await markNotificationsRead(supabase, null);
      discardInFlight();
      setItems((current) => current.map((i) => ({ ...i, read: true })));
      setUnread(0);
      setAnnouncement("Đã đánh dấu tất cả thông báo là đã đọc.");
      void refresh();
    } catch {
      toast.error("Chưa đánh dấu được. Vui lòng thử lại.");
    } finally {
      setMarkingAll(false);
    }
  };

  const urgentUnread = items.some((i) => i.urgent && !i.read);
  const trigger = (
    <Button variant="ghost" size="icon-lg" aria-label={bellLabel(unread)} className="relative rounded-full">
      {urgentUnread ? (
        <BellRing aria-hidden className="size-5 text-danger" />
      ) : (
        <Bell aria-hidden className="size-5" />
      )}
      {unread > 0 ? (
        <span
          aria-hidden
          data-testid="notification-badge"
          className={cn(
            "absolute top-0.5 right-0.5 grid h-5 min-w-5 place-items-center rounded-full px-1 text-[0.6875rem] leading-none font-bold text-primary-foreground ring-2 ring-surface",
            urgentUnread ? "bg-danger" : "bg-primary",
          )}
        >
          {badgeText(unread)}
        </span>
      ) : null}
    </Button>
  );

  const markAllButton = (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => void markAll()}
      disabled={unread === 0 || markingAll}
      className="shrink-0"
    >
      {markingAll ? <Loader2 aria-hidden className="animate-spin" /> : <CheckCheck aria-hidden />}
      Đánh dấu tất cả đã đọc
    </Button>
  );

  const list = (
    <NotificationList
      items={items}
      status={status}
      onOpenItem={openItem}
      onRetry={() => {
        setStatus((s) => (s === "error" && items.length === 0 ? "loading" : s));
        void refresh();
      }}
    />
  );

  return (
    <>
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
      {isDesktop ? (
        <Popover open={open} onOpenChange={onOpenChange}>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <PopoverContent
            align="end"
            sideOffset={8}
            aria-labelledby={headingId}
            className="w-[400px] max-w-[calc(100vw-2rem)] gap-0 p-0 shadow-3"
          >
            <div className="flex items-center justify-between gap-2 border-b py-2 pr-2 pl-4">
              <h2 id={headingId} className="text-base font-semibold text-ink">
                Thông báo
              </h2>
              {markAllButton}
            </div>
            <div className="max-h-[min(70vh,560px)] overflow-y-auto">{list}</div>
          </PopoverContent>
        </Popover>
      ) : (
        <Sheet open={open} onOpenChange={onOpenChange}>
          <SheetTrigger asChild>{trigger}</SheetTrigger>
          <SheetContent
            side="right"
            className="w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md"
          >
            <SheetHeader className="border-b pr-14">
              <SheetTitle className="text-lg font-semibold">Thông báo</SheetTitle>
              <SheetDescription>
                {unread > 0 ? `${unread} thông báo chưa đọc` : "Không có thông báo chưa đọc"}
              </SheetDescription>
            </SheetHeader>
            <div className="flex justify-end border-b px-2 py-1">{markAllButton}</div>
            <div className="min-h-0 flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">{list}</div>
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
