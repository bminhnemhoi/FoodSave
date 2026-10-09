"use client";

import { Eye, Loader2, Phone, PhoneOff, ShieldCheck, UserRound } from "lucide-react";
import { useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import { revealTripContact, type TripVolunteerContact } from "../actions";
import { formatPhone, telHref } from "../phone";
import { OrgContactButton } from "./org-contact-button";

type State =
  | { status: "confirm" }
  | { status: "loading" }
  | { status: "ready"; contact: TripVolunteerContact }
  | { status: "error"; code: string; message: string };

const NETWORK = "Không có kết nối mạng nên chưa lấy được số. Hãy thử lại khi có sóng.";

/**
 * "Gọi tình nguyện viên" (B1) cho cửa hàng ở điểm dừng và điều phối viên của chuyến đang chạy: xác nhận ⇒
 * `reveal_trip_contact` (mỗi lần xem ghi nhật ký, tối đa 10 lần/giờ) ⇒ hiện số + nút gọi. TNV chưa bật cho phép
 * gọi ⇒ giải thích và đưa hotline của tổ chức điều phối (nếu có `fallbackOrg`).
 */
export function CallVolunteerButton({
  pickupId,
  fallbackOrg,
  className,
}: {
  pickupId: string;
  /** Tổ chức điều phối chuyến (cửa hàng xem): gọi hotline của họ khi TNV chưa bật cho phép gọi. */
  fallbackOrg?: { id: string; name: string } | null;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>({ status: "confirm" });

  const reveal = () => {
    setState({ status: "loading" });
    revealTripContact({ pickupId })
      .then((res) =>
        setState(
          res.ok
            ? { status: "ready", contact: res.data }
            : { status: "error", code: res.error.code, message: res.error.message },
        ),
      )
      .catch(() => setState({ status: "error", code: "network", message: NETWORK }));
  };

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    // Mỗi lần mở lại phải xác nhận lại (mỗi lần xem là một dòng nhật ký)
    if (!next) setState({ status: "confirm" });
  };

  const blocked =
    state.status === "error" && ["no_consent", "trip_not_active", "no_volunteer"].includes(state.code);
  const showFallback = fallbackOrg && blocked;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className={cn("min-h-11", className)}>
          <Phone aria-hidden />
          Gọi tình nguyện viên
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Gọi tình nguyện viên của chuyến</DialogTitle>
          <DialogDescription>
            Số chỉ hiện khi tình nguyện viên cho phép và chuyến đang chạy. Mỗi lần xem số đều được FoodSave
            ghi nhật ký; chỉ dùng để liên hệ về chuyến này.
          </DialogDescription>
        </DialogHeader>

        {state.status === "ready" ? (
          <div className="flex flex-col gap-3" aria-live="polite">
            <p className="flex items-center gap-2 font-medium text-ink">
              <UserRound aria-hidden className="size-5 text-ink-subtle" />
              {state.contact.volunteerName}
            </p>
            {state.contact.phone ? (
              <>
                <p className="text-2xl font-bold tracking-wide text-ink tabular-nums" data-volunteer-phone>
                  {formatPhone(state.contact.phone)}
                </p>
                <a
                  href={telHref(state.contact.phone)}
                  className={cn(buttonVariants({ size: "lg" }), "min-h-12 w-full text-base")}
                >
                  <Phone aria-hidden />
                  Gọi {formatPhone(state.contact.phone)}
                </a>
              </>
            ) : (
              <p className="flex items-start gap-2 text-sm text-ink-muted">
                <PhoneOff aria-hidden className="mt-0.5 size-4 shrink-0" />
                Tình nguyện viên chưa cập nhật số điện thoại trong hồ sơ.
              </p>
            )}
          </div>
        ) : null}

        {state.status === "error" ? (
          <div className="flex flex-col gap-3">
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
              {state.message}
            </p>
            {showFallback ? (
              <div className="flex flex-col gap-2 rounded-lg border bg-bg p-3">
                <p className="text-sm text-ink">
                  Bạn có thể gọi điều phối viên của <strong>{fallbackOrg.name}</strong> để nhắn tình nguyện
                  viên.
                </p>
                <OrgContactButton
                  orgId={fallbackOrg.id}
                  orgName={fallbackOrg.name}
                  label="Hotline điều phối"
                />
              </div>
            ) : null}
          </div>
        ) : null}

        {state.status === "confirm" || state.status === "loading" ? (
          <p className="flex items-start gap-2 text-sm text-ink-muted">
            <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
            Không lưu, chụp hay chia sẻ số này ra ngoài mục đích trao nhận.
          </p>
        ) : null}

        <DialogFooter>
          {state.status === "confirm" || state.status === "loading" ? (
            <Button
              type="button"
              className="min-h-11"
              onClick={reveal}
              disabled={state.status === "loading"}
              aria-busy={state.status === "loading"}
            >
              {state.status === "loading" ? (
                <Loader2 aria-hidden className="animate-spin" />
              ) : (
                <Eye aria-hidden />
              )}
              {state.status === "loading" ? "Đang lấy số…" : "Hiện số điện thoại"}
            </Button>
          ) : null}
          {state.status === "error" && !blocked ? (
            <Button type="button" variant="outline" className="min-h-11" onClick={reveal}>
              Thử lại
            </Button>
          ) : null}
          <Button type="button" variant="ghost" className="min-h-11" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
