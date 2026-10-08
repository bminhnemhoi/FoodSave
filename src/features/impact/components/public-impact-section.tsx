import { connection } from "next/server";

import { ImpactCounters } from "@/components/charts/impact-counters";
import { Skeleton } from "@/components/ui/skeleton";
import { displayKg } from "@/core/impact";
import { formatDateTime } from "@/lib/format";

import { getPublicImpact } from "../queries";

/**
 * Khối "Tác động đã ghi nhận" trên landing (PRD US-PUB-02, F-76): số thật từ `public_impact_stats`
 * (loại demo). Khối render theo request (`connection()`), còn số liệu nằm trong Data Cache theo thẻ
 * `public-impact` tối đa 10 phút và được hủy ngay (`updateTag`) sau mỗi bàn giao ghi sổ — không phụ thuộc
 * bản HTML dựng sẵn lúc build. Sổ trống ⇒ câu trung thực, không số 0.
 */
export async function PublicImpactSection() {
  await connection();
  const impact = await getPublicImpact();

  return (
    <section aria-labelledby="impact-heading" className="border-t bg-surface">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-14 sm:px-8">
        <div className="flex max-w-prose flex-col gap-2">
          <h2 id="impact-heading" className="text-[1.375rem] leading-[1.875rem] font-semibold">
            Tác động đã ghi nhận
          </h2>
          <p className="text-ink-muted">
            Mỗi con số đến từ một lần bàn giao thật đã được cửa hàng và tổ chức đối soát từng dòng — không có
            số ước đoán hay số mẫu.
          </p>
        </div>

        {impact.status === "unavailable" ? (
          <p role="status" className="rounded-lg border border-dashed bg-bg p-5 text-ink-muted">
            Số liệu tác động tạm thời chưa tải được. Vui lòng quay lại sau ít phút.
          </p>
        ) : (
          <>
            <ImpactCounters
              label="Bộ đếm tác động của FoodSave"
              variant="hero"
              totals={impact.totals}
              metrics={["kg", "meals", "co2e", "lots"]}
              factorVersion={impact.factors.current?.version}
              sources={impact.factors.sources.filter((s) => s.metric !== "water_l_per_kg")}
              empty={{
                title: "Chưa có lần bàn giao nào — số liệu sẽ cập nhật tự động",
                description:
                  "Bộ đếm chỉ tính thực phẩm đã tới tay tổ chức và được hai bên xác nhận. Hãy là cửa hàng đầu tiên.",
              }}
            />
            <div className="flex flex-col gap-1 text-sm text-ink-subtle sm:flex-row sm:flex-wrap sm:gap-x-4">
              {impact.updatedAt ? <p>Cập nhật lần cuối: {formatDateTime(impact.updatedAt)}.</p> : null}
              {impact.demoKg > 0 ? (
                <p>
                  <span className="mr-1.5 rounded-full bg-brand-yellow-soft px-2 py-0.5 font-medium text-ink">
                    Dữ liệu demo
                  </span>
                  Ngoài ra có {displayKg(impact.demoKg).text} trong dữ liệu demo, không tính vào số trên.
                </p>
              ) : null}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/** Skeleton đúng hình khối tác động (tiêu đề + 4 ô số). */
export function PublicImpactSectionSkeleton() {
  return (
    <section aria-label="Đang tải số liệu tác động" className="border-t bg-surface">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-14 sm:px-8">
        <div className="flex max-w-prose flex-col gap-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-full" />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      </div>
    </section>
  );
}
