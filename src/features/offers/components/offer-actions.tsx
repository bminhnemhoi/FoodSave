"use client";

import { Ban, Ellipsis, Pencil, Scale, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { OfferStatus } from "@/features/catalog/labels";

import {
  CancelOfferDialog,
  DeleteDraftDialog,
  PublishDialog,
  QuantityDialog,
  type OfferActionTarget,
} from "./offer-dialogs";

/** Vùng chạm ≥ 44 px trên mobile (DESIGN-SYSTEM §5). */
const ITEM = "min-h-11 px-2.5 md:min-h-9";

type Open = "publish" | "quantity" | "cancel" | "delete" | null;

/**
 * Thao tác trên một lô (DESIGN-SYSTEM §12.2: tối đa 1 nút hiện + menu "…"):
 * nháp ⇒ "Đăng lô" + sửa/xóa; đang mở ⇒ sửa, cập nhật số lượng, hủy lô (chỉ owner/manager — `cancel_offer`).
 */
export function OfferActions({
  offer,
  status,
  canCancel,
  variant = "card",
}: {
  offer: OfferActionTarget;
  status: OfferStatus;
  canCancel: boolean;
  variant?: "card" | "header";
}) {
  const [open, setOpen] = useState<Open>(null);
  const isDraft = status === "draft";
  const isLive = status === "open" || status === "fully_allocated";
  if (!isDraft && !isLive) return null;

  const editHref = `/store/inventory/${offer.id}/edit`;
  const set = (key: Exclude<Open, null>) => (next: boolean) => setOpen(next ? key : null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {isDraft ? (
        <>
          <Button
            type="button"
            onClick={() => setOpen("publish")}
            size={variant === "header" ? "lg" : "default"}
          >
            <Send aria-hidden />
            Đăng lô
          </Button>
          {variant === "header" ? (
            <Button asChild variant="outline" size="lg">
              <Link href={editHref}>
                <Pencil aria-hidden />
                Sửa nháp
              </Link>
            </Button>
          ) : null}
        </>
      ) : variant === "header" ? (
        <>
          <Button asChild variant="outline" size="lg">
            <Link href={editHref}>
              <Pencil aria-hidden />
              Sửa lô
            </Link>
          </Button>
          <Button type="button" variant="outline" size="lg" onClick={() => setOpen("quantity")}>
            <Scale aria-hidden />
            Cập nhật số lượng
          </Button>
        </>
      ) : (
        <Button asChild variant="outline">
          <Link href={editHref}>
            <Pencil aria-hidden />
            Sửa
          </Link>
        </Button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            aria-label={`Thao tác khác với lô ${offer.title}`}
            className="border border-border"
          >
            <Ellipsis aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          {isDraft ? (
            <>
              {variant === "card" ? (
                <DropdownMenuItem asChild className={ITEM}>
                  <Link href={editHref}>
                    <Pencil aria-hidden />
                    Sửa nháp
                  </Link>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem className={ITEM} variant="destructive" onSelect={() => setOpen("delete")}>
                <Trash2 aria-hidden />
                Xóa nháp
              </DropdownMenuItem>
            </>
          ) : (
            <>
              {variant === "card" ? (
                <>
                  <DropdownMenuItem asChild className={ITEM}>
                    <Link href={editHref}>
                      <Pencil aria-hidden />
                      Sửa lô
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem className={ITEM} onSelect={() => setOpen("quantity")}>
                    <Scale aria-hidden />
                    Cập nhật số lượng
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              ) : null}
              <DropdownMenuItem
                className={ITEM}
                variant="destructive"
                disabled={!canCancel}
                onSelect={() => setOpen("cancel")}
              >
                <Ban aria-hidden />
                {canCancel ? "Hủy lô" : "Hủy lô (chỉ chủ cửa hàng/quản lý)"}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {isDraft ? (
        <>
          <PublishDialog offer={offer} open={open === "publish"} onOpenChange={set("publish")} />
          <DeleteDraftDialog
            offer={offer}
            open={open === "delete"}
            onOpenChange={set("delete")}
            redirectTo={variant === "header" ? "/store/inventory?tab=draft" : undefined}
          />
        </>
      ) : (
        <>
          <QuantityDialog offer={offer} open={open === "quantity"} onOpenChange={set("quantity")} />
          {canCancel ? (
            <CancelOfferDialog offer={offer} open={open === "cancel"} onOpenChange={set("cancel")} />
          ) : null}
        </>
      )}
    </div>
  );
}
