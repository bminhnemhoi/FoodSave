"use client";

import { Mail, Phone, PhoneOff, RotateCcw } from "lucide-react";
import { useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { getOrgContact, type OrgContact } from "../actions";
import { formatPhone, mailtoHref, telHref } from "../phone";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; contact: OrgContact }
  | { status: "error"; message: string };

const NETWORK = "Không có kết nối mạng nên chưa tải được liên hệ. Hãy thử lại khi có sóng.";

/**
 * Nút "Liên hệ" của một tổ chức (B1): chỉ gọi `get_org_contact` khi người dùng mở ô — không tải hàng loạt trên
 * trang danh sách (giới hạn 60 lần/giờ). Có hotline ⇒ nút Gọi (`tel:`) / Email (`mailto:`); không có ⇒ "Chưa có
 * hotline" (chữ mờ, không phải nút). Đủ trạng thái đang tải / lỗi (thử lại) / trống.
 */
export function OrgContactButton({
  orgId,
  orgName,
  label = "Liên hệ",
  subject,
  size = "sm",
  className,
}: {
  orgId: string;
  orgName: string;
  label?: string;
  /** Tiêu đề email gợi ý (ví dụ tên lô). */
  subject?: string;
  size?: "sm" | "default" | "lg";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>({ status: "idle" });

  const load = () => {
    setState({ status: "loading" });
    getOrgContact({ orgId })
      .then((res) =>
        setState(
          res.ok ? { status: "ready", contact: res.data } : { status: "error", message: res.error.message },
        ),
      )
      .catch(() => setState({ status: "error", message: NETWORK }));
  };

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next && (state.status === "idle" || state.status === "error")) load();
  };

  const linkClass = cn(
    buttonVariants({ variant: "outline", size: "default" }),
    "min-h-11 w-full justify-start",
  );

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size={size}
          className={cn("min-h-11 md:min-h-9", className)}
          aria-label={label.includes(orgName) ? undefined : `${label} ${orgName}`}
          data-contact-org={orgId}
        >
          <Phone aria-hidden />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] gap-3 p-4">
        <div className="flex flex-col gap-0.5">
          <PopoverTitle className="text-base font-semibold text-ink">{orgName}</PopoverTitle>
          <PopoverDescription className="text-sm text-ink-muted">
            Hotline do tổ chức tự khai, chỉ dùng để liên hệ khi trao nhận.
          </PopoverDescription>
        </div>

        {state.status === "loading" || state.status === "idle" ? (
          <div role="status" aria-live="polite" className="flex flex-col gap-2">
            <span className="sr-only">Đang tải liên hệ…</span>
            <Skeleton className="h-11 w-full rounded-lg" />
            <Skeleton className="h-11 w-full rounded-lg" />
          </div>
        ) : null}

        {state.status === "error" ? (
          <div className="flex flex-col gap-2">
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
              {state.message}
            </p>
            <Button type="button" variant="outline" size="sm" className="min-h-11 w-fit" onClick={load}>
              <RotateCcw aria-hidden />
              Thử lại
            </Button>
          </div>
        ) : null}

        {state.status === "ready" ? (
          state.contact.phone || state.contact.email ? (
            <div className="flex flex-col gap-2" aria-live="polite">
              {state.contact.phone ? (
                <a href={telHref(state.contact.phone)} className={linkClass}>
                  <Phone aria-hidden />
                  <span>
                    Gọi <span className="tabular-nums">{formatPhone(state.contact.phone)}</span>
                  </span>
                </a>
              ) : null}
              {state.contact.email ? (
                <a href={mailtoHref(state.contact.email, subject)} className={linkClass}>
                  <Mail aria-hidden />
                  <span className="min-w-0 truncate">Email {state.contact.email}</span>
                </a>
              ) : null}
            </div>
          ) : (
            <p className="flex items-center gap-2 text-sm text-ink-muted" aria-live="polite">
              <PhoneOff aria-hidden className="size-4 shrink-0" />
              Chưa có hotline
            </p>
          )
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
