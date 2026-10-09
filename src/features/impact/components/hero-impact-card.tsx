"use client";

import { BookCheck } from "lucide-react";

import { displayDeliveredLots, displayKg } from "@/core/impact";
import { cn } from "@/lib/utils";

import { usePublicImpact } from "./use-public-impact";

/** Khối giữ chỗ tĩnh (không nhấp nháy): số liệu thường về trong vài trăm ms, tránh chuyển động thừa ở màn đầu. */
function Bone({ className }: { className?: string }) {
  return <span aria-hidden className={cn("block rounded-md bg-muted", className)} />;
}

function Chip() {
  return (
    <span className="inline-flex w-fit items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-xs leading-4 font-semibold text-primary-active">
      <BookCheck aria-hidden className="size-3.5" />
      Sổ tác động
    </span>
  );
}

/**
 * Thẻ nổi trên ảnh hero (L3) mang SỐ THẬT từ sổ tác động — cùng nguồn với khối tác động (`/api/public-impact`,
 * Data Cache thẻ `public-impact`). Đang tải ⇒ skeleton cùng kích thước (không nhảy bố cục); sổ trống/lỗi ⇒
 * câu trung thực, không có số 0 hay số mẫu.
 */
export function HeroImpactCard() {
  const impact = usePublicImpact();

  if (impact === null) {
    return (
      <div aria-busy className="flex flex-col gap-1.5">
        <Chip />
        <Bone className="h-7 w-28" />
        <Bone className="h-4 w-40" />
      </div>
    );
  }
  if (impact.status === "unavailable") {
    return (
      <div className="flex flex-col gap-1.5">
        <Chip />
        <p className="max-w-44 text-ink-muted">Số liệu tạm chưa tải được.</p>
      </div>
    );
  }
  const { totals } = impact;
  if (totals.deliveries === 0 && totals.kg === 0) {
    return (
      <div className="flex flex-col gap-1.5">
        <Chip />
        <p className="max-w-48 font-semibold">Chưa có lần bàn giao nào</p>
        <p className="max-w-48 text-xs leading-4 text-ink-muted">
          Số thật sẽ hiện ở đây sau lần bàn giao đầu tiên.
        </p>
      </div>
    );
  }
  const kg = displayKg(totals.kg);
  return (
    <div className="flex flex-col gap-1.5">
      <Chip />
      <p className="flex items-baseline gap-1">
        <span className="font-display text-2xl leading-7 font-extrabold tabular-nums">{kg.value}</span>
        <span className="font-semibold text-ink-muted">{kg.unit}</span>
      </p>
      <p className="text-xs leading-4 text-ink-muted">
        thực phẩm đã trao · {displayDeliveredLots(totals.deliveries).text}
      </p>
    </div>
  );
}
