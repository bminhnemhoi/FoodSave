"use client";

import { CircleAlert, Loader2, Search, TriangleAlert } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { LatLng } from "@/core/geo/types";
import { NETWORK_ERROR } from "@/features/offers/use-op-id";

import { findPlans } from "../actions";
import { formatAmount } from "../present";
import type { PlansData } from "../queries";
import { PlanCompare } from "./plan-compare";

type ShortfallFinderProps = {
  needId: string;
  remaining: number;
  unitLabel: string;
  home: LatLng;
  homeName: string;
  neededBy: string;
  serverNow: number;
  canChoose: boolean;
  disabledReason: string | null;
};

/**
 * Ghép lại phần thiếu (US-CHA-12 AC1): khi cửa hàng từ chối / hết hạn / phương án chưa đủ, chỉ tìm đúng phần
 * còn thiếu, loại các cửa hàng đã giữ hàng hoặc đã từ chối. Kết quả hiện bằng cùng bộ so sánh phương án.
 */
export function ShortfallFinder({
  needId,
  remaining,
  unitLabel,
  home,
  homeName,
  neededBy,
  serverNow,
  canChoose,
  disabledReason,
}: ShortfallFinderProps) {
  const [data, setData] = useState<PlansData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const amount = `${formatAmount(remaining)} ${unitLabel}`;

  function find() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await findPlans({ needId });
        if (res.ok) setData(res.data);
        else setError(res.error.message);
      } catch {
        setError(NETWORK_ERROR);
      }
    });
  }

  if (data)
    return (
      <PlanCompare
        needId={needId}
        data={data}
        home={home}
        homeName={homeName}
        neededBy={neededBy}
        serverNow={serverNow}
        canChoose={canChoose}
        disabledReason={disabledReason}
        heading={`Phương án bổ sung cho ${amount} còn thiếu`}
        lead={
          data.plans.length > 0
            ? `Chỉ ghép đúng ${amount} còn thiếu, không đụng tới các cửa hàng đang giữ hàng hoặc đã từ chối. Từ ${data.candidateLots} lô của ${data.candidateStores} cửa hàng khác.`
            : undefined
        }
      />
    );

  return (
    <section
      aria-labelledby="shortfall-heading"
      className="flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning-soft p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
    >
      <div className="min-w-0">
        <h2 id="shortfall-heading" className="flex items-center gap-2 text-lg font-semibold text-ink">
          <TriangleAlert aria-hidden className="size-5 shrink-0 text-warning" />
          Còn thiếu {amount}
        </h2>
        <p className="mt-1 max-w-prose text-sm text-ink">
          Có cửa hàng từ chối, không trả lời kịp, hoặc phương án đã chọn chưa đủ. FoodSave chỉ ghép lại đúng
          phần còn thiếu — các cửa hàng đang giữ hàng không bị ảnh hưởng.
        </p>
        {error ? (
          <p role="alert" className="mt-2 flex items-start gap-1.5 text-sm text-danger">
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        ) : null}
      </div>
      <Button
        type="button"
        onClick={find}
        disabled={pending}
        aria-busy={pending || undefined}
        className="shrink-0"
      >
        {pending ? <Loader2 aria-hidden className="animate-spin" /> : <Search aria-hidden />}
        Còn thiếu {amount} — tìm phương án bổ sung
      </Button>
    </section>
  );
}
