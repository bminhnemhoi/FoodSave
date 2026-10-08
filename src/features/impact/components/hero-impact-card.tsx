import { BookCheck } from "lucide-react";
import { connection } from "next/server";

import { Skeleton } from "@/components/ui/skeleton";
import { displayDeliveredLots, displayKg } from "@/core/impact";

import { getPublicImpact } from "../queries";

function Chip() {
  return (
    <span className="inline-flex w-fit items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-xs leading-4 font-semibold text-primary-active">
      <BookCheck aria-hidden className="size-3.5" />
      Sổ tác động
    </span>
  );
}

/**
 * Thẻ nổi trên ảnh hero (L3) mang SỐ THẬT từ sổ tác động — cùng nguồn `getPublicImpact()` với khối tác động
 * (cache thẻ `public-impact`). Sổ trống/lỗi ⇒ câu trung thực, không có số 0 hay số mẫu.
 */
export async function HeroImpactCard() {
  await connection();
  const impact = await getPublicImpact();

  if (impact.status === "unavailable") {
    return (
      <>
        <Chip />
        <p className="max-w-44 text-ink-muted">Số liệu tạm chưa tải được.</p>
      </>
    );
  }
  const { totals } = impact;
  if (totals.deliveries === 0 && totals.kg === 0) {
    return (
      <>
        <Chip />
        <p className="max-w-48 font-semibold">Chưa có lần bàn giao nào</p>
        <p className="max-w-48 text-xs leading-4 text-ink-muted">
          Số thật sẽ hiện ở đây sau lần bàn giao đầu tiên.
        </p>
      </>
    );
  }
  const kg = displayKg(totals.kg);
  return (
    <>
      <Chip />
      <p className="flex items-baseline gap-1">
        <span className="font-display text-2xl leading-7 font-extrabold tabular-nums">{kg.value}</span>
        <span className="font-semibold text-ink-muted">{kg.unit}</span>
      </p>
      <p className="text-xs leading-4 text-ink-muted">
        thực phẩm đã trao · {displayDeliveredLots(totals.deliveries).text}
      </p>
    </>
  );
}

export function HeroImpactCardSkeleton() {
  return (
    <>
      <Chip />
      <Skeleton className="h-7 w-28" />
      <Skeleton className="h-4 w-36" />
    </>
  );
}
